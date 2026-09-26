import { HAND_TYPES, moveTargets, dropTargets, play, isRestricted, inCheck } from "./rules.js";

export function availableActions(state) {
  if (state.status !== "playing") return [];
  const actions = [];
  state.board.forEach((piece, from) => {
    if (piece?.owner === state.turn)
      for (const to of moveTargets(state, from)) actions.push({ kind: "move", from, to });
  });
  for (const type of HAND_TYPES)
    for (const to of dropTargets(state, type)) actions.push({ kind: "drop", type, to });
  return actions.filter((action) => !isRestricted(state, action));
}

const values = { king: 20000, taku: 320, megu: 300, ham: 200, tapi: 160 };
const promotedValues = { taku: 720, megu: 650, ham: 340, tapi: 1000 };
function evaluate(state, owner) {
  if (state.status === "won") return state.winner === owner ? 100000 : -100000;
  let score = 0;
  state.board.forEach((p, index) => {
    if (!p) return;
    const progress = p.owner === 0 ? 3 - Math.floor(index / 4) : Math.floor(index / 4);
    const value =
      (p.promoted ? promotedValues[p.type] : values[p.type]) +
      (p.type === "king" ? 0 : progress * 14);
    score += (p.owner === owner ? 1 : -1) * value;
  });
  for (const side of [0, 1]) {
    for (const type of HAND_TYPES)
      score += (side === owner ? 1 : -1) * state.hands[side][type] * values[type] * 0.9;
    if (inCheck(state, side)) score += side === owner ? -2200 : 900;
  }
  return score;
}
function priority(state, action) {
  const victim = state.board[action.to];
  let score = victim ? values[victim.type] * 10 : 0;
  if (
    action.kind === "move" &&
    !state.board[action.from].promoted &&
    Math.floor(action.to / 4) === (state.turn === 0 ? 0 : 3)
  )
    score += 600;
  return score;
}

// The search runs in a Worker. Node/time bounds also keep the fallback responsive.
export function chooseMove(state, difficulty = "normal", options = {}) {
  const limits = { easy: [1, 1000, 100], normal: [3, 6500, 450], hard: [4, 22000, 1000] };
  const [depthLimit, defaultNodes, defaultMs] = limits[difficulty] || limits.normal;
  const now = options.now || (() => performance.now());
  const deadline = now() + (options.maxMs ?? defaultMs),
    maxNodes = options.maxNodes ?? defaultNodes;
  const owner = state.turn;
  let nodes = 0,
    interrupted = false;
  const ordered = (s) => availableActions(s).sort((a, b) => priority(s, b) - priority(s, a));
  const root = ordered(state).map((action) => ({ action, result: play(state, action) }));
  const candidates = root.filter((item) => item.result.ok);
  const win = candidates.find((item) => item.result.state.winner === owner);
  if (win) return win.action;
  if (!candidates.length) return root[0]?.action ?? null;
  let best = candidates[0].action;
  function search(s, depth, alpha, beta, ply) {
    if (++nodes > maxNodes || now() >= deadline) {
      interrupted = true;
      return evaluate(s, owner);
    }
    if (s.status === "won") return evaluate(s, owner) + (s.winner === owner ? -ply : ply);
    if (!depth) return evaluate(s, owner);
    const maximize = s.turn === owner;
    let score = maximize ? -Infinity : Infinity,
      found = false;
    for (const action of ordered(s)) {
      const result = play(s, action);
      if (!result.ok) continue;
      found = true;
      const value = search(result.state, depth - 1, alpha, beta, ply + 1);
      score = maximize ? Math.max(score, value) : Math.min(score, value);
      if (maximize) alpha = Math.max(alpha, score);
      else beta = Math.min(beta, score);
      if (beta <= alpha || interrupted) break;
    }
    return found ? score : evaluate(s, owner);
  }
  for (let depth = 1; depth <= depthLimit; depth++) {
    let roundBest = best,
      score = -Infinity;
    for (const { action, result } of candidates) {
      const value = search(result.state, depth - 1, -Infinity, Infinity, 1);
      if (value > score) {
        score = value;
        roundBest = action;
      }
      if (interrupted) break;
    }
    if (!interrupted) best = roundBest;
    if (interrupted || score > 90000) break;
    candidates.sort((a, b) => Number(b.action === best) - Number(a.action === best));
  }
  return best;
}

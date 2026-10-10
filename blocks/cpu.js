import { PIECES, cellsFor, legalMoves } from "./rules.js?v=20261010-blocks3";

// Search only placements supplied by the shared rules. Since the board only
// fills up, descendants can filter these placements instead of rebuilding them.
function entryFor(action) {
  let low = 0,
    high = 0;
  for (const [x, y] of cellsFor(action)) {
    const i = y * 8 + x;
    if (i < 32) low |= 1 << i;
    else high |= 1 << (i - 32);
  }
  return { action, low, high };
}
function advance(node, entry) {
  const owner = node.turn;
  const hands = node.hands.map((hand, p) =>
    p === owner ? hand.filter((piece) => piece !== entry.action.piece) : hand,
  );
  const moves = node.moves.map((list, p) =>
    list.filter(
      (move) =>
        !(move.low & entry.low) &&
        !(move.high & entry.high) &&
        (p !== owner || move.action.piece !== entry.action.piece),
    ),
  );
  const turn = 1 - owner;
  const winner = hands.every((hand) => !hand.length)
    ? 1 - node.starter
    : !moves[turn].length
      ? owner
      : null;
  return { hands, moves, turn, starter: node.starter, winner };
}
function evaluate(node, owner) {
  if (node.winner !== null) return node.winner === owner ? 100000 : -100000;
  function flexibility(p) {
    const counts = Object.fromEntries(PIECES.map((piece) => [piece, 0]));
    for (const move of node.moves[p]) counts[move.action.piece]++;
    // A shape with no remaining home will never become playable again.
    return node.hands[p].reduce(
      (score, piece) => score + (counts[piece] ? 32 + 8 * Math.log2(1 + counts[piece]) : -120),
      0,
    );
  }
  return flexibility(owner) - flexibility(1 - owner);
}
function shuffled(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function chooseMove(state, difficulty = "normal", options = {}) {
  if (state.status !== "playing") return null;
  const random = options.random ?? Math.random;
  const actions = [...legalMoves(state)];
  if (!actions.length) return null;
  if (difficulty === "easy") {
    const pieces = [...new Set(actions.map((action) => action.piece))];
    const piece = pieces[Math.floor(random() * pieces.length)];
    const choices = actions.filter((action) => action.piece === piece);
    return choices[Math.floor(random() * choices.length)];
  }
  const limits =
    difficulty === "hard"
      ? { depth: 4, beam: 16, nodes: 24000, ms: 600 }
      : { depth: 2, beam: 10, nodes: 8000, ms: 220 };
  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.maxMs ?? limits.ms);
  const maxNodes = options.maxNodes ?? limits.nodes;
  const root = {
    hands: state.hands,
    turn: state.turn,
    starter: state.starter,
    winner: null,
    moves: [0, 1].map((p) =>
      shuffled(p === state.turn ? actions : [...legalMoves(state, p)], random).map(entryFor),
    ),
  };
  const owner = state.turn;
  let best = root.moves[owner][0].action,
    bestScore = -Infinity,
    nodes = 0;
  const stopped = Symbol("search budget exhausted");
  function budget() {
    if (++nodes > maxNodes || now() >= deadline) throw stopped;
  }
  function rank(node) {
    const candidates = [];
    for (const entry of node.moves[node.turn]) {
      budget();
      const child = advance(node, entry),
        score = evaluate(child, node.turn);
      if (child.winner === node.turn) return [{ entry, child, score }];
      candidates.push({ entry, child, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    // Inspect all choices in small endgames; otherwise keep a promising beam.
    return node.hands[0].length + node.hands[1].length <= 4
      ? candidates
      : candidates.slice(0, limits.beam);
  }
  function search(node, depth, alpha, beta) {
    budget();
    if (node.winner !== null || depth === 0) return evaluate(node, owner);
    const maximize = node.turn === owner;
    let score = maximize ? -Infinity : Infinity;
    for (const { child } of rank(node)) {
      const value = search(child, depth - 1, alpha, beta);
      score = maximize ? Math.max(score, value) : Math.min(score, value);
      if (maximize) alpha = Math.max(alpha, score);
      else beta = Math.min(beta, score);
      if (alpha >= beta) break;
    }
    return score;
  }
  try {
    const candidates = [];
    for (const entry of root.moves[owner]) {
      budget();
      const child = advance(root, entry),
        score = evaluate(child, owner);
      if (score > bestScore) {
        best = entry.action;
        bestScore = score;
      }
      if (child.winner === owner) return entry.action;
      candidates.push({ entry, child, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const shortlist =
      state.hands.flat().length <= 4 ? candidates : candidates.slice(0, limits.beam);
    for (let depth = 2; depth <= limits.depth; depth++) {
      let roundBest = best,
        score = -Infinity;
      for (const { entry, child } of shortlist) {
        const value = search(child, depth - 1, -Infinity, Infinity);
        if (value > score) {
          score = value;
          roundBest = entry.action;
        }
      }
      // Keep the last completed depth if the next search exceeds its budget.
      best = roundBest;
      if (Math.abs(score) === 100000) break;
      shortlist.sort((a, b) => Number(b.entry.action === best) - Number(a.entry.action === best));
    }
  } catch (error) {
    if (error !== stopped) throw error;
  }
  return best;
}

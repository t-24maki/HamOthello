import { initialExpression } from "./characters.js?v=poker-dilemma-20261025";
export const METALS = {
  bronze: { name: "銅", strength: 0 },
  silver: { name: "銀", strength: 1 },
  gold: { name: "金", strength: 2 },
};
export const ROLES = [
  "役なし",
  "ワンペア",
  "フラッシュ",
  "ストレート",
  "ストレートフラッシュ",
  "スリーカード",
];
export const PLAYER_COUNT = 4;
export const MATCH_ROUNDS = 9;
export const WINS_TO_WIN = 3;

export function createDeck() {
  return Object.keys(METALS).flatMap((metal) =>
    Array.from({ length: 9 }, (_, i) => ({ id: `${metal}-${i + 1}`, value: i + 1, metal })),
  );
}

function validateHand(hand) {
  if (
    !Array.isArray(hand) ||
    hand.length !== 3 ||
    new Set(hand.map((card) => card?.id)).size !== 3 ||
    hand.some(
      (card) =>
        !card ||
        !Number.isInteger(card.value) ||
        card.value < 1 ||
        card.value > 9 ||
        !Object.hasOwn(METALS, card.metal) ||
        card.id !== `${card.metal}-${card.value}`,
    )
  ) {
    throw new Error("A hand must contain three distinct cards from the 27-card deck.");
  }
}

export function evaluateHand(hand) {
  validateHand(hand);
  const sorted = [...hand].sort(
    (a, b) => b.value - a.value || METALS[b.metal].strength - METALS[a.metal].strength,
  );
  const values = sorted.map((card) => card.value);
  const unique = new Set(values).size;
  const flush = hand.every((card) => card.metal === hand[0].metal);
  const straight = unique === 3 && values[0] - values[2] === 2;
  const rank =
    unique === 1 ? 5 : straight && flush ? 4 : straight ? 3 : flush ? 2 : unique === 2 ? 1 : 0;
  // Flushes compare their metal first, then numbers when both metals match.
  // Other roles compare their defining number first (the pair before its kicker).
  const ordered =
    rank === 1
      ? [...sorted].sort(
          (a, b) =>
            values.filter((n) => n === b.value).length - values.filter((n) => n === a.value).length,
        )
      : sorted;
  const key =
    rank === 2 || rank === 4
      ? [METALS[ordered[0].metal].strength, ...ordered.map((card) => card.value)]
      : ordered.flatMap((card) => [card.value, METALS[card.metal].strength]);
  return { rank, name: ROLES[rank], sorted: ordered, key };
}

export function compareHands(a, b) {
  const left = evaluateHand(a),
    right = evaluateHand(b);
  if (left.rank !== right.rank) return Math.sign(left.rank - right.rank);
  for (let i = 0; i < left.key.length; i++) {
    if (left.key[i] !== right.key[i]) return Math.sign(left.key[i] - right.key[i]);
  }
  return 0;
}

export function createRound(
  mode = "cpu",
  random = Math.random,
  characters = ["tak", "meg", "ham", "tapi"],
) {
  if (
    !Array.isArray(characters) ||
    characters.length !== PLAYER_COUNT ||
    characters.some((c) => !["tak", "meg", "ham", "tapi"].includes(c))
  )
    throw new Error("Invalid characters.");
  if (!["cpu", "local"].includes(mode)) throw new Error("Unknown play mode.");
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error("Invalid random value.");
    const j = Math.floor(value * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    mode,
    roundNumber: 1,
    wins: Array(PLAYER_COUNT).fill(0),
    characters: [...characters],
    expressions: characters.map((character, p) =>
      initialExpression(character, evaluateHand(deck.slice(p * 3, p * 3 + 3))),
    ),
    history: [],
    phase: mode === "local" ? "handoff" : "choose",
    active: 0,
    hands: Array.from({ length: PLAYER_COUNT }, (_, p) => deck.slice(p * 3, p * 3 + 3)),
    initialHands: Array.from({ length: PLAYER_COUNT }, (_, p) => deck.slice(p * 3, p * 3 + 3)),
    deck: deck.slice(PLAYER_COUNT * 3),
    discards: [],
    exchanges: Array(PLAYER_COUNT).fill(null),
  };
}

export function revealHand(state) {
  return state.phase === "handoff" ? { ...state, phase: "choose" } : null;
}

function replaceCards(state, player, indices) {
  const deck = [...state.deck],
    discards = [...state.discards],
    hands = state.hands.map((hand) => [...hand]);
  for (const index of [...indices].sort((a, b) => a - b)) {
    discards.push(hands[player][index]);
    hands[player][index] = deck.shift();
  }
  const exchanges = [...state.exchanges];
  exchanges[player] = indices.length;
  return { ...state, hands, deck, discards, exchanges };
}

export function exchangeCards(state, indices) {
  if (
    state.phase !== "choose" ||
    !Number.isInteger(state.active) ||
    state.active < 0 ||
    state.active >= PLAYER_COUNT ||
    state.exchanges[state.active] !== null ||
    !Array.isArray(indices) ||
    indices.length > 3 ||
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index > 2)
  )
    return null;
  return { ...replaceCards(state, state.active, indices), phase: "review" };
}

export function continueRound(state) {
  if (state.phase !== "review") return null;
  if (state.mode === "cpu") return { ...state, phase: "cpu" };
  return state.active < PLAYER_COUNT - 1
    ? { ...state, active: state.active + 1, phase: "handoff" }
    : recordRound({ ...state, phase: "result" });
}

// Score only the transition into a result, never a render or a repeated message.
export function recordRound(state) {
  if (
    state.phase !== "result" ||
    state.history.length !== state.roundNumber - 1 ||
    state.roundNumber > MATCH_ROUNDS ||
    [0, 1, 2, 3].some((p) => state.history.filter((winner) => winner === p).length >= WINS_TO_WIN)
  )
    return null;
  const { winner } = roundResult(state);
  // No physical hands tie under the full metal/number comparison. Reject corrupt rounds.
  if (
    winner === null ||
    state.hands.length !== PLAYER_COUNT ||
    new Set(state.hands.flat().map((c) => c.id)).size !== PLAYER_COUNT * 3
  )
    return null;
  const history = [...state.history, winner];
  return {
    ...state,
    history,
    wins: [0, 1, 2, 3].map((p) => history.filter((w) => w === p).length),
  };
}

export function matchResult(state) {
  if (state.phase !== "result") return null;
  const winner = state.wins.findIndex((wins) => wins >= WINS_TO_WIN);
  return winner < 0 ? null : { winner, wins: [...state.wins] };
}

export function nextRound(state, random = Math.random) {
  if (state.phase !== "result" || matchResult(state) || state.history.length !== state.roundNumber)
    return null;
  return {
    ...createRound(state.mode === "online" ? "cpu" : state.mode, random, state.characters),
    mode: state.mode,
    roundNumber: state.roundNumber + 1,
    wins: [...state.wins],
    history: [...state.history],
  };
}

function* combinations(cards, count, offset = 0, chosen = []) {
  if (count === 0) {
    yield chosen;
    return;
  }
  for (let i = offset; i <= cards.length - count; i++) {
    yield* combinations(cards, count - 1, i + 1, [...chosen, cards[i]]);
  }
}

// The CPU receives only its own hand. It evaluates possible draws from unseen
// cards, without reading the opponent's cards, discards, or shuffled deck order.
export function chooseCpuExchange(hand) {
  validateHand(hand);
  const unseen = createDeck().filter((card) => !hand.some((own) => own.id === card.id));
  let best = [],
    bestValue = -Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const indices = [0, 1, 2].filter((index) => mask & (1 << index));
    const kept = hand.filter((_, index) => !indices.includes(index));
    let total = 0,
      count = 0;
    for (const draw of combinations(unseen, indices.length)) {
      const result = evaluateHand([...kept, ...draw]);
      const tieValue =
        result.rank === 2 || result.rank === 4
          ? result.key[0] * 10 + result.key[1]
          : result.key[0] * 3 + result.key[1];
      total += result.rank * 100 + tieValue;
      count++;
    }
    const expected = total / count;
    if (expected > bestValue + 1e-9) {
      best = indices;
      bestValue = expected;
    }
  }
  return best;
}

// Only the CPU's own hand is passed to the decision function.
export function exchangeCpuPlayers(state, seats) {
  let next = state;
  for (const player of seats) {
    if (next.exchanges[player] === null)
      next = replaceCards(next, player, chooseCpuExchange(next.hands[player]));
  }
  return next;
}

export function finishCpuTurn(state) {
  if (state.mode !== "cpu" || state.phase !== "cpu" || state.exchanges[0] === null) return null;
  return recordRound({ ...exchangeCpuPlayers(state, [1, 2, 3]), phase: "result" });
}

export function roundResult(state) {
  if (state.phase !== "result") return null;
  const ranking = state.hands
    .map((_, i) => i)
    .sort((a, b) => -compareHands(state.hands[a], state.hands[b]));
  const winner =
    compareHands(state.hands[ranking[0]], state.hands[ranking[1]]) === 0 ? null : ranking[0];
  const roles = state.hands.map(evaluateHand);
  let reason = "役の強さが同じ。なかよく引き分け！";
  if (winner !== null) {
    const win = roles[winner],
      lose = roles[ranking[1]];
    if (win.rank !== lose.rank) reason = `「${win.name}」は「${lose.name}」より強いよ。`;
    else if (win.rank === 2 || win.rank === 4)
      reason =
        win.key[0] !== lose.key[0]
          ? `同じ「${win.name}」。金 ＞ 銀 ＞ 銅の順。${METALS[win.sorted[0].metal].name}は${METALS[lose.sorted[0].metal].name}より強いよ。`
          : `同じ「${win.name}」で色も${METALS[win.sorted[0].metal].name}。いちばん大きい数字の ${win.key[1]} と ${lose.key[1]} でくらべたよ。`;
    else if (win.key[0] !== lose.key[0])
      reason = `同じ「${win.name}」。${win.rank === 1 ? "ペアの数字" : "いちばん大きい数字"}の ${win.key[0]} と ${lose.key[0]} でくらべたよ。`;
    else
      reason = `同じ「${win.name}」で、${win.rank === 1 ? "ペアの数字" : "大きい数字"}も ${win.key[0]}。金・銀・銅の順でくらべたよ。`;
  }
  return { winner, roles, reason, ranking };
}

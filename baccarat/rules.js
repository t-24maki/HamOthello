import { createDeck } from "../poker/rules.js?v=poker-scoreboard-20261022";

export const CHARACTERS = [
  { id: "tak", name: "たくハム", expression: "もやもや", hint: "最初の2枚が0〜2なら、もやもや。" },
  {
    id: "meg",
    name: "めぐハム",
    expression: "うれしそう",
    hint: "最初の2枚が7〜9なら、うれしそう。",
  },
  {
    id: "ham",
    name: "ノーマルハム",
    expression: "なやましい",
    hint: "最初の2枚が4〜6なら、なやましい。",
  },
  { id: "tapi", name: "たぴ", expression: "いつもどおり", hint: "どんな手でも、ずっと無表情。" },
];

export function score(hand) {
  return hand.reduce((sum, card) => sum + card.value, 0) % 10;
}

export function expressionFor(character, initialScore) {
  if (character === "tak" && initialScore <= 2) return "tell";
  if (character === "meg" && initialScore >= 7) return "tell";
  if (character === "ham" && initialScore >= 4 && initialScore <= 6) return "tell";
  return "neutral";
}

// Clockwise around the table: self (bottom), left, top, right.
export const SEAT_ORDER = [0, 2, 1, 3];
export const STARTING_CHIPS = 10;
export const TARGET_CHIPS = 20;

function randomIndex(random, size) {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error("Invalid random value");
  return Math.floor(n * size);
}

function deal(match, dealer, random) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const first = SEAT_ORDER.indexOf(dealer);
  match.order = [...SEAT_ORDER.slice(first), ...SEAT_ORDER.slice(0, first)];
  match.dealer = dealer;
  match.roundNumber++;
  match.players.forEach((p) => {
    p.beforeChips = p.chips;
    p.chips--;
    p.wager = 1;
    p.hand = [];
    p.decision = null;
  });
  for (let pass = 0; pass < 2; pass++)
    for (const seat of match.order) match.players[seat].hand.push(deck.pop());
  for (const p of match.players) p.expression = expressionFor(p.character, score(p.hand));
  Object.assign(match, {
    phase: "choose",
    deck,
    turnIndex: 0,
    pot: 4,
    payout: 0,
    winners: [],
    tiedTop: false,
    finished: false,
    champions: [],
  });
}

export function createMatch(character = "tak", random = Math.random) {
  if (!CHARACTERS.some((c) => c.id === character)) throw new Error("Unknown character");
  const dealer = SEAT_ORDER[randomIndex(random, 4)];
  const characters = [character, ...CHARACTERS.map((c) => c.id).filter((id) => id !== character)];
  const match = {
    roundNumber: 0,
    players: characters.map((id) => ({ character: id, chips: STARTING_CHIPS })),
  };
  deal(match, dealer, random);
  return match;
}

export function nextRound(match, random = Math.random) {
  if (match.phase !== "result" || match.finished) return false;
  deal(match, SEAT_ORDER[(SEAT_ORDER.indexOf(match.dealer) + 1) % 4], random);
  return true;
}

// Only the original second card stays secret. A paid third card is immediately public.
// The CPU receives this same view, with no deck or other players' hidden cards.
export function viewFor(match, seat = 0) {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new Error("Invalid seat");
  return {
    phase: match.phase,
    seat,
    roundNumber: match.roundNumber,
    dealer: match.dealer,
    order: [...match.order],
    activeSeat: match.phase === "choose" ? match.order[match.turnIndex] : null,
    pot: match.pot,
    payout: match.payout,
    winners: [...match.winners],
    tiedTop: match.tiedTop,
    finished: match.finished,
    champions: [...match.champions],
    players: match.players.map((p, index) => ({
      character: p.character,
      expression: p.expression,
      decision: p.decision,
      chips: p.chips,
      beforeChips: p.beforeChips,
      wager: p.wager,
      hand: p.hand.map((card, i) =>
        i === 1 && index !== seat && match.phase !== "result" ? null : { ...card },
      ),
      score: index === seat || match.phase === "result" ? score(p.hand) : null,
    })),
  };
}

// Estimate net chip return, using public third cards, initial tells and tie priority.
// Future opponents are approximated as drawing on 0–5 if they can afford it.
// Marginal hidden-card distributions are estimates, not access to the actual deal.
export function chooseCpu(view) {
  const self = view.players[view.seat];
  if (self.chips < 1 || self.score === 9) return "stand";
  const known = new Set(view.players.flatMap((p) => p.hand.filter(Boolean).map((c) => c.id)));
  const unseen = createDeck().filter((c) => !known.has(c.id));
  const priority = view.order.indexOf(view.seat);
  const estimate = (value, drawn = null) => {
    const available = unseen.filter((c) => c.id !== drawn?.id);
    let winChance = 1,
      extraBets = 0;
    view.players.forEach((p, index) => {
      if (index === view.seat) return;
      const clues = available.filter(
        (c) => expressionFor(p.character, score([p.hand[0], c])) === p.expression,
      );
      const candidates = clues.length ? clues : available;
      const beats = (other) =>
        value > other || (value === other && priority < view.order.indexOf(index));
      let wins = 0,
        draws = 0;
      for (const hidden of candidates) {
        const initial = score([p.hand[0], hidden]);
        if (p.decision === "draw") {
          wins += Number(beats((initial + p.hand[2].value) % 10));
        } else if (p.decision === "stand" || p.chips < 1 || initial > 5) {
          wins += Number(beats(initial));
        } else {
          const options = available.filter((c) => c.id !== hidden.id);
          wins +=
            options.reduce((sum, c) => sum + Number(beats((initial + c.value) % 10)), 0) /
            options.length;
          draws++;
        }
      }
      winChance *= wins / candidates.length;
      extraBets += draws / candidates.length;
    });
    return winChance * (view.pot + Number(!!drawn) + extraBets) - Number(!!drawn);
  };
  const standing = estimate(self.score);
  const drawing =
    unseen.reduce((sum, c) => sum + estimate((self.score + c.value) % 10, c), 0) / unseen.length;
  return drawing > standing ? "draw" : "stand";
}

export function decideRound(match, seat, decision) {
  if (
    match.phase !== "choose" ||
    match.order[match.turnIndex] !== seat ||
    !["draw", "stand"].includes(decision)
  )
    return false;
  const player = match.players[seat];
  if (decision === "draw" && (player.chips < 1 || !match.deck.length)) return false;
  if (decision === "draw") {
    player.chips--;
    player.wager++;
    match.pot++;
    player.hand.push(match.deck.pop());
  }
  player.decision = decision;
  match.turnIndex++;
  if (match.turnIndex === 4) match.phase = "ready";
  return true;
}

export function revealRound(match) {
  if (match.phase !== "ready") return false;
  const best = Math.max(...match.players.map((p) => score(p.hand)));
  const leaders = match.order.filter((seat) => score(match.players[seat].hand) === best);
  const winner = leaders[0];
  match.winners = [winner];
  match.tiedTop = leaders.length > 1;
  match.payout = match.pot;
  match.players[winner].chips += match.pot;
  match.pot = 0;
  match.phase = "result";
  // A temporary zero while betting does not eliminate a player who wins this pot.
  match.finished = match.players.some((p) => p.chips === 0 || p.chips >= TARGET_CHIPS);
  const most = Math.max(...match.players.map((p) => p.chips));
  match.champions = match.finished
    ? match.players.flatMap((p, i) => (p.chips === most ? [i] : []))
    : [];
  return true;
}

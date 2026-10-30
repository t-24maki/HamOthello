import { isCharacter, tableCharacters } from "../poker/characters.js?v=poker-dilemma-20261025";
export { tableCharacters };
export const PROTOCOL = "mini-roulette-20261030-4";
export const OUTER_COUNT = 6;
export const WHEEL = Array.from({ length: OUTER_COUNT + 1 }, (_, n) => n);
export const color = (n) => (n === 0 ? "green" : n % 2 ? "red" : "black");
const spots = [];
function spot(id, numbers, kind) {
  const weight = WHEEL.filter((n) => numbers.includes(n)).length;
  spots.push({
    id,
    numbers,
    kind,
    weight,
    multiplier: OUTER_COUNT / weight,
    label: id === "red" ? "赤" : id === "black" ? "黒" : numbers.join("・"),
  });
}
for (let n = 0; n <= OUTER_COUNT; n++) spot(`n${n}`, [n], 1);
for (let n = 1; n <= OUTER_COUNT; n++) {
  const next = n === OUTER_COUNT ? 1 : n + 1;
  spot(`edge${n}`, [n, next], 2);
  spot(`zero${n}`, [0, n], 2);
  spot(`trio${n}`, [0, n, next], 3);
}
spot("red", [1, 3, 5], "color");
spot("black", [2, 4, 6], "color");
export const SPOTS = spots;
export const SPOT = Object.fromEntries(spots.map((s) => [s.id, s]));
export const stake = (bets) => (bets ?? []).reduce((sum, b) => sum + b.amount, 0);
export function validBets(bets, bank) {
  return (
    Array.isArray(bets) &&
    bets.length > 0 &&
    bets.length <= SPOTS.length &&
    new Set(bets.map((b) => b?.id)).size === bets.length &&
    bets.every(
      (b) =>
        b &&
        Object.hasOwn(SPOT, b.id) &&
        Number.isSafeInteger(b.amount) &&
        b.amount > 0 &&
        b.amount <= 50,
    ) &&
    stake(bets) <= bank
  );
}
// Returns include the stake. All seven-pocket bets pay exact integers (6/3/2).
export function payout(bets, number) {
  return bets.reduce(
    (sum, b) => sum + (SPOT[b.id].numbers.includes(number) ? b.amount * SPOT[b.id].multiplier : 0),
    0,
  );
}
export const finished = (state) =>
  state.phase === "result" && state.coins.some((n) => n <= 0 || n > 50);
export function ranking(coins) {
  return coins
    .map((amount, player) => ({
      player,
      coins: amount,
      rank: 1 + coins.filter((n) => n > amount).length,
    }))
    .sort((a, b) => b.coins - a.coins || a.player - b.player);
}
const choose = (items, random) =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const integer = (min, max, random) =>
  min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
export function cpuBets(bank, character, random = Math.random, results = []) {
  if (!Number.isInteger(bank) || bank < 1 || bank > 50) return [];
  if (character === "tak" && bank > 20) {
    // Aim past 50 in one hit, taking the broadest affordable coverage and
    // spending only the amount needed. Refunds include the original stake.
    const options = SPOTS.flatMap((s) => {
      for (let amount = 1; amount <= bank; amount++) {
        const bet = [{ id: s.id, amount }];
        if (bank - amount + payout(bet, s.numbers[0]) > 50) return [{ spot: s, amount }];
      }
      return [];
    });
    if (options.length) {
      const widest = Math.max(...options.map((o) => o.spot.weight));
      const candidates = options.filter((o) => o.spot.weight === widest);
      const colors = candidates.filter((o) => o.spot.kind === "color");
      const pick = choose(colors.length ? colors : candidates, random);
      return [{ id: pick.spot.id, amount: pick.amount }];
    }
  }
  if (character === "tak") {
    const count = Math.min(bank, integer(1, 3, random));
    let remaining = bank;
    const candidates = [...SPOTS],
      bets = [];
    for (let i = 0; i < count; i++) {
      const pick = choose(candidates, random);
      const amount = integer(1, Math.min(2, remaining - (count - i - 1)), random);
      bets.push({ id: pick.id, amount });
      remaining -= amount;
      candidates.splice(candidates.indexOf(pick), 1);
    }
    return bets;
  }
  if (character === "meg") {
    const count = Math.min(bank, integer(2, 3, random));
    const used = new Set(results);
    let remaining = bank;
    const candidates = SPOTS.filter((s) => s.kind === 1);
    const bets = [];
    for (let i = 0; i < count; i++) {
      const unseen = candidates.filter((s) => !used.has(s.numbers[0]));
      const pick = choose(unseen.length ? unseen : candidates, random);
      const amount = integer(1, Math.min(2, remaining - (count - i - 1)), random);
      bets.push({ id: pick.id, amount });
      remaining -= amount;
      candidates.splice(candidates.indexOf(pick), 1);
    }
    return bets;
  }
  if (character === "ham") {
    const count = bank >= 6 ? integer(1, 2, random) : 1;
    let remaining = bank;
    const candidates = [...SPOTS],
      bets = [];
    for (let i = 0; i < count; i++) {
      const pick = choose(candidates, random);
      const available = remaining - 3 * (count - i - 1);
      const amount = Math.min(available, integer(3, Math.min(5, Math.max(3, available)), random));
      bets.push({ id: pick.id, amount });
      remaining -= amount;
      candidates.splice(candidates.indexOf(pick), 1);
    }
    return bets;
  }
  const count = Math.min(bank, integer(1, 4, random));
  const candidates = [...SPOTS],
    bets = [];
  for (let i = 0; i < count; i++) {
    const pick = choose(candidates, random);
    bets.push({ id: pick.id, amount: 1 });
    candidates.splice(candidates.indexOf(pick), 1);
  }
  return bets;
}
// The current outcome is held back until the local spin animation finishes.
export function visibleResults(state, revealed = false) {
  return state.phase === "result" && !revealed ? state.results.slice(0, -1) : [...state.results];
}
export function createRound(
  matchId = "local",
  roundId = 1,
  random = Math.random,
  previous = null,
  characters = tableCharacters("tak"),
  humans = 1,
) {
  if (!characters || characters.length !== 4 || !characters.every(isCharacter))
    throw new Error("Invalid characters");
  const bank = previous ? [...previous.coins] : [20, 20, 20, 20];
  const results = previous ? [...previous.results] : [];
  return {
    protocol: PROTOCOL,
    matchId,
    roundId,
    roundNumber: previous ? previous.roundNumber + 1 : 1,
    revision: 0,
    humans,
    characters: [...characters],
    bank,
    coins: [...bank],
    results,
    bets: bank.map((n, p) => (p < humans ? null : cpuBets(n, characters[p], random, results))),
    phase: "bet",
    pocket: null,
    seen: [false, false],
    proceed: [false, false],
  };
}
export function canSubmit(s, player, type, bets) {
  if (!s || !Number.isInteger(player) || player < 0 || player >= s.humans) return false;
  if (type === "bet")
    return s.phase === "bet" && s.bets[player] === null && validBets(bets, s.bank[player]);
  if (type === "seen") return s.phase === "result" && !s.seen[player];
  return (
    (type === "next" || type === "rematch") &&
    s.phase === "result" &&
    !s.proceed[player] &&
    s.seen.slice(0, s.humans).every(Boolean) &&
    type === (finished(s) ? "rematch" : "next")
  );
}
export function applyAction(state, player, action, random = Math.random) {
  if (
    !action ||
    action.matchId !== state.matchId ||
    action.roundId !== state.roundId ||
    !canSubmit(state, player, action.type, action.bets)
  )
    return null;
  const s = structuredClone(state);
  s.revision++;
  if (action.type === "bet") {
    s.bets[player] = action.bets.map(({ id, amount }) => ({ id, amount }));
    if (s.bets.every(Boolean)) {
      s.pocket = Math.min(WHEEL.length - 1, Math.max(0, Math.floor(random() * WHEEL.length)));
      s.phase = "result";
      s.results.push(WHEEL[s.pocket]);
      s.coins = s.bank.map((n, p) => n - stake(s.bets[p]) + payout(s.bets[p], WHEEL[s.pocket]));
    }
  } else if (action.type === "seen") s.seen[player] = true;
  else {
    s.proceed[player] = true;
    if (s.proceed.slice(0, s.humans).every(Boolean))
      return createRound(
        s.matchId,
        s.roundId + 1,
        random,
        finished(s) ? null : s,
        s.characters,
        s.humans,
      );
  }
  return s;
}
export const playerView = (state) => structuredClone(state);
export function validView(s) {
  if (
    !s ||
    s.protocol !== PROTOCOL ||
    typeof s.matchId !== "string" ||
    !s.matchId ||
    s.matchId.length > 120 ||
    !Number.isSafeInteger(s.roundId) ||
    s.roundId < 1 ||
    !Number.isSafeInteger(s.roundNumber) ||
    s.roundNumber < 1 ||
    s.roundNumber > s.roundId ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    s.humans !== 2 ||
    !Array.isArray(s.characters) ||
    s.characters.length !== 4 ||
    !s.characters.every(isCharacter) ||
    !Array.isArray(s.results) ||
    !s.results.every((n) => WHEEL.includes(n)) ||
    s.results.length !== s.roundNumber - (s.phase === "bet" ? 1 : 0) ||
    !Array.isArray(s.bank) ||
    s.bank.length !== 4 ||
    !s.bank.every((n) => Number.isInteger(n) && n >= 1 && n <= 50) ||
    !Array.isArray(s.coins) ||
    s.coins.length !== 4 ||
    !s.coins.every((n) => Number.isInteger(n) && n >= 0 && n <= 50 * OUTER_COUNT) ||
    !Array.isArray(s.bets) ||
    s.bets.length !== 4 ||
    s.bets.some((b, p) => (b === null ? p >= s.humans : !validBets(b, s.bank[p]))) ||
    ![s.seen, s.proceed].every(
      (a) => Array.isArray(a) && a.length === 2 && a.every((v) => typeof v === "boolean"),
    ) ||
    (s.proceed.some(Boolean) && !s.seen.every(Boolean))
  )
    return false;
  if (s.phase === "bet")
    return (
      s.pocket === null &&
      !s.bets.every(Boolean) &&
      !s.seen.some(Boolean) &&
      !s.proceed.some(Boolean) &&
      s.coins.every((n, p) => n === s.bank[p])
    );
  return (
    s.phase === "result" &&
    Number.isInteger(s.pocket) &&
    s.pocket >= 0 &&
    s.pocket < WHEEL.length &&
    s.results.at(-1) === WHEEL[s.pocket] &&
    s.bets.every(Boolean) &&
    s.coins.every((n, p) => n === s.bank[p] - stake(s.bets[p]) + payout(s.bets[p], WHEEL[s.pocket]))
  );
}

import { FOODS, DICTIONARY_VERSION } from "./dictionary.js?v=20261026-1300words";
export { FOODS, DICTIONARY_VERSION };
export const PLAYERS = ["たくハム", "めぐハム"];
export const TURN_LIMIT_MS = 30_000;
export const SMALL_KANA = Object.freeze({
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  ゃ: "や",
  ゅ: "ゆ",
  ょ: "よ",
  っ: "つ",
  ゎ: "わ",
  ゕ: "か",
  ゖ: "け",
});
export function normalize(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
const words = new Map();
function register(key, word) {
  const normalized = normalize(key);
  const previous = words.get(normalized);
  if (previous && (previous.id !== word.id || previous.reading !== word.reading))
    throw new Error(`辞書の別表記が重複しています: ${key}`);
  words.set(normalized, Object.freeze(word));
}
for (const food of FOODS) {
  if (!/^[ぁ-ゖー]+$/.test(food.reading) || food.reading.startsWith("ー"))
    throw new Error(`よみを確認してください: ${food.name}`);
  const canonical = {
    id: food.id,
    name: food.name,
    reading: food.reading,
    category: food.category,
  };
  register(food.name, canonical);
  register(food.reading, canonical);
  for (const alias of food.aliases) {
    const [name, specified] = alias.split("~");
    const kana = normalize(name).replace(/・/g, "");
    const reading = specified || (/^[ぁ-ゖー]+$/.test(kana) ? kana : food.reading);
    // An orthographic variant retains the familiar display name. A different
    // reading, such as パイン, uses that reading for its starting/ending sound.
    const variant = { ...canonical, name: reading === food.reading ? food.name : name, reading };
    register(name, variant);
    register(reading, variant);
  }
}
export function lookup(value) {
  return words.get(normalize(value)) ?? null;
}
export function soundAtStart(reading) {
  return SMALL_KANA[reading[0]] ?? reading[0];
}
export function soundAtEnd(reading) {
  const last = reading.replace(/ー+$/, "").at(-1);
  return SMALL_KANA[last] ?? last;
}
export function createGame(starter = 0) {
  if (![0, 1].includes(starter)) throw new Error("Invalid starter");
  return {
    starter,
    turn: starter,
    history: [],
    next: "",
    winner: null,
    reason: null,
    failed: null,
  };
}
export function checkWord(state, player, input) {
  if (state.winner !== null)
    return { ok: false, code: "finished", message: "このしりとりは、おしまいだよ。" };
  if (player !== state.turn)
    return { ok: false, code: "turn", message: "相手の番だよ。ちょっと待ってね。" };
  const word = typeof input === "string" && input.length <= 80 ? lookup(input) : null;
  if (!word)
    return {
      ok: false,
      code: "dictionary",
      message: "まだ辞書にない言葉だよ。別の食べ物・飲み物を入れてね。",
    };
  if (state.history.some((item) => item.id === word.id)) return { ok: true, word, loss: "repeat" };
  if (state.next && soundAtStart(word.reading) !== state.next)
    return { ok: false, code: "start", message: `「${state.next}」ではじまる言葉を入れてね。` };
  return { ok: true, word, loss: soundAtEnd(word.reading) === "ん" ? "n" : null };
}
export function playWord(state, player, input) {
  const result = checkWord(state, player, input);
  if (!result.ok) return { ...result, state };
  const { word, loss } = result;
  if (loss)
    return {
      ok: true,
      state: { ...state, winner: 1 - player, reason: loss, failed: { ...word, player } },
    };
  return {
    ok: true,
    state: {
      ...state,
      turn: 1 - player,
      next: soundAtEnd(word.reading),
      history: [...state.history, { ...word, player }],
    },
  };
}
export function giveUp(state, player) {
  if (state.winner !== null || state.turn !== player) return null;
  return { ...state, winner: 1 - player, reason: "giveup" };
}
export function timeOut(state, player = state.turn) {
  if (state.winner !== null || state.turn !== player) return null;
  return { ...state, winner: 1 - player, reason: "timeout" };
}
export function resultCopy(state) {
  if (state.reason === "repeat") return `「${state.failed.name}」は、もう出ていたね。`;
  if (state.reason === "n") return `「${state.failed.name}」は「ん」でおしまいだったね。`;
  if (state.reason === "timeout") return `${PLAYERS[1 - state.winner]}、30秒たっちゃったね。`;
  return `${PLAYERS[1 - state.winner]}が「まいった」したよ。`;
}
// Validate snapshots by replaying registered words, never trusting supplied
// winners, readings or move ownership from a remote client.
export function validateGame(candidate) {
  if (
    !candidate ||
    ![0, 1].includes(candidate.starter) ||
    !Array.isArray(candidate.history) ||
    candidate.history.length > FOODS.length
  )
    return null;
  let state = createGame(candidate.starter);
  for (const item of candidate.history) {
    if (!item || item.player !== state.turn) return null;
    const result = playWord(state, item.player, item.reading);
    if (!result.ok || result.state.winner !== null || result.state.history.at(-1).id !== item.id)
      return null;
    state = result.state;
  }
  if (candidate.winner !== null) {
    if (candidate.reason === "giveup") state = giveUp(state, state.turn);
    else if (candidate.reason === "timeout") state = timeOut(state);
    else {
      if (candidate.failed?.player !== state.turn) return null;
      const result = playWord(state, state.turn, candidate.failed?.reading);
      if (
        !result.ok ||
        result.state.reason !== candidate.reason ||
        result.state.failed?.id !== candidate.failed.id
      )
        return null;
      state = result.state;
    }
  }
  if (
    !state ||
    state.turn !== candidate.turn ||
    state.next !== candidate.next ||
    state.winner !== candidate.winner ||
    state.reason !== candidate.reason
  )
    return null;
  return state;
}

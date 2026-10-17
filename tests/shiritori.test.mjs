import test from "node:test";
import assert from "node:assert/strict";
import {
  FOODS,
  lookup,
  normalize,
  soundAtEnd,
  createGame,
  playWord,
  giveUp,
  timeOut,
  TURN_LIMIT_MS,
  validateGame,
} from "../shiritori/rules.js";
import {
  createRound,
  expireRound,
  applyAction,
  validateRound,
  createShiritoriMatch,
  PROTOCOL,
} from "../shiritori/online.js";
const action = (state, type, word) => ({
  type,
  word,
  matchId: state.matchId,
  roundId: state.roundId,
  revision: state.revision,
});

test("food dictionary has unique entries, explicit kana readings, and working registered spellings", () => {
  assert.equal(FOODS.length, 1200);
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length);
  for (const food of FOODS) {
    assert.equal(lookup(food.name).id, food.id);
    assert.equal(lookup(food.reading).id, food.id);
    assert.match(food.reading, /^[ぁ-ゖー]+$/);
    for (const alias of food.aliases) assert.equal(lookup(alias.split("~")[0]).id, food.id);
  }
  assert.equal(lookup("りんご").id, lookup(" 林檎 ").id);
  assert.equal(lookup("ﾘﾝｺﾞ").id, lookup("リンゴ").id);
  assert.equal(lookup("空を飛ぶ犬"), null);
  assert.equal(lookup("<img src=x onerror=alert(1)>"), null);
  assert.equal(normalize(null), "");
});
test("requested foods work in both kana spellings and ending-in-n words remain valid losing moves", () => {
  for (const [word, ending] of [
    ["きんつば", "ば"],
    ["キーマカレー", "れ"],
    ["マカロン", "ん"],
    ["マカロニ", "に"],
    ["マカロニグラタン", "ん"],
    ["きんかん", "ん"],
    ["りんごあめ", "め"],
    ["にこごり", "り"],
    ["ちくわぶ", "ぶ"],
    ["くずきり", "り"],
    ["トッポギ", "ぎ"],
    ["がんもどき", "き"],
    ["レバ刺し", "し"],
    ["レバニラ", "ら"],
    ["するめ", "め"],
    ["するめいか", "か"],
    ["かんぴょうまき", "き"],
    ["からすみ", "み"],
    ["バインミー", "み"],
    ["もち", "ち"],
    ["マスカット", "と"],
    ["めかじき", "き"],
    ["めざし", "し"],
    ["ざらめ", "め"],
    ["ザーサイ", "い"],
    ["レモンパイ", "い"],
    ["タバスコ", "こ"],
    ["巨峰", "う"],
    ["ポン菓子", "し"],
  ]) {
    const food = lookup(word);
    assert.ok(food, word);
    const katakana = food.reading.replace(/[ぁ-ゖ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) + 0x60),
    );
    assert.equal(lookup(katakana).id, food.id);
    assert.equal(lookup(food.reading).id, food.id);
    const result = playWord(createGame(), 0, word);
    assert.ok(result.ok, word);
    assert.equal(
      ending === "ん" ? result.state.reason : result.state.next,
      ending === "ん" ? "n" : ending,
    );
  }
  assert.equal(lookup("りんご飴").id, lookup("リンゴアメ").id);
});
test("new food aliases keep their spoken endings and count as the same used food", () => {
  for (const [word, alias, ending] of [
    ["ごはん", "ライス", "す"],
    ["レバニラ炒め", "レバニラ", "ら"],
    ["レバニラ炒め", "ニラレバ", "ば"],
    ["するめ", "あたりめ", "め"],
    ["がんもどき", "がんも", "も"],
    ["トッポギ", "トッポッキ", "き"],
    ["にこごり", "煮凝り", "り"],
    ["かんぴょうまき", "干瓢巻き", "き"],
    ["もち", "お餅", "ち"],
    ["ざらめ", "ザラメ糖", "う"],
    ["ザーサイ", "搾菜", "い"],
    ["お茶漬け", "茶漬け", "け"],
    ["いちごミルク", "いちごオレ", "れ"],
  ]) {
    assert.equal(lookup(alias).id, lookup(word).id);
    const first = playWord(createGame(), 0, alias);
    assert.ok(first.ok, alias);
    assert.equal(first.state.next, ending);
    assert.equal(playWord(first.state, 1, word).state.reason, "repeat");
    assert.deepEqual(validateGame(first.state), first.state);
  }
  assert.notEqual(lookup("するめ").id, lookup("するめいか").id);
  assert.equal(lookup("レバ刺し").id, lookup("レバー刺し").id);
  assert.equal(lookup("おいなりさん").id, lookup("いなり寿司").id);
  assert.equal(playWord(createGame(), 0, "おいなりさん").state.reason, "n");
});
test("names with different readings preserve their own sounds but cannot bypass reuse", () => {
  assert.equal(lookup("パイン").reading, "ぱいん");
  assert.equal(lookup("中華そば").reading, "ちゅうかそば");
  assert.equal(lookup("ミルク").reading, "みるく");
  assert.equal(lookup("牛乳").reading, "ぎゅうにゅう");
  let state = playWord(createGame(), 0, "牛乳").state;
  assert.equal(state.next, "う");
  const repeated = playWord(state, 1, "ミルク");
  assert.equal(repeated.state.reason, "repeat");
  assert.equal(playWord(createGame(), 0, "パイン").state.reason, "n");
});
test("invalid dictionary entries and wrong starting sounds retain the current turn and history", () => {
  const first = playWord(createGame(), 0, "りんご");
  assert.ok(first.ok);
  assert.equal(first.state.next, "ご");
  assert.equal(first.state.turn, 1);
  for (const [text, code] of [
    ["ごりら", "dictionary"],
    ["みかん", "start"],
    ["x".repeat(100), "dictionary"],
  ]) {
    const invalid = playWord(first.state, 1, text);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, code);
    assert.equal(invalid.state, first.state);
  }
  assert.equal(playWord(first.state, 0, "ごま").code, "turn");
});
test("players alternate, repeated registered words lose, and ending in n loses", () => {
  let state = createGame();
  for (const word of ["りんご", "ごま", "まぐろ", "ロールキャベツ", "つみれ"]) {
    const next = playWord(state, state.turn, word);
    assert.ok(next.ok);
    assert.equal(next.state.history.length, state.history.length + 1);
    state = next.state;
  }
  const end = playWord(state, state.turn, "レモン").state;
  assert.equal(end.winner, 0);
  assert.equal(end.reason, "n");
  assert.equal(end.history.length, 5);
  assert.equal(playWord(end, 0, "りんご").ok, false);
  const first = playWord(createGame(), 0, "りんご").state;
  const repeat = playWord(first, 1, "林檎").state;
  assert.equal(repeat.reason, "repeat");
  assert.equal(repeat.winner, 0);
  assert.equal(first.history.length, 1);
});
test("long marks, small kana and voicing use the documented matching rule", () => {
  for (const [word, ending] of [
    ["カレー", "れ"],
    ["コーヒー", "ひ"],
    ["紅茶", "や"],
    ["シチュー", "ゆ"],
    ["フィナンシェ", "え"],
    ["スパゲッティ", "い"],
  ])
    assert.equal(soundAtEnd(lookup(word).reading), ending);
  const state = playWord(createGame(), 0, "りんご").state;
  assert.equal(playWord(state, 1, "コーヒー").ok, false);
  const tea = playWord(createGame(), 0, "紅茶").state;
  assert.ok(playWord(tea, 1, "焼き芋").ok);
});
test("giveup belongs to the active player; malformed or invented snapshots are rejected", () => {
  let state = playWord(createGame(), 0, "りんご").state;
  assert.equal(giveUp(state, 0), null);
  assert.equal(giveUp(state, 1).winner, 0);
  assert.deepEqual(validateGame(state), state);
  assert.deepEqual(validateGame(giveUp(state, 1)), giveUp(state, 1));
  const n = playWord(createGame(), 0, "プリン").state;
  assert.deepEqual(validateGame(n), n);
  const repeat = playWord(state, 1, "リンゴ").state;
  assert.deepEqual(validateGame(repeat), repeat);
  for (const invalid of [
    { ...state, winner: 0 },
    { ...state, next: "あ" },
    { ...state, history: [{ ...state.history[0], id: "madeup" }] },
    { ...state, history: [{ ...state.history[0], player: 1 }] },
    null,
  ])
    assert.equal(validateGame(invalid), null);
});
test("online actions enforce turns and revisions, safely retry rematch votes and validate outcomes", () => {
  let state = createRound("room");
  assert.ok(validateRound(state));
  const first = action(state, "word", "りんご");
  assert.equal(applyAction(state, 1, first).ok, false);
  state = applyAction(state, 0, first).state;
  assert.equal(applyAction(state, 0, first).ok, false);
  assert.ok(validateRound(state));
  assert.equal(applyAction(state, 1, action(state, "word", "ごりら")).ok, false);
  state = applyAction(state, 1, action(state, "word", "ごはん")).state;
  assert.equal(state.winner, 0);
  assert.ok(validateRound(state));
  const hostVote = action(state, "rematch"),
    guestVote = action(state, "rematch");
  state = applyAction(state, 0, hostVote).state;
  assert.ok(validateRound(state));
  assert.equal(applyAction(state, 0, hostVote).ok, false);
  state = applyAction(state, 1, guestVote).state;
  assert.equal(state.roundId, 2);
  assert.equal(state.turn, 1);
  assert.equal(state.history.length, 0);
  assert.equal(applyAction(state, 1, guestVote).ok, false);
  assert.equal(validateRound({ ...state, protocol: "old-dictionary" }), null);
  assert.equal(validateRound({ ...state, revision: 5 }), null);
});
test("the active player loses at exactly 30 seconds, once, with a valid replayable outcome", () => {
  const state = createRound("timed", 1, 1000);
  assert.equal(TURN_LIMIT_MS, 30000);
  assert.equal(state.turnEndsAt, 31000);
  assert.equal(expireRound(state, 30999), state);
  const expired = expireRound(state, 31000);
  assert.equal(expired.reason, "timeout");
  assert.equal(expired.winner, 1);
  assert.equal(expired.revision, 1);
  assert.equal(expired.history.length, 0);
  assert.equal(expireRound(expired, 999999), expired);
  assert.ok(validateRound(expired));
  assert.equal(timeOut(createGame(), 1), null);
  assert.equal(timeOut(expired), null);
  assert.deepEqual(validateGame(timeOut(createGame(1))), timeOut(createGame(1)));
  assert.equal(validateRound({ ...state, turnEndsAt: NaN }), null);
  assert.equal(validateRound({ ...state, turnEndsAt: null }), null);
});
test("accepted words start a new 30 seconds; invalid, stale and late submissions cannot extend time", () => {
  const initial = createRound("timed", 1, 1000);
  assert.equal(applyAction(initial, 0, action(initial, "word", "ごりら"), 20000).ok, false);
  assert.equal(initial.turnEndsAt, 31000);
  const first = applyAction(initial, 0, action(initial, "word", "りんご"), 30999).state;
  assert.equal(first.turnEndsAt, 60999);
  assert.equal(first.turn, 1);
  assert.equal(applyAction(first, 1, action(first, "word", "きんつば"), 50000).ok, false);
  assert.equal(first.turnEndsAt, 60999);
  assert.equal(applyAction(first, 0, action(initial, "word", "りんご"), 51000).ok, false);
  for (const arrival of [31000, 45000]) {
    const late = applyAction(initial, 0, action(initial, "word", "りんご"), arrival).state;
    assert.equal(late.reason, "timeout");
    assert.equal(late.history.length, 0);
    assert.equal(late.turnEndsAt, initial.turnEndsAt);
  }
});
test("a rematch only starts its deadline when both players agree", () => {
  let state = expireRound(createRound("timed", 1, 1000), 31000);
  state = applyAction(state, 0, action(state, "rematch"), 90000).state;
  assert.equal(state.turnEndsAt, 31000);
  assert.equal(state.reason, "timeout");
  state = applyAction(state, 1, action(state, "rematch"), 200000).state;
  assert.equal(state.turn, 1);
  assert.equal(state.turnEndsAt, 230000);
  assert.equal(state.winner, null);
  assert.ok(validateRound(state));
});
function wire() {
  const peers = [],
    intervals = new Set();
  let dropRequest = false,
    dropResponse = false;
  return {
    peers,
    intervals,
    timers: {
      setInterval(fn) {
        intervals.add(fn);
        return fn;
      },
      clearInterval(fn) {
        intervals.delete(fn);
      },
    },
    factory: async (options) => {
      const peer = { options, id: `seat-${peers.length}`, closed: false };
      peers.push(peer);
      if (peers.length === 2)
        queueMicrotask(() =>
          peers.forEach((p) => {
            p.options.onPeerChange(true, {});
            p.options.onReady();
          }),
        );
      return {
        clientId: peer.id,
        async send(message) {
          if (message.type === "action" && dropRequest) {
            dropRequest = false;
            return true;
          }
          if (message.type === "state" && message.ack && dropResponse) {
            dropResponse = false;
            return true;
          }
          peers.find((p) => p !== peer && !p.closed)?.options.onMessage(structuredClone(message));
          return true;
        },
        async close() {
          peer.closed = true;
        },
      };
    },
    dropRequest() {
      dropRequest = true;
    },
    dropResponse() {
      dropResponse = true;
    },
    retry() {
      for (const fn of intervals) fn();
    },
  };
}
async function pair({ guestSkew = 0 } = {}) {
  const network = wire(),
    h = [],
    g = [],
    errors = [];
  const base = {
    roomCode: "HAMU-ABC234",
    sessionFactory: network.factory,
    timers: network.timers,
    onError: (e) => errors.push(e.message),
  };
  const clock = { time: 1000000 };
  const host = await createShiritoriMatch({
    ...base,
    role: "host",
    now: () => clock.time,
    onState: (s) => h.push(s),
  });
  const guest = await createShiritoriMatch({
    ...base,
    role: "guest",
    now: () => clock.time + guestSkew,
    onState: (s) => g.push(s),
  });
  await new Promise(setImmediate);
  return { network, host, guest, h: () => h.at(-1), g: () => g.at(-1), errors, clock };
}
test("two clients synchronize words and losses, repair dropped messages, and agree to rematch", async () => {
  const p = await pair();
  try {
    assert.equal(p.network.peers[0].options.channelPrefix, "takumegu-food-shiritori");
    assert.equal(p.network.peers[0].options.protocolVersion, PROTOCOL);
    assert.ok(p.host.submit("word", "りんご"));
    assert.deepEqual(p.h(), p.g());
    p.network.dropRequest();
    assert.ok(p.guest.submit("word", "ごま"));
    assert.equal(p.guest.submit("word", "ごま"), false);
    assert.equal(p.h().history.length, 1);
    p.network.retry();
    assert.equal(p.h().history.length, 2);
    assert.deepEqual(p.h(), p.g());
    assert.ok(p.host.submit("word", "まぐろ"));
    p.network.dropResponse();
    assert.ok(p.guest.submit("word", "ロールキャベツ"));
    assert.equal(p.h().history.length, 4);
    p.network.retry();
    assert.equal(p.h().history.length, 4);
    assert.deepEqual(p.h(), p.g());
    assert.ok(p.host.submit("word", "つみれ"));
    assert.ok(p.guest.submit("word", "レモン"));
    assert.equal(p.h().reason, "n");
    assert.deepEqual(p.h(), p.g());
    assert.ok(p.host.submit("rematch"));
    assert.equal(p.h().roundId, 1);
    assert.ok(p.guest.submit("rematch"));
    assert.equal(p.h().roundId, 2);
    assert.equal(p.g().turn, 1);
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.network.intervals.size, 0);
});
test("disconnection freezes input and clears all retry timers", async () => {
  const p = await pair();
  p.network.peers[0].options.onPeerChange(false, { previousPeerId: "seat-1" });
  assert.match(p.errors[0], /通信が切れた/);
  assert.equal(p.host.submit("word", "りんご"), false);
  p.guest.close();
  assert.equal(p.network.intervals.size, 0);
});
test("the host broadcasts timeout to both players despite different device clocks", async () => {
  const p = await pair({ guestSkew: 7200000 });
  try {
    assert.equal(p.host.remainingMs(), 30000);
    assert.equal(p.guest.remainingMs(), 30000);
    p.clock.time += 29999;
    p.network.retry();
    assert.equal(p.host.remainingMs(), 1);
    assert.equal(p.guest.remainingMs(), 1);
    assert.equal(p.h().winner, null);
    p.clock.time++;
    p.network.retry();
    assert.equal(p.h().reason, "timeout");
    assert.equal(p.h().winner, 1);
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.guest.remainingMs(), 0);
    p.network.retry();
    assert.equal(p.h().revision, 1);
    assert.ok(p.host.submit("rematch"));
    p.clock.time += 50000;
    p.network.retry();
    assert.equal(p.h().roundId, 1);
    assert.ok(p.guest.submit("rematch"));
    assert.equal(p.g().turn, 1);
    assert.equal(p.host.remainingMs(), 30000);
    assert.equal(p.guest.remainingMs(), 30000);
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("a suspended timer cannot accept a late word, and delayed guest requests cannot reverse timeout", async () => {
  const p = await pair();
  try {
    p.clock.time += 31000;
    assert.equal(p.host.submit("word", "りんご"), false);
    assert.equal(p.h().reason, "timeout");
    assert.equal(p.h().history.length, 0);
    assert.deepEqual(p.h(), p.g());
    p.host.submit("rematch");
    p.guest.submit("rematch");
    p.network.dropRequest();
    assert.equal(p.guest.submit("word", "りんご"), true);
    p.clock.time += 30000;
    p.network.retry();
    assert.equal(p.h().reason, "timeout");
    assert.equal(p.h().winner, 0);
    assert.equal(p.h().history.length, 0);
    assert.deepEqual(p.h(), p.g());
    assert.deepEqual(p.errors, []);
    assert.ok(p.guest.submit("rematch"));
  } finally {
    p.host.close();
    p.guest.close();
  }
});

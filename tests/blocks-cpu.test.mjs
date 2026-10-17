import test from "node:test";
import assert from "node:assert/strict";
import { chooseMove } from "../blocks/cpu.js";
import { createCpuTurn } from "../blocks/cpu-turn.js";
import { createGame, play, legalMoves, canPlace, seededRandom } from "../blocks/rules.js";
import { completePacking } from "./blocks-fixtures.mjs";

for (const difficulty of ["easy", "normal", "hard"])
  test(`blocks CPU ${difficulty}: legal, immutable moves through seeded full games`, () => {
    for (const seed of [3, 19, 51, 88]) {
      let state = createGame({ seed, starter: seed % 2 });
      const random = seededRandom(seed);
      while (state.status === "playing") {
        const before = structuredClone(state);
        const action = chooseMove(state, difficulty, {
          random,
          maxNodes: 1000,
          maxMs: 2000,
          now: () => 0,
        });
        assert.ok(canPlace(state, action));
        assert.deepEqual(state, before);
        state = play(state, action).state;
        assert.ok(state.moves.length <= 14);
      }
      assert.equal(chooseMove(state, difficulty), null);
    }
  });
test("blocks CPU: easy uses different pieces and placements instead of always taking the first legal move", () => {
  const state = createGame({ seed: 1 }),
    random = seededRandom(4);
  const choices = Array.from({ length: 60 }, () => chooseMove(state, "easy", { random }));
  assert.equal(new Set(choices.map((a) => a.piece)).size, 7);
  assert.ok(new Set(choices.map(JSON.stringify)).size > 30);
});
for (const difficulty of ["normal", "hard"])
  test(`blocks CPU ${difficulty}: chooses an immediate win for either owner`, () => {
    for (const owner of [0, 1]) {
      const state = createGame({ starter: owner });
      const spaces = [0, 1, 2, 3, 16, 17, 24, 25];
      state.board = Array.from({ length: 64 }, (_, i) => (spaces.includes(i) ? 0 : 1));
      state.hands = owner === 0 ? [["I", "O"], ["O"]] : [["O"], ["I", "O"]];
      const action = chooseMove(state, difficulty, { now: () => 0, random: seededRandom(3) });
      const next = play(state, action).state;
      assert.equal(action.piece, "O");
      assert.equal(next.winner, owner);
      assert.equal(next.reason, "blocked");
    }
  });
for (const difficulty of ["normal", "hard"])
  test(`blocks CPU ${difficulty}: avoids the opponent's immediate winning reply`, () => {
    const history = [
      ["S", 0, 2, 0],
      ["J", 2, 5, 6],
      ["Z", 1, 5, 2],
      ["T", 2, 2, 5],
      ["L", 3, 6, 1],
      ["L", 1, 1, 0],
      ["O", 0, 2, 3],
      ["Z", 1, 0, 3],
      ["I", 0, 0, 7],
      ["S", 0, 4, 0],
    ];
    let state = createGame({ seed: 86 });
    for (const [piece, rotation, x, y] of history)
      state = play(state, { piece, rotation, x, y }).state;
    const choices = [...legalMoves(state)];
    const losesNext = (action) => {
      const next = play(state, action).state;
      return [...legalMoves(next)].some((reply) => play(next, reply).state.winner === next.turn);
    };
    assert.equal(choices.length, 3);
    assert.equal(choices.filter(losesNext).length, 2);
    const action = chooseMove(state, difficulty, {
      now: () => 0,
      maxNodes: 100000,
      random: seededRandom(23),
    });
    assert.equal(losesNext(action), false);
  });
test("blocks CPU: the final piece respects the second-player victory for both starting players", () => {
  for (const starter of [0, 1]) {
    let state = createGame({ blocked: [60, 61, 62, 63], starter });
    for (const action of completePacking.slice(0, 13)) state = play(state, action).state;
    const result = play(state, chooseMove(state, "hard"));
    assert.ok(result.ok);
    assert.equal(result.state.winner, 1 - starter);
    assert.equal(result.state.reason, "all-placed");
    assert.deepEqual(result.state.hands, [[], []]);
  }
});
test("blocks CPU: exhausted time and node budgets still return a legal move", () => {
  const state = createGame({ seed: 90 });
  for (const options of [{ maxNodes: 0 }, { maxMs: 0 }, { maxNodes: 2, now: () => 0 }])
    assert.ok(canPlace(state, chooseMove(state, "hard", options)));
  state.board.fill(1);
  assert.equal(chooseMove(state), null);
});

function runner(makeWorker) {
  const tasks = new Map(),
    workers = [],
    outputs = [];
  let serial = 0;
  const timers = {
    setTimeout(fn, ms) {
      const id = ++serial;
      tasks.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };
  const factory = () => {
    const worker = {
      terminated: false,
      message: null,
      postMessage(message) {
        this.message = message;
      },
      terminate() {
        this.terminated = true;
      },
    };
    workers.push(worker);
    return worker;
  };
  const cpu = createCpuTurn({ timers, makeWorker: makeWorker ?? factory });
  const advance = (ms) => {
    const due = [...tasks].filter(([, task]) => task.ms === ms);
    for (const [id, task] of due) {
      tasks.delete(id);
      task.fn();
    }
  };
  return {
    ...cpu,
    tasks,
    workers,
    outputs,
    advance,
    begin(state = createGame({ seed: 2 })) {
      cpu.start(state, "normal", (action) => outputs.push(action));
      return state;
    },
  };
}
test("blocks CPU turn: delayed worker result is accepted once and timers are cleared", () => {
  const r = runner(),
    state = r.begin();
  assert.equal(r.workers.length, 0);
  r.advance(420);
  const worker = r.workers[0],
    action = legalMoves(state).next().value;
  assert.equal(worker.message.difficulty, "normal");
  worker.onmessage({ data: { id: worker.message.id + 1, action } });
  assert.equal(r.outputs.length, 0);
  worker.onmessage({ data: { id: worker.message.id, action } });
  worker.onmessage({ data: { id: worker.message.id, action } });
  assert.deepEqual(r.outputs, [action]);
  assert.equal(worker.terminated, true);
  assert.equal(r.tasks.size, 0);
});
test("blocks CPU turn: cancelling before launch prevents a later move", () => {
  const r = runner();
  r.begin();
  r.cancel();
  r.advance(420);
  assert.equal(r.workers.length, 0);
  assert.equal(r.outputs.length, 0);
  assert.equal(r.tasks.size, 0);
});
test("blocks CPU turn: a cancelled worker cannot place into a new match", () => {
  const r = runner(),
    old = r.begin();
  r.advance(420);
  const worker = r.workers[0];
  const fresh = createGame({ seed: 5 });
  r.begin(fresh);
  worker.onmessage({ data: { id: worker.message.id, action: legalMoves(old).next().value } });
  worker.onerror({ preventDefault() {} });
  assert.equal(r.outputs.length, 0);
  assert.equal(worker.terminated, true);
  r.advance(420);
  const current = r.workers[1],
    action = legalMoves(fresh).next().value;
  current.onmessage({ data: { id: current.message.id, action } });
  assert.deepEqual(r.outputs, [action]);
});
test("blocks CPU turn: unsupported worker, worker error, bad response and timeout all have a legal fallback", () => {
  for (const failure of ["unsupported", "error", "invalid", "timeout"]) {
    const r = runner(
      failure === "unsupported"
        ? () => {
            throw Error("unavailable");
          }
        : undefined,
    );
    const state = r.begin();
    r.advance(420);
    const worker = r.workers[0];
    if (failure === "error") worker.onerror({ preventDefault() {} });
    if (failure === "invalid")
      worker.onmessage({
        data: { id: worker.message.id, action: { piece: "I", x: 99, y: 99, rotation: 0 } },
      });
    if (failure === "timeout") r.advance(2500);
    assert.equal(r.outputs.length, 1, failure);
    assert.ok(canPlace(state, r.outputs[0]), failure);
    assert.equal(r.tasks.size, 0);
    if (worker) assert.equal(worker.terminated, true);
  }
});
test("blocks CPU turn: no worker starts after the match is over", () => {
  const r = runner(),
    state = createGame();
  state.status = "won";
  r.begin(state);
  r.advance(420);
  assert.equal(r.tasks.size, 0);
  assert.equal(r.workers.length, 0);
});

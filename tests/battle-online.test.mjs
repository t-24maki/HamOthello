import test from "node:test";
import assert from "node:assert/strict";
import { createBattlePeer } from "../battle/online-peer.js";
import { createBattleOnline } from "../battle/online.js";
import { PROTOCOL, readGame, gameView, validState } from "../battle/online-protocol.js";
import { STEP, EMPTY_INPUT, createMatch, tick } from "../battle/engine.js";
const empty = () => ({ ...EMPTY_INPUT });
function pair(options = {}) {
  let time = 1,
    queue = [],
    messages = [],
    errors = [];
  const peers = [];
  const send = (from, m) => {
    const packet = structuredClone(m);
    messages.push({ from, m: packet });
    queue.push({ from, m: packet });
  };
  const host = createBattlePeer({
    role: "host",
    matchId: "test-match",
    now: () => time,
    send: (m) => send(0, m),
    onError: (e) => errors.push(e.message),
    ...options,
  });
  const guest = createBattlePeer({
    role: "guest",
    character: options.guestCharacter ?? (options.character === "meg" ? "tak" : "meg"),
    now: () => time,
    send: (m) => send(1, m),
    onError: (e) => errors.push(e.message),
  });
  peers.push(host, guest);
  function deliver(filter = () => true) {
    const q = queue;
    queue = [];
    for (const p of q) if (filter(p)) peers[1 - p.from].receive(structuredClone(p.m));
  }
  function flush() {
    guest.flush();
    deliver();
    host.flush();
    deliver();
  }
  function step(h = empty(), g = empty()) {
    time += STEP * 1000;
    host.update(STEP, () => h);
    guest.update(STEP, () => g);
    guest.renderGame(STEP);
  }
  function run(seconds, h = empty(), g = empty(), filter = () => true) {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      step(typeof h === "function" ? h(i) : h, typeof g === "function" ? g(i) : g);
      if (i % 12 === 0) {
        guest.flush();
        host.flush();
        deliver(filter);
      }
    }
    flush();
  }
  host.connect();
  guest.connect();
  deliver();
  flush();
  return {
    host,
    guest,
    deliver,
    flush,
    step,
    run,
    errors,
    messages,
    peers,
    advance(ms) {
      time += ms;
    },
    drain() {
      const q = queue;
      queue = [];
      return q;
    },
    ready() {
      host.request("ready");
      guest.request("ready");
      deliver();
      flush();
    },
    play() {
      this.ready();
      run(2.8);
      assert.equal(host.info().game.phase, "playing");
      assert.equal(guest.info().game.phase, "playing");
    },
  };
}
test("host-authoritative potions, both seats' growth, pause and fall resets reach the guest", () => {
  for (const seat of [0, 1]) {
    const p = pair({ character: "ham", guestCharacter: "tapi", stageId: "meadow" });
    p.play();
    const g = p.host.info().game,
      f = g.fighters[seat];
    g.items.wait = 0;
    g.items.potion = { x: f.x, y: 10, vy: 0, platformId: null };
    p.flush();
    assert.deepEqual(p.guest.info().game.items, g.items);
    g.items.potion.y = f.y - 18;
    p.step();
    p.flush();
    assert.equal(f.giant, true);
    assert.equal(p.guest.info().game.fighters[seat].giant, true);
    assert.equal(p.guest.renderGame().fighters[seat].giant, true);
    assert.equal(p.guest.info().game.items.potion, null);
    p.host.request("pause");
    p.deliver();
    p.flush();
    const before = structuredClone(g.items);
    p.run(1);
    assert.deepEqual(g.items, before);
    assert.equal(p.guest.info().game.fighters[seat].giant, true);
    p.host.request("ready");
    p.guest.request("ready");
    p.deliver();
    p.flush();
    Object.assign(f, { x: -95, grounded: false });
    p.step();
    p.flush();
    assert.equal(f.giant, false);
    assert.equal(p.guest.info().game.fighters[seat].giant, false);
    assert.equal(p.guest.info().game.fighters[seat].stocks, 2);
    assert.deepEqual(p.errors, []);
  }
});
test("long potion respawn waits reach the guest without stalling state updates", () => {
  const p = pair({ stageId: "meadow" });
  p.play();
  const g = p.host.info().game;
  g.items.potion = null;
  g.items.wait = 19.5;
  p.flush();
  assert.equal(p.guest.info().game.items.wait, 19.5);
  p.run(13);
  assert.equal(g.items.potion, null);
  assert.ok(Math.abs(g.items.wait - 6.5) < 1e-8);
  assert.deepEqual(p.guest.info().game.items, g.items);
  assert.equal(p.guest.info().game.elapsed, g.elapsed);
  assert.deepEqual(p.errors, []);
});
test("online giant refresh and timed expiry reach both seats and stale snapshots cannot restore growth", () => {
  for (const seat of [0, 1]) {
    const p = pair({ character: "ham", guestCharacter: "tapi", stageId: "meadow" });
    p.play();
    const g = p.host.info().game,
      f = g.fighters[seat];
    const collect = () => {
      g.items.wait = 0;
      g.items.potion = { x: f.x, y: f.y - 18, vy: 0, platformId: null };
      p.step();
      p.flush();
      assert.equal(f.giantTime, 10);
      assert.equal(p.guest.info().game.fighters[seat].giantTime, 10);
      g.items.wait = 12;
    };
    collect();
    p.run(7.5);
    assert.ok(Math.abs(f.giantTime - 2.5) < 1e-8);
    assert.equal(p.guest.info().game.fighters[seat].giantTime, f.giantTime);
    collect();
    const old = structuredClone(
      p.messages.filter((q) => q.from === 0 && q.m.type === "state").at(-1).m,
    );
    p.run(10 - STEP);
    assert.equal(f.giant, true);
    p.step();
    p.flush();
    assert.equal(f.giantTime, 0);
    assert.equal(f.giant, false);
    p.guest.receive(old);
    assert.equal(p.guest.info().game.fighters[seat].giant, false);
    assert.equal(p.guest.renderGame().fighters[seat].giant, false);
    assert.equal(p.guest.info().game.fighters[seat].giantTime, 0);
    assert.deepEqual(p.errors, []);
  }
});
test("online rematch clears both giants and starts a fresh single-item schedule", () => {
  const p = pair();
  p.play();
  const g = p.host.info().game;
  g.fighters.forEach((f) => {
    f.giant = true;
    f.giantTime = 10;
  });
  g.remaining = STEP;
  p.step();
  p.flush();
  p.host.request("rematch");
  p.guest.request("rematch");
  p.deliver();
  p.flush();
  for (const peer of [p.host, p.guest]) {
    const next = peer.info().game;
    assert.deepEqual(
      next.fighters.map((f) => f.giant),
      [false, false],
    );
    assert.equal(next.items.potion, null);
    assert.deepEqual(
      next.fighters.map((f) => f.giantTime),
      [0, 0],
    );
    assert.ok(next.items.wait >= 8 && next.items.wait < 12);
  }
  assert.deepEqual(p.guest.info().game.items, p.host.info().game.items);
});
for (const stageId of ["islands", "seesaw", "planet"])
  test(`${stageId}: both peers share terrain motion, pause and the same stage on rematch`, () => {
    const p = pair({ character: "ham", guestCharacter: "tapi", stageId });
    p.play();
    p.run(3);
    const g = p.host.info().game;
    assert.equal(p.guest.info().game.stageId, stageId);
    assert.deepEqual(p.guest.info().game.fighters, g.fighters);
    p.host.request("pause");
    p.deliver();
    p.flush();
    const before = gameView(g);
    p.run(1);
    assert.deepEqual(gameView(g), before);
    assert.equal(p.guest.info().game.elapsed, g.elapsed);
    p.host.request("ready");
    p.guest.request("ready");
    p.deliver();
    p.flush();
    g.remaining = STEP;
    p.step();
    p.flush();
    p.host.request("rematch");
    p.guest.request("rematch");
    p.deliver();
    p.flush();
    assert.equal(p.host.info().game.stageId, stageId);
    assert.equal(p.host.info().game.elapsed, 0);
    assert.deepEqual(p.guest.info().game.fighters, p.host.info().game.fighters);
    assert.deepEqual(p.errors, []);
  });
test("online room uses host stage/character, assigns opposite seats, waits for both ready", () => {
  const p = pair({ character: "meg", stageId: "cloud" });
  assert.equal(p.guest.info().seat, 1);
  assert.deepEqual(
    p.guest.info().game.fighters.map((f) => f.character),
    ["meg", "tak"],
  );
  assert.equal(p.guest.info().game.stageId, "cloud");
  p.host.request("ready");
  p.flush();
  p.run(0.3);
  assert.equal(p.host.info().game.phase, "paused");
  p.guest.request("ready");
  p.deliver();
  p.flush();
  assert.equal(p.guest.info().game.phase, "countdown");
  p.run(2.8);
  assert.equal(p.host.info().game.phase, "playing");
});
test("guest sees immediate movement while damage and stocks remain host-authoritative", () => {
  const p = pair();
  p.play();
  const x = p.guest.info().game.fighters[1].x;
  p.guest.update(0.1, () => ({ ...empty(), move: -1 }));
  assert.ok(p.guest.renderGame().fighters[1].x < x);
  assert.equal(p.guest.info().game.fighters[1].x, x);
  assert.equal(p.host.info().game.fighters[1].x, x);
  assert.deepEqual(
    p.guest.info().game.fighters.map((f) => f.damage),
    [0, 0],
  );
  p.flush();
  p.run(0.2, empty(), { ...empty(), move: -1 });
  assert.ok(p.host.info().game.fighters[1].x < x);
});
test("lost and duplicated jump packets deliver one edge, never a second jump", () => {
  const p = pair();
  p.play();
  p.step(empty(), { ...empty(), jump: true });
  p.guest.flush();
  const first = p.drain().find((q) => q.from === 1).m; // lost packet
  p.advance(100);
  p.guest.flush();
  const retry = p.drain().find((q) => q.from === 1).m;
  p.host.receive(retry);
  p.host.receive(retry);
  p.host.receive(first);
  p.step();
  p.step();
  assert.equal(p.host.info().game.fighters[1].jumps, 1);
  assert.equal(p.host.info().game.events.filter((e) => e.type === "jump").length, 1);
});
test("both attack directions apply damage through host collision detection", () => {
  const p = pair();
  p.play();
  const g = p.host.info().game;
  g.fighters[0].x = 350;
  g.fighters[1].x = 415;
  p.flush();
  p.step({ ...empty(), attack: true });
  p.run(0.13);
  p.flush();
  assert.equal(p.guest.info().game.fighters[1].damage, 8);
  Object.assign(g.fighters[0], { x: 350, invincible: 0, stun: 0 });
  Object.assign(g.fighters[1], {
    x: 415,
    y: 370,
    vx: 0,
    vy: 0,
    grounded: true,
    invincible: 0,
    stun: 0,
  });
  p.flush();
  p.step(empty(), { ...empty(), attack: true });
  p.flush();
  p.run(0.13);
  p.flush();
  assert.equal(p.guest.info().game.fighters[0].damage, 10);
});
test("both characters' special damage and recovery cross the wire from either seat", () => {
  for (const character of ["tak", "meg"]) {
    for (const seat of [0, 1]) {
      const p = pair({ character, guestCharacter: character, stageId: "meadow" });
      p.play();
      const game = p.host.info().game;
      Object.assign(game.fighters[0], { x: 365, y: 300 });
      Object.assign(game.fighters[1], { x: 435, y: 300 });
      p.flush();
      const inputs = [empty(), empty()];
      inputs[seat].special = true;
      p.step(...inputs);
      p.flush();
      p.run(0.15);
      const host = p.host.info().game.fighters;
      const guest = p.guest.info().game.fighters;
      assert.equal(host[1 - seat].damage, character === "tak" ? 13 : 17);
      assert.deepEqual(
        guest.map((f) => f.damage),
        host.map((f) => f.damage),
      );
      assert.equal(guest[seat].attack?.duration, character === "tak" ? 0.36 : 0.46);
      assert.equal(guest[seat].specialCooldown, host[seat].specialCooldown);
      assert.equal(p.errors.length, 0);
    }
  }
});
test("pause is shared and resume requires two fresh ready votes; old input cannot survive", () => {
  const p = pair();
  p.play();
  p.run(0.1, empty(), { ...empty(), move: 1 });
  const old = p.messages.filter((q) => q.from === 1 && q.m.type === "input").at(-1).m;
  p.guest.request("pause");
  assert.equal(p.guest.renderGame().phase, "paused");
  p.deliver();
  p.flush();
  const remaining = p.host.info().game.remaining;
  assert.equal(p.host.info().game.phase, "paused");
  p.host.request("ready");
  p.run(0.3);
  assert.equal(p.host.info().game.remaining, remaining);
  p.guest.request("ready");
  p.deliver();
  p.flush();
  p.host.receive(old);
  p.run(0.3);
  assert.equal(p.host.info().game.phase, "playing");
  assert.equal(p.host.info().game.fighters[1].vx, 0);
});
test("stale or malformed state cannot overwrite the guest", () => {
  const p = pair();
  p.play();
  const good = structuredClone(
    p.messages.filter((q) => q.from === 0 && q.m.type === "state").at(-1).m,
  );
  for (const mutate of [
    (m) => (m.game.fighters[1].x = NaN),
    (m) => (m.game.fighters[0].stocks = 99),
    (m) => (m.game.stageId = "other"),
    (m) => (m.ready = [true]),
    (m) => (m.protocol = "old"),
    (m) => (m.matchId = "other"),
    (m) => (m.game.events = [{ id: 2, type: "unknown" }]),
    (m) => (m.game.fighters[0].attack = { kind: "normal" }),
  ]) {
    const bad = structuredClone(good);
    bad.serial += 100;
    mutate(bad);
    p.guest.receive(bad);
    assert.equal(p.guest.info().game.phase, "playing");
    assert.ok(Number.isFinite(p.guest.info().game.fighters[1].x));
    assert.equal(p.guest.info().game.fighters[0].stocks, 3);
  }
  const stale = structuredClone(good);
  stale.game.fighters[0].damage = 999;
  p.guest.receive(stale);
  assert.equal(p.guest.info().game.fighters[0].damage, 0);
});
test("invalid controls and huge edge-counter jumps never move or attack the host fighter", () => {
  const p = pair();
  p.play();
  const m = structuredClone(
    p.messages.filter((q) => q.from === 1 && q.m.type === "input").at(-1).m,
  );
  m.input.seq += 20;
  m.input.edges.attack = 99999;
  m.input.move = 1;
  p.host.receive(m);
  p.run(0.1);
  assert.equal(p.host.info().game.fighters[1].attack, null);
  assert.equal(p.host.info().game.fighters[1].x, 550);
});
test("missing input releases held movement before lost connection pauses both peers", () => {
  const p = pair();
  p.play();
  p.run(0.1, empty(), { ...empty(), move: 1 });
  p.drain();
  p.advance(400);
  p.host.update(0.1, empty);
  assert.equal(p.host.info().game.fighters[1].vx, 0);
  p.advance(600);
  p.host.flush();
  p.guest.flush();
  p.deliver();
  p.flush();
  assert.equal(p.host.info().game.phase, "paused");
  assert.equal(p.guest.info().game.phase, "paused");
});
test("long outage fails once and never awards a disconnect win", () => {
  const p = pair();
  p.play();
  p.advance(8100);
  p.host.flush();
  p.host.flush();
  assert.equal(p.errors.length, 1);
  assert.equal(p.host.info().stopped, true);
  assert.equal(p.host.info().game.winner, null);
  assert.equal(p.host.info().game.phase, "paused");
});
test("a stalled frame requests a shared pause instead of fast-forwarding the fight", () => {
  const p = pair();
  p.play();
  const before = p.host.info().game.remaining;
  p.guest.update(2, empty);
  p.deliver();
  p.flush();
  assert.equal(p.host.info().game.remaining, before);
  assert.equal(p.host.info().game.phase, "paused");
});
test("stock finish is identical on both peers and rematch requires both votes", () => {
  const p = pair({ stageId: "cloud", character: "meg" });
  p.play();
  const g = p.host.info().game;
  g.fighters[1].stocks = 1;
  g.fighters[1].y = 620;
  g.fighters[1].grounded = false;
  p.step();
  p.flush();
  assert.equal(p.guest.info().game.phase, "finished");
  assert.equal(p.guest.info().game.winner, 0);
  const old = structuredClone(
    p.messages.filter((q) => q.from === 0 && q.m.type === "state").at(-1).m,
  );
  p.guest.request("rematch");
  p.deliver();
  p.flush();
  assert.equal(p.host.info().game.phase, "finished");
  p.host.request("rematch");
  p.deliver();
  p.flush();
  assert.equal(p.guest.info().round, 2);
  assert.equal(p.guest.info().game.phase, "paused");
  assert.equal(p.guest.info().game.stageId, "cloud");
  assert.deepEqual(
    p.guest.info().game.fighters.map((f) => [f.character, f.stocks, f.damage]),
    [
      ["meg", 3, 0],
      ["tak", 3, 0],
    ],
  );
  p.guest.receive(old);
  assert.equal(p.guest.info().round, 2);
  p.ready();
  assert.equal(p.guest.info().game.phase, "countdown");
});
test("time-limit winner and a simultaneous draw survive state validation", () => {
  for (const stocks of [
    [3, 2],
    [3, 3],
  ]) {
    const p = pair();
    p.play();
    const g = p.host.info().game;
    g.remaining = STEP;
    g.fighters.forEach((f, i) => (f.stocks = stocks[i]));
    p.step();
    p.flush();
    assert.equal(p.guest.info().game.phase, "finished");
    assert.equal(p.guest.info().game.reason, "time");
    assert.equal(p.guest.info().game.winner, stocks[0] === stocks[1] ? null : 0);
  }
});
for (const stageId of ["hill", "meadow", "cloud", "islands", "seesaw", "planet"])
  test(`120 seconds of ${stageId} physics serialize safely, including slopes/moving platforms`, () => {
    const g = createMatch("tak", "normal", stageId);
    g.phase = "playing";
    for (let n = 0; n < 14410 && g.phase !== "finished"; n++) {
      const input = (i) => ({
        ...empty(),
        move: n % 300 < 150 ? 1 : -1,
        jump: n % 91 === i,
        attack: n % 51 === i,
        special: n % 181 === i,
        guard: n % 210 > 190,
      });
      tick(g, [input(0), input(1)]);
      if (n % 12 === 0) assert.ok(readGame(gameView(g)), `invalid tick ${n}`);
      // Keep exercising platforms after outs without ending the simulation early.
      for (const f of g.fighters) if (f.stocks === 1) f.stocks = 3;
    }
    assert.ok(readGame(gameView(g)));
  });
test("bad state headers and non-finite physics are rejected", () => {
  assert.equal(validState({}), false);
  assert.equal(readGame({}), null);
  for (const k of ["x", "y", "vx", "vy", "damage", "shield"]) {
    const g = createMatch();
    g.fighters[0][k] = Infinity;
    assert.equal(readGame(gameView(g)), null);
  }
});
test("closing a room notifies the other peer and never keeps simulating", () => {
  const p = pair();
  p.play();
  p.guest.close();
  p.deliver();
  assert.equal(p.errors.length, 1);
  assert.ok(p.errors[0].includes("へやを出た"));
  const t = p.host.info().game.remaining;
  p.run(0.2);
  assert.equal(p.host.info().game.remaining, t);
});
function fakeSession({ early = true } = {}) {
  let callbacks,
    closes = 0,
    timer = null,
    cleared = 0,
    messages = [];
  return {
    get callbacks() {
      return callbacks;
    },
    get closes() {
      return closes;
    },
    get cleared() {
      return cleared;
    },
    messages,
    timers: {
      setInterval(fn, ms) {
        assert.equal(ms, 100);
        timer = fn;
        return 9;
      },
      clearInterval(id) {
        assert.equal(id, 9);
        cleared++;
        timer = null;
      },
    },
    factory: async (opts) => {
      callbacks = opts;
      assert.equal(opts.channelPrefix, "takumegu-battle");
      assert.deepEqual(opts.supportedRules, ["battle"]);
      if (early) {
        opts.onReady();
        opts.onMessage({ type: "hello", protocol: PROTOCOL, character: "meg" });
      }
      return {
        clientId: "transport-id",
        send: async (m) => {
          messages.push(m);
          return true;
        },
        close: async () => {
          closes++;
        },
      };
    },
    flush() {
      timer?.();
    },
  };
}
test("transport tolerates ready before construction, owns its timer and closes once", async () => {
  const f = fakeSession();
  const session = await createBattleOnline({
    role: "host",
    roomCode: "HAMU-ABC234",
    sessionFactory: f.factory,
    timers: f.timers,
  });
  assert.equal(session.info().game.phase, "paused");
  assert.ok(f.messages.some((m) => m.type === "state"));
  session.close();
  session.close();
  assert.equal(f.closes, 1);
  assert.equal(f.cleared, 1);
});
test("transport disconnect/replacement fails once and cleans the interval", async () => {
  for (const replacement of [false, true]) {
    const f = fakeSession();
    let errors = 0;
    const session = await createBattleOnline({
      role: "host",
      roomCode: "HAMU-ABC234",
      sessionFactory: f.factory,
      timers: f.timers,
      onError: () => errors++,
    });
    f.callbacks.onPeerChange(true, { peerId: "original" });
    f.callbacks.onPeerChange(replacement, {
      peerId: replacement ? "new" : null,
      previousPeerId: "original",
    });
    f.callbacks.onError(new Error("extra"));
    assert.equal(errors, 1);
    assert.equal(f.closes, 1);
    assert.equal(f.cleared, 1);
    assert.equal(session.info().stopped, true);
  }
});
test("transport subscription failure rejects without leaving a live timer", async () => {
  const f = fakeSession();
  await assert.rejects(
    createBattleOnline({
      role: "host",
      roomCode: "HAMU-ABC234",
      timers: f.timers,
      sessionFactory: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
  assert.equal(f.cleared, 0);
});
test("prediction converges under 200ms round-trip latency, jitter, loss and reordering", () => {
  const p = pair({ stageId: "cloud" });
  p.play();
  let inFlight = [];
  for (let i = 0; i < 960; i++) {
    p.step(empty(), {
      ...empty(),
      move: i < 50 ? -1 : i > 50 && i < 80 ? 1 : 0,
      jump: i === 140 || i === 165,
      attack: i === 400,
      special: i === 510,
    });
    if (i % 12 === 0) {
      p.host.flush();
      p.guest.flush();
    }
    for (const packet of p.drain()) {
      if (packet.from === 0 && i % 60 === 0) continue;
      inFlight.push({ ...packet, due: i + 12 + (i % 36 === 0 ? 15 : 0) });
      if (packet.from === 1 && i % 84 === 0) inFlight.push({ ...packet, due: i + 17 });
    }
    const arriving = inFlight.filter((x) => x.due <= i);
    inFlight = inFlight.filter((x) => x.due > i);
    for (const packet of arriving.reverse()) p.peers[1 - packet.from].receive(packet.m);
    assert.equal(p.host.info().game.phase, "playing");
    assert.ok(
      p.guest.renderGame().fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y)),
    );
  }
  p.flush();
  p.run(0.4);
  assert.deepEqual(
    p.guest.info().game.fighters.map((f) => [f.stocks, f.damage]),
    p.host.info().game.fighters.map((f) => [f.stocks, f.damage]),
  );
  assert.equal(p.guest.info().game.fighters[1].x, p.host.info().game.fighters[1].x);
  // Visual prediction may lead the moving cloud by one 100ms send interval (up to 7px).
  assert.ok(Math.abs(p.guest.renderGame().fighters[1].x - p.host.info().game.fighters[1].x) < 12);
  assert.equal(p.errors.length, 0);
});
test("hit effects cross the wire, while impossible winners and malformed effects are rejected", () => {
  const g = createMatch();
  g.phase = "playing";
  g.fighters[0].x = 350;
  g.fighters[1].x = 415;
  tick(g, [{ ...empty(), attack: true }, empty()]);
  for (let i = 0; i < 12; i++) tick(g);
  const state = readGame(gameView(g));
  assert.ok(state.effects.some((e) => e.type === "hit"));
  const bad = gameView(g);
  bad.effects[0].color = "url(https://example.com)";
  assert.equal(readGame(bad), null);
  const wrong = createMatch();
  wrong.phase = "finished";
  wrong.reason = "time";
  wrong.remaining = 0;
  wrong.winner = 1;
  assert.equal(readGame(gameView(wrong)), null);
});
test("leaving the screen after ready cancels that vote instead of starting without the player", () => {
  for (const seat of [0, 1]) {
    const p = pair();
    p.peers[seat].request("ready");
    p.deliver();
    p.flush();
    p.peers[seat].request("pause");
    p.deliver();
    p.flush();
    p.peers[1 - seat].request("ready");
    p.deliver();
    p.flush();
    assert.equal(p.host.info().game.phase, "paused");
    assert.equal(p.host.info().ready[seat], false);
    p.peers[seat].request("ready");
    p.deliver();
    p.flush();
    assert.equal(p.host.info().game.phase, "countdown");
  }
});
test("an early disconnect before session construction cannot leak a heartbeat timer", async () => {
  const p = pair();
  const state = p.messages.find((q) => q.m.type === "state").m;
  let active = 0,
    closes = 0;
  await assert.rejects(
    createBattleOnline({
      role: "guest",
      character: "meg",
      roomCode: "HAMU-ABC234",
      timers: {
        setInterval() {
          active++;
          return 1;
        },
        clearInterval() {
          active--;
        },
      },
      sessionFactory: async (opts) => {
        opts.onReady();
        opts.onMessage(state);
        opts.onMessage({ type: "leave", protocol: PROTOCOL, matchId: state.matchId });
        return {
          clientId: "guest",
          send: async () => true,
          close: async () => {
            closes++;
          },
        };
      },
    }),
    /へやを出た/,
  );
  assert.equal(active, 0);
  assert.equal(closes, 1);
});
for (const host of ["tak", "meg", "ham", "tapi"])
  for (const guest of ["tak", "meg", "ham", "tapi"]) {
    test(`independent selections ${host}/${guest} survive both screens, respawn and rematch`, () => {
      const p = pair({ character: host, guestCharacter: guest });
      for (const peer of p.peers)
        assert.deepEqual(
          peer.info().game.fighters.map((f) => f.character),
          [host, guest],
        );
      p.play();
      const g = p.host.info().game;
      Object.assign(g.fighters[1], { y: 620, grounded: false });
      p.step();
      p.flush();
      assert.equal(p.guest.info().game.fighters[1].character, guest);
      assert.equal(p.guest.info().game.fighters[1].stocks, 2);
      Object.assign(g.fighters[0], { stocks: 1, y: 620, grounded: false });
      p.step();
      p.flush();
      assert.equal(p.guest.info().game.winner, 1);
      p.guest.request("rematch");
      p.deliver();
      p.host.request("rematch");
      p.deliver();
      p.flush();
      assert.deepEqual(
        p.guest.info().game.fighters.map((f) => [f.character, f.stocks, f.damage]),
        [
          [host, 3, 0],
          [guest, 3, 0],
        ],
      );
      assert.equal(p.guest.info().round, 2);
    });
  }
test("Tapi's third and fourth jump inputs synchronize without accepting a fifth", () => {
  for (const seat of [0, 1]) {
    const p = pair({
      character: seat ? "ham" : "tapi",
      guestCharacter: seat ? "tapi" : "ham",
      stageId: "meadow",
    });
    p.play();
    for (let n = 1; n <= 4; n++) {
      const inputs = [empty(), empty()];
      inputs[seat].jump = true;
      p.step(...inputs);
      p.flush();
      p.run(0.09);
      assert.equal(p.host.info().game.fighters[seat].jumps, n);
      assert.equal(p.guest.info().game.fighters[seat].jumps, n);
    }
    const inputs = [empty(), empty()];
    inputs[seat].jump = true;
    p.step(...inputs);
    p.flush();
    p.run(0.05);
    assert.equal(p.guest.info().game.fighters[seat].jumps, 4);
    assert.equal(p.errors.length, 0);
  }
});
test("host waits for the guest selection; lost/duplicate selection packets are harmless", () => {
  let time = 1;
  const toHost = [],
    toGuest = [];
  const host = createBattlePeer({
    role: "host",
    matchId: "selection",
    character: "meg",
    now: () => time,
    send: (m) => toGuest.push(structuredClone(m)),
  });
  const guest = createBattlePeer({
    role: "guest",
    character: "meg",
    now: () => time,
    send: (m) => toHost.push(structuredClone(m)),
  });
  host.connect();
  guest.connect();
  toHost.length = 0;
  host.update(0.1, empty);
  assert.equal(host.info().game, null);
  assert.equal(host.request("ready"), false);
  for (const character of [null, "constructor", "__proto__", "other"])
    host.receive({ type: "hello", protocol: PROTOCOL, character });
  assert.equal(host.info().game, null);
  time += 100;
  guest.flush();
  host.receive(toHost[0]);
  host.receive(toHost[0]);
  for (const m of toGuest) guest.receive(m);
  assert.equal(host.info().round, 1);
  assert.deepEqual(
    guest.info().game.fighters.map((f) => f.character),
    ["meg", "meg"],
  );
  host.receive({ ...toHost[0], character: "tak" });
  assert.equal(host.info().game.fighters[1].character, "meg");
});
test("guest rejects a snapshot replacing its selected character or changing the host mid-room", () => {
  const p = pair({ character: "tak", guestCharacter: "tak" });
  const state = structuredClone(p.messages.findLast((q) => q.m.type === "state").m);
  for (const index of [0, 1]) {
    const bad = structuredClone(state);
    bad.serial += 100;
    bad.game.fighters[index].character = "meg";
    p.guest.receive(bad);
    assert.deepEqual(
      p.guest.info().game.fighters.map((f) => f.character),
      ["tak", "tak"],
    );
  }
});

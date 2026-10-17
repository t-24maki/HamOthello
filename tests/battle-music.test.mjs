import test from "node:test";
import assert from "node:assert/strict";
import { createBattleMusic, wantsMusic } from "../battle/music.js";
function player(play = () => Promise.resolve()) {
  return {
    currentTime: 0,
    loop: false,
    volume: 1,
    paused: true,
    plays: 0,
    pauses: 0,
    play() {
      this.plays++;
      this.paused = false;
      return play();
    },
    pause() {
      this.pauses++;
      this.paused = true;
    },
  };
}
test("music plays only during an audible visible match, including its countdown", () => {
  for (const phase of [undefined, "countdown", "playing", "paused", "finished"]) {
    assert.equal(wantsMusic(true, phase), phase === "countdown" || phase === "playing");
    assert.equal(wantsMusic(false, phase), false);
    assert.equal(wantsMusic(true, phase, true), false);
  }
});
test("BGM loops, starts once, pauses without rewinding, and resumes from the same position", async () => {
  const p = player(),
    music = createBattleMusic(p);
  music.setPlaying(true);
  music.setPlaying(true);
  await Promise.resolve();
  assert.equal(p.loop, true);
  assert.equal(p.volume, 0.35);
  assert.equal(p.plays, 1);
  p.currentTime = 17;
  music.setPlaying(false);
  assert.equal(p.paused, true);
  assert.equal(p.currentTime, 17);
  music.setPlaying(true);
  assert.equal(p.currentTime, 17);
  assert.equal(p.plays, 2);
});
test("rematch resets BGM to the beginning, without changing the mute setting", () => {
  const p = player(),
    music = createBattleMusic(p);
  music.setPlaying(true);
  p.currentTime = 23;
  music.reset();
  assert.equal(p.currentTime, 0);
  assert.equal(p.paused, true);
  music.setPlaying(false);
  assert.equal(p.plays, 1);
  music.setPlaying(true);
  assert.equal(p.plays, 2);
});
test("a late play resolution cannot unpause audio after mute or leaving the match", async () => {
  let resolve;
  const p = player(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
    music = createBattleMusic(p);
  music.setPlaying(true);
  music.setPlaying(false);
  p.paused = false;
  resolve();
  await Promise.resolve();
  assert.equal(p.paused, true);
});
test("expected cancellation of pending playback never shows a stale error", async () => {
  let reject,
    errors = 0;
  const p = player(
      () =>
        new Promise((r, j) => {
          reject = j;
        }),
    ),
    music = createBattleMusic(p, () => errors++);
  music.setPlaying(true);
  music.reset();
  reject(new Error("cancelled"));
  await Promise.resolve();
  assert.equal(errors, 0);
});
test("a genuine playback failure is reported and can be retried with OFF then ON", async () => {
  let errors = 0;
  const p = player(() => Promise.reject(new Error("blocked"))),
    music = createBattleMusic(p, () => errors++);
  music.setPlaying(true);
  await Promise.resolve();
  assert.equal(errors, 1);
  music.setPlaying(false);
  music.setPlaying(true);
  await Promise.resolve();
  assert.equal(p.plays, 2);
  assert.equal(errors, 2);
});
test("online ready gesture primes audio and a delayed unlock never stops an active match", async () => {
  let resolve;
  const p = player(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
    music = createBattleMusic(p);
  music.unlock();
  const unlockDone = resolve;
  music.setPlaying(true);
  unlockDone();
  await Promise.resolve();
  assert.equal(p.paused, false);
  resolve();
  await Promise.resolve();
  music.setPlaying(false);
  assert.equal(p.paused, true);
});
test("priming audio while waiting for the other player pauses after the gesture", async () => {
  const p = player(),
    music = createBattleMusic(p);
  music.unlock();
  await Promise.resolve();
  assert.equal(p.paused, true);
});

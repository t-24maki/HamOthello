// Game time excludes reconnection waits. The host keeps the authoritative game
// in memory; adapters request its snapshot before accepting new input.
export function createConnectionGuard(clock = Date.now) {
  let held = false, since = 0, skipped = 0;
  return {
    get paused() { return held; },
    now: () => (held ? since : clock()) - skipped,
    change(status, {idleMs = 0} = {}) {
      const pause = status !== "connected" && status !== "waiting";
      if (pause && !held) { since = clock() - Math.max(0, idleMs); held = true; }
      if (!pause && held) { skipped += Math.max(0, clock() - since); held = false; }
    },
  };
}

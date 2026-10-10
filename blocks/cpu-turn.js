import { canPlace, legalMoves } from "./rules.js?v=20261010-blocks3";

export function createCpuTurn({
  makeWorker = () =>
    new Worker(new URL("./cpu-worker.js?v=20261010-blocks3", import.meta.url), { type: "module" }),
  timers = globalThis,
  delay = 420,
  timeout = 2500,
} = {}) {
  let job = null,
    serial = 0;
  function cancel() {
    if (!job) return;
    const current = job;
    job = null;
    timers.clearTimeout(current.delay);
    timers.clearTimeout(current.timeout);
    current.worker?.terminate();
  }
  function start(state, difficulty, onMove) {
    cancel();
    if (state.status !== "playing") return;
    const current = { id: ++serial, worker: null, delay: null, timeout: null };
    job = current;
    const finish = (action) => {
      if (job !== current) return;
      const safeAction = canPlace(state, action)
        ? action
        : (legalMoves(state).next().value ?? null);
      cancel();
      onMove(safeAction);
    };
    current.delay = timers.setTimeout(() => {
      if (job !== current) return;
      // A failed or stalled Worker must not freeze the match or run a long
      // search on the UI thread. Fall back to one legal placement instead.
      current.timeout = timers.setTimeout(() => finish(null), timeout);
      try {
        current.worker = makeWorker();
        current.worker.onmessage = ({ data }) => {
          if (data?.id === current.id) finish(data.action);
        };
        current.worker.onerror = (event) => {
          event?.preventDefault?.();
          finish(null);
        };
        current.worker.postMessage({ id: current.id, state, difficulty });
      } catch {
        finish(null);
      }
    }, delay);
  }
  return { start, cancel };
}

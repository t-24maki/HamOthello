export const RESULT_DELAY_MS = 3000;
// Local display time, not match time. Repeated network snapshots never restart
// the three-second look at the final board, and old rounds cannot open a modal.
export function createResultGate(now = () => performance.now()) {
  let key = null,
    finishedAt = null;
  return {
    ready(nextKey, finished) {
      if (nextKey !== key || !finished) {
        key = nextKey;
        finishedAt = null;
      }
      if (!finished) return false;
      finishedAt ??= now();
      return now() - finishedAt >= RESULT_DELAY_MS;
    },
  };
}

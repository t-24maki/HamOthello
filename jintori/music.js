// One song follows the match clock. Browser gesture priming stays silent.
export function createMatchMusic(player, onError = () => {}) {
  player.loop = false;
  player.volume = 0.35;
  player.muted = true;
  let enabled = false,
    state = { key: null, phase: "", frame: 0 },
    requested = false,
    ended = false,
    failed = false,
    revision = 0,
    pendingSeek = null;
  function seek(seconds) {
    pendingSeek = seconds;
    if (player.readyState === 0) return;
    try {
      player.currentTime = seconds;
      pendingSeek = null;
    } catch {
      // Safari may wait for metadata before accepting a seek.
    }
  }
  player.addEventListener("loadedmetadata", () => {
    if (pendingSeek !== null) seek(pendingSeek);
  });
  player.addEventListener("ended", () => {
    if (requested) {
      ended = true;
      requested = false;
    }
  });
  function stop() {
    revision++;
    requested = false;
    player.muted = true;
    player.pause();
  }
  function reconcile() {
    const wanted = enabled && state.phase === "playing" && !state.blocked && !ended && !failed;
    if (!wanted) {
      if (requested) stop();
      return;
    }
    if (requested) return;
    requested = true;
    const token = ++revision;
    seek(state.frame / 60);
    player.muted = false;
    Promise.resolve(player.play()).catch(() => {
      if (token !== revision || !requested) return;
      failed = true;
      stop();
      onError();
    });
  }
  return {
    sync(next) {
      if (next.key !== state.key) {
        stop();
        seek(0);
        ended = failed = false;
      }
      state = next;
      reconcile();
    },
    setEnabled(next) {
      enabled = next;
      failed = false;
      if (!enabled) stop();
      else reconcile();
    },
    unlock() {
      if (!enabled || requested || ended) return;
      // Called directly by a click, so mobile browsers authorize this element.
      player.muted = true;
      Promise.resolve(player.play()).then(
        () => {
          if (!requested) {
            player.pause();
            seek(state.frame / 60);
          }
        },
        () => {},
      );
    },
    reset() {
      stop();
      seek(0);
      ended = failed = false;
      state = { key: null, phase: "", frame: 0 };
    },
  };
}

// A local static server may not support byte ranges. A Blob gives the audio
// element a fully seekable source, so pause/resume also works in local previews.
export async function prepareMusicSource(player) {
  const response = await fetch(player.src);
  if (!response.ok) throw new Error("BGM could not be loaded");
  const source = URL.createObjectURL(await response.blob());
  player.src = source;
  player.load();
  return source;
}

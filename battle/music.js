// Called directly by start/resume/sound controls to retain mobile user activation.
export function createBattleMusic(player, onError = () => {}) {
  let requested = false,
    revision = 0;
  player.loop = true;
  player.volume = 0.35;
  return {
    unlock() {
      if (requested) return;
      // Prime this media element during the ready-button gesture, before the remote reply.
      try {
        Promise.resolve(player.play()).then(
          () => {
            if (!requested) player.pause();
          },
          () => {},
        );
      } catch {
        /* A later explicit sound toggle can retry. */
      }
    },
    setPlaying(playing) {
      if (playing === requested) return;
      requested = playing;
      const request = ++revision;
      if (!playing) {
        player.pause();
        return;
      }
      const failed = () => {
        if (requested && request === revision) onError();
      };
      try {
        Promise.resolve(player.play()).then(() => {
          // A late play promise must never restart music after pause, mute or exit.
          if (!requested) player.pause();
        }, failed);
      } catch {
        failed();
      }
    },
    reset() {
      requested = false;
      ++revision;
      player.pause();
      try {
        player.currentTime = 0;
      } catch {
        /* Metadata may still be loading. */
      }
    },
  };
}
export function wantsMusic(soundEnabled, phase, hidden = false) {
  return soundEnabled && !hidden && (phase === "countdown" || phase === "playing");
}

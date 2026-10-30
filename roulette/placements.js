// Presentation only: the authoritative bets stay in the round state.
// Each destination travels as one stack, so a large bet never creates a long wait.
export class ChipPlacements {
  constructor(ownSeat) {
    this.ownSeat = ownSeat;
    this.order = [2, ownSeat === 0 ? 1 : 0, 3];
    this.bets = [null, null, null, null];
    this.received = new Set();
    this.queue = [];
    this.elapsed = 0;
  }

  sync(bets) {
    for (const player of this.order) {
      if (!bets[player] || this.received.has(player)) continue;
      this.received.add(player);
      this.bets[player] = [];
      this.queue.push(...bets[player].map((bet) => ({ ...bet, player })));
    }
  }

  get active() {
    return this.queue[0] ?? null;
  }

  pending(player) {
    return this.queue.some((bet) => bet.player === player);
  }

  get progress() {
    // Briefly show the stack in the hand, then let it settle before the next one.
    return Math.max(0, Math.min(1, (this.elapsed - 60) / 360));
  }

  advance(milliseconds, { paused = false, reduced = false } = {}) {
    if (paused || !this.active) return false;
    this.elapsed += Math.max(0, milliseconds);
    const duration = reduced ? 100 : 500;
    let changed = false;
    while (this.active && this.elapsed >= duration) {
      const { player, id, amount } = this.queue.shift();
      this.bets[player].push({ id, amount });
      this.elapsed -= duration;
      changed = true;
    }
    if (!this.active) this.elapsed = 0;
    return changed;
  }
}

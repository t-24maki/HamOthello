// A visible-time clock: menus, rules and background tabs never consume a cue.
export class CueClock {
  constructor(cues) { this.cues = [...cues].sort((a, b) => a.at - b.at); this.elapsed = 0; this.index = 0; }
  advance(ms, paused = false) {
    if (paused) return [];
    this.elapsed += Math.max(0, ms);
    const due = [];
    while (this.index < this.cues.length && this.cues[this.index].at <= this.elapsed) due.push(this.cues[this.index++]);
    return due;
  }
  get done() { return this.index === this.cues.length; }
}

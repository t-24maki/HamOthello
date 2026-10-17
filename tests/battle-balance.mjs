// Manual, reproducible CPU mirror tournament. Not a human balance guarantee.
// node tests/battle-balance.mjs [seeds-per-matchup=24] [first-seed=1] [all]
import { CHARACTERS, createMatch, tick, STEP } from "../battle/engine.js";
import { createCPU, cpuInput } from "../battle/cpu.js";
import { STAGES } from "../battle/stages.js";
import { gameView, readGame } from "../battle/online-protocol.js";

const count = Number(process.argv[2] ?? 24);
const first = Number(process.argv[3] ?? 1);
if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(first) || first < 1)
  throw new Error("Use positive integer seed counts and starting seeds.");
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const results = [];
const roster = process.argv[4] === "all" ? Object.keys(CHARACTERS) : ["tak", "meg"];
const matchups = roster.flatMap((a, i) => roster.slice(i + 1).map((b) => [a, b]));
for (const matchup of matchups) {
  for (const stage of STAGES) {
    for (const difficulty of ["easy", "normal", "hard"]) {
      const row = {
        matchup,
        stage: stage.id,
        difficulty,
        ...Object.fromEntries(roster.map((key) => [key, 0])),
        draw: 0,
        timeouts: 0,
      };
      for (let seed = first; seed < first + count; seed++) {
        // Swap both characters' seats with the same seat-based random streams.
        for (const seat of [0, 1]) {
          const game = createMatch(matchup[seat], difficulty, stage.id, matchup[1 - seat], seed);
          game.phase = "playing";
          const brains = [createCPU(seeded(seed * 2)), createCPU(seeded(seed * 2 + 1))];
          for (let frame = 0; frame < 120 * 121 && game.phase !== "finished"; frame++) {
            tick(
              game,
              brains.map((brain, i) => cpuInput(game, brain, STEP, i)),
            );
            if (frame % 120 === 0 && !readGame(gameView(game)))
              throw new Error("Invalid network snapshot");
          }
          if (game.phase !== "finished") throw new Error("Match did not finish");
          row[game.winner === null ? "draw" : game.fighters[game.winner].character]++;
          if (game.reason === "time") row.timeouts++;
        }
      }
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }
}
console.log(
  JSON.stringify({
    seeds: [first, first + count - 1],
    total: results.reduce(
      (sum, row) => {
        for (const key of [...roster, "draw", "timeouts"]) sum[key] += row[key];
        return sum;
      },
      Object.fromEntries([...roster, "draw", "timeouts"].map((key) => [key, 0])),
    ),
  }),
);

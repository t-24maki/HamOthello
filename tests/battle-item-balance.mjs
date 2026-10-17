// Manual, reproducible item-frequency comparison. CPU results do not rank human balance.
// node tests/battle-item-balance.mjs [seeds-per-matchup=12]
import assert from "node:assert/strict";
import { CHARACTERS, createMatch, tick, STEP, hurtbox, attackArea } from "../battle/engine.js";
import { createCPU, cpuInput } from "../battle/cpu.js";
import { STAGES } from "../battle/stages.js";
import { gameView, readGame } from "../battle/online-protocol.js";

const count = Number(process.argv[2] ?? 12);
assert.ok(Number.isSafeInteger(count) && count > 0);
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const roster = Object.keys(CHARACTERS);
const matchups = roster.flatMap((a, i) => roster.slice(i + 1).map((b) => [a, b]));
const geometry = roster.map((character) => {
  const f = createMatch(character).fighters[0];
  f.facing = 1;
  f.attack = { kind: "normal", age: 0.12, hit: false };
  const measure = () => {
    const body = hurtbox(f),
      area = attackArea(f);
    return {
      normalForwardReach: area.x + area.rx - f.x,
      pickupWidthAtBodyHeight: 2 * (body.rx + 18),
      highestPotionCenterAboveFeet: f.y - body.y + body.ry + 18,
    };
  };
  const normal = measure();
  f.giant = true;
  return { character, normal, giant: measure() };
});
const results = [];
for (const schedule of ["previous-6-to-10", "current-7-to-20"]) {
  const stats = {
    schedule,
    matches: 0,
    pickups: 0,
    refreshes: 0,
    matchesWithRefresh: 0,
    samePlayerConsecutivePickups: 0,
    consecutivePickupPairs: 0,
    matchesWithPickup: 0,
    firstCollectorWins: 0,
    firstCollectorDraws: 0,
    giantFighterSeconds: 0,
    fighterSeconds: 0,
    completedMatchSeconds: 0,
  };
  for (const matchup of matchups)
    for (const stage of STAGES) {
      for (let sample = 1; sample <= count; sample++)
        for (const seat of [0, 1]) {
          // Spread seeds across the full uint32 range, then use identical starts in both schedules.
          const seed = Math.imul(sample, 2654435761) >>> 0;
          const g = createMatch(matchup[seat], "normal", stage.id, matchup[1 - seat], seed);
          g.phase = "playing";
          const brains = [createCPU(seeded(seed * 2)), createCPU(seeded(seed * 2 + 1))];
          let firstCollector = null,
            previousCollector = null,
            refreshed = false;
          for (let frame = 0; frame < 120 * 121 && g.phase !== "finished"; frame++) {
            const before = g.fighters.map((f) => ({ giantTime: f.giantTime, stocks: f.stocks }));
            const hadPotion = !!g.items.potion;
            tick(
              g,
              brains.map((brain, i) => cpuInput(g, brain, STEP, i)),
            );
            for (const f of g.fighters) {
              if (f.stocks > 0 && !f.respawn) {
                stats.fighterSeconds += STEP;
                if (f.giant) stats.giantFighterSeconds += STEP;
              }
            }
            if (hadPotion && !g.items.potion) {
              const collector = g.fighters.findIndex((f) => f.giantTime === 10);
              // All stage floors retain the bottle; no unobserved pickup-plus-KO in this sample.
              assert.notEqual(collector, -1, "Unclassified potion disappearance");
              stats.pickups++;
              firstCollector ??= collector;
              if (previousCollector !== null) {
                stats.consecutivePickupPairs++;
                if (previousCollector === collector) stats.samePlayerConsecutivePickups++;
              }
              previousCollector = collector;
              if (
                before[collector].giantTime > STEP + 1e-9 &&
                before[collector].stocks === g.fighters[collector].stocks
              ) {
                stats.refreshes++;
                refreshed = true;
              }
              // Same random draw, mapped to the previous interval; all other rules stay identical.
              if (schedule === "previous-6-to-10") g.items.wait = 6 + ((g.items.wait - 7) / 13) * 4;
            }
            if (frame % 120 === 0) assert.ok(readGame(gameView(g)), "Invalid snapshot");
          }
          assert.equal(g.phase, "finished");
          stats.matches++;
          stats.completedMatchSeconds += g.elapsed;
          if (refreshed) stats.matchesWithRefresh++;
          if (firstCollector !== null) {
            stats.matchesWithPickup++;
            if (g.winner === firstCollector) stats.firstCollectorWins++;
            if (g.winner === null) stats.firstCollectorDraws++;
          }
        }
    }
  results.push(stats);
  console.log(JSON.stringify(stats));
}
console.log(JSON.stringify({ seedsPerMatchup: count, geometry, results }, null, 2));

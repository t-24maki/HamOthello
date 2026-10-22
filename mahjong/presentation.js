import { tileMarkup, tileInfo } from "./tiles.js?v=20261022-mahjong7";
import { matchWinner } from "./rules.js?v=20261022-mahjong7";

const names = ["たくハム", "めぐハム"];

// Final standings use all four public results, independently of the last round's winner.
export function matchPresentation(view) {
  if (view.phase !== "matchEnd") return null;
  const winner = matchWinner(view.scores);
  return {
    title: winner === null ? "ふたりで引き分け！" : `${names[winner]}の優勝！`,
    table: `<table class="final-scores"><caption>4局の得点と合計</caption><thead><tr><th scope="col">局</th>${names.map((name, p) => `<th scope="col" class="${winner === p ? "champion" : ""}"><img src="../assets/${p === 0 ? "pink" : "cream"}-piece.png" alt="">${name}</th>`).join("")}</tr></thead><tbody>${view.history.map((h) => `<tr><th scope="row">第${h.round}局${h.winner === null ? "<small>流局</small>" : ""}</th>${names.map((_, p) => `<td${h.winner === p ? ' class="round-earned"' : ""}>${h.winner === p ? `+${h.points}` : "0"}<small>点</small></td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><th scope="row">合計</th>${view.scores.map((score, p) => `<td class="${winner === p ? "champion" : ""}">${score}<small>点</small></td>`).join("")}</tr></tfoot></table>`,
  };
}

// The claimed ron tile is shown in the dialog; keep the board's original eight tiles.
export function boardHand(view, player) {
  const hand = view.hands[player] ?? [];
  return view.result?.method === "ron" && view.result.winner === player
    ? hand.filter((id) => id !== view.lastDiscard.tile)
    : hand;
}

// Use only public result information, so both seats see the same deciding tile.
export function roundPresentation(view) {
  const result = view.result;
  if (!result) return null;
  if (result.winner === null)
    return {
      tile: null,
      title: "流局",
      source: "山の牌がなくなりました",
      description: "上がりなし・この局は0点です",
    };
  const ron = result.method === "ron";
  const tile = ron ? view.lastDiscard.tile : view.drawn;
  const source = ron
    ? `${names[view.lastDiscard.player]}が捨てた牌`
    : `${names[result.winner]}が山からひいた牌`;
  return {
    tile,
    title: `${names[result.winner]}、${ron ? "ロン" : "ツモ"}！`,
    source,
    description: `${source}「${tileInfo(tile).name}」で3組が完成`,
  };
}

export function groupsMarkup(score, winningTile) {
  return (
    score?.groups
      .map(
        (group) =>
          `<div class="result-group"><div class="meld">${group.tiles.map((id) => tileMarkup(id, { winning: id === winningTile })).join("")}</div><small>${group.kind === "run" ? "連番" : "同じ牌"} ${group.points}点</small></div>`,
      )
      .join("") ?? ""
  );
}

export function tileCatalogMarkup() {
  const sets = [
    { name: "たくハム", ids: [0, 3, 6, 9, 12], note: "1〜5が各3枚", count: 15 },
    { name: "めぐハム", ids: [15, 18, 21, 24, 27], note: "1〜5が各3枚", count: 15 },
    { name: "たぴ", ids: [30, 33, 36], note: "3色が各3枚", count: 9 },
  ];
  return `<section class="tile-catalog" aria-label="使う牌・全39枚"><h3>使う牌は、ぜんぶで39枚</h3>${sets
    .map(
      (set) =>
        `<div class="tile-family"><div class="family-heading"><b>${set.name}</b><span>${set.note}・${set.count}枚</span></div><div class="catalog-tiles">${set.ids.map((id) => `<div>${tileMarkup(id)}<small>${tileInfo(id).suit === "tapi" ? `${tileInfo(id).name}<br>` : ""}×3枚</small></div>`).join("")}</div></div>`,
    )
    .join("")}<p>どちらのプレイヤーも、すべての種類を使えます。</p></section>`;
}

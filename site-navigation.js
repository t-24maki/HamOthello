export const GAME_GROUPS = [
  {
    id: "action",
    name: "アクション系",
    games: [
      { id: "sanpo", name: "たくめぐのおさんぽ", path: "sanpo/" },
      { id: "battle", name: "ぽよんバトル", path: "battle/" },
      { id: "jintori", name: "じんとりがっせん", path: "jintori/" },
      { id: "gyoza", name: "たくめぐぎょうざ", path: "gyoza/" },
    ],
  },
  {
    id: "board",
    name: "ボードゲーム系",
    games: [
      { id: "othello", name: "ぷにっとオセロ", path: "othello.html" },
      { id: "shogi", name: "たくめぐしょうぎ", path: "shogi/" },
      { id: "poker", name: "ミニポーカー", path: "poker/" },
      { id: "roulette", name: "ミニルーレット", path: "roulette/" },
      { id: "mahjong", name: "ミニまーじゃん", path: "mahjong/" },
      { id: "blocks", name: "ブロックつめこみ", path: "blocks/" },
    ],
  },
  {
    id: "other",
    name: "その他",
    games: [
      { id: "billiards", name: "まんまるビリヤード", path: "billiards/" },
      { id: "shiritori", name: "たべものしりとり", path: "shiritori/" },
      { id: "quiz", name: "クイズ・めぐハムア", path: "quiz/" },
    ],
  },
];

// Resolve from the module rather than the page, including GitHub Pages subdirectories.
export function navigationMarkup(base, current) {
  return GAME_GROUPS.map(
    (group) =>
      `<section><h3>${group.name}</h3>${group.games.map((game) => `<a href="${new URL(game.path, base).href}"${game.id === current ? ' aria-current="page"' : ""}>${game.name}<span aria-hidden="true">${game.id === current ? "●" : "↗"}</span></a>`).join("")}</section>`,
  ).join("");
}

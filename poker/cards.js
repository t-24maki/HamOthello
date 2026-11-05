// Keep ranks as real text so the same artwork can display every card in the deck.
export function appendCardArtwork(node, card = null) {
  const marks = card
    ? [
        ["strong", "card-number", card.value],
        ["span", "card-index", card.value],
        ["span", "card-corner", card.value],
        ["span", "metal-name", card.metal.toUpperCase()],
      ]
    : []; // 裏面の文字も画像内に含め、配布中に別レイヤーで遅れて描画しない。
  for (const [tag, className, text] of marks) {
    const mark = document.createElement(tag);
    mark.className = className;
    mark.textContent = text;
    mark.setAttribute("aria-hidden", "true");
    node.append(mark);
  }
}

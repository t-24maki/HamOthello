// Keep ranks as real text so the same artwork can display every card in the deck.
export function appendCardArtwork(node, card = null) {
  const marks = card
    ? [
        ["strong", "card-number", card.value],
        ["span", "card-index", card.value],
        ["span", "card-corner", card.value],
        ["span", "metal-name", card.metal.toUpperCase()],
      ]
    : [["span", "card-brand", "TAK&MEG"]];
  for (const [tag, className, text] of marks) {
    const mark = document.createElement(tag);
    mark.className = className;
    mark.textContent = text;
    mark.setAttribute("aria-hidden", "true");
    node.append(mark);
  }
}

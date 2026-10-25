// Card flights live inside the table, so scrolling the page also moves the
// animation. Game state stays in the controller; these are disposable visuals.
export function createDealer({ window, layer, deck, discard }) {
  const animations = new Set();
  const ghosts = new Set();
  const concealed = new Map();

  function cancel() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
    for (const [card, visibility] of concealed) card.style.visibility = visibility;
    concealed.clear();
  }

  function finish() {
    // If the viewport changes or the tab is hidden, settle the current flight
    // before measuring the next one. The game can always finish its transition.
    for (const animation of animations) animation.finish();
  }

  async function fly(cards, direction) {
    if (
      !cards.length ||
      window.document?.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !deck.animate
    )
      return;
    const origin = layer.getBoundingClientRect();
    const pile = (direction === "in" ? deck : discard).getBoundingClientRect();
    if (!pile.width) return;
    await Promise.all(
      cards.map(async (card, index) => {
        const rect = card.getBoundingClientRect();
        if (!rect.width) return;
        const ghost =
          direction === "in"
            ? deck.querySelector(".playing-card").cloneNode(true)
            : card.cloneNode(true);
        ghost.removeAttribute("id");
        ghost.removeAttribute("aria-pressed");
        ghost.setAttribute("aria-hidden", "true");
        ghost.tabIndex = -1;
        ghost.classList.remove("is-selected", "fresh-card");
        ghost.classList.add("flying-card");
        ghost.querySelector(".card-choice")?.remove();
        Object.assign(ghost.style, {
          left: `${rect.left - origin.left}px`,
          top: `${rect.top - origin.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
        layer.append(ghost);
        ghosts.add(ghost);
        const visibility = card.style.visibility;
        concealed.set(card, visibility);
        card.style.visibility = "hidden";
        const dx = pile.left + pile.width / 2 - rect.left - rect.width / 2;
        const dy = pile.top + pile.height / 2 - rect.top - rect.height / 2;
        const atPile = `translate(${dx}px, ${dy}px) scale(${pile.width / rect.width}, ${pile.height / rect.height}) rotate(-9deg)`;
        const atHand = "translate(0px, 0px) scale(1) rotate(0deg)";
        const animation = ghost.animate(
          direction === "in"
            ? [{ transform: atPile }, { transform: atHand }]
            : [
                { transform: atHand, opacity: 1 },
                { transform: atPile, opacity: 0.55 },
              ],
          {
            duration: direction === "in" ? 560 : 320,
            delay: index * 115,
            easing: "cubic-bezier(.22,.7,.23,1)",
            fill: "both",
          },
        );
        animations.add(animation);
        try {
          await animation.finished;
        } catch {
          /* Cancelled when the user leaves or starts another round. */
        } finally {
          animations.delete(animation);
          ghost.remove();
          ghosts.delete(ghost);
          if (concealed.has(card)) {
            card.style.visibility = concealed.get(card);
            concealed.delete(card);
          }
        }
      }),
    );
  }

  return { fly, cancel, finish };
}

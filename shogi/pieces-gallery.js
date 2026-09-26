import { PIECES, TYPES } from "./rules.js";
import { pieceElement } from "./pieces.js?v=20260926-art3";

const gallery = document.getElementById("piece-gallery");
for (const type of TYPES) {
  for (const promoted of type === "king" ? [false] : [false, true]) {
    const card = document.createElement("article");
    card.className = `gallery-card${promoted ? " is-promoted" : ""}`;
    const label = document.createElement("span");
    label.className = "gallery-state";
    label.textContent = promoted ? "成ったすがた" : "ふつう";
    const title = document.createElement("h2");
    title.textContent = PIECES[type].name;
    const hint = document.createElement("p");
    hint.textContent = promoted ? PIECES[type].promotedHint : PIECES[type].hint;
    card.append(label, pieceElement({ type, promoted, owner: 0 }), title, hint);
    gallery.append(card);
  }
}

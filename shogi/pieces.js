import { movement } from "./rules.js?v=20261001-shogi7";

export function pieceArtwork(piece) {
  // たぴは同じイラストを大きくして、成長した姿を表す。
  const variant = piece.promoted && ["taku", "megu", "ham"].includes(piece.type) ? "-promoted" : "";
  const image = new URL(`./art/${piece.type}${variant}.png`, import.meta.url);
  if (piece.type === "tapi") image.searchParams.set("v", "pink-20260926-v2");
  return image.href;
}

export function pieceElement(piece) {
  const node = document.createElement("span");
  node.className = `piece owner-${piece.owner} type-${piece.type}${piece.promoted ? " promoted" : ""}`;
  node.setAttribute("aria-hidden", "true");
  const art = document.createElement("img");
  art.className = "piece-art";
  art.src = pieceArtwork(piece);
  art.alt = "";
  art.draggable = false;
  node.append(art);

  // Rotate the opponent's entire tile so its local movement indicators follow it.
  const { directions, sliding } = movement({ ...piece, owner: 0 });
  for (const [dr, dc] of directions) {
    const mark = document.createElement("span");
    mark.className = `move-marker ${sliding ? "slide" : "step"}`;
    mark.style.left = `${50 + dc * 42}%`;
    mark.style.top = `${50 + dr * 42}%`;
    if (sliding) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.style.transform = `rotate(${(Math.atan2(dc, -dr) * 180) / Math.PI}deg)`;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 20V4M5 11L12 4L19 11");
      svg.append(path);
      mark.append(svg);
    }
    node.append(mark);
  }
  return node;
}

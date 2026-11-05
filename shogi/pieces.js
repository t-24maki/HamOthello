import { movement } from "./rules.js?v=20261001-shogi7";

export function pieceArtwork(piece) {
  // たぴは同じイラストを大きくして、成長した姿を表す。
  if (piece.type === "tapi") return new URL("../baccarat/art/table-friends-v3.png", import.meta.url).href;
  if (piece.type === "king") return new URL("./art/king-mawashi-v1.png", import.meta.url).href;
  const variant = piece.promoted && ["taku", "megu", "ham"].includes(piece.type) ? "-promoted" : "";
  const image = new URL(`./art/${piece.type}${variant}.png`, import.meta.url);
  return image.href;
}

// 盤上・持ち駒・説明・ずかんで同じ正面の絵を使う。
export function pieceArtElement(piece, className = "piece-art") {
  if (piece.type === "tapi") {
    // ミニポーカーと同じ、正面向き・無表情・手付きの通常ポーズ。
    // baccarat/art.js の portrait("tapi", "neutral") と同じ範囲を表示する。
    const art = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    art.setAttribute("class", className);
    art.setAttribute("viewBox", "934 40 320 285");
    art.setAttribute("aria-hidden", "true");
    art.setAttribute("focusable", "false");
    const image = document.createElementNS(art.namespaceURI, "image");
    image.setAttribute("href", pieceArtwork(piece));
    image.setAttribute("width", "1254");
    image.setAttribute("height", "1254");
    art.append(image);
    return art;
  }
  const art = document.createElement("img");
  art.className = className;
  art.src = pieceArtwork(piece);
  art.alt = "";
  art.draggable = false;
  return art;
}

export function pieceElement(piece) {
  const node = document.createElement("span");
  node.className = `piece owner-${piece.owner} type-${piece.type}${piece.promoted ? " promoted" : ""}`;
  node.setAttribute("aria-hidden", "true");
  node.append(pieceArtElement(piece));

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

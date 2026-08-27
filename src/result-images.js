const NORMAL_IMAGES = {
  black: "./assets/pink-piece.png",
  white: "./assets/cream-piece.png",
};

export function getResultCharacterImages(counts, ended) {
  if (!ended || counts.black === counts.white) return NORMAL_IMAGES;

  if (counts.black > counts.white) {
    return {
      black: "./assets/tak-win.png",
      white: "./assets/meg-lose.png",
    };
  }

  return {
    black: "./assets/tak-lose.png",
    white: "./assets/meg-win.png",
  };
}

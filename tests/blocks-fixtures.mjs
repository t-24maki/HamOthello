const move = (piece, rotation, x, y) => ({ piece, rotation, x, y });
export const completePacking = [
  move("I", 0, 0, 0),
  move("I", 0, 4, 0),
  move("O", 0, 0, 1),
  move("O", 0, 6, 1),
  move("T", 0, 0, 5),
  move("L", 0, 3, 1),
  move("J", 1, 0, 3),
  move("T", 0, 3, 3),
  move("S", 0, 1, 3),
  move("J", 2, 5, 3),
  move("L", 2, 2, 1),
  move("Z", 0, 4, 5),
  move("Z", 0, 2, 5),
  move("S", 1, 6, 4),
];

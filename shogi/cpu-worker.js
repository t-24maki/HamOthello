import { chooseMove } from "./cpu.js?v=20261001-shogi7";
self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, action: chooseMove(data.state, data.difficulty) });
};

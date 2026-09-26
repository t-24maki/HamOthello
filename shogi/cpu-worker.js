import { chooseMove } from "./cpu.js";
self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, action: chooseMove(data.state, data.difficulty) });
};

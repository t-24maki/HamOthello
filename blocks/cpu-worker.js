import { chooseMove } from "./cpu.js?v=20261010-blocks3";
self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, action: chooseMove(data.state, data.difficulty) });
};

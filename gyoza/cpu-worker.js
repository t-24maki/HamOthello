import { chooseMove } from "./cpu.js?v=20261027-gyoza3";
self.onmessage = ({ data }) => {
  const move = chooseMove(data.view);
  self.postMessage({ id: data.id, move });
};

import { test } from "node:test";
import assert from "node:assert/strict";
import { createUI } from "./ui-fixture.mjs";
import { BLACK, WHITE, EMPTY } from "../src/game-logic.js";
import { ONLINE_VERSION } from "../src/card-rules.js";

test("card selection and cancellation do not spend a turn; confirmation uses one card and one turn", () => {
  const ui = createUI();
  ui.start();
  const before = ui.snapshot();
  ui.button('[data-card="anywhere"]').fire("click");
  assert.equal(ui.element("board").dataset.action, "anywhere");
  assert.equal(ui.element("board").children.filter((node) => !node.disabled).length, 60);
  assert.deepEqual(ui.snapshot(), before);
  ui.element("cancel-card").fire("click");
  assert.deepEqual(ui.snapshot(), before);
  assert.equal(ui.element("board").children.filter((node) => !node.disabled).length, 4);
  ui.button('[data-card="anywhere"]').fire("click");
  ui.moveTo(0);
  assert.equal(ui.snapshot().board[0], BLACK);
  assert.equal(ui.snapshot().turnCount, 1);
  assert.equal(ui.snapshot().hands[BLACK].anywhere, 0);
  assert.equal(ui.snapshot().currentPlayer, WHITE);
  assert.match(ui.element("move-counter").textContent, /^1手/);
  assert.match(ui.element("black-card-stock").textContent, /どこでも 0枚/);
  assert.match(ui.element("last-card-action").textContent, /どこでもカード/);
});

test("flip targets are only opponents, and local undo restores both cards and counts", () => {
  const ui = createUI();
  ui.start();
  const before = ui.snapshot();
  ui.button('[data-card="flip"]').fire("click");
  const targets = ui.element("board").children.filter((node) => !node.disabled);
  assert.equal(targets.length, 2);
  assert.ok(targets.every((node) => before.board[Number(node.dataset.index)] === WHITE));
  assert.ok(targets.every((node) => node.getAttribute("aria-label").includes("返せます")));
  ui.moveTo(27);
  assert.equal(ui.snapshot().hands[BLACK].flip, 0);
  assert.equal(ui.snapshot().turnCount, 1);
  ui.undo();
  assert.deepEqual(ui.snapshot(), before);
  assert.match(ui.element("black-card-stock").textContent, /くるん 1枚/);
});

test("CPU answers and undo restores the human decision including card stock; reset replenishes hands", () => {
  const ui = createUI();
  ui.start("cpu");
  const before = ui.snapshot();
  ui.button('[data-card="anywhere"]').fire("click");
  ui.moveTo(0);
  assert.equal(ui.canHumanPlay(), false);
  ui.runTimers(520);
  assert.equal(ui.snapshot().turnCount, 2);
  ui.undo();
  assert.deepEqual(ui.snapshot(), before);
  ui.button('[data-card="flip"]').fire("click");
  ui.moveTo(27);
  ui.start();
  assert.equal(ui.snapshot().turnCount, 0);
  assert.equal(ui.snapshot().hands[BLACK].flip, 1);
});

test("classic setup hides the hand controls and rejects special moves", () => {
  const ui = createUI();
  ui.start("local", "classic");
  assert.equal(ui.element("card-panel").hidden, true);
  assert.equal(ui.element("setup-card-guide").hidden, true);
  ui.button('[data-card="anywhere"]').fire("click");
  ui.moveTo(0);
  assert.equal(ui.snapshot().turnCount, 0);
  assert.equal(ui.element("board").children.filter((node) => !node.disabled).length, 4);
});

test("eliminating the last opponent shows the winner and stops the CPU despite remaining cards", () => {
  const ui = createUI();
  ui.start("cpu");
  const position = ui.snapshot();
  position.board = Array(64).fill(EMPTY);
  for (const index of [0, 8, 9]) position.board[index] = BLACK;
  position.board[1] = WHITE;
  ui.restore(position);
  ui.render();
  ui.button('[data-card="flip"]').fire("click");
  ui.moveTo(1);
  const ended = ui.snapshot();
  assert.equal(ui.element("turn-status").textContent, "たくハムのかち！");
  assert.equal(ui.element("white-score").textContent, "0");
  assert.equal(ui.canHumanPlay(), false);
  assert.ok(ui.element("board").children.every((cell) => cell.disabled));
  assert.equal(ui.button('[data-card="anywhere"]').disabled, true);
  ui.runTimers(520);
  assert.deepEqual(ui.snapshot(), ended);
  ui.undo();
  assert.deepEqual(ui.snapshot(), position);
  assert.equal(ui.canHumanPlay(), true);
});

test("card marker persists through normal moves, follows the next card and restores on undo", () => {
  const ui = createUI();
  ui.start();
  const marked = () =>
    ui.element("board").children.filter((cell) => cell.classList.contains("is-card-action"));
  ui.button('[data-card="anywhere"]').fire("click");
  ui.moveTo(0);
  assert.equal(ui.element("last-card-action").textContent, "たくハムがどこでもカードをつかったよ");
  assert.equal(marked().length, 1);
  assert.equal(marked()[0].dataset.index, "0");
  assert.equal(marked()[0].children[1].children[0].textContent, "＋");
  assert.ok(marked()[0].children[1].classList.contains("is-revealing"));
  ui.render();
  assert.equal(marked()[0].children[1].classList.contains("is-revealing"), false);
  const normalTarget = ui.element("board").children.find((cell) => !cell.disabled);
  ui.moveTo(Number(normalTarget.dataset.index));
  assert.equal(marked()[0].dataset.index, "0");
  const flipTarget = ui.snapshot().board.indexOf(WHITE);
  ui.button('[data-card="flip"]').fire("click");
  ui.moveTo(flipTarget);
  assert.equal(marked().length, 1);
  assert.equal(marked()[0].dataset.index, String(flipTarget));
  assert.equal(marked()[0].children[1].children[0].textContent, "↻");
  assert.equal(ui.element("last-card-action").textContent, "たくハムがくるんカードをつかったよ");
  ui.undo();
  assert.equal(marked()[0].dataset.index, "0");
  ui.start();
  assert.equal(marked().length, 0);
});

test("host-authoritative online play synchronizes card actions and ignores duplicates", async () => {
  const host = createUI(),
    guest = createUI();
  const toGuest = [],
    toHost = [];
  host.connect("host", BLACK, async (packet) => {
    toGuest.push(packet);
    return true;
  });
  guest.connect("guest", WHITE, async (packet) => {
    toHost.push(packet);
    return true;
  });
  host.runTimers(0);
  guest.runTimers(0);
  assert.equal(toHost[0].type, "state-request");
  assert.equal(toHost[0].version, ONLINE_VERSION);
  guest.handleOnlineMessage({ ...toGuest.at(-1), senderRole: "host" });
  host.button('[data-card="anywhere"]').fire("click");
  host.moveTo(0);
  guest.handleOnlineMessage({ ...toGuest.at(-1), senderRole: "host" });
  assert.equal(guest.canHumanPlay(), true);
  guest.button('[data-card="flip"]').fire("click");
  guest.moveTo(0);
  assert.equal(guest.pending(), true);
  assert.equal(guest.snapshot().turnCount, 1);
  assert.equal(guest.snapshot().hands[WHITE].flip, 1);
  const request = { ...toHost.at(-1), senderRole: "guest" };
  assert.equal(request.type, "action");
  guest.moveTo(0);
  assert.equal(toHost.filter((packet) => packet.type === "action").length, 1);
  host.handleOnlineMessage(request);
  guest.handleOnlineMessage({ ...toGuest.at(-1), senderRole: "host" });
  assert.deepEqual(guest.snapshot(), host.snapshot());
  assert.equal(guest.snapshot().turnCount, 2);
  assert.equal(guest.snapshot().hands[WHITE].flip, 0);
  assert.equal(guest.element("last-card-action").textContent, "めぐハムがくるんカードをつかったよ");
  assert.ok(guest.element("board").children[0].classList.contains("is-card-action"));
  assert.equal(guest.pending(), false);
  host.handleOnlineMessage(request);
  assert.equal(host.snapshot().turnCount, 2);
  const before = guest.snapshot();
  guest.handleOnlineMessage({ ...toGuest.at(-1), version: 1, senderRole: "host" });
  assert.deepEqual(guest.snapshot(), before);
  await Promise.resolve();
});

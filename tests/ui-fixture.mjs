// A small DOM double for exercising the actual controller without a browser,
// screenshots, or any connection to the live multiplayer service.
import fs from "node:fs";
import * as logic from "../src/game-logic.js";
import * as rules from "../src/card-rules.js";
import * as online from "../src/online-game.js";
import { getResultCharacterImages } from "../src/result-images.js";

export function createUI() {
  const nodes = [],
    ids = new Map();
  let document;
  function matches(node, selector) {
    if (selector.startsWith("#")) return node.attrs.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute)
      return (
        Object.hasOwn(node.attrs, attribute[1]) &&
        (attribute[2] === undefined || node.attrs[attribute[1]] === attribute[2])
      );
    const [tag, ...classes] = selector.split(".");
    return (!tag || node.tag === tag) && classes.every((name) => node.classes.has(name));
  }
  class Element {
    constructor(tag, attrs = {}) {
      this.tag = tag;
      this.attrs = attrs;
      this.children = [];
      this.handlers = {};
      this.dataset = {};
      this.leaves = {};
      this.disabled = Object.hasOwn(attrs, "disabled");
      this.hidden = Object.hasOwn(attrs, "hidden");
      this.textContent = "";
      this.value = "";
      this.className = attrs.class ?? "";
      for (const [key, value] of Object.entries(attrs))
        if (key.startsWith("data-"))
          this.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
      this.classList = {
        add: (...names) => names.forEach((name) => this.classes.add(name)),
        remove: (...names) => names.forEach((name) => this.classes.delete(name)),
        toggle: (name, force) => {
          const active = force ?? !this.classes.has(name);
          if (active) this.classes.add(name);
          else this.classes.delete(name);
          return active;
        },
        contains: (name) => this.classes.has(name),
      };
    }
    set className(value) {
      this.classes = new Set(value.split(/\s+/).filter(Boolean));
    }
    get className() {
      return [...this.classes].join(" ");
    }
    setAttribute(key, value) {
      this.attrs[key] = value;
    }
    getAttribute(key) {
      return this.attrs[key] ?? null;
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(fragment) {
      this.children = fragment.children ? [...fragment.children] : [fragment];
    }
    addEventListener(type, fn) {
      (this.handlers[type] ??= []).push(fn);
    }
    fire(type, options = {}) {
      if (type === "click" && this.disabled) return;
      for (const fn of this.handlers[type] ?? [])
        fn({ target: this, currentTarget: this, detail: 1, preventDefault() {}, ...options });
    }
    focus() {
      document.activeElement = this;
    }
    closest(selector) {
      return matches(this, selector) ? this : null;
    }
    querySelector(selector) {
      if (selector === ".card-remaining") return (this.leaves[selector] ??= new Element("span"));
      if (this.attrs.id === "board") {
        const index = selector.match(/data-index="(\d+)"/);
        return (
          this.children.find((child) =>
            index ? child.dataset.index === index[1] : matches(child, selector),
          ) ?? null
        );
      }
      return nodes.find((node) => matches(node, selector)) ?? null;
    }
  }
  const html = fs.readFileSync(new URL("../othello.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries(
      [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]),
    );
    if (/\bhidden(?:\s|$)/.test(match[2])) attrs.hidden = "";
    const node = new Element(match[1], attrs);
    nodes.push(node);
    if (attrs.id) ids.set(attrs.id, node);
  }
  document = {
    activeElement: null,
    body: new Element("body"),
    handlers: {},
    querySelector: (selector) =>
      selector.startsWith("#")
        ? (ids.get(selector.slice(1)) ?? null)
        : (nodes.find((node) => matches(node, selector)) ?? null),
    querySelectorAll: (selector) => nodes.filter((node) => matches(node, selector)),
    createElement: (tag) => new Element(tag),
    createDocumentFragment: () => new Element("fragment"),
    addEventListener(type, fn) {
      (this.handlers[type] ??= []).push(fn);
    },
  };
  const timers = new Map();
  let timerId = 0;
  const window = {
    setTimeout(fn, delay) {
      timers.set(++timerId, { fn, delay });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    scrollTo() {},
    addEventListener() {},
  };
  const source = fs.readFileSync(new URL("../src/game.js", import.meta.url), "utf8");
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g)].flatMap(
    (match) =>
      match[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
  );
  const body = source.replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g, "");
  const exports = new Function(
    "document",
    "window",
    "dependencies",
    `const {${[...new Set(names)].join(",")}} = dependencies;\n${body}\nreturn { snapshot, restore, render, showGameSetup, chooseMode, startGame, moveTo, undo, canHumanPlay, handleOnlineMessage, startOnlineGame,
    connect(role, player, send) { gameMode = 'online'; onlineRole = role; onlineSession = {send,close:async()=>{}}; onlinePeerConnected = true; startOnlineGame(player, 'cards'); },
    pending: () => onlinePending,
  };`,
  )(document, window, { ...logic, ...rules, ...online, getResultCharacterImages });
  return {
    ...exports,
    document,
    element: (id) => document.querySelector("#" + id),
    button: (selector) => document.querySelector(selector),
    runTimers(delay) {
      // Run only timers present at the start; callbacks may schedule the next turn.
      const pendingTimers = Array.from(timers);
      for (const [id, timer] of pendingTimers)
        if (timer.delay === delay) {
          timers.delete(id);
          timer.fn();
        }
    },
    start(mode = "local", rule = "cards") {
      exports.showGameSetup();
      exports.chooseMode(mode);
      document.querySelector(`[data-rule="${rule}"]`).fire("click");
      exports.startGame();
    },
  };
}

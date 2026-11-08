// Shared entry points; each game still owns its rules, setup and match state.
const HELP = {
  othello: { content: ".rules-panel, #card-rules-details", setup: "#setup-overlay" },
  shogi: { content: ".guide > .rules", setup: "#match-setup" },
  blocks: { content: "details.rules", setup: "#setup" },
  billiards: { content: "details.rules", setup: "#match-setup" },
  mahjong: { content: "details.rules", setup: "#setup" },
  shiritori: { content: "details.rules", setup: "#setup" },
  battle: { content: ".how-to, .keyboard-guide", setup: "#setup" },
  jintori: { content: "details.howto", setup: "#setup" },
  poker: { trigger: "#show-rules", dialog: "#rules", setup: "#setup" },
  roulette: { trigger: "#show-rules", dialog: "#rules", setup: "#setup" },
  sugoroku: { trigger: "#rules-open", dialog: "#dialog", setup: "#setup" },
  gyoza: { trigger: "#help", dialog: "#guide", setup: "#setup" },
  quiz: { trigger: "#rules-open", dialog: "#rules", setup: "#intro" },
  sanpo: { content: "#sanpo-instructions" },
};

export function hasGameHelp(page) { return Object.hasOwn(HELP, page); }

export function installGameHelp(header, button) {
  const config = HELP[header.dataset.page];
  if (!config) return;
  const install = () => {
    const setup = config.setup && document.querySelector(config.setup);
    setup?.classList.add("site-setup");
    if (setup) {
      // Starting below a long settings form should reveal the top of the board.
      let wasHidden = setup.hidden;
      new MutationObserver(() => {
        if (setup.hidden && !wasHidden) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
        wasHidden = setup.hidden;
      }).observe(setup, { attributes: true, attributeFilter: ["hidden"] });
    }
    let dialog, trigger;
    if (config.trigger) {
      trigger = document.querySelector(config.trigger);
      dialog = document.querySelector(config.dialog);
      trigger.classList.add("site-help-trigger");
    } else {
      dialog = document.createElement("dialog");
      dialog.id = "site-help";
      dialog.setAttribute("aria-labelledby", "site-help-title");
      dialog.innerHTML = '<div class="site-help-heading"><h2 id="site-help-title">あそびかた</h2><button type="button" autofocus>閉じる</button></div><div class="site-help-body"></div>';
      const body = dialog.querySelector(".site-help-body");
      for (const node of document.querySelectorAll(config.content)) {
        if (node.tagName === "DETAILS") node.open = true;
        if (node.id === "sanpo-instructions") node.hidden = false;
        body.append(node); // Preserve live rule diagrams, IDs and event handlers.
      }
      if (header.dataset.page === "shiritori") {
        const note = document.createElement("p");
        note.textContent = "1台で遊ぶときは説明中の時計が止まるよ。通信対戦では、説明中も持ち時間が進みます。";
        body.prepend(note);
      }
      dialog.querySelector("button").addEventListener("click", () => dialog.close());
      document.body.append(dialog);
    }
    button.setAttribute("aria-controls", dialog.id);
    let active = false;
    const announce = open => {
      active = open;
      button.setAttribute("aria-expanded", String(open));
      document.documentElement.classList.toggle("site-help-open", open);
      if (!trigger) window.dispatchEvent(new CustomEvent("takumegu-menu", { detail: { open, source: "help" } }));
    };
    button.addEventListener("click", () => {
      if (dialog.open) return;
      dialog.classList.add("site-help-dialog");
      announce(true);
      if (trigger) trigger.click();
      else dialog.showModal();
    });
    dialog.addEventListener("close", () => {
      if (!active) return;
      announce(false);
      dialog.classList.remove("site-help-dialog");
      if (!document.querySelector("dialog[open]")) button.focus({ preventScroll: true });
    });
    for (const type of ["keydown", "keyup"]) dialog.addEventListener(type, event => event.stopPropagation());
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

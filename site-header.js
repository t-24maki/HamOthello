import { navigationMarkup } from "./site-navigation.js?v=20261027-site6";

const base = new URL("./", import.meta.url);
class TakumeguHeader extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <link rel="stylesheet" href="${new URL("site-header.css?v=20261022-site1", base)}">
      <header class="shell">
        <a class="brand" href="${base}" aria-label="たくめぐのあそびば トップページ">
          <span class="friends" aria-hidden="true"><img src="${base}assets/pink-piece.png" alt=""><img src="${base}assets/cream-piece.png" alt=""></span>
          <span><small>TAK&MEG</small>たくめぐのあそびば</span>
        </a>
        <div class="tools"><slot name="actions"></slot><button class="toggle" type="button" aria-label="ゲームメニューを開く" aria-expanded="false" aria-controls="navigation"><span></span><span></span><span></span></button></div>
      </header>
      <dialog id="navigation" aria-labelledby="menu-title">
        <div class="menu-heading"><div><small>TAK&MEG</small><h2 id="menu-title">なにしてあそぶ？</h2></div><button class="close" type="button" aria-label="メニューを閉じる" autofocus>×</button></div>
        <nav aria-label="ゲーム一覧"><a class="home" href="${base}"${this.dataset.page === "home" ? ' aria-current="page"' : ""}>トップページ<span aria-hidden="true">↗</span></a>${navigationMarkup(base, this.dataset.page)}</nav>
      </dialog>`;
    const dialog = root.querySelector("dialog");
    const toggle = root.querySelector(".toggle");
    const announce = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      document.documentElement.classList.toggle("site-menu-open", open);
      window.dispatchEvent(new CustomEvent("takumegu-menu", { detail: { open } }));
    };
    toggle.addEventListener("click", () => {
      announce(true);
      dialog.showModal();
    });
    root.querySelector(".close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    });
    dialog.addEventListener("close", () => {
      announce(false);
      // A game's pause dialog may now be on top; do not steal its focus.
      if (!document.querySelector("dialog[open]")) toggle.focus({ preventScroll: true });
    });
    // Keep game keyboard shortcuts from consuming navigation keys or Escape.
    root.addEventListener("keydown", (event) => {
      if (dialog.open) event.stopPropagation();
    });
    root.addEventListener("keyup", (event) => {
      if (dialog.open) event.stopPropagation();
    });
  }
}
customElements.define("takumegu-header", TakumeguHeader);

// Shared, fixed-position connection notice. No board layout changes. Keeping it
// modal also blocks keyboard/touch input while the authoritative state is held.
export function createConnectionNotice(cancel, doc = globalThis.document) {
  let dialog, text;
  return {
    show(message) {
      if (!doc?.body) return;
      if (!dialog) {
        dialog = doc.createElement("dialog");
        dialog.setAttribute("aria-label", "通信の確認");
        dialog.style.cssText = "box-sizing:border-box;width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:22px;border:3px solid #75583d;border-radius:22px;background:#fff9e9;color:#493827;font:700 16px/1.7 system-ui;text-align:center;box-shadow:0 8px 35px #0004;";
        text = doc.createElement("p"); text.setAttribute("role", "status"); text.setAttribute("aria-live", "polite");
        text.style.cssText = "margin:0 0 16px;font:inherit;white-space:pre-line;";
        const button = doc.createElement("button"); button.textContent = "接続をやめる";
        button.style.cssText = "padding:12px 20px;border:1px solid #ac9274;border-radius:18px;background:#fff;color:#493827;font:inherit;cursor:pointer;";
        button.onclick = cancel;
        dialog.addEventListener("cancel", e => { e.preventDefault(); cancel(); });
        dialog.append(text, button); doc.body.append(dialog);
      }
      if (text.textContent !== message) text.textContent = message;
      if (!dialog.open) dialog.showModal();
    },
    hide() { if (dialog?.open) dialog.close(); },
    dispose() { dialog?.remove(); dialog = null; },
  };
}

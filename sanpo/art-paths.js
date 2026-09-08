window.__TAKUMEGU_ART__ = {
  "cream": "./art/cream.png",
  "lavender": "./art/lavender.png",
  "items": "./art/items.png",
  "ume": "./art/ume.png",
  "meadow": "./art/meadow.png"
};
Object.entries(window.__TAKUMEGU_ART__).forEach(([key, url]) => document.documentElement.style.setProperty("--art-" + key, 'url("' + url + '")'));

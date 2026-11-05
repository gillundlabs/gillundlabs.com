/* Gillund Labs: ONE place for store links. Replace a null with the real listing URL when it goes live;
   every button on the site (game pages, home page, demo gates) reads from here. */
window.GL_CONFIG = {
  games: {
    "maxwells-demon":      { name: "Maxwell's Demon",     appStore: null, googlePlay: null, steam: null },
    "vacuum-maze":         { name: "Vacuum Maze",         appStore: null, googlePlay: null, steam: null },
    "fantastic-apparatus": { name: "Fantastic Apparatus", appStore: null, googlePlay: null, steam: null }
  },
  stores: { appStore: "App Store", googlePlay: "Google Play", steam: "Steam" },
  demo: { freeLevels: 3, freeElements: 3 }
};
/* Renders every [data-stores="slug"] container as store buttons. */
(function () {
  function render() {
    document.querySelectorAll('[data-stores]').forEach(function (box) {
      var g = window.GL_CONFIG.games[box.getAttribute('data-stores')]; if (!g) return; box.innerHTML = '';
      Object.keys(window.GL_CONFIG.stores).forEach(function (k) {
        var label = window.GL_CONFIG.stores[k], url = g[k], a;
        if (url) { a = document.createElement('a'); a.href = url; a.rel = 'noopener'; a.className = 'btn store'; a.innerHTML = label; }
        else { a = document.createElement('span'); a.className = 'btn store soon'; a.setAttribute('aria-disabled', 'true'); a.innerHTML = label + ' <small>coming soon</small>'; }
        box.appendChild(a);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();

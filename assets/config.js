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

/* Phone nav scroll cue: walnut fade + brass end-cap; hide at scroll end. */
(function () {
  function setupNavCue() {
    var bar = document.querySelector('header.bar');
    if (!bar) return;
    var nav = bar.querySelector('nav');
    if (!nav) return;
    var cue = bar.querySelector('.bar-nav-cue');
    if (!cue) {
      cue = document.createElement('span');
      cue.className = 'bar-nav-cue';
      cue.setAttribute('aria-hidden', 'true');
      cue.innerHTML = '<span class="bar-nav-fade"></span><span class="bar-nav-cap"><span class="bar-nav-cue-arrow" aria-hidden="true">\u25B8</span></span>';
      bar.appendChild(cue);
    }
    function update() {
      var max = nav.scrollWidth - nav.clientWidth;
      var canScroll = max > 2;
      var atEnd = !canScroll || nav.scrollLeft >= max - 2;
      bar.classList.toggle('nav-has-more', canScroll && !atEnd);
      bar.classList.toggle('nav-at-end', atEnd);
    }
    if (!nav._glNavCueBound) {
      nav.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      nav._glNavCueBound = true;
    }
    update();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupNavCue);
  else setupNavCue();
})();

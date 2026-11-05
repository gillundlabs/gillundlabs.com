/* Gillund Labs demo gate (browser copies only). The patched game calls window.GL_GATE(force).
   Shows an in-style notebook page once per page load (or again when force is true). */
(function () {
  var slug = document.documentElement.getAttribute('data-gl-game') || '';
  var shown = false;
  function css() {
    if (document.getElementById('gl-gate-css')) return;
    var s = document.createElement('style'); s.id = 'gl-gate-css';
    s.textContent = '@font-face{font-family:"GL Caveat";src:url("../../assets/fonts/Caveat-Variable.woff2") format("woff2");font-weight:400 700}' +
      '@font-face{font-family:"GL Pinyon";src:url("../../assets/fonts/PinyonScript-Regular.woff2") format("woff2")}' +
      '#gl-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,6,2,.78);overflow:auto}' +
      '#gl-gate .pg{position:relative;max-width:560px;width:100%;box-sizing:border-box;padding:22px 24px 22px 66px;background:#f1e3c2;color:#3b2414;font:21px/30px "GL Caveat","Segoe Print",cursive;' +
      'background-image:linear-gradient(90deg,transparent 52px,#c96a5a 52px,#c96a5a 54px,transparent 54px),repeating-linear-gradient(transparent 0 29px,#9fb3c8 29px 30px);box-shadow:0 12px 40px rgba(0,0,0,.6);border-radius:3px}' +
      '#gl-gate h2{font:400 40px/1.1 "GL Pinyon","Snell Roundhand",cursive;margin:0 0 8px;color:#3b2414}' +
      '#gl-gate p{margin:0 0 12px}#gl-gate .row{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}' +
      '#gl-gate a,#gl-gate button,#gl-gate span.b{min-height:44px;display:inline-flex;align-items:center;padding:0 14px;border-radius:6px;font:16px Georgia,serif;text-decoration:none;cursor:pointer;border:1px solid #3d2706;' +
      'background:linear-gradient(180deg,#4a300a 0%,#9a6b1f 12%,#d9a943 30%,#fff1b8 42%,#e8bb55 50%,#a87622 75%,#3d2706 100%);color:#2a1803}' +
      '#gl-gate span.b{background:#e9dab4;color:#6b4a2e;border-style:dashed;cursor:default}#gl-gate small{margin-left:6px;font-style:italic}' +
      '#gl-gate .date{position:absolute;left:6px;top:24px;width:44px;font-size:15px;line-height:18px;color:#6b4a2e;text-align:center}' +
      '#gl-gate button.close{background:#3b2414;color:#f1e3c2}';
    document.head.appendChild(s);
  }
  window.GL_GATE = function (force) {
    if (shown && !force) return true;
    if (document.getElementById('gl-gate')) return true;
    shown = true; css();
    var C = window.GL_CONFIG || { games: {}, stores: {} }, g = C.games[slug] || {}, stores = '';
    Object.keys(C.stores || {}).forEach(function (k) {
      stores += g[k] ? '<a href="' + g[k] + '" rel="noopener">' + C.stores[k] + '</a>' : '<span class="b" aria-disabled="true">' + C.stores[k] + '<small>coming soon</small></span>';
    });
    var what = slug === 'maxwells-demon' ? 'the first three elements' : 'the first three experiments';
    var d = document.createElement('div'); d.id = 'gl-gate'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'gl-gate-t');
    d.innerHTML = '<div class="pg"><span class="date" aria-hidden="true">to be<br>cont\u2019d</span><h2 id="gl-gate-t">The rest of the experiments await</h2>' +
      '<p>That is the end of the free trial in the browser: ' + what + ' are yours to play as often as you like.</p>' +
      '<p>The full notebook of experiments comes with the complete game:</p><div class="row">' + stores + '</div>' +
      '<div class="row"><a href="../../games/' + slug + '/">About ' + (g.name || 'this game') + '</a><button class="close" type="button">Keep playing the free part</button></div></div>';
    document.body.appendChild(d);
    var b = d.querySelector('button.close'); b.addEventListener('click', function () { d.remove(); }); b.focus();
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') d.remove(); });
    return true;
  };
})();

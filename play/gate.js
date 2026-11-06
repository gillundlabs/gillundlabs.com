/* Gillund Labs demo gate (browser copies only). Patched games call window.GL_GATE(force).
   Kit ivory plaque (DECISIONS a521b25): data-vls-ivory, Old Standard TT, engraved brass buttons
   with labels on the face (one line). No soft-gold card, no browser popup, no notebook paper. B&W → Inter. */
(function () {
  var slug = document.documentElement.getAttribute('data-gl-game') || '';
  var shown = false;
  var ASSET = '../../assets/';

  function ensureKit(cb) {
    function addCss(href, id) {
      if (document.getElementById(id)) return;
      var l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }
    function addJs(src, id) {
      return new Promise(function (resolve, reject) {
        if (document.getElementById(id)) { resolve(); return; }
        var s = document.createElement('script');
        s.id = id; s.src = src; s.onload = function () { resolve(); }; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    addCss(ASSET + 'tokens.css', 'gl-gate-tokens-css');
    addCss(ASSET + 'ivory/ivory.css', 'gl-gate-ivory-css');
    if (!document.getElementById('gl-gate-css')) {
      var s = document.createElement('style'); s.id = 'gl-gate-css';
      s.textContent =
        /* Translucent scrim — real game stays visible and dimmed behind the plaque */
        '#gl-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(14,8,3,.42);overflow:auto;box-sizing:border-box;' +
        '-webkit-backdrop-filter:brightness(.62) saturate(.9);backdrop-filter:brightness(.62) saturate(.9)}' +
        /* Desktop plaque ~640–720 so every label fits on one line */
        '#gl-gate .gl-gate-plaque{position:relative;max-width:720px;width:100%;box-sizing:border-box;text-align:center;' +
        'font-family:var(--vls-font-ivory);color:var(--vls-ivory-ink,#2b2015);margin:0 auto}' +
        '#gl-gate .gl-gate-plaque .vls-plaque__label{display:block;width:100%;box-sizing:border-box;' +
        'white-space:normal!important;overflow:visible!important;line-height:1.45;text-align:center;' +
        'padding:6px 8px;max-width:100%}' +
        '#gl-gate h2{font-family:var(--vls-font-ivory);font-weight:700;font-size:clamp(22px,4.2vw,30px);line-height:1.25;' +
        'margin:0 0 12px;color:inherit;letter-spacing:.02em;text-transform:none;text-wrap:balance}' +
        '#gl-gate p{margin:0 0 14px;font:18px/1.5 var(--vls-font-ivory);color:inherit;text-wrap:pretty}' +
        '#gl-gate .gl-gate-actions{display:flex;flex-direction:column;gap:12px;margin:14px 0 2px;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box}' +
        '#gl-gate .gl-gate-stores,#gl-gate .gl-gate-primary{display:flex;flex-wrap:nowrap;gap:10px;justify-content:center;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box;min-width:0}' +
        /* Kit rule: engraved labels stay on ONE line (min ~13px).
           !important defeats per-game button { padding:8px !important } bleed. */
        '#gl-gate .gl-gate-btn,#gl-gate button.gl-gate-btn,#gl-gate a.gl-gate-btn,#gl-gate span.gl-gate-btn{' +
        'position:relative;display:inline-flex!important;align-items:center;justify-content:center;' +
        'border-radius:3px;border:1px solid var(--vls-brass-dark,#3d2706)!important;box-sizing:border-box;' +
        'background:var(--gl-brass-face,linear-gradient(160deg,#8a6320 0%,#c8922e 18%,#d9a943 36%,#b88228 62%,#6b4a14 84%,#3d2706 100%))!important;' +
        'color:var(--vls-engraving,#2a1803)!important;font:700 14px/1.15 var(--vls-font-engraved)!important;letter-spacing:0!important;' +
        'text-transform:uppercase!important;text-decoration:none;cursor:pointer;text-align:center;' +
        'box-shadow:0 2px 0 #1a0e06,3px 5px 12px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,241,184,.55),inset 0 -1px 0 rgba(61,39,6,.65)!important;' +
        'text-shadow:0 1px 0 rgba(255,241,184,.55),0 -.5px 0 rgba(26,14,6,.35)!important;overflow:hidden!important;' +
        'white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important;' +
        'width:auto!important;max-width:100%!important;min-width:0!important;height:auto!important;' +
        'flex-direction:row!important;gap:0!important}' +
        '#gl-gate .gl-gate-btn::before{content:"";position:absolute;inset:3px;border-radius:2px;background:transparent!important;' +
        'border:1px solid rgba(61,39,6,.4);box-shadow:inset 0 1px 0 rgba(255,241,184,.3),inset 0 -1px 0 rgba(61,39,6,.35);pointer-events:none}' +
        '#gl-gate .gl-gate-btn > *{position:relative;z-index:1;max-width:100%;white-space:nowrap!important}' +
        /* FA (and similar) wrap every button in .brass-face — don't let that clip/wrap gate labels */
        '#gl-gate .brass-face{display:inline-flex!important;flex-direction:inherit!important;align-items:center;justify-content:center;gap:inherit;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;overflow:visible!important;min-width:0}' +
        '#gl-gate .brass-face > *{max-width:none!important;min-width:0;white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important}' +
        /* Equal-width store plates in one row on desktop */
        '#gl-gate .gl-gate-stores .gl-gate-btn{flex:1 1 0!important;min-width:0!important;max-width:100%!important;' +
        'flex-direction:column!important;gap:2px!important;padding:9px 6px!important;font-size:13px!important;letter-spacing:0!important;min-height:50px!important}' +
        /* Unlit / dimmed engraved brass — flatter, no hot highlight; mid ≥#b88228 so ink clears 4.5:1 */
        '#gl-gate .gl-gate-btn.soon,#gl-gate span.gl-gate-btn.soon{cursor:default;opacity:1;filter:none;' +
        'color:#2a1803!important;' +
        'background:linear-gradient(180deg,#4a3010 0%,#7a5418 22%,#b88228 52%,#7a5418 78%,#3d2706 100%)!important;' +
        'box-shadow:0 1px 0 #130a03,0 2px 4px rgba(0,0,0,.28)!important;' +
        'text-shadow:none!important}' +
        '#gl-gate .gl-gate-btn.soon::before{border-color:rgba(61,39,6,.55);box-shadow:none}' +
        '#gl-gate .gl-gate-btn.soon small{display:block;margin:0;font-style:italic;text-transform:none!important;letter-spacing:0!important;' +
        'font-weight:600!important;font-size:11px!important;line-height:1.2;color:#2a1803!important;white-space:nowrap!important}' +
        /* Primary Keep-playing is the larger lit brass plate */
        '#gl-gate .gl-gate-primary{justify-content:center}' +
        '#gl-gate .gl-gate-btn.primary,#gl-gate button.gl-gate-btn.primary{flex:1 1 auto!important;min-width:max-content!important;max-width:100%!important;min-height:52px!important;padding:11px 8px!important;font-size:12.5px!important;letter-spacing:0!important;box-shadow:0 2px 0 #1a0e06,0 4px 0 #1a0e06,0 8px 16px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,241,184,.55)!important}' +
        '#gl-gate .gl-gate-btn.about,#gl-gate a.gl-gate-btn.about{flex:0 1 auto!important;min-width:max-content!important;max-width:100%!important;min-height:52px!important;padding:11px 8px!important;font-size:12.5px!important;letter-spacing:0!important}' +
        /* B&W: Inter, black/white/grey scrim, no ivory texture; soon looks flatter/dimmer */
        'html[data-theme="bw"] #gl-gate,body[data-theme="bw"] #gl-gate,[data-theme="bw"] #gl-gate{' +
        'background:rgba(60,60,60,.38);-webkit-backdrop-filter:grayscale(1) brightness(.85);backdrop-filter:grayscale(1) brightness(.85)}' +
        '[data-theme="bw"] #gl-gate .gl-gate-plaque{background:#fff!important;background-image:none!important;color:#000!important;' +
        'font-family:var(--vls-font-sans)!important;box-shadow:none!important;outline:1.5px solid #000}' +
        '[data-theme="bw"] #gl-gate .gl-gate-plaque .vls-ivory::before,[data-theme="bw"] #gl-gate .gl-gate-plaque .vls-ivory::after,' +
        '[data-theme="bw"] #gl-gate .gl-gate-plaque[data-vls-ivory]::before,[data-theme="bw"] #gl-gate .gl-gate-plaque[data-vls-ivory]::after' +
        '{display:none!important}' +
        '[data-theme="bw"] #gl-gate h2,[data-theme="bw"] #gl-gate p{font-family:var(--vls-font-sans)!important;color:#000!important}' +
        '[data-theme="bw"] #gl-gate .gl-gate-btn,[data-theme="bw"] #gl-gate button.gl-gate-btn,' +
        '[data-theme="bw"] #gl-gate a.gl-gate-btn,[data-theme="bw"] #gl-gate span.gl-gate-btn{' +
        'background:#fff!important;color:#000!important;border:2px solid #000!important;' +
        'box-shadow:none!important;text-shadow:none!important;font-family:var(--vls-font-sans)!important;filter:none!important;' +
        'padding:10px 6px!important;font-size:12.5px!important;letter-spacing:0!important;white-space:nowrap!important}' +
        '[data-theme="bw"] #gl-gate .gl-gate-btn::before{display:none!important}' +
        '[data-theme="bw"] #gl-gate .gl-gate-btn.soon{background:#e6e6e6!important;border-style:dashed!important}' +
        '[data-theme="bw"] #gl-gate .gl-gate-btn.soon small{color:#000!important;opacity:.75}' +
        '[data-theme="bw"] #gl-gate .gl-gate-btn.primary{outline:3px solid #000;outline-offset:1px;background:#fff!important}' +
        /* Phone: stack stores full-width, then About + Keep playing full-width; labels stay one line */
        '@media (max-width:420px){' +
        '#gl-gate{padding:4px}' +
        '#gl-gate .gl-gate-plaque{max-width:100%}' +
        '#gl-gate .gl-gate-plaque .vls-plaque__label{padding:6px 4px}' +
        '#gl-gate .gl-gate-stores,#gl-gate .gl-gate-primary{flex-direction:column;flex-wrap:nowrap;gap:8px}' +
        '#gl-gate .gl-gate-stores .gl-gate-btn,' +
        '#gl-gate .gl-gate-primary .gl-gate-btn{flex:0 0 auto!important;width:100%!important;max-width:100%!important;font-size:13px!important;padding:10px 4px!important;min-height:48px!important;letter-spacing:0!important;min-width:0!important;width:100%!important}' +
        '#gl-gate .gl-gate-btn.primary,#gl-gate button.gl-gate-btn.primary{font-size:12.5px!important;padding:11px 2px!important}' +
        '#gl-gate .gl-gate-btn.about,#gl-gate a.gl-gate-btn.about{font-size:12.5px!important;padding:11px 2px!important}' +
        '#gl-gate h2{font-size:22px}' +
        '#gl-gate p{font-size:16px}' +
        '}';
      document.head.appendChild(s);
    }
    var chain = Promise.resolve();
    /* Always pull site tokens.js so plaqueChrome matches kit a521b25. In-game
       single-file builds ship an older plaqueMount(root) that only runs
       querySelectorAll('.vls-plaque') on root — calling it ON the plaque finds
       nothing, so the gate never gets its label/chrome. */
    chain = chain.then(function () { return addJs(ASSET + 'tokens.js', 'gl-gate-tokens-js'); });
    if (!(window.VLS && VLS.apparatus)) chain = chain.then(function () { return addJs(ASSET + 'apparatus.js', 'gl-gate-apparatus-js'); });
    if (!(window.VLS && VLS.ivory)) chain = chain.then(function () { return addJs(ASSET + 'ivory/ivory.js', 'gl-gate-ivory-js'); });
    chain.then(function () { cb(); }).catch(function () { cb(); });
  }

  function mountPlaque(el) {
    if (!el) return;
    function finish() {
      var label = el.querySelector('.vls-plaque__label');
      if (label) {
        label.style.whiteSpace = 'normal';
        label.style.fontSize = '';
        label.style.overflow = 'visible';
        label.style.lineHeight = '1.45';
        label.style.textAlign = 'center';
      }
      function paint() {
        if (window.VLS && VLS.plaqueChrome) VLS.plaqueChrome(el, { force: true });
        else if (window.VLS && VLS.plaqueMount) VLS.plaqueMount(el, { force: true });
        label = el.querySelector('.vls-plaque__label');
        if (label) {
          label.style.whiteSpace = 'normal';
          label.style.fontSize = '';
          label.style.overflow = 'visible';
          label.style.textAlign = 'center';
        }
        if (window.VLS && VLS.ivory && VLS.ivory.applyAll) VLS.ivory.applyAll(el);
      }
      paint();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { paint(); });
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(paint, 0); });
      setTimeout(paint, 300);
    }
    if (window.VLS && VLS.ivory && VLS.ivory.ready) {
      VLS.ivory.ready().then(finish).catch(finish);
    } else {
      finish();
    }
  }

  window.GL_GATE = function (force) {
    if (shown && !force) return true;
    if (document.getElementById('gl-gate')) return true;
    shown = true;
    ensureKit(function () {
      if (document.getElementById('gl-gate')) return;
      var C = window.GL_CONFIG || { games: {}, stores: {} }, g = C.games[slug] || {};
      var storeOrder = ['appStore', 'googlePlay', 'steam'];
      var storeLabels = C.stores || { appStore: 'App Store', googlePlay: 'Google Play', steam: 'Steam' };
      var stores = '';
      storeOrder.forEach(function (k) {
        var label = storeLabels[k] || k;
        if (g[k]) {
          stores += '<a class="gl-gate-btn" href="' + g[k] + '" rel="noopener"><span>' + label + '</span></a>';
        } else {
          stores += '<span class="gl-gate-btn soon" aria-disabled="true"><span>' + label + '</span><small>coming soon</small></span>';
        }
      });
      var gameName = g.name || 'this game';
      var d = document.createElement('div');
      d.id = 'gl-gate';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-modal', 'true');
      d.setAttribute('aria-labelledby', 'gl-gate-t');
      d.innerHTML =
        '<div class="gl-gate-plaque gl-plaque vls-plaque vls-plaque--ivory" data-vls-ivory="site/gate/' + (slug || 'demo') + '">' +
        '<h2 id="gl-gate-t">The rest of the experiments await</h2>' +
        '<p>The first three experiments are yours to play as often as you like. The full notebook comes with the complete game.</p>' +
        '<div class="gl-gate-actions">' +
        '<div class="gl-gate-stores">' + stores + '</div>' +
        '<div class="gl-gate-primary">' +
        '<a class="gl-gate-btn about" href="../../games/' + slug + '/"><span>About ' + gameName + '</span></a>' +
        '<button class="gl-gate-btn primary close" type="button"><span>Keep playing the free part</span></button>' +
        '</div></div></div>';
      document.body.appendChild(d);
      var plaque = d.querySelector('.gl-gate-plaque');
      mountPlaque(plaque);
      var b = d.querySelector('button.close');
      b.addEventListener('click', function () { d.remove(); shown = false; });
      b.focus();
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { d.remove(); shown = false; } });
    });
    return true;
  };
})();

/* Gillund Labs — procedural ivory (owner approved 2026-11-06). Stable cut selection; vanilla classic script.
 * No fetch, modules, libraries, storage, server or network requirement.
 * Image paths are relative to THIS script, including file:// / Cordova packages.
 * Optional generated ivory-manifest.js can precede this file for non-default builds.
 */
(function (root) {
  'use strict';
  var VLS = root.VLS = root.VLS || {};
  var doc = root.document;
  var script = doc && doc.currentScript;
  if (!script && doc) {
    var scripts = doc.getElementsByTagName('script');
    for (var n = scripts.length - 1; n >= 0; n--) {
      if (/\/ivory\.js(?:[?#]|$)/.test(scripts[n].src)) { script = scripts[n]; break; }
    }
  }
  var base = script && script.src ? script.src.replace(/[^/]*(?:[?#].*)?$/, '') : '';
  /* BEGIN GENERATED CUTS */
  var defaultCuts=[{"file":"variants/ivory-01.webp","focus":[-34.47,516.61],"category":"bold"},{"file":"variants/ivory-02.webp","focus":[293.1,452.17],"category":"medium"},{"file":"variants/ivory-03.webp","focus":[211.63,599.52],"category":"bold"},{"file":"variants/ivory-04.webp","focus":[-66.86,373.17],"category":"near-plain"},{"file":"variants/ivory-05.webp","focus":[550.97,674.16],"category":"medium"},{"file":"variants/ivory-06.webp","focus":[132.79,461.29],"category":"near-plain"},{"file":"variants/ivory-07.webp","focus":[382.48,488.6],"category":"medium"},{"file":"variants/ivory-08.webp","focus":[-16.35,629.24],"category":"bold"},{"file":"variants/ivory-09.webp","focus":[172.99,679.89],"category":"medium"},{"file":"variants/ivory-10.webp","focus":[288.34,646.06],"category":"bold"},{"file":"variants/ivory-11.webp","focus":[80.79,744.57],"category":"near-plain"},{"file":"variants/ivory-12.webp","focus":[527.55,362.36],"category":"medium"}];
  /* END GENERATED CUTS */
  var manifest = VLS.ivoryManifest || null;
  var count = manifest ? manifest.variant_count : defaultCuts.length;
  var cssW = manifest ? manifest.css_px[0] : 512;
  var cssH = manifest ? manifest.css_px[1] : 1024;
  var cache = Object.create(null);
  var watched = [];
  var resizeObserver = root.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) { refresh(entry.target); });
  }) : null;
  var mul = Math.imul || function (a, b) {
    return ((a & 65535) * b + ((((a >>> 16) * b) & 65535) << 16)) | 0;
  };
  function hash(id) {
    id = String(id);
    if (!id) { throw new Error('VLS.ivory needs a nonempty stable plate id.'); }
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) { h = mul(h ^ id.charCodeAt(i), 16777619); }
    h ^= h >>> 16; h = mul(h, 0x7feb352d); h ^= h >>> 15;
    h = mul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  function describe(id) {
    var seed = hash(id), state = seed || 0x9e3779b9;
    function random() {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    }
    var variant = Math.floor(random() * count);
    var cut = manifest ? manifest.variants[variant] : defaultCuts[variant];
    var filename = cut.file;
    return {id: String(id), seed: seed, variant: variant + 1, file: filename,
      url: base + filename, offsetU: random(), offsetV: random(),
      flip: random() < .5, warmth: (random() - .5) * .018,
      grain: 'long-axis', focus: cut.focus || cut.figure_centre, category: cut.category};
  }
  function tint(d) {
    return d.warmth >= 0 ? 'rgba(215,144,42,' + d.warmth.toFixed(6) + ')' :
      'rgba(211,227,246,' + (-d.warmth).toFixed(6) + ')';
  }
  function geometry(w, h, d) {
    var landscape = w >= h;
    var cw = landscape ? h : w, ch = landscape ? w : h;
    // Crop once, never tile. Keep round-two's fibre scale at ordinary UI sizes;
    // exceptionally large faces enlarge this single cut rather than repeating.
    var scale = Math.max(cw / cssW, ch / cssH, 1);
    function clamp(value,max) { return Math.max(0,Math.min(max,value)); }
    // Small faces stay near the cut's representative figure, with deterministic
    // id-derived positional variation. Large faces still show one unrepeated cut.
    var ox=(cssW*scale-cw)*d.offsetU,oy=(cssH*scale-ch)*d.offsetV;
    if (d.focus) {
      ox=clamp(d.focus[0]*scale-cw*(.28+.44*d.offsetU),cssW*scale-cw);
      oy=clamp(d.focus[1]*scale-ch*(.28+.44*d.offsetV),cssH*scale-ch);
    }
    return {width: cw, height: ch, imageWidth: cssW * scale, imageHeight: cssH * scale,
      x: ox, y: oy,
      angle: (landscape ? 90 : 0) + (d.flip ? 180 : 0), scale: scale};
  }
  function imageFor(d) {
    if (cache[d.variant]) { return cache[d.variant]; }
    var item = {image: new Image(), loaded: false};
    item.promise = new Promise(function (resolve, reject) {
      item.image.onload = function () { item.loaded = true; resolve(item.image); };
      item.image.onerror = function () { reject(new Error('Ivory image unavailable: ' + d.url)); };
    });
    // No crossOrigin: local app/file images must not require an HTTP origin.
    item.image.src = d.url;
    cache[d.variant] = item;
    return item;
  }
  function ready(id) {
    if (id !== undefined && id !== null) { return imageFor(describe(id)).promise; }
    var all = [];
    for (var v = 0; v < count; v++) {
      var file = manifest ? manifest.variants[v].file : defaultCuts[v].file;
      all.push(imageFor({variant: v + 1, url: base + file}).promise);
    }
    return Promise.all(all);
  }
  function plateId(el) { return el.getAttribute('data-vls-ivory') || el.id; }
  function refresh(el) {
    var id = plateId(el);
    if (!id) { return false; }
    var d = describe(id);
    // client dimensions exclude an optional face border; no boundingClientRect
    // dependency, so a parent CSS transform cannot skew the material scale.
    var g = geometry(el.clientWidth, el.clientHeight, d);
    var s = el.style;
    s.setProperty('--vls-ivory-image', 'url("' + d.url.replace(/"/g, '%22') + '")');
    s.setProperty('--vls-ivory-surface-w', g.width + 'px');
    s.setProperty('--vls-ivory-surface-h', g.height + 'px');
    s.setProperty('--vls-ivory-image-size', g.imageWidth + 'px ' + g.imageHeight + 'px');
    s.setProperty('--vls-ivory-offset', -g.x + 'px ' + -g.y + 'px');
    s.setProperty('--vls-ivory-angle', g.angle + 'deg');
    s.setProperty('--vls-ivory-tint', tint(d));
    el.setAttribute('data-vls-ivory-variant', d.variant);
    el.setAttribute('data-vls-ivory-seed', d.seed);
    return true;
  }
  function apply(el, id) {
    if (typeof el === 'string') { el = doc.querySelector(el); }
    if (!el) { throw new Error('VLS.ivory.apply: plate element not found.'); }
    if (id !== undefined && el.getAttribute('data-vls-ivory') !== String(id)) {
      el.setAttribute('data-vls-ivory', String(id));
    }
    if (!plateId(el)) {
      if (root.console) { console.warn('VLS.ivory: skipped anonymous plate; add an id or data-vls-ivory.'); }
      return false;
    }
    el.classList.add('vls-ivory');
    refresh(el);
    if (watched.indexOf(el) < 0) {
      watched.push(el);
      if (resizeObserver) { resizeObserver.observe(el); }
    }
    var expectedId = plateId(el);
    var resource = imageFor(describe(expectedId));
    el.setAttribute('data-vls-ivory-ready', resource.loaded ? 'true' : 'loading');
    resource.promise.then(function () {
      if (plateId(el) === expectedId) { el.setAttribute('data-vls-ivory-ready', 'true'); }
    }, function (err) {
      if (plateId(el) === expectedId) { el.setAttribute('data-vls-ivory-ready', 'error'); }
      if (root.console) { console.error(err); }
    });
    return el;
  }
  function applyAll(scope) {
    scope = scope || doc;
    var plates = [];
    if (scope.matches && scope.matches('[data-vls-ivory],.vls-ivory[id]')) { plates.push(scope); }
    var list = scope.querySelectorAll('[data-vls-ivory],.vls-ivory[id]');
    for (var i = 0; i < list.length; i++) { plates.push(list[i]); }
    plates.forEach(function (el) { apply(el); });
    return plates.length;
  }
  function paint(ctx, x, y, w, h, id) {
    if (!(w > 0 && h > 0)) { return false; }
    var d = describe(id), item = imageFor(d), g = geometry(w, h, d);
    ctx.save();
    try {
      if (root.Path2D) {
        var clip = new root.Path2D(); clip.rect(x, y, w, h); ctx.clip(clip);
      } else { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }
      ctx.fillStyle = '#f1ecdf'; ctx.fillRect(x, y, w, h);
      if (!item.loaded) { return false; } // call ready() once before a game loop
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(g.angle * Math.PI / 180);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(item.image, -g.width / 2 - g.x, -g.height / 2 - g.y, g.imageWidth, g.imageHeight);
      ctx.fillStyle = tint(d); ctx.fillRect(-g.width / 2, -g.height / 2, g.width, g.height);
      ctx.restore();
      // Same subtle satin polish as the DOM surface, in face coordinates.
      var dx = Math.sin(130 * Math.PI / 180), dy = -Math.cos(130 * Math.PI / 180);
      var extent = Math.abs(w * dx) + Math.abs(h * dy);
      var sheen = ctx.createLinearGradient(x+w/2-dx*extent/2, y+h/2-dy*extent/2,
                                          x+w/2+dx*extent/2, y+h/2+dy*extent/2);
      sheen.addColorStop(0, 'rgba(255,253,246,.10)');
      sheen.addColorStop(.42, 'rgba(255,253,246,0)');
      sheen.addColorStop(1, 'rgba(87,55,20,.025)');
      ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.translate(x+w*.48, y+h*.35); ctx.scale(w, h*1.3);
      var edge = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      edge.addColorStop(.48, 'rgba(153,106,45,0)'); edge.addColorStop(1, 'rgba(153,106,45,.055)');
      ctx.fillStyle = edge; ctx.fillRect(-.48, -.35/1.3, 1, 1/1.3);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,254,249,.45)'; ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = 'rgba(89,65,31,.12)'; ctx.fillRect(x, y+h-1, w, 1);
      return true;
    } finally { ctx.restore(); }
  }
  VLS.ivory = {version: '1.0.0', variantCount: count,
    hash: hash, describe: describe, apply: apply, applyAll: applyAll,
    refresh: refresh, ready: ready, paint: paint};
  function start() {
    applyAll();
    if (root.MutationObserver) {
      new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.type === 'attributes') { applyAll(m.target); }
          else {
            for (var i = 0; i < m.addedNodes.length; i++) {
              if (m.addedNodes[i].nodeType === 1) { applyAll(m.addedNodes[i]); }
            }
            // Release removed elements rather than retaining retired game UI.
            watched = watched.filter(function (el) {
              if (doc.documentElement.contains(el)) { return true; }
              if (resizeObserver) { resizeObserver.unobserve(el); }
              return false;
            });
          }
        });
      }).observe(doc.documentElement, {subtree: true, childList: true,
        attributes: true, attributeFilter: ['data-vls-ivory', 'id']});
    }
    if (!resizeObserver) {
      root.addEventListener('resize', function () { watched.forEach(refresh); });
    }
  }
  if (doc) {
    if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', start); }
    else { start(); }
  }
})(window);

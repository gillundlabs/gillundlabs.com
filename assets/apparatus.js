/* Victorian Lab Style: apparatus drawing (canvas 2D). Plain script: window.VLS.apparatus. Needs tokens.js first.
 * Extracted from Maxwell's Demon (render.js). Everything is procedural: no image assets.
 * Reserved for later additions by sibling projects: stainless tube, ConFlat flange, pump, gauge and laser helpers.
 * Put them in a separate file (e.g. hardware.js → VLS.hardware) that follows the same conventions. */
(function (root) {
  'use strict';
  const VLS = (root.VLS = root.VLS || {});
  const C = (n) => VLS.tokens.palette[n];

  // small deterministic PRNG (same seed → same texture)
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const dprOf = () => Math.min(3, Math.max(1, (root.devicePixelRatio || 1)));

  // ---------- French-polished dark walnut ----------
  // Slab walnut: straight uneven rings, irregular pores, broken figure (furniture-grade).
  // NO sine-wave swoops, NO mirrored swirls (owner 2026-11-05).
  // Grain scale follows the surface; generate at the logical draw size.
  // Panelling: same slab look on every piece, unique seed, grainDir along the long axis
  // (owner 2026-11-05: prefer slab over cathedral/flame nested arches).
  // figure 'cathedral' remains available but is NOT used for recessed paneling.
  const woodCache = new Map(), WOOD_CACHE_MAX = 80;
  const SITE_WOOD_SEED = 20261105; // fixed seed for Webmaster site backgrounds (stable across visits)
  const SITE_WOOD_DESKTOP = [2400, 1600], SITE_WOOD_PHONE = [1080, 1920];

  function grainScaleOf(w, h, override) {
    if (override != null && override > 0) return override;
    return Math.max(0.35, Math.min(2.8, Math.min(w, h) / 180));
  }
  // Grain runs along the long dimension of a board/panel piece.
  function grainAlongLong(w, h) {
    return (h >= w) ? 'v' : 'h';
  }

  function hash01(a, b, c) {
    let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ (c | 0);
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function paintWalnut(g, w, h, seed, opts = {}) {
    const tileable = !!opts.tileable;
    const vignette = opts.vignette !== undefined ? !!opts.vignette : !tileable;
    const grainDir = (opts.grainDir === 'v' || opts.grainDir === 'vertical') ? 'v' : 'h';
    const figure = (opts.figure === 'cathedral' || opts.figure === 'flame') ? 'cathedral' : 'plain';
    const S = grainScaleOf(w, h, opts.grainScale);
    const r = mulberry(seed | 0);
    g.fillStyle = C('wood'); g.fillRect(0, 0, w, h);

    // Colour plates along the grain (uneven heartwood / sapwood bands)
    const nPlates = 12 + (figure === 'cathedral' ? 4 : 0);
    for (let i = 0; i < nPlates; i++) {
      const warm = r() < 0.42;
      g.fillStyle = warm
        ? `rgba(${88 + r() * 40},${42 + r() * 22},${14 + r() * 12},${0.07 + r() * 0.12})`
        : `rgba(${22 + r() * 18},${9 + r() * 8},${3 + r() * 5},${0.09 + r() * 0.15})`;
      if (grainDir === 'v') {
        const x = r() * w, ww = (10 + r() * 55) * S;
        const band = (xx) => g.fillRect(xx, 0, ww, h);
        band(x); if (tileable) { band(x - w); band(x + w); }
      } else {
        const y = r() * h, hh = (10 + r() * 60) * S;
        const band = (yy) => g.fillRect(0, yy, w, hh);
        band(y); if (tileable) { band(y - h); band(y + h); }
      }
    }

    const step = Math.max(2, Math.round(3 + S));

    if (figure === 'cathedral' && grainDir === 'v') {
      // Irregular flat-sawn cathedral / flame — unique centre, focus, lean per seed.
      // Hash wobble + broken rings keep it from reading as mirrored procedural swirl.
      const cx = w * (0.18 + r() * 0.64);
      const apex = -h * (0.02 + r() * 0.35);
      const focus = (18 + r() * 95) * S * Math.max(0.55, w / 160);
      const leanAll = (r() - 0.5) * 0.045;
      const skew = (r() - 0.5) * 0.00035 * w;
      const rings = [];
      let d = (1.2 + r() * 4) * S;
      while (d < Math.max(w, h) * 1.25) {
        const spacing = (2.0 + r() * 6.5 + (r() < 0.1 ? r() * 12 : 0)) * S;
        rings.push({
          d, thick: (r() < 0.22 ? 1.4 + r() * 2.4 : 0.45 + r() * 1.15) * S,
          dark: r() < 0.7, broken: r() < 0.16,
          breakAt: 0.15 + r() * 0.7, breakW: 0.015 + r() * 0.04,
          wobble: (0.5 + r() * 2.4) * S,
          lean: leanAll + (r() - 0.5) * 0.012,
          focusJitter: 0.82 + r() * 0.4,
        });
        d += spacing;
      }
      for (const ring of rings) {
        const strokeOnce = (xOff, yOff) => {
          g.beginPath();
          let started = false;
          for (let x = 0; x <= w; x += step) {
            const h1 = hash01(Math.floor(x / (7 * S || 7)), Math.floor(ring.d * 10), seed) - 0.5;
            const h2 = hash01(Math.floor(x / (19 * S || 19)), Math.floor(ring.d * 3), seed ^ 0xabc) - 0.5;
            const h3 = hash01(Math.floor(x / (41 * S || 41)), seed ^ Math.floor(ring.d), 9) - 0.5;
            const dx = (x + xOff) - cx + h3 * 6 * S;
            const f = focus * ring.focusJitter;
            let y = apex + yOff + ring.d + (dx * dx) / f + x * ring.lean + skew * x * x / Math.max(1, w)
              + h1 * ring.wobble * 0.85 + h2 * ring.wobble * 1.1;
            if (ring.broken && Math.abs(x / w - ring.breakAt) < ring.breakW) {
              if (started) g.stroke();
              started = false; continue;
            }
            if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
          }
          g.strokeStyle = ring.dark
            ? `rgba(8,3,1,${0.22 + (ring.thick > 1.3 * S ? 0.24 : 0.08)})`
            : `rgba(155,90,42,${0.05 + r() * 0.08})`;
          g.lineWidth = ring.thick;
          if (started) g.stroke();
        };
        strokeOnce(0, 0);
        if (tileable) { strokeOnce(-w, 0); strokeOnce(w, 0); strokeOnce(0, -h); strokeOnce(0, h); }
      }
      // Soft mottling unique to this board (breaks "same tile" read)
      for (let i = 0; i < 7; i++) {
        const mx = r() * w, my = r() * h, mr = (20 + r() * 70) * S;
        const mg = g.createRadialGradient(mx, my, 0, mx, my, mr);
        const warm = r() < 0.5;
        mg.addColorStop(0, warm ? `rgba(120,60,25,${0.04 + r() * 0.06})` : `rgba(10,4,1,${0.05 + r() * 0.08})`);
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = mg; g.fillRect(0, 0, w, h);
      }
      // Gentle centre sheen (satin polish catching light) — not a hard specular stripe
      const flame = g.createRadialGradient(cx, h * 0.35, 4, cx, h * 0.45, Math.max(w, h) * 0.55);
      flame.addColorStop(0, 'rgba(255,220,170,0.05)');
      flame.addColorStop(0.45, 'rgba(255,210,150,0.015)');
      flame.addColorStop(1, 'rgba(255,200,140,0)');
      g.fillStyle = flame; g.fillRect(0, 0, w, h);
        } else if (grainDir === 'v') {
      // Quartersawn / straight vertical rings (stiles)
      const rings = [];
      let x = -20 * S - r() * 30 * S;
      while (x < w + 40 * S) {
        const spacing = (2.0 + r() * 4.8 + (r() < 0.08 ? r() * 8 : 0)) * S;
        rings.push({
          x0: x, thick: (r() < 0.16 ? 1.5 + r() * 2.0 : 0.5 + r() * 1.0) * S,
          dark: r() < 0.75, broken: r() < 0.1,
          breakAt: 0.25 + r() * 0.5, breakDx: (r() - 0.5) * 14 * S,
          lean: (r() - 0.5) * 0.01, wobble: (0.3 + r() * 1.4) * S,
        });
        x += spacing;
      }
      for (const ring of rings) {
        const strokeOnce = (xOff) => {
          g.beginPath();
          let started = false;
          for (let y = 0; y <= h; y += step) {
            const h1 = hash01(Math.floor(y / (11 * S || 11)), Math.floor(ring.x0), seed) - 0.5;
            const h2 = hash01(Math.floor(y / (29 * S || 29)), Math.floor(ring.x0 * 3), seed ^ 7) - 0.5;
            let xx = ring.x0 + xOff + y * ring.lean + h1 * ring.wobble * 0.55 + h2 * ring.wobble * 0.85;
            if (ring.broken && y / h > ring.breakAt) xx += ring.breakDx * 0.12;
            if (ring.broken && Math.abs(y / h - ring.breakAt) < 0.02) {
              if (started) g.stroke();
              started = false; continue;
            }
            if (!started) { g.moveTo(xx, y); started = true; } else g.lineTo(xx, y);
          }
          g.strokeStyle = ring.dark
            ? `rgba(8,3,1,${0.26 + (ring.thick > 1.3 * S ? 0.22 : 0.08)})`
            : `rgba(140,82,38,${0.06 + r() * 0.07})`;
          g.lineWidth = ring.thick;
          if (started) g.stroke();
        };
        strokeOnce(0); if (tileable) { strokeOnce(-w); strokeOnce(w); }
      }
    } else {
      // Horizontal rings (rails, benches, tileable boards) — prior walnut behaviour
      const rings = [];
      let y = -20 * S - r() * 30 * S;
      while (y < h + 40 * S) {
        const spacing = (2.2 + r() * 5.5 + (r() < 0.08 ? r() * 10 : 0)) * S;
        rings.push({
          y0: y, thick: (r() < 0.18 ? 1.6 + r() * 2.2 : 0.55 + r() * 1.1) * S,
          dark: r() < 0.75, broken: r() < 0.12,
          breakAt: 0.25 + r() * 0.5, breakDx: (r() - 0.5) * 18 * S,
          lean: (r() - 0.5) * 0.012, wobble: (0.4 + r() * 1.8) * S,
        });
        y += spacing;
      }
      for (const ring of rings) {
        const strokeOnce = (yOff) => {
          g.beginPath();
          let started = false;
          for (let x = 0; x <= w; x += step) {
            const h1 = hash01(Math.floor(x / (11 * S || 11)), Math.floor(ring.y0), seed) - 0.5;
            const h2 = hash01(Math.floor(x / (29 * S || 29)), Math.floor(ring.y0 * 3), seed ^ 3) - 0.5;
            const h3 = hash01(Math.floor(x / (47 * S || 47)), seed, Math.floor(ring.y0)) - 0.5;
            let yy = ring.y0 + yOff + x * ring.lean + h1 * ring.wobble * 0.55 + h2 * ring.wobble * 0.9 + h3 * 0.7 * S;
            if (ring.broken && x / w > ring.breakAt) yy += ring.breakDx * 0.15;
            if (ring.broken && Math.abs(x / w - ring.breakAt) < 0.02) {
              if (started) g.stroke();
              started = false; continue;
            }
            if (!started) { g.moveTo(x, yy); started = true; } else g.lineTo(x, yy);
          }
          g.strokeStyle = ring.dark
            ? `rgba(8,3,1,${0.28 + (ring.thick > 1.4 * S ? 0.25 : 0.1)})`
            : `rgba(140,82,38,${0.07 + r() * 0.08})`;
          g.lineWidth = ring.thick;
          if (started) g.stroke();
        };
        strokeOnce(0); if (tileable) { strokeOnce(-h); strokeOnce(h); }
      }
    }

    // Irregular open pores elongated with the grain
    const poreCount = Math.floor(700 * (w * h) / (512 * 512));
    for (let i = 0; i < poreCount; i++) {
      const x = r() * w, y = r() * h;
      if (!(r() < 0.35 && (Math.floor((grainDir === 'v' ? x : y) / (18 * S)) % 3 === 0)) && r() < 0.25) continue;
      const along = (0.4 + r() * 2.8) * S, across = (0.15 + r() * 0.55) * S;
      const rw = grainDir === 'v' ? across : along, rh = grainDir === 'v' ? along : across;
      g.fillStyle = `rgba(5,2,1,${0.18 + r() * 0.38})`;
      const blot = (xx, yy) => { g.beginPath(); g.ellipse(xx, yy, rw, rh, (r() - 0.5) * 0.2, 0, 7); g.fill(); };
      blot(x, y);
      if (tileable) { blot(x - w, y); blot(x + w, y); blot(x, y - h); blot(x, y + h); }
    }

    // Short vessel / ray flecks along the grain
    for (let i = 0; i < Math.floor(80 * Math.min(2, (w * h) / (512 * 512))); i++) {
      const x = r() * w, y = r() * h, L = (4 + r() * 18) * S;
      g.strokeStyle = `rgba(10,4,1,${0.10 + r() * 0.22})`;
      g.lineWidth = (0.4 + r() * 0.7) * S;
      g.beginPath();
      if (grainDir === 'v') { g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 1.2 * S, y + L); }
      else { g.moveTo(x, y); g.lineTo(x + L, y + (r() - 0.5) * 1.2 * S); }
      g.stroke();
    }

    // Soft French-polish / satin sheen
    if (grainDir === 'v') {
      const sh = g.createLinearGradient(0, 0, w, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.10)');
      sh.addColorStop(0.35, 'rgba(255,215,160,0)');
      sh.addColorStop(0.5, 'rgba(255,230,180,0.05)');
      sh.addColorStop(0.65, 'rgba(255,215,160,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      const sh2 = g.createLinearGradient(0, 0, 0, h);
      sh2.addColorStop(0, 'rgba(255,215,160,0.04)');
      sh2.addColorStop(0.45, 'rgba(255,215,160,0)');
      sh2.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = sh2; g.fillRect(0, 0, w, h);
    } else {
      const sh = g.createLinearGradient(0, 0, 0, h);
      sh.addColorStop(0, 'rgba(255,215,160,0.045)');
      sh.addColorStop(0.4, 'rgba(255,215,160,0)');
      sh.addColorStop(0.55, 'rgba(255,230,180,0.055)');
      sh.addColorStop(0.7, 'rgba(255,215,160,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
    }

    if (vignette) {
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }
  }

  function woodTexture(w, h, seed = 7, opts = {}) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const tileable = !!opts.tileable, vignette = opts.vignette !== undefined ? !!opts.vignette : !tileable;
    const gScale = opts.grainScale == null ? '' : String(opts.grainScale);
    const grainDir = (opts.grainDir === 'v' || opts.grainDir === 'vertical') ? 'v' : 'h';
    const figure = (opts.figure === 'cathedral' || opts.figure === 'flame') ? 'c' : 'p';
    const dpr = opts.dpr != null ? opts.dpr : dprOf();
    const key = `${w}x${h}:${seed | 0}:t${tileable ? 1 : 0}:v${vignette ? 1 : 0}:s${gScale}:d${dpr}:${grainDir}${figure}`;
    if (woodCache.has(key)) { const hit = woodCache.get(key); woodCache.delete(key); woodCache.set(key, hit); return hit; }
    while (woodCache.size >= WOOD_CACHE_MAX) {
      const k0 = woodCache.keys().next().value, old = woodCache.get(k0); woodCache.delete(k0);
      if (old) old.width = old.height = 0;
    }
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    c.logicalW = w; c.logicalH = h;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    paintWalnut(g, w, h, seed, { tileable, vignette, grainScale: opts.grainScale, grainDir, figure: figure === 'c' ? 'cathedral' : 'plain' });
    woodCache.set(key, c); return c;
  }

  // Flat timber bake (benches / misc). Prefer woodPanellingBake for site CSS wall backgrounds.
  function woodPanelBake(w = SITE_WOOD_DESKTOP[0], h = SITE_WOOD_DESKTOP[1], seed = SITE_WOOD_SEED, opts = {}) {
    return woodTexture(w, h, seed, Object.assign({ vignette: false, tileable: false, dpr: 1 }, opts));
  }
  function woodPanelDataURL(w, h, seed, opts = {}) {
    return woodPanelBake(w, h, seed, opts).toDataURL(opts.type || 'image/png');
  }

  // Draw true recessed Victorian paneling into an existing context (stiles, rails, fields, bolection, pegs).
  function paintPanelling(g, w, h, opts = {}) {
    const seed = (opts.seed != null ? opts.seed : SITE_WOOD_SEED) | 0;
    const pegs = opts.pegs !== false;
    const twoRow = opts.twoRow !== false && h >= 420;
    const targetPanel = Math.max(72, opts.panel || Math.round(Math.min(w * 0.18, h * 0.22)));
    const stile = Math.max(16, Math.round(opts.stile || targetPanel * 0.18));
    const rail = Math.max(14, Math.round(opts.rail || stile * 0.92));
    const mold = Math.max(7, Math.round(opts.molding || Math.min(18, stile * 0.55)));
    const margin = Math.max(stile, Math.round(opts.margin != null ? opts.margin : stile * 0.85));
    const baseH = opts.baseboard != null ? Math.round(opts.baseboard) : (h >= 500 ? Math.round(Math.min(72, h * 0.07)) : 0);
    const dprTex = opts.dpr || 1;

    const topY = margin;
    const botY = h - (baseH > 0 ? baseH : Math.max(rail, Math.round(margin * 0.6)));
    const leftX = margin;
    const rightX = w - margin;
    const cols = Math.max(1, Math.round(opts.cols || (rightX - leftX) / Math.max(targetPanel, 1)));
    const rows = twoRow ? 2 : Math.max(1, Math.round(opts.rows || 1));

    // Vertical stile centre-lines (including outer frame stiles at leftX / rightX)
    const xs = [];
    for (let c = 0; c <= cols; c++) xs.push(Math.round(leftX + c * (rightX - leftX) / cols));

    // Horizontal rail centre-lines (including top / bottom frame rails)
    const ys = [topY];
    if (rows === 2) {
      // Owner-locked layout (2026-11-05): long panels over short ones — keep ~2/3 : ~1/3.
      // Do not flatten to equal rows or single-tier without a new owner call.
      ys.push(Math.round(topY + (botY - topY) * 0.66));
    }
    ys.push(botY);

    const castsOnly = !!opts.castsOnly;
    const wallH = baseH > 0 ? h - baseH : h;
    if (!castsOnly) {
    g.fillStyle = C('woodDeep'); g.fillRect(0, 0, w, h);

    // Outer margin carcass (beyond frame) — same deep walnut
    // Continuous stiles (vertical quartersawn), full height down to baseboard
    for (let c = 0; c <= cols; c++) {
      const cx = xs[c];
      let x0 = Math.round(cx - stile / 2), x1 = x0 + stile;
      if (c === 0) { x0 = 0; x1 = Math.round(cx + stile / 2); }
      if (c === cols) { x0 = Math.round(cx - stile / 2); x1 = w; }
      const tw = Math.max(4, x1 - x0);
      const pseed = (Math.imul(seed ^ 0x85157b0c, 0x85ebca6b) ^ Math.imul(c + 11, 0xc2b2ae35)) | 0;
      const thS = Math.max(8, wallH);
      const tex = woodTexture(tw, thS, pseed, { vignette: false, grainDir: grainAlongLong(tw, thS), figure: 'plain', dpr: dprTex });
      g.drawImage(tex, x0, 0, tw, wallH);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x0, 0, 1, wallH);
      g.fillStyle = 'rgba(255,200,140,0.04)'; g.fillRect(x1 - 1, 0, 1, wallH);
    }

    // Continuous rails (horizontal grain) across full width
    for (let k = 0; k < ys.length; k++) {
      const cy = ys[k];
      let y0 = Math.round(cy - rail / 2), y1 = y0 + rail;
      if (k === 0) { y0 = 0; y1 = Math.round(cy + rail / 2); }
      if (k === ys.length - 1) { y0 = Math.round(cy - rail / 2); y1 = wallH; }
      y0 = Math.max(0, y0); y1 = Math.min(wallH, y1);
      const th = Math.max(4, y1 - y0);
      const pseed = (Math.imul(seed ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(k + 3, 0xc2b2ae35)) | 0;
      const tex = woodTexture(w, th, pseed, { vignette: false, grainDir: grainAlongLong(w, th), figure: 'plain', dpr: dprTex });
      g.drawImage(tex, 0, y0, w, th);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y0, w, 1);
      g.fillStyle = 'rgba(255,210,150,0.05)'; g.fillRect(0, y1 - 1, w, 1);
    }

    } // end !castsOnly frame/stiles/rails

    // Recessed fields + bolection molding (directional light on raised lips)
    // opts.lightX / lightY: lamp or key light in panel coords (default upper-left).
    const lightX = opts.lightX != null ? opts.lightX : w * 0.28;
    const lightY = opts.lightY != null ? opts.lightY : h * 0.12;
    const lightReach = Math.max(w, h) * (opts.lightReach != null ? opts.lightReach : 0.85);

    let pi = 0;
    for (let row = 0; row < ys.length - 1; row++) {
      for (let col = 0; col < cols; col++, pi++) {
        const xL = (col === 0) ? Math.round(xs[0] + stile / 2) : Math.round(xs[col] + stile / 2);
        const xR = (col === cols - 1) ? Math.round(xs[cols] - stile / 2) : Math.round(xs[col + 1] - stile / 2);
        const yT = (row === 0) ? Math.round(ys[0] + rail / 2) : Math.round(ys[row] + rail / 2);
        const yB = (row === ys.length - 2) ? Math.round(ys[ys.length - 1] - rail / 2) : Math.round(ys[row + 1] - rail / 2);
        const fw = xR - xL, fh = yB - yT;
        if (fw < 14 || fh < 14) continue;

        const m = Math.min(mold, Math.floor(Math.min(fw, fh) / 5));
        const ix = xL + m, iy = yT + m, iw = fw - 2 * m, ih = fh - 2 * m;
        if (iw < 4 || ih < 4) continue;

        const pseed = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(pi + 1, 0xc2b2ae35) ^ Math.imul(col + 1, 131) ^ Math.imul(row + 1, 17)) | 0;
        const castsOnly = !!opts.castsOnly;
        if (!castsOnly) {
          const tex = woodTexture(Math.max(8, iw), Math.max(8, ih), pseed, {
            vignette: false, grainDir: grainAlongLong(iw, ih), figure: 'plain', dpr: dprTex,
          });
          g.drawImage(tex, ix, iy, iw, ih);
        }

        // Light vector from panel centre → lamp (canvas y-down)
        const pcx = xL + fw * 0.5, pcy = yT + fh * 0.5;
        let ldx = lightX - pcx, ldy = lightY - pcy;
        const ldist = Math.hypot(ldx, ldy) || 1;
        ldx /= ldist; ldy /= ldist;
        // Gentle proximity — do not crush far panels
        const prox = Math.max(0.55, Math.min(1.05, 1.05 - ldist / (lightReach * 1.35)));
        const faceTop = Math.max(0, -ldy);
        const faceBot = Math.max(0, ldy);
        const faceL = Math.max(0, -ldx);
        const faceR = Math.max(0, ldx);
        const leeTop = Math.max(0, ldy);
        const leeBot = Math.max(0, -ldy);
        const leeL = Math.max(0, ldx);
        const leeR = Math.max(0, -ldx);

        // --- Soft photo-like cast penumbra onto the field (refs 06/07) ---
        // Thin vertical lee line; slightly wider wash under the top rail.
        // Low multiply so grain stays readable — never muddy black bands.
        const raiseZ = Math.max(2.5, m * 0.55);
        const lightPull = opts.lightPull != null ? opts.lightPull : Math.max(40, Math.min(90, Math.min(w, h) * 0.07));
        const maxV = Math.min(9, Math.max(3, iw * 0.04));   // thin vertical cast
        const maxH = Math.min(18, Math.max(6, ih * 0.055));  // wider top wash
        const castLen = (distAlong, cap) => {
          const raw = raiseZ * (Math.max(12, distAlong) / lightPull);
          return Math.max(2, Math.min(cap, raw * (0.35 + 0.2 * prox)));
        };

        g.save();
        g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
        g.globalCompositeOperation = 'multiply';

        // Soft band: strength 0..1 maps to gentle darkening under multiply
        const softBand = (sx, sy, dx, dy, len, strength) => {
          if (len < 2 || strength < 0.04) return;
          const gx1 = sx + dx * len, gy1 = sy + dy * len;
          const gr = g.createLinearGradient(sx, sy, gx1, gy1);
          // refs: transparent wash — umbra ~8–18% darken, fades fast
          const u = Math.round(255 * (1 - Math.min(0.10, strength * 0.12)));
          const mid = Math.round(255 * (1 - Math.min(0.05, strength * 0.06)));
          const pen = Math.round(255 * (1 - Math.min(0.015, strength * 0.02)));
          gr.addColorStop(0, `rgb(${u},${Math.round(u * 0.92)},${Math.round(u * 0.85)})`);
          gr.addColorStop(0.35, `rgb(${mid},${Math.round(mid * 0.94)},${Math.round(mid * 0.88)})`);
          gr.addColorStop(0.75, `rgb(${pen},${Math.round(pen * 0.96)},${Math.round(pen * 0.92)})`);
          gr.addColorStop(1, 'rgb(255,255,255)');
          g.fillStyle = gr;
          if (Math.abs(dx) >= Math.abs(dy)) {
            const x0 = dx > 0 ? sx : sx - len;
            g.fillRect(x0, iy, len + 1, ih);
          } else {
            const y0 = dy > 0 ? sy : sy - len;
            g.fillRect(ix, y0, iw, len + 1);
          }
        };

        const edgeSlop = Math.max(4, stile * 0.45);
        // Vertical lee: thin line on the side away from the light
        if (lightX <= ix + edgeSlop) {
          softBand(ix, iy, 1, 0, castLen(Math.max(lightPull * 0.5, ix + edgeSlop - lightX), maxV), 0.22 + 0.15 * prox);
        }
        if (lightX >= ix + iw - edgeSlop) {
          softBand(ix + iw, iy, -1, 0, castLen(Math.max(lightPull * 0.5, lightX - (ix + iw - edgeSlop)), maxV), 0.22 + 0.15 * prox);
        }
        // Top rail wash onto field (wider, still soft) when light is above / upper
        if (lightY <= iy + edgeSlop * 1.5 || faceTop > 0.35) {
          const topStr = 0.28 + 0.18 * Math.max(faceTop, prox * 0.45);
          softBand(ix, iy, 0, 1, castLen(Math.max(lightPull * 0.7, Math.abs(iy - lightY) + 8), maxH), topStr);
        }
        if (lightY >= iy + ih - edgeSlop) {
          softBand(ix, iy + ih, 0, -1, castLen(Math.max(lightPull * 0.5, lightY - (iy + ih - edgeSlop)), maxV), 0.16 + 0.12 * prox);
        }

        g.globalCompositeOperation = 'source-over';
        // Tiny ambient recess only (grain stays open)
        g.fillStyle = `rgba(0,0,0,${0.015 + 0.01 * prox})`;
        g.fillRect(ix, iy, iw, ih);
        g.restore();

        // Tiered bolection: wood lips + thin facing highlights / soft lee (not thick gold)
        if (castsOnly) continue;
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const t0 = (m * t) / tiers;
          const inset = Math.max(1, m / tiers);
          const rx = xL + t0, ry = yT + t0, rw = fw - 2 * t0, rh = fh - 2 * t0;
          const midSeed = (pseed ^ Math.imul(t + 5, 0x85ebca6b)) | 0;
          const band = Math.max(1, Math.round(inset));
          const tierBoost = 1 - t * 0.14;
          if (rw > 4 && rh > 4) {
            const twM = Math.max(4, Math.round(rw)), thM = band + 2;
            const swM = band + 2, shM = Math.max(4, Math.round(rh));
            const ttex = woodTexture(twM, thM, midSeed, { vignette: false, grainDir: grainAlongLong(twM, thM), figure: 'plain', dpr: dprTex });
            const stex = woodTexture(swM, shM, midSeed ^ 0x55, { vignette: false, grainDir: grainAlongLong(swM, shM), figure: 'plain', dpr: dprTex });
            g.drawImage(ttex, rx, ry, rw, band);
            g.drawImage(ttex, rx, ry + rh - band, rw, band);
            g.drawImage(stex, rx, ry, band, rh);
            g.drawImage(stex, rx + rw - band, ry, band, rh);
          }
          // Thin specular lips (ref 07) — keep alpha low
          const hiW = Math.max(1, Math.min(2.2, inset * 0.35));
          if (faceTop > 0.05) {
            g.fillStyle = `rgba(255,230,190,${(0.025 + 0.06 * faceTop) * prox * tierBoost})`;
            g.fillRect(rx, ry, rw, hiW);
          }
          if (faceL > 0.05) {
            g.fillStyle = `rgba(255,225,180,${(0.02 + 0.05 * faceL) * prox * tierBoost})`;
            g.fillRect(rx, ry, hiW, rh);
          }
          if (faceBot > 0.05) {
            g.fillStyle = `rgba(255,225,180,${(0.02 + 0.05 * faceBot) * prox * tierBoost})`;
            g.fillRect(rx, ry + rh - hiW, rw, hiW);
          }
          if (faceR > 0.05) {
            g.fillStyle = `rgba(255,220,175,${(0.02 + 0.05 * faceR) * prox * tierBoost})`;
            g.fillRect(rx + rw - hiW, ry, hiW, rh);
          }
          // Soft lee groove only (ambient occlusion in the step — not a cast band)
          const shW = Math.max(1, inset * 0.4);
          if (leeBot > 0.05 || faceTop > 0.25) {
            g.fillStyle = `rgba(0,0,0,${(0.04 + 0.05 * Math.max(leeBot, faceTop * 0.4)) * prox * tierBoost})`;
            g.fillRect(rx, ry + rh - shW, rw, shW);
          }
          if (leeR > 0.05 || faceL > 0.25) {
            g.fillStyle = `rgba(0,0,0,${(0.035 + 0.045 * Math.max(leeR, faceL * 0.4)) * prox * tierBoost})`;
            g.fillRect(rx + rw - shW, ry, shW, rh);
          }
          if (leeTop > 0.05) {
            g.fillStyle = `rgba(0,0,0,${(0.03 + 0.035 * leeTop) * prox * tierBoost})`;
            g.fillRect(rx, ry, rw, Math.max(1, inset * 0.3));
          }
          if (leeL > 0.05) {
            g.fillStyle = `rgba(0,0,0,${(0.025 + 0.03 * leeL) * prox * tierBoost})`;
            g.fillRect(rx, ry, Math.max(1, inset * 0.3), rh);
          }
          g.strokeStyle = `rgba(0,0,0,${0.05 + t * 0.015})`;
          g.lineWidth = 1;
          g.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        }
        g.strokeStyle = `rgba(0,0,0,${0.14 + 0.04 * prox})`;
        g.lineWidth = 1;
        g.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
        const rimA = (0.02 + 0.05 * prox * Math.max(faceTop, faceL, faceR));
        g.strokeStyle = `rgba(255,220,170,${rimA})`;
        g.lineWidth = 1;
        g.strokeRect(xL - 0.5, yT - 0.5, fw + 1, fh + 1);
      }
    }

    // Joinery pegs at stile × rail intersections
    if (pegs && !castsOnly) {
      for (let c = 0; c <= cols; c++) {
        for (let k = 0; k < ys.length; k++) {
          const px = Math.max(6, Math.min(w - 6, xs[c]));
          const py = Math.max(6, Math.min(wallH - 6, ys[k]));
          const pr = Math.max(1.6, Math.min(3.4, stile * 0.1));
          g.beginPath(); g.arc(px + 0.4, py + 0.6, pr + 0.7, 0, 7);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
          g.beginPath(); g.arc(px, py, pr, 0, 7);
          g.fillStyle = 'rgba(55,28,10,0.9)'; g.fill();
          g.beginPath(); g.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.32, 0, 7);
          g.fillStyle = 'rgba(255,210,150,0.2)'; g.fill();
        }
      }
    }

    // Baseboard
    if (baseH > 4 && !castsOnly) {
      const by = h - baseH;
      const pseed = (Math.imul(seed ^ 0x165667b1, 0x85ebca6b) ^ 99) | 0;
      const tex = woodTexture(w, baseH, pseed, { vignette: false, grainDir: grainAlongLong(w, baseH), figure: 'plain', dpr: dprTex });
      g.drawImage(tex, 0, by, w, baseH);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, by, w, 2);
      g.fillStyle = 'rgba(255,215,160,0.10)'; g.fillRect(0, by + 2, w, Math.max(2, baseH * 0.1));
      g.fillStyle = 'rgba(255,200,140,0.05)'; g.fillRect(0, by + baseH * 0.35, w, Math.max(2, baseH * 0.08));
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - Math.max(3, baseH * 0.14), w, Math.max(3, baseH * 0.14));
    }

    if (opts.satin !== false && !castsOnly) {
      const sat = g.createLinearGradient(0, 0, 0, h);
      sat.addColorStop(0, 'rgba(255,220,170,0.045)');
      sat.addColorStop(0.4, 'rgba(255,215,160,0)');
      sat.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = sat; g.fillRect(0, 0, w, h);
    }
  }

  function woodPanellingBake(w = SITE_WOOD_DESKTOP[0], h = SITE_WOOD_DESKTOP[1], seed = SITE_WOOD_SEED, opts = {}) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    paintPanelling(g, w, h, Object.assign({
      seed, dpr: 1, twoRow: h >= 900, baseboard: h >= 900 ? Math.round(h * 0.06) : 0,
      lightX: w * 0.72, lightY: h * 0.08, lightReach: Math.max(w, h) * 1.15,
      lightPull: Math.max(48, Math.min(96, Math.min(w, h) * 0.08)),
    }, opts));
    return c;
  }
  function woodPanellingDataURL(w, h, seed, opts = {}) {
    return woodPanellingBake(w, h, seed, opts).toDataURL(opts.type || 'image/png');
  }

  // ---------- lacquered brass ----------
  const BRASS_STOPS = () => [[0, C('brassShadow')], [0.12, C('brassMid')], [0.3, C('brass')], [0.42, C('brassHighlight')], [0.5, C('brassBright')], [0.75, C('brassWarm')], [1, C('brassDark')]];
  function brassGrad(ctx, x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of BRASS_STOPS()) g.addColorStop(o, c);
    return g;
  }
  // a brass bar/rail. vertical: the gradient runs across x (bar is tall); radius: corner radius
  function brassRect(ctx, x, y, w, h, vertical = false, radius = 3) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = vertical ? brassGrad(ctx, x, 0, x + w, 0) : brassGrad(ctx, 0, y, 0, y + h);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip();
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#000';   // brushed lines
    if (vertical) for (let yy = y; yy < y + h; yy += 2) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + 0.5); ctx.stroke(); }
    else for (let xx = x; xx < x + w; xx += 3) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + 0.5, y + h); ctx.stroke(); }
    ctx.globalAlpha = 1;                                // lacquer specular streak
    const s = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    s.addColorStop(0, 'rgba(255,255,230,0)'); s.addColorStop(0.32, 'rgba(255,255,230,0.0)'); s.addColorStop(0.38, 'rgba(255,255,235,0.35)'); s.addColorStop(0.44, 'rgba(255,255,230,0)'); s.addColorStop(1, 'rgba(255,255,230,0)');
    ctx.fillStyle = s; ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,24,4,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius); ctx.stroke();
  }
  // a curved brass wall: annulus r0..r1 about (cx, cy) from angle a0 to a1 (canvas radians, clockwise),
  // with turned lines along the curve and screws every ~opts.screwSpacing px of arc length
  function brassArc(ctx, cx, cy, r0, r1, a0, a1, opts = {}) {
    const ring = () => { ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath(); };
    const gr = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    [[0, C('brassDark')], [0.25, C('brassWarm')], [0.5, C('brassBright')], [0.58, C('brassHighlight')], [0.7, C('brass')], [0.88, C('brassMid')], [1, C('brassShadow')]].forEach(([o, c]) => gr.addColorStop(o, c));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ring(); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    ctx.save(); ring(); ctx.clip(); ctx.globalAlpha = 0.07; ctx.strokeStyle = '#000';
    for (let rr = r0 + 1; rr < r1; rr += 2) { ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke(); }
    ctx.restore();
    if (opts.screws === false) return;
    const rm = (r0 + r1) / 2, span = a1 - a0, n = Math.max(2, Math.round((Math.abs(span) * rm) / (opts.screwSpacing || 75)));
    for (let i = 0; i <= n; i++) { const a = a0 + span * (0.03 + (0.94 * i) / n); screw(ctx, cx + rm * Math.cos(a), cy + rm * Math.sin(a), opts.screwRadius || 4.6, i * 1.3 + a); }
  }

  // ---------- blued-steel fillister-head (cheese-head) slotted screw ----------
  function screw(ctx, x, y, r, angle = 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x + 0.8, y + 1.4, r + 1.6, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + 0.8, r, 0, 7); ctx.fillStyle = '#05080c'; ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, C('steelGlint')); g.addColorStop(0.25, C('steelBlue')); g.addColorStop(0.65, '#141f30'); g.addColorStop(1, C('steelDark'));
    ctx.beginPath(); ctx.arc(x, y - 0.4, r * 0.9, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    const t = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    t.addColorStop(0, 'rgba(60,40,120,0.25)'); t.addColorStop(0.5, 'rgba(20,60,120,0.1)'); t.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = t; ctx.beginPath(); ctx.arc(x, y - 0.4, r * 0.9, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y - 0.4); ctx.rotate(angle);
    ctx.fillStyle = '#010203'; ctx.fillRect(-r * 0.92, -r * 0.14, r * 1.84, r * 0.28);
    ctx.fillStyle = 'rgba(140,170,210,0.45)'; ctx.fillRect(-r * 0.92, r * 0.14, r * 1.84, Math.max(0.6, r * 0.07));
    ctx.restore();
    ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.5, r * 0.16, 0, 7); ctx.fillStyle = 'rgba(220,235,255,0.7)'; ctx.fill();
  }

  // ---------- engraved lettering and brass plaques ----------
  // Owner geometry (2026-11-06): screw at (s,s); plate corner-radius = s.
  // Side rules at inset s (screw-centre line). Concave quarter-circle notches
  // centred on each screw with radius R = s + r (r = screw-head radius).
  // Clearance to head (R − r) equals clearance to edge along the sides (= s).
  // Screws sit outside the closed ruled field. Defaults: s=10, r=3 → R=13.
  // Draw the rule as ONE closed path (straight → arc → straight → …). Cast
  // shadow BEYOND the plate on bottom and right only.
  const PLAQUE_S = 10, PLAQUE_HEAD = 3; // --vls-plaque-screw / --vls-plaque-head

  function engrave(ctx, text, x, y, size, align = 'center', weight = '600') {
    ctx.save();
    ctx.font = `${weight} ${size}px ${VLS.tokens.fonts.engraved}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${Math.max(0.5, size * 0.08)}px`;
    ctx.fillStyle = 'rgba(255,240,190,0.55)'; ctx.fillText(text, x, y + 1);
    ctx.fillStyle = C('engraving'); ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Brass cheese-head slotted screw for plaques (period; kit `screw` stays blued-steel for rails).
  function screwBrass(ctx, x, y, r, angle = 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x + 0.6, y + 1.1, r + 1.2, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    const rim = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.05, x, y, r);
    rim.addColorStop(0, C('brassHighlight')); rim.addColorStop(0.35, C('brassBright'));
    rim.addColorStop(0.7, C('brassMid')); rim.addColorStop(1, C('brassDark'));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = rim; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, 7);
    ctx.strokeStyle = 'rgba(40,24,4,0.85)'; ctx.lineWidth = Math.max(0.6, r * 0.12); ctx.stroke();
    const face = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 0.85);
    face.addColorStop(0, '#e8d090'); face.addColorStop(0.4, C('brass')); face.addColorStop(1, C('brassWarm'));
    ctx.beginPath(); ctx.arc(x, y - 0.15, r * 0.78, 0, 7); ctx.fillStyle = face; ctx.fill();
    ctx.translate(x, y - 0.15); ctx.rotate(angle);
    ctx.fillStyle = 'rgba(30,18,4,0.92)'; ctx.fillRect(-r * 0.78, -r * 0.12, r * 1.56, r * 0.24);
    ctx.fillStyle = 'rgba(255,240,190,0.35)'; ctx.fillRect(-r * 0.78, r * 0.12, r * 1.56, Math.max(0.5, r * 0.06));
    ctx.restore();
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.42, r * 0.14, 0, 7); ctx.fillStyle = 'rgba(255,250,230,0.7)'; ctx.fill();
  }

  // Single closed path: sides at inset s, concave quarter-arcs of radius R=s+r at screws.
  // plaqueRulePath(ctx, x, y, w, h, s, rHead)  — 5th numeric after h is head radius (not legacy d).
  function plaqueRulePath(ctx, x, y, w, h, s, r) {
    const R = s + r;
    ctx.beginPath();
    ctx.moveTo(x + s + R, y + s);
    ctx.lineTo(x + w - s - R, y + s);
    // TR: west → south through SW (anticlockwise)
    ctx.arc(x + w - s, y + s, R, Math.PI, Math.PI / 2, true);
    ctx.lineTo(x + w - s, y + h - s - R);
    // BR: north → west through NW
    ctx.arc(x + w - s, y + h - s, R, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(x + s + R, y + h - s);
    // BL: east → north through NE
    ctx.arc(x + s, y + h - s, R, 0, -Math.PI / 2, true);
    ctx.lineTo(x + s, y + s + R);
    // TL: south → east through SE
    ctx.arc(x + s, y + s, R, Math.PI / 2, 0, true);
    ctx.closePath();
  }

  function plaqueIvoryFill(ctx, x, y, w, h, s, seed) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, s); ctx.clip();
    // Cream fallback while procedural ivory loads; VLS.ivory.paint replaces it when ready.
    const base = '#f1ecdf';
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    const id = 'plaque/' + (seed | 0) + '/' + Math.round(w) + 'x' + Math.round(h);
    if (VLS.ivory && typeof VLS.ivory.paint === 'function') {
      try { VLS.ivory.paint(ctx, x, y, w, h, id); } catch (e) { /* keep cream */ }
    } else {
      const wash = ctx.createLinearGradient(x, y, x + w, y + h);
      wash.addColorStop(0, 'rgba(255,253,246,0.55)'); wash.addColorStop(0.45, 'rgba(255,253,246,0)');
      wash.addColorStop(1, 'rgba(89,65,31,0.10)');
      ctx.fillStyle = wash; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.06; ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1;
      const horiz = w >= h;
      if (horiz) {
        for (let yy = y + 3; yy < y + h; yy += 3.5) {
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + ((yy * 13) % 5) * 0.15 - 0.3); ctx.stroke();
        }
      } else {
        for (let xx = x + 3; xx < x + w; xx += 3.5) {
          ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + ((xx * 13) % 5) * 0.15 - 0.3, y + h); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function plaqueBwFill(ctx, x, y, w, h, s) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, s);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  // plaque(ctx, x, y, w, h, seed=1)
  // plaque(ctx, x, y, w, h, seed, opts)  or  plaque(ctx, x, y, w, h, opts)
  // opts: { material: 'brass'|'ivory'|'bw', s, r, seed, label, labelSize, theme }
  // Existing 5-arg callers keep working (brass, seed as 5th). opts.d is ignored (legacy).
  function plaque(ctx, x, y, w, h, seed = 1, opts) {
    if (seed && typeof seed === 'object') { opts = seed; seed = opts.seed != null ? opts.seed : 1; }
    opts = opts || {};
    let s = opts.s != null ? opts.s : (VLS.tokens.plaque && VLS.tokens.plaque.screw) || PLAQUE_S;
    let rHead = opts.r != null ? opts.r
      : (opts.head != null ? opts.head
        : (VLS.tokens.plaque && VLS.tokens.plaque.head) || PLAQUE_HEAD);
    // Scale so 2*(s+R)=2*(2s+r) leaves ~14px for the notched label field.
    const sMax = Math.max(4, (Math.min(w, h) - 14) / (4 + 2 * (rHead / Math.max(s, 1))));
    if (s > sMax) { const k = sMax / s; s = sMax; rHead = Math.max(1.1, rHead * k); }
    if (rHead > s * 0.45) rHead = Math.max(1.1, s * 0.3);
    const R = s + rHead; // arc radius; clearance to head = R − r = s
    let material = opts.material || 'brass';
    if (opts.theme === 'bw' || material === 'bw') material = 'bw';
    const rnd = mulberry(seed | 0);

    // Cast shadow BEYOND the plate, bottom + right only (owner: "Shadow lies beyond edge, not within it.").
    if (material !== 'bw') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.48)';
      ctx.shadowBlur = Math.max(4, Math.min(w, h) * 0.04);
      ctx.shadowOffsetX = Math.max(2.5, s * 0.28);
      ctx.shadowOffsetY = Math.max(2.5, s * 0.28);
      ctx.fillStyle = material === 'ivory' ? '#f1ecdf' : C('brass');
      ctx.beginPath(); ctx.roundRect(x, y, w, h, s); ctx.fill();
      ctx.restore();
    }

    if (material === 'brass') {
      // Aged brass: kit mid/warm only (no bright #d9a943 peak, no hot specular stripe).
      ctx.save();
      ctx.beginPath(); ctx.roundRect(x, y, w, h, s); ctx.clip();
      const aged = ctx.createLinearGradient(0, y, 0, y + h);
      aged.addColorStop(0, '#3a2508');
      aged.addColorStop(0.2, '#6b4a14');
      aged.addColorStop(0.45, '#8f6a28');  // muted mid — no lemon
      aged.addColorStop(0.7, '#6b4a14');
      aged.addColorStop(1, '#2a1803');
      ctx.fillStyle = aged; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.035; ctx.strokeStyle = '#1a0e04';
      for (let xx = x; xx < x + w; xx += 4.5) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + 0.25, y + h); ctx.stroke(); }
      ctx.globalAlpha = 1;
      const sheen = ctx.createRadialGradient(x + w * 0.2, y + h * 0.2, 0, x + w * 0.2, y + h * 0.2, Math.max(w, h) * 0.7);
      sheen.addColorStop(0, 'rgba(200,160,70,0.07)');
      sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = 'rgba(40,24,4,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, s); ctx.stroke();
    } else if (material === 'ivory') {
      plaqueIvoryFill(ctx, x, y, w, h, s, seed);
      ctx.strokeStyle = 'rgba(89,65,31,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, s); ctx.stroke();
    } else {
      plaqueBwFill(ctx, x, y, w, h, s);
    }

    // Engraved rule: dark incision + light lip on the lower-right of the groove (readable at normal size).
    const lineW = material === 'bw' ? 1.7 : 1.85;
    if (material === 'bw') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = lineW;
      plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(1.0, 1.0);
      ctx.strokeStyle = material === 'ivory' ? 'rgba(255,252,240,0.95)' : 'rgba(255,236,170,0.85)';
      ctx.lineWidth = lineW + 0.35;
      plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = material === 'ivory' ? 'rgba(30,20,12,0.95)' : 'rgba(20,10,2,0.98)';
      ctx.lineWidth = lineW;
      plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
    }

    // Four corner screws, varied slot angles. Brass on colour plaques; simple rings in B&W.
    const corners = [[x + s, y + s], [x + w - s, y + s], [x + s, y + h - s], [x + w - s, y + h - s]];
    corners.forEach(([sx, sy], i) => {
      const ang = (rnd() * 0.9 + i * 0.55 + seed * 0.17) % Math.PI; // visibly varied slots
      if (material === 'bw') {
        ctx.beginPath(); ctx.arc(sx, sy, rHead, 0, 7);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-rHead * 0.75, 0); ctx.lineTo(rHead * 0.75, 0);
        ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, rHead * 0.22); ctx.stroke();
        ctx.restore();
      } else {
        screwBrass(ctx, sx, sy, rHead, ang + i * 0.15);
      }
    });

    if (opts.label) {
      // One line inside the closed notched field (inscribed between arc endpoints).
      // Width clears screw heads along the side rules (at inset s); height clears notches.
      const margin = Math.max(2, rHead * 0.5 + 1);
      const innerW = Math.max(8, w - 2 * (s + rHead + margin + 2));
      const innerH = Math.max(8, h - 2 * (s + R + margin));
      const fontFamily = material === 'bw' ? VLS.tokens.fonts.sans
        : material === 'ivory' ? VLS.tokens.fonts.ivory
        : VLS.tokens.fonts.engraved;
      const weight = material === 'ivory' ? '400' : '600';
      const tracking = material === 'brass';
      const text = String(opts.label);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      // Offscreen ink scan — Engraving CC's advance width lies; measure real pixels after font load.
      const inkOf = (sz, ls) => {
        const font = `${weight} ${sz}px ${fontFamily}`;
        const probe = inkOf._c || (inkOf._c = document.createElement('canvas'));
        const p = probe.getContext('2d', { willReadFrequently: true });
        p.font = font;
        try { p.letterSpacing = ls ? `${ls}px` : '0px'; } catch (e) {}
        const adv = p.measureText(text).width || text.length * sz;
        const pad = Math.ceil(sz * 0.5) + 4;
        const pw = Math.max(8, Math.ceil(adv + sz * 2) + pad * 2);
        const ph = Math.max(8, Math.ceil(sz * 2.4) + pad * 2);
        if (probe.width !== pw || probe.height !== ph) { probe.width = pw; probe.height = ph; }
        else p.clearRect(0, 0, pw, ph);
        p.font = font;
        try { p.letterSpacing = ls ? `${ls}px` : '0px'; } catch (e2) {}
        p.textAlign = 'left'; p.textBaseline = 'alphabetic';
        p.fillStyle = '#000';
        p.fillText(text, pad, pad + sz);
        let img;
        try { img = p.getImageData(0, 0, pw, ph).data; } catch (e3) {
          return { w: adv, h: sz * 0.9, ls };
        }
        let minX = pw, minY = ph, maxX = -1, maxY = -1;
        for (let i = 0, y = 0; y < ph; y++) {
          for (let x0 = 0; x0 < pw; x0++, i += 4) {
            if (img[i + 3] > 40) {
              if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return { w: adv, h: sz * 0.9, ls };
        return { w: maxX - minX + 1, h: maxY - minY + 1, ls };
      };

      // Ink scan matches painted advance once the face is loaded — no inflation.
      const maxFill = 0.92, targetFill = 0.78, minFill = 0.60;
      // Cap-height ≈ 0.72em for Engraving CC / Old Standard; start tall enough to hit target ink height.
      let size = opts.labelSize != null ? opts.labelSize : Math.max(8, (innerH * targetFill) / 0.72);
      let ls = tracking ? Math.max(0.3, size * 0.03) : 0;
      let ink = inkOf(size, ls);
      const fits = (i) => i.w <= innerW * maxFill && i.h <= innerH * maxFill;
      for (let guard = 0; guard < 100 && size > 7; guard++, size -= 0.5) {
        ls = tracking ? Math.max(0.3, size * 0.03) : 0;
        ink = inkOf(size, ls);
        if (fits(ink)) break;
      }
      // Grow short labels up to target fill on the binding axis.
      if (opts.labelSize == null) {
        const shy = () => ink.w < innerW * targetFill && ink.h < innerH * targetFill;
        while (shy()) {
          const next = size + 0.5;
          const nls = tracking ? Math.max(0.3, next * 0.03) : 0;
          const nink = inkOf(next, nls);
          if (!fits(nink)) break;
          size = next; ls = nls; ink = nink;
          if (ink.h >= innerH * targetFill || ink.w >= innerW * targetFill) break;
          if (size > Math.max(innerW, innerH)) break;
        }
      }

      // Clip to the notched ruled field so ink never crosses the concave corners.
      ctx.beginPath();
      plaqueRulePath(ctx, x, y, w, h, s, rHead);
      ctx.clip();
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      try { ctx.letterSpacing = ls ? `${ls}px` : '0px'; } catch (e) {}
      if (material === 'bw') {
        ctx.fillStyle = '#000'; ctx.fillText(text, x + w / 2, y + h / 2);
      } else if (material === 'ivory') {
        ctx.fillStyle = '#2b2015'; ctx.fillText(text, x + w / 2, y + h / 2);
      } else {
        ctx.fillStyle = 'rgba(255,240,190,0.22)'; ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
        ctx.fillStyle = C('engraving'); ctx.fillText(text, x + w / 2, y + h / 2);
      }
      ctx.restore();
      // Re-strike the rule on top of the label so edge kisses lose to the incision (face-only).
      const rw = material === 'bw' ? 1.7 : 1.85;
      if (material === 'bw') {
        ctx.strokeStyle = '#000'; ctx.lineWidth = rw;
        plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(1.0, 1.0);
        ctx.strokeStyle = material === 'ivory' ? 'rgba(255,252,240,0.9)' : 'rgba(255,236,170,0.8)';
        ctx.lineWidth = rw + 0.35;
        plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = material === 'ivory' ? 'rgba(30,20,12,0.95)' : 'rgba(20,10,2,0.98)';
        ctx.lineWidth = rw;
        plaqueRulePath(ctx, x, y, w, h, s, rHead); ctx.stroke();
      }
    }
  }

  VLS.apparatus = { mulberry, woodTexture, paintWalnut, paintPanelling, grainScaleOf, grainAlongLong, woodPanelBake, woodPanelDataURL, woodPanellingBake, woodPanellingDataURL, SITE_WOOD_SEED, SITE_WOOD_DESKTOP, SITE_WOOD_PHONE, brassGrad, brassRect, brassArc, screw, screwBrass, engrave, plaque, plaqueRulePath, PLAQUE_S, PLAQUE_HEAD, PLAQUE_D: PLAQUE_S };
})(typeof self !== 'undefined' ? self : this);

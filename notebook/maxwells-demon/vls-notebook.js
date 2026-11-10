/* Victorian Lab Style: laboratory-notebook helpers. Plain script: window.VLS.notebook. Needs tokens.js first.
 * Canvas side: aged paper, an ink "pen" with wobbly lines, hatching and hand-lettered labels.
 * DOM side: margin-note boxes (Analogy / Simplification) and the handwritten 'cf.' source footnote.
 * Styling for the DOM parts lives in tokens.css (.vls-* classes). */
(function (root) {
  'use strict';
  const VLS = (root.VLS = root.VLS || {});
  const T = () => VLS.tokens, col = (n, theme) => VLS.color(n, theme);
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // ---------- aged, ruled paper as a canvas (cached). opts: seed, theme, ruled, lineGap, marginX, foxing, coffee ----------
  const paperCache = new Map();
  function paperTexture(w, h, opts = {}) {
    const o = Object.assign({ seed: 3, theme: 'victorian', ruled: true, lineGap: 28, marginX: 56, foxing: 18, coffee: 0 }, opts);   // coffee defaults to 0: pages are unmarked unless a game asks (owner, 2026-11-09)
    const key = JSON.stringify([w, h, o]); if (paperCache.has(key)) return paperCache.get(key);
    const bw = o.theme === 'bw', dpr = Math.min(3, Math.max(1, root.devicePixelRatio || 1)), r = mulberry(o.seed);
    const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = col('paper', o.theme); g.fillRect(0, 0, w, h);
    if (!bw) {
      for (let i = 0; i < 1400 * (w * h) / 300000; i++) {   // fibre mottling
        g.fillStyle = `rgba(${150 + r() * 60},${110 + r() * 50},${60 + r() * 40},${0.03 + r() * 0.05})`;
        g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 14, 1 + r() * 6, r() * 3, 0, 7); g.fill();
      }
      const e = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);   // browned edges
      e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(120,80,30,0.32)'); g.fillStyle = e; g.fillRect(0, 0, w, h);
      for (let i = 0; i < o.foxing; i++) {               // foxing: rusty age spots
        const x = r() * w, y = r() * h, s = 1 + r() * 5, f = g.createRadialGradient(x, y, 0, x, y, s * 2.5);
        f.addColorStop(0, `rgba(150,95,40,${0.18 + r() * 0.2})`); f.addColorStop(1, 'rgba(150,95,40,0)');
        g.fillStyle = f; g.beginPath(); g.arc(x, y, s * 2.5, 0, 7); g.fill();
      }
      for (let i = 0; i < o.coffee; i++) {               // legacy opt-in faint ring; prefer pageMark() for the one notebook mark
        const x = w * (0.55 + r() * 0.35), y = h * (0.1 + r() * 0.75), R0 = 30 + r() * 26, a0 = r() * 6.28;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, y, R0 + k * 1.2, R0 * 0.96 + k, r(), a0, a0 + 4.6 + r() * 1.3);
          g.strokeStyle = `rgba(122,74,30,${0.13 - k * 0.035})`; g.lineWidth = 2.2 - k * 0.5; g.stroke(); }
      }
    }
    if (o.ruled) {
      g.strokeStyle = col('rule', o.theme); g.globalAlpha = bw ? 0.8 : 0.45; g.lineWidth = 0.8;
      for (let y = o.lineGap * 2.2; y < h - 6; y += o.lineGap) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.globalAlpha = bw ? 1 : 0.55; g.strokeStyle = col('margin', o.theme);
      g.beginPath(); g.moveTo(o.marginX, 0); g.lineTo(o.marginX, h); g.stroke(); g.globalAlpha = 1;
    }
    paperCache.set(key, c); return c;
  }

  // ---------- the pen: iron-gall / sepia ink with a slightly unsteady hand ----------
  // const p = VLS.notebook.pen(ctx, { theme, seed, width, jitter, color });
  function pen(ctx, opts = {}) {
    const o = Object.assign({ theme: 'victorian', seed: 11, width: 1.6, jitter: 1.1, color: null }, opts);
    const r = mulberry(o.seed), ink = () => o.color || col(o.theme === 'bw' ? 'ink' : 'inkSepia', o.theme);
    const wob = () => (r() - 0.5) * 2 * o.jitter;
    // stroke a polyline twice with slightly different wobble (that hand-drawn double line)
    function strokePts(pts, w = o.width, passes = 2) {
      ctx.save(); ctx.strokeStyle = ink(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let p = 0; p < passes; p++) {
        ctx.globalAlpha = p ? 0.45 : 0.9; ctx.lineWidth = p ? w * 0.6 : w; ctx.beginPath();
        pts.forEach(([x, y], i) => { const X = x + wob() * 0.6, Y = y + wob() * 0.6; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
      }
      ctx.restore();
    }
    const seg = (x0, y0, x1, y1) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14)), pts = [];
      const bow = wob() * 1.5; for (let i = 0; i <= n; i++) { const t = i / n, s = Math.sin(Math.PI * t) * bow; pts.push([x0 + (x1 - x0) * t - (y1 - y0) / (Math.hypot(x1 - x0, y1 - y0) || 1) * s, y0 + (y1 - y0) * t + (x1 - x0) / (Math.hypot(x1 - x0, y1 - y0) || 1) * s]); } return pts; };
    const api = {
      line(x0, y0, x1, y1, w) { strokePts(seg(x0, y0, x1, y1), w); return api; },
      polyline(pts, w) { let all = []; for (let i = 1; i < pts.length; i++) all = all.concat(seg(...pts[i - 1], ...pts[i]).slice(i > 1 ? 1 : 0)); strokePts(all, w); return api; },
      // parametric curve f(t) → [x, y] for t in [t0, t1]
      curve(f, t0, t1, n = 48, w) { const pts = []; for (let i = 0; i <= n; i++) pts.push(f(t0 + ((t1 - t0) * i) / n)); strokePts(pts, w); return api; },
      ellipse(cx, cy, rx, ry, w, a0 = 0, a1 = Math.PI * 2) { const over = a1 - a0 >= 6.28 ? 0.25 : 0; return api.curve((t) => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)], a0, a1 + over, Math.max(16, Math.ceil((rx + ry) * 0.6)), w); },
      circle(cx, cy, rr, w) { return api.ellipse(cx, cy, rr, rr, w); },
      arrow(x0, y0, x1, y1, w, head = 9) { api.line(x0, y0, x1, y1, w); const a = Math.atan2(y1 - y0, x1 - x0);
        for (const s of [-1, 1]) api.line(x1, y1, x1 - head * Math.cos(a + s * 0.42), y1 - head * Math.sin(a + s * 0.42), w); return api; },
      dot(x, y, rr = 2.2) { ctx.save(); ctx.fillStyle = ink(); ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); ctx.restore(); return api; },
      // hatching inside a clip path (pathFn draws the path on ctx), lines at `angle` every `gap` px
      hatch(pathFn, bbox, angle = Math.PI / 4, gap = 6, w = 0.8) {
        ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.clip();
        const [x, y, bw, bh] = bbox, d = Math.hypot(bw, bh), cx = x + bw / 2, cy = y + bh / 2, ca = Math.cos(angle), sa = Math.sin(angle);
        for (let k = -d / 2; k <= d / 2; k += gap) { const px = cx - sa * k, py = cy + ca * k; strokePts(seg(px - ca * d / 2, py - sa * d / 2, px + ca * d / 2, py + sa * d / 2), w, 1); }
        ctx.restore(); return api;
      },
      // hand-lettered label in the bundled handwriting font
      label(text, x, y, lopts = {}) {
        const l = Object.assign({ size: 18, align: 'center', rotate: (r() - 0.5) * 0.06, font: 'hand', baseline: 'middle' }, lopts);
        ctx.save(); ctx.translate(x, y); ctx.rotate(l.rotate); ctx.fillStyle = ink(); ctx.globalAlpha = 0.92;
        ctx.font = `${l.weight || 500} ${l.size}px ${T().fonts[l.font] || l.font}`; ctx.textAlign = l.align; ctx.textBaseline = l.baseline;
        ctx.fillText(text, 0, 0); ctx.restore(); return api;
      },
      ink,
    };
    return api;
  }

  // ---------- the notebook's one mark (owner, 2026-11-09: ~90% of pages unmarked; one mark that soaks through
  // to the next two pages in the identical spot). kind: 'mug-ring' (Maxwell), 'coffee-drops' (Vacuum Maze),
  // 'fingerprint' (Fantastic Apparatus). fade: 0 = the page it happened on, 1 = next page, 2 = the page after.
  // Same seed + kind + (x, y, size) gives the same shape on every page, so the soak-through lines up.
  // Draws nothing in 'bw' (B&W pages stay pure). Returns true if anything was drawn.
  const MARK_ALPHA = [1, 0.42, 0.17];
  function pageMark(ctx, kind, x, y, opts = {}) {
    const o = Object.assign({ seed: 5, theme: 'victorian', fade: 0, size: 1 }, opts);
    if (o.theme === 'bw' || !(o.fade >= 0 && o.fade <= 2)) return false;
    const r = mulberry(o.seed), A = MARK_ALPHA[o.fade | 0], s = o.size;
    ctx.save(); ctx.translate(x, y);
    if (kind === 'mug-ring') {                  // a coffee-mug base ring, ~8.5 cm across at size 1 (≈ 48 px radius)
      const R = 48 * s, a0 = r() * 6.28, gap = 0.5 + r() * 0.7, sq = 0.95 + r() * 0.04, rot = r();
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, 0, R + k * 1.1 * s, (R + k * 1.1 * s) * sq, rot, a0, a0 + 6.28 - gap * (1 - k * 0.15));
        ctx.strokeStyle = `rgba(110,64,24,${(0.2 - k * 0.04) * A})`; ctx.lineWidth = (2.6 - k * 0.5) * s; ctx.stroke(); }
      const f = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);   // faint tide inside the ring
      f.addColorStop(0, 'rgba(122,74,30,0)'); f.addColorStop(1, `rgba(122,74,30,${0.05 * A})`);
      ctx.fillStyle = f; ctx.beginPath(); ctx.ellipse(0, 0, R, R * sq, rot, 0, 6.29); ctx.fill();
    } else if (kind === 'coffee-drops') {       // two or three small splashed drops with darker rims
      const n = 2 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const dx = (i ? (r() - 0.5) * 46 : 0) * s, dy = (i ? (r() - 0.3) * 34 : 0) * s, rr = (i ? 4 + r() * 4 : 9 + r() * 4) * s;
        const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr);
        g.addColorStop(0, `rgba(122,74,30,${0.16 * A})`); g.addColorStop(0.72, `rgba(122,74,30,${0.22 * A})`); g.addColorStop(0.92, `rgba(96,54,18,${0.4 * A})`); g.addColorStop(1, 'rgba(96,54,18,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(dx, dy, rr, rr * (0.85 + r() * 0.15), r() * 3, 0, 6.29); ctx.fill();
      }
    } else if (kind === 'fingerprint') {        // an oily thumbprint: concentric whorl ridges, greasy translucent smudge
      const W = 21 * s, H = 27 * s, rot = (r() - 0.5) * 0.9; ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H);
      g.addColorStop(0, `rgba(95,72,38,${0.16 * A})`); g.addColorStop(0.7, `rgba(95,72,38,${0.1 * A})`); g.addColorStop(1, 'rgba(95,72,38,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, W * 1.1, H * 1.1, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, W, H, 0, 0, 6.29); ctx.clip();
      ctx.lineCap = 'round';
      for (let k = 1; k <= 14; k++) { const f = k / 14, cx = (r() - 0.5) * 0.8 * s, cy = -H * 0.18 * (1 - f);
        ctx.beginPath(); ctx.ellipse(cx, cy, W * f * 1.05, H * f, 0, 0.15 + r() * 0.4, 6.1 - r() * 0.5);
        ctx.strokeStyle = `rgba(70,52,30,${(0.2 - f * 0.1) * A})`; ctx.lineWidth = (1.3 + r() * 0.5) * s; ctx.stroke(); }
    } else { ctx.restore(); return false; }
    ctx.restore(); return true;
  }

  // ---------- DOM: margin notes / pasted slips and the 'cf.' footnote ----------
  // kind: 'analogy' | 'simplification'. label overrides the default text (e.g. 'In the game').
  function note(kind, html, opts = {}) {
    const el = document.createElement('aside');
    el.className = `vls-note vls-${kind}`;
    el.setAttribute('role', 'note');
    const label = opts.label || T().labels[kind] || kind;
    el.innerHTML = `<span class="vls-note-label">${label}</span>${html}`;
    return el;
  }
  function cf(html) { const el = document.createElement('p'); el.className = 'vls-cf'; el.innerHTML = `<span class="vls-cf-mark">${T().labels.cf}</span> ${html}`; return el; }
  // switch a container between handwriting and plain (accessible) type
  function setPlain(container, on) { container.classList.toggle('vls-plain', !!on); }

  VLS.notebook = { paperTexture, pen, pageMark, note, cf, setPlain, mulberry };
})(typeof self !== 'undefined' ? self : this);

/* Victorian Lab Style: design tokens. Plain script, no imports.
 * Browser: window.VLS.tokens. Node: module.exports. Keep in sync with tokens.css (same names, same hex values). */
(function (root) {
  'use strict';
  const VLS = (root.VLS = root.VLS || {});
  const tokens = {
    version: '1.1.0',
    palette: {
      // apparatus (Victorian theme)
      wood: '#2b170b', woodDeep: '#1a0e06', woodLight: '#5a3418',
      brassDark: '#3d2706', brassShadow: '#4a300a', brassMid: '#9a6b1f', brass: '#d9a943', brassBright: '#e8bb55',
      brassHighlight: '#fff1b8', brassWarm: '#a87622', brassText: '#f3d58a', engraving: '#2a1803',
      steelBlue: '#2c4466', steelDark: '#06090e', steelGlint: '#6f8fb8',
      vacuum: '#0d1117', vacuumDeep: '#030405',
      nucleus: '#c4301f', nucleusDark: '#4a0b05', nucleusGlint: '#ffd2c4', electron: '#2350b8', electronTrail: '#e9be5c',
      // laboratory notebook
      paper: '#f1e3c2', paperLight: '#f8eed6', paperShade: '#d9c39a', paperEdge: '#b8965f',
      rule: '#9fb3c8', margin: '#c96a5a', foxing: '#a8743a', coffee: '#7a4a1e',
      ink: '#3b2414', inkFaded: '#6b4a2e', inkSepia: '#704214', inkRed: '#8e2a1c', inkBlue: '#24375e',
      noteAnalogy: '#fdf6dc', noteSimplification: '#f6e1d3', slipTape: 'rgba(235,225,190,0.75)',
    },
    // B&W theme: pure black and white apparatus; notebook becomes ink on white
    bw: {
      background: '#000000', foreground: '#ffffff',
      paper: '#ffffff', paperShade: '#ffffff', rule: '#d0d0d0', margin: '#000000', ink: '#000000', inkFaded: '#333333',
      noteAnalogy: '#ffffff', noteSimplification: '#ffffff',
    },
    fonts: {
      sans: '"VLS Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', // B&W mode: the only font
      ivory: '"VLS Old Standard TT", "Iowan Old Style", Georgia, "Times New Roman", serif',
      engraved: '"VLS Engraving CC", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
      serif: '"VLS Old Standard TT", "Iowan Old Style", Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, Menlo, Consolas, monospace',
      hand: '"VLS Caveat", "Segoe Print", "Bradley Hand", Georgia, cursive',        // body handwriting (OFL, bundled)
      script: '"VLS Caveat", "Segoe Print", "Bradley Hand", Georgia, cursive', // retired copperplate; alias of hand. Notebook titles: hand at weight 700, 46px
      plain: '"VLS Old Standard TT", "Iowan Old Style", Georgia, "Times New Roman", serif',                                     // 'plain text' accessibility mode
    },
    fontFiles: { sans: 'fonts/Inter-Variable.woff2', ivory: ['fonts/OldStandardTT-Regular.woff2', 'fonts/OldStandardTT-Italic.woff2', 'fonts/OldStandardTT-Bold.woff2'], engraved: 'fonts/EngravingCC.woff2', hand: 'fonts/Caveat-Variable.woff2' },
    sizes: { handBody: 21, handSmall: 17, scriptTitle: 40, minTouch: 44 },
    // Shared plaque geometry (owner 2026-11-06). s = screw offset = corner radius =
    // side-rule inset; head = screw-head radius r; arc R = s+r so clearance to head
    // equals clearance to edge (= s). inset kept as alias of screw for old readers.
    plaque: { screw: 10, head: 3, inset: 10, shadowX: 4, shadowY: 4, shadowBlur: 8 },
    labels: { analogy: 'Analogy', simplification: 'Simplification', cf: 'cf.' },
  };
  VLS.tokens = tokens;
  // theme lookup: VLS.color('ink', 'bw') falls back to the Victorian palette
  VLS.color = (name, theme) => (theme === 'bw' && tokens.bw[name] !== undefined ? tokens.bw[name] : tokens.palette[name]);

  // ---------- powers of ten (v1.1.0, added by Maxwell's Demon for the studio; DECISIONS 2ae02b0) ----------
  // One formatter for every game, so the minus in 10^-N is always legible: a true minus (U+2212) in HTML, styled
  // by .vls-exp in tokens.css; on canvas a drawn bar, never a font's superscript-minus glyph (the bundled Caveat and
  // Pinyon fonts have no U+207B, so browsers substitute a tiny glyph from another font).
  const MINUS = '\u2212', MINUS_HTML = `<span class="vls-minus">${MINUS}</span>`;   // .vls-minus thickens the glyph (tokens.css)
  const SUPER = { '⁻': '-', '⁺': '+', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '·': '.' };
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // exponent → { neg, digits }: accepts -9, '-9', '−9', '⁻⁹', 4.5, '4·5'
  function expParts(exp) {
    let s = String(exp).trim().split('').map((c) => (SUPER[c] !== undefined ? SUPER[c] : c)).join('').replace(/^\u2212/, '-');
    const neg = s[0] === '-'; if (neg || s[0] === '+') s = s.slice(1);
    return { neg, digits: s };
  }
  // HTML: VLS.pow10(-9, { mantissa: 3.2 }) → '3.2 × 10<sup class="vls-exp"><span class="vls-minus">−</span>9</sup>'; VLS.pow10(7) → '10<sup class="vls-exp">7</sup>'
  function pow10(exp, opts = {}) {
    const e = expParts(exp), m = opts.mantissa;
    const head = m === undefined || m === null || m === '' ? '' : `${escHtml(m)}${opts.times === undefined ? ' × ' : opts.times}`;
    return `${head}10<sup class="vls-exp">${e.neg ? MINUS_HTML : ''}${escHtml(e.digits)}</sup>`;
  }
  // value → { mantissa: '3.2', exp: -9 } with sig significant figures (sig 1 gives '3'); 0 / non-finite → null
  function sciParts(value, sig = 2) {
    if (!(Math.abs(value) > 0) || !isFinite(value)) return null;
    let e = Math.floor(Math.log10(Math.abs(value))), m = value / Math.pow(10, e);
    let ms = m.toFixed(Math.max(0, sig - 1));
    if (Math.abs(+ms) >= 10) { e += 1; ms = (value / Math.pow(10, e)).toFixed(Math.max(0, sig - 1)); }
    return { mantissa: ms, exp: e };
  }
  // VLS.fmtSci(3.2e-9) → '3.2 × 10<sup class="vls-exp">−9</sup>'. opts: { dropOne: true } prints 1e-12 as '10<sup>−12</sup>'.
  function fmtSci(value, sig = 2, opts = {}) {
    const p = sciParts(value, sig); if (!p) return value === 0 ? '0' : String(value);
    return pow10(p.exp, { mantissa: opts.dropOne && +p.mantissa === 1 ? '' : p.mantissa, times: opts.times });
  }
  // HTML text with Unicode superscripts (e.g. '10⁻¹² Pa', '3 × 10⁻¹⁰', 'cm⁻³') → the same with <sup class="vls-exp">.
  // Converts every superscript run that has a minus or follows '10'; plain squares and cubes (m², v²) are left alone.
  function expHtml(html) {
    return String(html).replace(/(10)?([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:·[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)/g, (all, ten, run) => {
      if (!ten && !/[⁻]/.test(run)) return all;
      const e = expParts(run); return `${ten || ''}<sup class="vls-exp">${e.neg ? MINUS_HTML : ''}${e.digits}</sup>`;
    });
  }
  // ---- canvas
  const fontPx = (font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return m ? +m[1] : 10; };
  const scaledFont = (font, k) => (font || '10px serif').replace(/(\d+(?:\.\d+)?)px/, (a, n) => `${+(n * k).toFixed(2)}px`);
  // vertical offset from the caller's textBaseline to the alphabetic baseline (positive = down)
  function toAlphabetic(ctx, px) {
    const b = ctx.textBaseline || 'alphabetic'; if (b === 'alphabetic') return 0;
    const save = ctx.textBaseline; ctx.textBaseline = 'alphabetic'; const mt = ctx.measureText('0'); ctx.textBaseline = save;
    const asc = mt.fontBoundingBoxAscent || px * 0.8, desc = mt.fontBoundingBoxDescent || px * 0.2;
    const ea = mt.emHeightAscent || asc, ed = mt.emHeightDescent || desc;
    if (b === 'top' || b === 'hanging') return asc;
    if (b === 'middle') return (ea - ed) / 2;
    return -desc;   // bottom / ideographic
  }
  // the raised exponent at (x, yAlpha) [left edge, alphabetic baseline of the base text]; returns its width
  function drawExp(ctx, x, yA, exp, opts, measureOnly) {
    const e = expParts(exp), baseFont = opts.font || ctx.font, px = fontPx(baseFont), k = opts.scale || (px <= 12 ? 0.8 : 0.7), ef = scaledFont(baseFont, k), epx = px * k;
    ctx.save(); ctx.font = ef; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const m0 = ctx.measureText('0'), dW = (m0.actualBoundingBoxRight || 0) + (m0.actualBoundingBoxLeft || 0) || m0.width * 0.8;
    const barW = Math.max(dW * 1.1, epx * 0.55), gap = epx * 0.05, lead = epx * 0.06;
    const dWidth = ctx.measureText(e.digits).width, w = lead + (e.neg ? barW + gap : 0) + dWidth;
    if (!measureOnly) {
      const yE = yA - px * (opts.raise || 0.42), col = opts.color || ctx.fillStyle;
      ctx.fillStyle = col;
      if (e.neg) {
        // a stroked bar: digit-width long and at least a digit stroke thick, on the digits' maths axis
        const th = Math.max(1, epx * (opts.minusWeight || 0.1)), yb = yE - epx * 0.26;
        ctx.strokeStyle = col; ctx.lineWidth = th; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x + lead, yb); ctx.lineTo(x + lead + barW, yb); ctx.stroke();
      }
      ctx.fillText(e.digits, x + lead + (e.neg ? barW + gap : 0), yE);
    }
    ctx.restore(); return w;
  }
  // canvas: VLS.drawPow10(ctx, x, y, '3.2', -9, { font, color, align, scale })  [scale: exponent size, default 0.7, or 0.8 for fonts ≤ 12 px] draws '3.2 × 10' and a raised
  // exponent; mantissa null/'' draws '10^exp' alone. Honours ctx.textAlign / textBaseline (or opts.align). Returns the width.
  function drawPow10(ctx, x, y, mantissa, exp, opts = {}) {
    const font = opts.font || ctx.font, px = fontPx(font);
    const base = mantissa === undefined || mantissa === null || mantissa === '' ? '10' : `${mantissa}${opts.times === undefined ? ' × ' : opts.times}10`;
    ctx.save(); ctx.font = font; const dy = toAlphabetic(ctx, px); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const wb = ctx.measureText(base).width, we = drawExp(ctx, 0, 0, exp, { ...opts, font }, true), w = wb + we;
    const a0 = opts.align || (/(right|end)/.test(ctx.textAlign) ? 'right' : ctx.textAlign === 'center' ? 'center' : 'left');
    const x0 = a0 === 'right' ? x - w : a0 === 'center' ? x - w / 2 : x;
    if (opts.color) ctx.fillStyle = opts.color;
    if (!opts.measureOnly) { ctx.fillText(base, x0, y + dy); drawExp(ctx, x0 + wb, y + dy, exp, { ...opts, font }); }
    ctx.restore(); return w;
  }
  // canvas: draw a line of text with Unicode-superscript powers (same runs as expHtml) through drawExp, so a
  // '10⁻¹² Pa' in any string is drawn legibly. opts.maxWidth squeezes like fillText's 4th argument. Returns the width.
  function drawSciText(ctx, text, x, y, opts = {}) {
    const parts = []; let last = 0; const re = /(10)?([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:·[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)/g; let m;
    while ((m = re.exec(text))) { if (!m[1] && !/[⁻]/.test(m[2])) continue; parts.push({ t: text.slice(last, m.index) + (m[1] || '') }); parts.push({ e: m[2] }); last = m.index + m[0].length; }
    parts.push({ t: text.slice(last) });
    const font = opts.font || ctx.font, px = fontPx(font);
    ctx.save(); ctx.font = font; if (opts.color) ctx.fillStyle = opts.color;
    const dy = toAlphabetic(ctx, px), align = opts.align || (/(right|end)/.test(ctx.textAlign) ? 'right' : ctx.textAlign === 'center' ? 'center' : 'left');
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const widths = parts.map((p) => (p.e ? drawExp(ctx, 0, 0, p.e, { ...opts, font }, true) : ctx.measureText(p.t).width)), w = widths.reduce((a, b) => a + b, 0);
    const sx = opts.maxWidth && w > opts.maxWidth ? opts.maxWidth / w : 1, W = w * sx;
    const x0 = align === 'right' ? x - W : align === 'center' ? x - W / 2 : x;
    ctx.translate(x0, y + dy); if (sx !== 1) ctx.scale(sx, 1);
    let cx = 0; parts.forEach((p, i) => { if (p.e) drawExp(ctx, cx, 0, p.e, { ...opts, font }); else if (p.t) ctx.fillText(p.t, cx, 0); cx += widths[i]; });
    ctx.restore(); return W;
  }

  // ---------- shared plaque DOM chrome (mirrors VLS.apparatus.plaque geometry) ----------
  // One SVG draws the full closed rule path (no separate full-length lines). Screws are
  // circles in the same SVG. Short label plates stay one line; tall content plaques wrap.
  // Chrome is rebuilt on size change (ResizeObserver) so the viewBox always matches the
  // real box — otherwise preserveAspectRatio=meet centres a short frame on a tall plaque.
  const _plaqueObserved = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function _isContentPlaque(el) {
    return !!(el && (
      el.classList.contains('hero') || el.classList.contains('cardbody') ||
      el.classList.contains('foot') || el.classList.contains('gamehead') ||
      el.classList.contains('prose') || el.classList.contains('plaquebox') ||
      el.classList.contains('feedback-plaque') || el.classList.contains('gl-gate-plaque') ||
      el.classList.contains('gl-plaque') && el.querySelector('p, form, .row, h1, textarea, button')
    ));
  }
  function plaqueChrome(el, opts = {}) {
    if (!el || el.nodeType !== 1) return el;
    const force = !!(opts && opts.force);
    const existing = el.querySelector(':scope > .vls-plaque__chrome-built');
    if (existing && !force) {
      // Still ensure we are watching for later size changes
      _watchPlaque(el);
      return el;
    }
    if (existing) existing.remove();

    const cs = getComputedStyle(el);
    let s = parseFloat(opts.s != null ? opts.s : (cs.getPropertyValue('--vls-plaque-screw') || tokens.plaque.screw));
    let rHead = parseFloat(opts.r != null ? opts.r
      : (opts.head != null ? opts.head
        : (cs.getPropertyValue('--vls-plaque-head') || tokens.plaque.head || 3)));
    const box = el.getBoundingClientRect();
    let w = Math.max(1, box.width || el.offsetWidth || 100);
    let h = Math.max(1, box.height || el.offsetHeight || 40);
    // Prefer layout size (offset*) once in document — more stable than a mid-reflow rect
    if (el.offsetWidth > 0) w = el.offsetWidth;
    if (el.offsetHeight > 0) h = el.offsetHeight;
    const minDim = Math.min(w, h);
    const sMax = Math.max(4, (minDim - 14) / (4 + 2 * (rHead / Math.max(s, 1))));
    if (s > sMax) { const k = sMax / s; s = sMax; rHead = Math.max(1.1, rHead * k); }
    if (rHead > s * 0.45) rHead = Math.max(1.1, s * 0.3);
    const R = s + rHead;
    el.style.setProperty('--_s', s + 'px');
    el.style.setProperty('--_r', rHead + 'px');
    el.style.setProperty('--_R', R + 'px');
    el.style.setProperty('--_d', s + 'px'); // clearance (= s); legacy alias
    const bw = el.classList.contains('vls-plaque--bw') || (el.closest('[data-theme="bw"]') != null);
    const ivory = !bw && el.classList.contains('vls-plaque--ivory');
    if (ivory && !el.getAttribute('data-vls-ivory')) {
      const existingId = el.id;
      el.setAttribute('data-vls-ivory', existingId || ('plaque/dom/' + Math.random().toString(36).slice(2, 10)));
    }
    const NS = 'http://www.w3.org/2000/svg';
    const wrap = document.createElement('div');
    wrap.className = 'vls-plaque__chrome-built';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:visible;border-radius:inherit;';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'vls-plaque__chrome');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    // none: if CSS size drifts 1px we still cover the whole plate; ResizeObserver rebuilds on real change
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;overflow:visible;display:block;';

    const dRule = [
      `M ${s + R} ${s}`,
      `L ${w - s - R} ${s}`,
      `A ${R} ${R} 0 0 0 ${w - s} ${s + R}`,
      `L ${w - s} ${h - s - R}`,
      `A ${R} ${R} 0 0 0 ${w - s - R} ${h - s}`,
      `L ${s + R} ${h - s}`,
      `A ${R} ${R} 0 0 0 ${s} ${h - s - R}`,
      `L ${s} ${s + R}`,
      `A ${R} ${R} 0 0 0 ${s + R} ${s}`,
      'Z',
    ].join(' ');
    if (!bw) {
      const lip = document.createElementNS(NS, 'path');
      lip.setAttribute('d', dRule);
      lip.setAttribute('fill', 'none');
      lip.setAttribute('stroke', 'var(--vls-plaque-rule-lip)');
      lip.setAttribute('stroke-width', '1.2');
      lip.setAttribute('vector-effect', 'non-scaling-stroke');
      lip.setAttribute('transform', 'translate(0.7 0.7)');
      svg.appendChild(lip);
    }
    const rule = document.createElementNS(NS, 'path');
    rule.setAttribute('d', dRule);
    rule.setAttribute('fill', 'none');
    rule.setAttribute('stroke', bw ? '#000' : 'var(--vls-plaque-rule)');
    rule.setAttribute('stroke-width', bw ? '1.6' : '1.55');
    rule.setAttribute('stroke-linejoin', 'round');
    rule.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(rule);

    const angles = [0.4, 1.1, 2.3, 0.85];
    const corners = [[s, s], [w - s, s], [s, h - s], [w - s, h - s]];
    corners.forEach(([cx, cy], i) => {
      if (bw) {
        const ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', rHead);
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#000'); ring.setAttribute('stroke-width', '1.2');
        ring.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(ring);
        const slot = document.createElementNS(NS, 'line');
        const a = angles[i], c = Math.cos(a), sn = Math.sin(a), L = rHead * 0.75;
        slot.setAttribute('x1', cx - c * L); slot.setAttribute('y1', cy - sn * L);
        slot.setAttribute('x2', cx + c * L); slot.setAttribute('y2', cy + sn * L);
        slot.setAttribute('stroke', '#000'); slot.setAttribute('stroke-width', String(Math.max(1, rHead * 0.22)));
        slot.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(slot);
      } else {
        const shadow = document.createElementNS(NS, 'circle');
        shadow.setAttribute('cx', cx + 0.5); shadow.setAttribute('cy', cy + 0.9); shadow.setAttribute('r', rHead + 1);
        shadow.setAttribute('fill', 'rgba(0,0,0,0.4)'); svg.appendChild(shadow);
        const defs = document.createElementNS(NS, 'defs');
        const grad = document.createElementNS(NS, 'radialGradient');
        const gid = `vls-scr-${Math.random().toString(36).slice(2, 8)}`;
        grad.setAttribute('id', gid);
        grad.setAttribute('cx', '35%'); grad.setAttribute('cy', '30%'); grad.setAttribute('r', '70%');
        [['0%', '#e8d090'], ['40%', '#8f6a28'], ['100%', '#2a1803']].forEach(([o, c]) => {
          const stop = document.createElementNS(NS, 'stop'); stop.setAttribute('offset', o); stop.setAttribute('stop-color', c); grad.appendChild(stop);
        });
        defs.appendChild(grad); svg.appendChild(defs);
        const head = document.createElementNS(NS, 'circle');
        head.setAttribute('cx', cx); head.setAttribute('cy', cy); head.setAttribute('r', rHead);
        head.setAttribute('fill', `url(#${gid})`); head.setAttribute('stroke', 'rgba(40,24,4,0.85)'); head.setAttribute('stroke-width', '0.8');
        head.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(head);
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('transform', `translate(${cx} ${cy}) rotate(${(angles[i] * 180) / Math.PI})`);
        const slot = document.createElementNS(NS, 'rect');
        slot.setAttribute('x', -rHead * 0.78); slot.setAttribute('y', -rHead * 0.12);
        slot.setAttribute('width', rHead * 1.56); slot.setAttribute('height', rHead * 0.24);
        slot.setAttribute('fill', 'rgba(30,18,4,0.92)');
        g.appendChild(slot); svg.appendChild(g);
      }
    });
    wrap.appendChild(svg);

    let label = el.querySelector(':scope > .vls-plaque__label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'vls-plaque__label';
      while (el.firstChild) label.appendChild(el.firstChild);
      el.appendChild(label);
    }
    const content = _isContentPlaque(el);
    if (content) {
      label.style.whiteSpace = 'normal';
      label.style.overflow = 'visible';
      label.style.fontSize = '';
      label.style.lineHeight = '';
      label.style.textOverflow = '';
    } else {
      label.style.whiteSpace = 'nowrap';
      const maxW = Math.max(8, w - 2 * (s + rHead + 6));
      const maxH = Math.max(8, h - 2 * (s + R + 2));
      let size = parseFloat(cs.fontSize) || 18;
      label.style.fontSize = size + 'px';
      for (let guard = 0; guard < 80 && size > 7; guard++, size -= 0.5) {
        label.style.fontSize = size + 'px';
        if (label.scrollWidth <= maxW + 0.5 && label.scrollHeight <= maxH + 0.5) break;
      }
    }
    el.insertBefore(wrap, el.firstChild);
    el.setAttribute('data-vls-plaque-w', String(Math.round(w)));
    el.setAttribute('data-vls-plaque-h', String(Math.round(h)));
    _watchPlaque(el);
    return el;
  }
  function _watchPlaque(el) {
    if (!_plaqueObserved || typeof ResizeObserver === 'undefined') return;
    if (_plaqueObserved.has(el)) return;
    let lastW = el.offsetWidth, lastH = el.offsetHeight;
    let timer = null;
    const ro = new ResizeObserver(function () {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w < 2 || h < 2) return;
      if (Math.abs(w - lastW) < 1 && Math.abs(h - lastH) < 1) return;
      lastW = w; lastH = h;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        if (!el.isConnected) return;
        plaqueChrome(el, { force: true });
      }, 40);
    });
    ro.observe(el);
    _plaqueObserved.set(el, ro);
  }
  function plaqueMount(root, opts) {
    const scope = root && root.querySelectorAll ? root : document;
    const force = !!(opts && opts.force);
    const list = scope.classList && scope.classList.contains('vls-plaque')
      ? [scope]
      : [...scope.querySelectorAll('.vls-plaque')];
    list.forEach((el) => plaqueChrome(el, { force: force }));
  }

    Object.assign(VLS, { MINUS, pow10, fmtSci, sciParts, expHtml, drawPow10, drawSciText, plaqueChrome, plaqueMount });
  if (typeof module === 'object' && module.exports) module.exports = tokens;
})(typeof self !== 'undefined' ? self : this);

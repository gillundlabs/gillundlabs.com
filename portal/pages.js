/* Shell pages for the testing bench. Game packages are never inlined here. */

import { SLOTS, slotKindDetail, slotKindLabel, slotStatusCopy } from './catalog.js';
import { GUARD_SCRIPT } from './sw-guard.js';

export { GUARD_SCRIPT };

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asset(origin, path) {
  if (!origin) return path;
  return `${origin.replace(/\/$/, '')}${path}`;
}

function layout({ title, description, main, footer, base, assetOrigin }) {
  const a = (path) => esc(asset(assetOrigin, path));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="gl-bench-path" content="${esc(base)}">
<meta name="theme-color" content="#2b170b">
<link rel="icon" href="${a('/favicon.ico')}" sizes="32x32"><link rel="icon" type="image/png" href="${a('/assets/img/favicon-192.png')}"><link rel="apple-touch-icon" href="${a('/assets/img/apple-touch-icon.png')}">
<link rel="stylesheet" href="${a('/assets/tokens.css')}"><link rel="stylesheet" href="${a('/assets/ivory/ivory.css')}"><link rel="stylesheet" href="${a('/assets/site.css')}"><link rel="stylesheet" href="${a('/assets/test-bench.css')}">
<script src="${a('/assets/config.js')}" defer></script><script src="${a('/assets/tokens.js')}" defer></script><script src="${a('/assets/apparatus.js')}" defer></script><script src="${a('/assets/ivory/ivory.js')}" defer></script><script src="${a('/assets/plaque-boot.js')}" defer></script><script src="${esc(base)}/portal-sw-guard.js" defer></script></head>
<body><a class="skip" href="#main">Skip to content</a>
<header class="bar"><a class="brand" href="/"><img src="${a('/assets/img/logo.png')}" alt="" width="40" height="40"><span>Gillund Labs</span></a>
<nav aria-label="Main"><a href="/">Home</a><a href="/games/maxwells-demon/">Maxwell's Demon</a><a href="/games/vacuum-maze/">Vacuum Maze</a><a href="/games/fantastic-apparatus/">Fantastic Apparatus</a><a href="/notebook/">Notebook</a><a href="/about/">About</a></nav></header>
<main id="main" class="gl-bench">
${main}
</main>
<footer class="foot gl-plaque vls-plaque vls-plaque--ivory" data-vls-ivory="site/foot"><p>© 2026 Gillund Labs · Gillund’s Laboratory · <span class="foot-links"><a href="/about/">About</a> · <a href="/notebook/">Notebook</a></span></p><p class="small">${footer}</p></footer>
</body></html>
`;
}

function notebook(title, paragraph) {
  return `<section class="nbteaser vls-notebook gl-bench-note"><div class="vls-page"><span class="vls-date">7 Nov<br>2026</span><h2>${title}</h2><p>${paragraph}</p></div></section>`;
}

function plaque(ivoryId, inner, extraClass = '') {
  return `<section class="gl-404" aria-labelledby="gl-bench-title"><div class="plaquebox gl-plaque vls-plaque vls-plaque--ivory gl-404-plaque feedback-plaque gl-bench-plaque ${extraClass}" data-vls-ivory="${esc(ivoryId)}">${inner}</div></section>`;
}

export function renderClosed({ base = '/test', assetOrigin = '', reason = 'public' } = {}) {
  const body = reason === 'public'
    ? 'This bench is closed. The public site cannot check a password, and no testing copy is stored here. This page does not ask for one.'
    : reason === 'unavailable'
      ? 'This bench cannot check passwords just now, so it is not asking for one.'
      : 'This host has no password check configured, so this page does not ask for one. No testing copy is served from here.';
  const note = reason === 'public'
    ? 'The rest of the laboratory is unchanged. This page is only the door to the testing bench, and on the public site that door stays shut.'
    : 'Nothing private is sent from this page. When a password check is really configured, the same address can ask for a username and a password.';
  return layout({
    title: 'Testing bench | Gillund Labs',
    description: 'This bench is closed.',
    base,
    assetOrigin,
    footer: 'No ads, no trackers, no cookies.',
    main: `${plaque('site/test/closed', `<h1 id="gl-bench-title">Testing bench</h1>
<p>${body}</p>`)}
${notebook('From the notebook', note)}`,
  });
}

export function renderLogin({ base = '/test', assetOrigin = '', error = '', username = '', csrf = '', next = '' } = {}) {
  const alert = error
    ? `<p class="feedback-status feedback-status--error" role="alert">${esc(error)}</p>`
    : '';
  const userValue = username ? ` value="${esc(username)}"` : '';
  const invalid = error ? ' aria-invalid="true"' : '';
  return layout({
    title: 'Testing bench | Gillund Labs',
    description: 'Sign in to the testing bench.',
    base,
    assetOrigin,
    footer: 'No ads and no trackers. Signing in keeps a session cookie for this bench only.',
    main: `${plaque('site/test/login', `<h1 id="gl-bench-title">Testing bench</h1>
<p>Sign in to open the testing copies that have been placed on this host.</p>
<form class="feedback-form" method="post" action="${esc(base)}/login" autocomplete="on">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<input type="hidden" name="next" value="${esc(next)}">
<div class="feedback-field"><label for="username">Username</label><input id="username" name="username" type="text" autocomplete="username" required maxlength="64" autocapitalize="off" spellcheck="false"${userValue}${invalid}></div>
<div class="feedback-field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"${invalid}></div>
${alert}
<button class="btn" type="submit"><span>Sign in</span></button>
</form>`)}
${notebook('From the notebook', 'The public demos stay where they are. A testing copy opens only after it has been accepted and placed on this host. The others stay marked closed.')}`,
  });
}

function card(slot, state, base, assetOrigin) {
  const a = (path) => esc(asset(assetOrigin, path));
  const detail = slotKindDetail(slot);
  const ready = state === 'ready';
  const action = ready
    ? `<p class="row"><a class="btn" href="${esc(base)}/play/${esc(slot.id)}/" aria-label="${esc(slot.kind === 'experimental' ? `Open the experimental ${slot.title} testing copy` : `Open the full ${slot.title} testing copy`)}"><span>Open</span></a></p>`
    : '';
  return `<article class="card plaque gl-bench-card"><div class="shot"><img src="${a(slot.shot)}" alt="${esc(slot.shotAlt)}" loading="lazy"></div>
<div class="cardbody gl-plaque vls-plaque vls-plaque--ivory" data-vls-ivory="site/test/card/${esc(slot.id)}"><img class="icon" src="${a(slot.icon)}" alt="" width="64" height="64"><p class="gl-bench-mark">${esc(slotKindLabel(slot))}</p>${detail ? `<p class="gl-bench-mark">${esc(detail)}</p>` : ''}<h3>${esc(slot.title)}</h3><p>${esc(slotStatusCopy(slot, state))}</p>${action}</div></article>`;
}

export function renderHub({ base = '/test', assetOrigin = '', username = '', csrf = '', states = new Map() } = {}) {
  const cards = SLOTS.map((slot) => card(slot, states.get(slot.id) || 'pending', base, assetOrigin)).join('');
  return layout({
    title: 'Testing bench | Gillund Labs',
    description: 'Signed-in testing bench.',
    base,
    assetOrigin,
    footer: 'No ads and no trackers. A session cookie is kept for this bench only while you are signed in.',
    main: `<section class="hero gl-plaque vls-plaque vls-plaque--ivory gl-bench-plaque" data-vls-ivory="site/test/hub"><p class="eyebrow">Gillund’s Laboratory</p>
<h1 id="gl-bench-title">Testing bench</h1>
<p class="lede">Signed in as ${esc(username)}. These are the testing copies. Nothing here is for sale, and the public demos are unchanged.</p>
<form method="post" action="${esc(base)}/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="btn ghost" type="submit" data-vls-ivory="site/test/sign-out"><span>Sign out</span></button></form></section>
<section class="grid" aria-label="Testing copies">${cards}</section>
${notebook('From the notebook', 'Maxwell’s Demon, Vacuum Maze, and the standard Fantastic Apparatus have accepted packages. None of those copies is sealed on this host yet. The experimental Fantastic Apparatus, with five extra parts, stays closed while an independent review is still open. This page does not change the public demos.')}`,
  });
}

export function renderMissing({ base = '/test', assetOrigin = '', message = 'That testing copy is not on this bench.' } = {}) {
  return layout({
    title: 'Testing bench | Gillund Labs',
    description: 'That testing copy is not on this bench.',
    base,
    assetOrigin,
    footer: 'No ads and no trackers. A session cookie is kept for this bench only while you are signed in.',
    main: `${plaque('site/test/missing', `<h1 id="gl-bench-title">Not on this bench</h1>
<p>${esc(message)}</p>
<p class="gl-404-actions"><a class="btn" href="${esc(base)}/"><span>Back to the bench</span></a></p>`)}`,
  });
}

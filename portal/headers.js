/* Every testing-bench response, including denials, is uncacheable and unindexed.
   Shell pages also refuse workers. Game bytes are not rewritten, so their
   script policy stays with the package; service-worker scripts are not served. */

function shellCsp(assetOrigin) {
  const extra = assetOrigin ? ` ${assetOrigin}` : '';
  return [
    "default-src 'self'",
    `img-src 'self'${extra}`,
    `style-src 'self'${extra}`,
    `font-src 'self'${extra}`,
    `script-src 'self'${extra}`,
    "worker-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const GAME_CSP = "frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

export function securityHeaders(init, { https = false, csp = 'shell', assetOrigin = '' } = {}) {
  const headers = new Headers(init || {});
  headers.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('Surrogate-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('Vary', 'Cookie');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('X-Content-Type-Options', 'nosniff');
  /* no-referrer makes Chrome send Origin: null on a real form post, which the
     sign-in check would reject. same-origin still omits the path off this host. */
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  /* COOP on an http preview makes Chrome treat the document as an opaque origin,
     so a real form then sends Origin: null and the sign-in check rejects it. */
  if (https) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (csp === 'shell') headers.set('Content-Security-Policy', shellCsp(assetOrigin));
  else if (csp === 'game') headers.set('Content-Security-Policy', GAME_CSP);
  else headers.delete('Content-Security-Policy');
  if (https) headers.set('Strict-Transport-Security', 'max-age=15552000');
  return headers;
}

export function appendSetCookie(headers, cookie) {
  headers.append('Set-Cookie', cookie);
}

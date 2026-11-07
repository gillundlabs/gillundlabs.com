/* A service worker whose scope is the site root, or this bench, can answer
   /test before the page runs. Directory workers under /play/ do not cover it.
   The page script unregisters only the covering registrations. */

export function scopeCoversBench(scope, bench) {
  let path;
  try {
    path = new URL(scope).pathname;
  } catch {
    return false;
  }
  if (!path.endsWith('/')) path += '/';
  const base = bench.endsWith('/') ? bench : `${bench}/`;
  if (path === '/') return true;
  return base.startsWith(path);
}

export const GUARD_SCRIPT = `/* Drop a service worker that covers this bench or the whole origin.
   Directory workers under /play/ stay registered. */
(function () {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  var meta = document.querySelector('meta[name="gl-bench-path"]');
  var bench = (meta && meta.content) || '/test';
  if (bench.charAt(0) !== '/') return;
  function covers(scope) {
    var path;
    try { path = new URL(scope).pathname; } catch (e) { return false; }
    if (path.charAt(path.length - 1) !== '/') path += '/';
    var base = bench.charAt(bench.length - 1) === '/' ? bench : bench + '/';
    if (path === '/') return true;
    return base.indexOf(path) === 0;
  }
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    var doomed = [];
    for (var i = 0; i < regs.length; i++) if (covers(regs[i].scope)) doomed.push(regs[i]);
    if (!doomed.length) return;
    Promise.all(doomed.map(function (reg) { return reg.unregister(); })).then(function () {
      if (navigator.serviceWorker.controller) location.reload();
    });
  }).catch(function () {});
})();
`;

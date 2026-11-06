/* Mount kit plaque chrome (VLS.plaqueMount) after tokens.js */
(function () {
  function run() {
    if (typeof VLS === 'undefined' || !VLS.plaqueMount) return;
    VLS.plaqueMount(document);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  // fonts/layout settle
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(run, 0); });
  setTimeout(run, 400);
})();

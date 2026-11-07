/* Mount kit plaque chrome + procedural ivory after tokens/apparatus/ivory. */
(function () {
  function fixContentLabels(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(
      '.hero.vls-plaque .vls-plaque__label, .plaquebox.vls-plaque .vls-plaque__label, ' +
      '.foot.vls-plaque .vls-plaque__label, .gamehead.vls-plaque .vls-plaque__label, ' +
      '.cardbody.vls-plaque .vls-plaque__label, main > .prose.vls-plaque .vls-plaque__label, ' +
      'main > section > .prose.vls-plaque .vls-plaque__label, .feedback-plaque .vls-plaque__label, ' +
      '.gl-gate-plaque .vls-plaque__label'
    ).forEach(function (label) {
      label.style.whiteSpace = 'normal';
      label.style.fontSize = '';
      label.style.overflow = 'visible';
      label.style.lineHeight = '';
      label.style.textOverflow = '';
    });
  }
  function stampIvory(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.vls-plaque--ivory').forEach(function (el, i) {
      if (el.classList.contains('btn')) return; /* buttons are brass, not ivory plates */
      if (!el.getAttribute('data-vls-ivory')) {
        el.setAttribute('data-vls-ivory', el.id || ('site/ivory/' + (el.className.match(/\b(hero|cardbody|foot|gamehead|prose|plaquebox|feedback-plaque|gl-gate-plaque)\b/) || ['block'])[0] + '/' + i));
      }
    });
  }
  function mount(force) {
    stampIvory(document);
    fixContentLabels(document);
    if (VLS.plaqueMount) VLS.plaqueMount(document, { force: !!force });
    fixContentLabels(document); // after mount (content plaques skip nowrap, but belt-and-braces)
    if (VLS.ivory && VLS.ivory.applyAll) VLS.ivory.applyAll(document);
    // One forced remount after layout settles so SVG viewBox matches final box
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fixContentLabels(document);
        if (VLS.plaqueMount) VLS.plaqueMount(document, { force: true });
        if (VLS.ivory && VLS.ivory.applyAll) VLS.ivory.applyAll(document);
      });
    });
  }
  function run() {
    if (typeof VLS === 'undefined') return;
    stampIvory(document);
    if (VLS.ivory && VLS.ivory.ready) {
      VLS.ivory.ready().then(function () { mount(true); }).catch(function () { mount(true); });
    } else {
      mount(true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(function () { if (window.VLS) mount(true); }, 0); });
  }
  setTimeout(function () { if (window.VLS) mount(true); }, 500);
  window.addEventListener('resize', function () {
    if (!window.VLS || !VLS.plaqueMount) return;
    clearTimeout(window.__glPlaqueResize);
    window.__glPlaqueResize = setTimeout(function () { VLS.plaqueMount(document, { force: true }); }, 80);
  });
})();

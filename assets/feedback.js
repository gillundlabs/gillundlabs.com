/* Feedback form → FormSubmit (AgentMail inbox). Endpoint may be a random alias. */
(function () {
  // Raw address used only until FormSubmit issues an alias; then replace below.
  var ENDPOINT = 'https://formsubmit.co/ajax/gillundlabs@agentmail.to';
  var form = document.getElementById('feedback-form');
  if (!form) return;
  var status = document.getElementById('feedback-status');
  function show(kind, text) {
    status.hidden = false;
    status.className = 'feedback-status feedback-status--' + kind;
    status.textContent = text;
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (form._honey && form._honey.value) return; // honeypot
    var msg = form.message && form.message.value.trim();
    var game = form.which_game && form.which_game.value;
    if (!game) { show('error', 'Please choose what the note is about.'); form.which_game.focus(); return; }
    if (!msg) { show('error', 'Please write a message.'); form.message.focus(); return; }
    var email = (form.email && form.email.value || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show('error', 'That email does not look right. Leave it blank, or fix it.');
      form.email.focus(); return;
    }
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; }
    show('pending', 'Sending…');
    var data = new FormData(form);
    fetch(ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
    }).then(function (r) {
      if (r.ok || (r.body && (r.body.success === 'true' || r.body.success === true))) {
        form.reset();
        show('ok', 'Thank you — your note is on the lab bench.');
      } else {
        var m = (r.body && (r.body.message || r.body.error)) || 'Something went wrong sending the note.';
        show('error', m);
      }
    }).catch(function () {
      show('error', 'Could not reach the post. Check your connection and try again.');
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  });
})();

/* Home-screen setup works independently of database loading and authentication. */
(() => {
  const get = id => document.getElementById(id);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  let installPrompt;
  const showPairing = () => {
    if (!get('pair-dialog').open) get('pair-dialog').showModal();
  };
  window.addEventListener('atlas:auth-required', showPairing);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    get('native-install').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    get('native-install').hidden = true;
    get('install-status').textContent = 'Sleep Atlas has been added. Launch it from its app icon.';
  });
  get('native-install').onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    get('native-install').hidden = true;
  };
  get('pair-form').onsubmit = async event => {
    event.preventDefault();
    get('pair-submit').disabled = true;
    get('pair-error').textContent = '';
    try {
      const response = await fetch('/api/session', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code: get('pair-code').value.trim()})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not connect.');
      get('pair-code').value = '';
      get('pair-dialog').close();
      window.dispatchEvent(new Event('atlas:paired'));
    } catch (error) {
      get('pair-error').textContent = error.message || 'Keep your Mac running and try again.';
    } finally {
      get('pair-submit').disabled = false;
    }
  };
  function copyField(label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'install-copy';
    const field = document.createElement('label');
    field.className = 'field';
    field.append(label);
    const input = document.createElement('input');
    input.value = value; input.readOnly = true;
    input.autocapitalize = 'none'; input.spellcheck = false;
    field.append(input);
    const button = document.createElement('button');
    button.className = 'secondary'; button.textContent = 'Copy';
    button.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
    button.onclick = async () => {
      try { await navigator.clipboard.writeText(value); button.textContent = 'Copied'; }
      catch { input.focus(); input.select(); button.textContent = 'Select & copy'; }
    };
    wrapper.append(field,button);
    return wrapper;
  }
  get('install-button').onclick = async () => {
    get('install-status').textContent = standalone() ? 'You’re already using the home-screen app.' : 'Add the moon icon to your Home Screen and open Sleep Atlas in its own window.';
    get('install-offline-note').textContent = window.isSecureContext && !localHost
      ? 'After the first visit, the app can show its last saved collection offline. New analysis and saving still need your Mac.'
      : 'Your local Wi-Fi connection supports live use. Offline launch on a phone needs a trusted HTTPS address.';
    const section = get('phone-connection');
    section.replaceChildren(); section.hidden = !localHost;
    if (!get('install-dialog').open) get('install-dialog').showModal();
    if (!localHost) return;
    section.textContent = 'Finding the phone address…';
    try {
      const response = await fetch('/api/installation');
      if (!response.ok) throw new Error('Could not read connection settings.');
      const info = await response.json();
      section.replaceChildren();
      if (!info.phoneEnabled) {
        section.className = 'notice';
        section.textContent = 'Phone access is off. On your Mac, stop the current server and open “Start Sleep Atlas for Phone.command” in the project folder, then reload this page.';
      } else {
        section.className = 'install-connection';
        if (info.urls?.length) section.append(copyField('Phone address',info.urls[0]));
        else { const note=document.createElement('p');note.textContent='Use http://<your Mac’s Wi-Fi IP>:8765/ on your phone.';section.append(note); }
        if (info.urls?.[1]) section.append(copyField('Alternative address',info.urls[1]));
        if (info.accessCode) section.append(copyField('Access code',info.accessCode));
        const note=document.createElement('p');note.className='small';note.textContent='Use the same trusted Wi-Fi network. Enter this code when prompted on your phone; keep it private.';section.append(note);
      }
    } catch {
      section.className='notice';
      section.textContent='Keep Sleep Atlas running on your Mac, then reopen these instructions.';
    }
  };
})();

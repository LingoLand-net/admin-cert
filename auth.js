/* Lingo‑Ville — shared auth + API wrapper */
(function () {
  const CFG = window.ADMIN_CONFIG;
  const KEY = CFG.TOKEN_KEY;

  function getToken() { return localStorage.getItem(KEY); }
  function setToken(t) { localStorage.setItem(KEY, t); }
  function clearToken() { localStorage.removeItem(KEY); }

  async function api(action, payload = {}) {
    const res = await fetch(CFG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error('NETWORK_' + res.status);
    const json = await res.json();
    if (json.status !== 'success') {
      const m = json.message || 'API_ERROR';
      if (m === 'TOKEN_EXPIRED' || m === 'NO_TOKEN') {
        clearToken();
        window.location.reload();
        throw new Error('AUTH_RELOAD');
      }
      throw new Error(m);
    }
    return json.data;
  }

  async function verifyPin(pin) {
    const { token } = await api('verifyPin', { pin });
    setToken(token);
    return token;
  }

  /**
   * Gate the page.
   * - If a token exists: hide PIN, show #appScreen, call onReady(token)
   * - Else: show PIN form, unlock, then call onReady(token)
   */
  function requireAuth(onReady) {
    const pinScreen = document.getElementById('pinScreen');
    const appScreen = document.getElementById('appScreen');
    if (!pinScreen || !appScreen) {
      console.error('auth: missing #pinScreen or #appScreen');
      return;
    }

    function unlock() {
      pinScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      onReady(getToken());
    }

    if (getToken()) { unlock(); return; }

    pinScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');

    const form = document.getElementById('pinForm');
    const input = document.getElementById('pinInput');
    const btn = document.getElementById('pinSubmitBtn');
    const err = document.getElementById('pinError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Verifying…';
      try {
        await verifyPin(input.value.trim());
        unlock();
      } catch (ex) {
        err.textContent = ex.message === 'INVALID_PIN'
          ? 'Wrong PIN. Try again.'
          : 'Verification failed. Check your connection.';
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Unlock';
      }
    });
  }

  function logout() {
    clearToken();
    window.location.href = 'index.html';
  }

  window.LVAuth = { getToken, setToken, clearToken, api, verifyPin, requireAuth, logout };
})();
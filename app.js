(() => {
  'use strict';
  const C = window.HazeCore;
  const $ = (id) => document.getElementById(id);
  const LAST_KEY = 'haze:last';
  const POLL_MS = 5 * 60 * 1000;

  let settings = Object.assign({}, C.DEFAULT_SETTINGS);
  let latest = null;
  let lastFetch = 0;
  let busy = false;
  let deferredInstall = null;

  /* ---------- helpers ---------- */
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(d);
  }

  const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function show(title, options) {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      return reg.showNotification(title, options);
    }
    return new Notification(title, options);
  }

  /* ---------- rendering ---------- */
  function render() {
    const grid = $('grid');
    grid.replaceChildren();
    if (!latest) return;
    for (const region of C.REGIONS) {
      const psi = num(latest.psi && latest.psi[region]);
      const pm = num(latest.pm25 && latest.pm25[region]);
      const b = psi === null ? null : C.band(C.PSI_BANDS, psi);
      const pb = pm === null ? null : C.band(C.PM25_BANDS, pm);

      const card = document.createElement('article');
      card.className = 'region' + (settings.enabled && settings.region === region ? ' watched' : '');
      if (b) card.style.setProperty('--band', b.color);
      card.innerHTML =
        '<h3>' + C.capitalise(region) +
          (settings.enabled && settings.region === region ? '<span title="Alert region" aria-label="Alert region">🔔</span>' : '') +
        '</h3>' +
        '<div class="psi"><span class="num">' + (psi === null ? '—' : psi) + '</span><span class="unit">24-hr PSI</span></div>' +
        (b ? '<span class="pill">' + b.label + '</span>' : '') +
        '<div class="pm">1-hr PM2.5 <strong>' + (pm === null ? '—' : pm + ' µg/m³') + '</strong>' +
          (pb ? ' · ' + pb.label : '') + '</div>';
      grid.append(card);
    }
    $('updated').textContent = 'PSI updated ' + fmtTime(latest.timestamp) +
      (latest.pm25Timestamp ? ' · PM2.5 updated ' + fmtTime(latest.pm25Timestamp) : '');
  }

  function renderStatus() {
    const el = $('alert-status');
    const regionName = C.capitalise(settings.region);
    const cur = latest ? num(latest.psi && latest.psi[settings.region]) : null;
    if (!settings.enabled) {
      el.textContent = 'Alerts are off.';
    } else {
      el.textContent = 'Alerts on: you’ll be notified when ' + regionName + ' 24-hr PSI reaches ' +
        settings.threshold + (cur === null ? '.' : ' (now ' + cur + ').');
    }
    $('test').hidden = !settings.enabled;
  }

  function setError(msg) {
    const el = $('error');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  async function updateBackgroundNote() {
    const note = $('bg-note');
    if (!settings.enabled) { note.textContent = ''; return; }
    const ok = await registerPeriodicSync();
    note.textContent = ok
      ? 'Background checks are on: Chrome will check roughly hourly even when the app is closed.'
      : 'Without a push server, the check runs while the app is open (or in the background on Android Chrome once the app is installed). Keep the app open to be alerted.';
  }

  /* ---------- data ---------- */
  async function refresh() {
    if (busy) return;
    busy = true;
    $('refresh').classList.add('spin');
    try {
      const res = await C.runCheck(show, { fetchIfDisabled: true });
      latest = res.data;
      lastFetch = Date.now();
      try { localStorage.setItem(LAST_KEY, JSON.stringify(latest)); } catch (e) { /* ignore */ }
      setError('');
    } catch (err) {
      setError(latest
        ? 'Couldn’t refresh (' + err.message + '). Showing the last readings.'
        : 'Couldn’t load readings (' + err.message + '). Check your connection and tap refresh.');
    } finally {
      busy = false;
      $('refresh').classList.remove('spin');
      render();
      renderStatus();
    }
  }

  /* ---------- alert settings ---------- */
  async function persist() {
    await C.saveSettings(settings);
    render();
    renderStatus();
    updateBackgroundNote();
  }

  function readThreshold() {
    const v = Math.round(Number($('threshold').value));
    if (!isFinite(v) || v < 1 || v > 500) {
      $('threshold').value = settings.threshold;
      return null;
    }
    return v;
  }

  async function registerPeriodicSync() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('periodicSync' in reg)) return false;
      const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (perm.state !== 'granted') return false;
      await reg.periodicSync.register('haze-check', { minInterval: 60 * 60 * 1000 });
      return true;
    } catch (e) { return false; }
  }

  async function unregisterPeriodicSync() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if ('periodicSync' in reg) await reg.periodicSync.unregister('haze-check');
    } catch (e) { /* ignore */ }
  }

  async function ensurePermission() {
    if (!notificationsSupported()) return false;
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  function bindSettings() {
    $('region').addEventListener('change', async () => {
      settings.region = $('region').value;
      await persist();
      if (settings.enabled) refresh();
    });

    $('threshold').addEventListener('change', async () => {
      const v = readThreshold();
      if (v === null) return;
      settings.threshold = v;
      await persist();
      if (settings.enabled) refresh();
    });

    document.querySelectorAll('.chip').forEach((chip) =>
      chip.addEventListener('click', async () => {
        settings.threshold = Number(chip.dataset.v);
        $('threshold').value = settings.threshold;
        await persist();
        if (settings.enabled) refresh();
      }));

    $('enabled').addEventListener('change', async (e) => {
      if (e.target.checked) {
        if (!notificationsSupported()) {
          e.target.checked = false;
          $('alert-status').textContent = isIos() && !isStandalone()
            ? 'On iPhone/iPad, add this app to your Home Screen first, then open it from there to turn on alerts.'
            : 'This browser doesn’t support notifications.';
          return;
        }
        if (!(await ensurePermission())) {
          e.target.checked = false;
          $('alert-status').textContent = 'Notifications are blocked. Allow them for this site in your browser or phone settings, then try again.';
          return;
        }
        settings.enabled = true;
        await persist();
        refresh();
      } else {
        settings.enabled = false;
        await persist();
        unregisterPeriodicSync();
      }
    });

    $('test').addEventListener('click', async () => {
      if (!(await ensurePermission())) return;
      await show('Haze Tracker test', {
        body: 'Notifications are working. You’ll be alerted at PSI ' + settings.threshold + ' in the ' +
          C.capitalise(settings.region) + '.',
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'haze-test', data: { url: './' },
      });
    });

    $('refresh').addEventListener('click', refresh);
  }

  /* ---------- install prompt ---------- */
  function setupInstall() {
    if (isStandalone()) return;
    const box = $('install');
    const text = $('install-text');
    const btn = $('install-btn');

    if (isIos()) {
      box.hidden = false;
      text.textContent = 'In Safari, tap the Share button, then “Add to Home Screen”. Open the app from your Home Screen to enable alerts.';
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
      box.hidden = false;
      text.textContent = 'Install Haze Tracker on your phone for quick access and background checks.';
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      box.hidden = true;
    });
    window.addEventListener('appinstalled', () => { box.hidden = true; });
  }

  /* ---------- start ---------- */
  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    try { settings = await C.getSettings(); } catch (e) { /* use defaults */ }
    if (settings.enabled && (!notificationsSupported() || Notification.permission !== 'granted')) {
      settings.enabled = false; // permission was revoked since last visit
      C.saveSettings(settings).catch(() => {});
    }
    $('region').value = settings.region;
    $('threshold').value = settings.threshold;
    $('enabled').checked = settings.enabled;

    try {
      const cached = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
      if (cached && cached.psi) latest = cached;
    } catch (e) { /* ignore */ }

    bindSettings();
    setupInstall();
    render();
    renderStatus();
    updateBackgroundNote();
    refresh();

    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastFetch > 2 * 60 * 1000) refresh();
    });
  }

  init();
})();

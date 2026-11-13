/* Shared by the page (index.html) and the service worker (sw.js):
   NEA data fetching, PSI bands, settings storage and the alert check. */
(function (root) {
  'use strict';

  const API = {
    psi: 'https://api-open.data.gov.sg/v2/real-time/api/psi',
    pm25: 'https://api-open.data.gov.sg/v2/real-time/api/pm25',
  };

  const REGIONS = ['north', 'south', 'east', 'west', 'central'];
  const DEFAULT_SETTINGS = { enabled: false, region: 'central', threshold: 100 };

  // NEA 24-hr PSI bands.
  const PSI_BANDS = [
    { max: 50, label: 'Good', color: '#2e9d5b' },
    { max: 100, label: 'Moderate', color: '#2f7fd0' },
    { max: 200, label: 'Unhealthy', color: '#e8890c' },
    { max: 300, label: 'Very unhealthy', color: '#d6342c' },
    { max: Infinity, label: 'Hazardous', color: '#8c1b3a' },
  ];

  // NEA 1-hr PM2.5 bands (µg/m³).
  const PM25_BANDS = [
    { max: 55, label: 'Band I', color: '#2e9d5b' },
    { max: 150, label: 'Band II', color: '#2f7fd0' },
    { max: 250, label: 'Band III', color: '#e8890c' },
    { max: 350, label: 'Band IV', color: '#d6342c' },
    { max: Infinity, label: 'Band V', color: '#8c1b3a' },
  ];

  const band = (bands, v) => bands.find((b) => v <= b.max) || bands[bands.length - 1];

  /* ---------- tiny IndexedDB key/value store (works in page and SW) ---------- */
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('haze-tracker', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSettings() {
    const saved = (await idbGet('settings')) || {};
    return Object.assign({}, DEFAULT_SETTINGS, saved);
  }
  // Saving settings resets the alert state so a new region/threshold can alert straight away.
  async function saveSettings(settings) {
    await idbSet('settings', settings);
    await idbSet('state', { alerted: false });
  }

  /* ---------- NEA API ---------- */
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('NEA API returned HTTP ' + res.status);
    return res.json();
  }

  function latestItem(json) {
    const items = json && json.data && json.data.items;
    if (!Array.isArray(items) || !items.length) throw new Error('NEA API returned no readings');
    return items.reduce((a, b) => (String(b.timestamp) > String(a.timestamp) ? b : a));
  }

  // Returns { timestamp, psi: {region: n}, pm25: {region: n} | null, pm25Timestamp, fetchedAt }.
  async function fetchReadings() {
    const [psiRes, pmRes] = await Promise.allSettled([fetchJson(API.psi), fetchJson(API.pm25)]);
    if (psiRes.status !== 'fulfilled') throw psiRes.reason;
    const psiItem = latestItem(psiRes.value);
    const out = {
      timestamp: psiItem.timestamp,
      psi: (psiItem.readings && psiItem.readings.psi_twenty_four_hourly) || {},
      pm25: null,
      pm25Timestamp: null,
      fetchedAt: Date.now(),
    };
    if (pmRes.status === 'fulfilled') {
      try {
        const pmItem = latestItem(pmRes.value);
        out.pm25 = (pmItem.readings && pmItem.readings.pm25_one_hourly) || null;
        out.pm25Timestamp = pmItem.timestamp;
      } catch (e) { /* PM2.5 is optional */ }
    }
    return out;
  }

  /* ---------- alert logic ---------- */
  // Notify once when the value reaches the threshold; re-arm when it drops below.
  function evaluate(value, threshold, alerted) {
    if (typeof value !== 'number' || !isFinite(value)) return { notify: false, alerted };
    if (value >= threshold) return { notify: !alerted, alerted: true };
    return { notify: false, alerted: false };
  }

  function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Fetches readings and, if alerts are enabled, sends a notification on a threshold crossing.
  // `show(title, options)` displays the notification (page and service worker pass different ones).
  async function runCheck(show, opts) {
    const settings = await getSettings();
    if (!settings.enabled && !(opts && opts.fetchIfDisabled)) return null;
    const data = await fetchReadings();
    let notified = false;
    if (settings.enabled) {
      const value = data.psi[settings.region];
      const state = (await idbGet('state')) || { alerted: false };
      const result = evaluate(value, settings.threshold, state.alerted);
      await idbSet('state', { alerted: result.alerted, value, timestamp: data.timestamp });
      if (result.notify) {
        const b = band(PSI_BANDS, value);
        await show('Haze alert: PSI ' + value + ' in the ' + capitalise(settings.region), {
          body: '24-hr PSI is ' + value + ' (' + b.label + '), at or above your threshold of ' + settings.threshold + '.',
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'haze-alert',
          renotify: true,
          data: { url: './' },
        });
        notified = true;
      }
    }
    return { data, settings, notified };
  }

  root.HazeCore = {
    REGIONS, DEFAULT_SETTINGS, PSI_BANDS, PM25_BANDS,
    band, getSettings, saveSettings, fetchReadings, evaluate, runCheck, capitalise,
  };
})(typeof self !== 'undefined' ? self : this);

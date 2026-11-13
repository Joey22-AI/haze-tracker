# Haze Tracker SG

A small installable web app (PWA) that shows Singapore's **24-hr PSI** and **1-hr PM2.5** for the
north, south, east, west and central regions, and sends a notification when the PSI in a region you
pick reaches a threshold you set.

Data: NEA via [data.gov.sg](https://data.gov.sg) real-time APIs
(`/v2/real-time/api/psi` and `/v2/real-time/api/pm25`), under the Singapore Open Data Licence.
NEA publishes the 1-hour figure as PM2.5 concentration (µg/m³), not as a PSI value.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Service workers and notifications need HTTPS (localhost is exempt).

## Put it on a phone

Host the folder on any HTTPS static host (for example GitHub Pages: Settings → Pages → deploy from
`main`, root). Then open the URL on the phone:

- **Android / Chrome:** tap *Install app* (or menu → Add to Home screen).
- **iPhone / Safari:** Share → *Add to Home Screen*, then open the app from the Home Screen.
  iOS only allows notifications for apps added to the Home Screen.

## How alerts work

There is no server. The alert check runs in the app and in its service worker:

- while the app is open, readings refresh every 5 minutes;
- on Android Chrome, an installed app also registers a Periodic Background Sync (about hourly, at the
  browser's discretion) so alerts can arrive when the app is closed;
- an alert fires once when PSI rises to or above the threshold, and re-arms when it falls below.

Reliable alerts while the app is fully closed on every device would need a push server (Web Push),
which this project does not include.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | UI |
| `core.js` | NEA fetching, PSI bands, settings, alert logic (shared with the service worker) |
| `sw.js` | Offline app shell, background check, notification clicks |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |
| `tools/make-icons.sh` | Regenerates the icon PNGs (needs `rsvg-convert`) |

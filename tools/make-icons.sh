#!/bin/sh
# Regenerates the app icons in ../icons from the shapes below (needs rsvg-convert).
set -e
cd "$(dirname "$0")/../icons"

# $1 = scale of the artwork, $2 = corner radius of the background
svg() {
cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16324f"/>
      <stop offset="1" stop-color="#3f7390"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffd985"/>
      <stop offset="1" stop-color="#ff9a3c"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="$2" fill="url(#sky)"/>
  <g transform="translate(256 256) scale($1) translate(-256 -256)">
    <circle cx="256" cy="204" r="104" fill="url(#sun)"/>
    <g fill="#eef3f6">
      <rect x="64"  y="228" width="384" height="40" rx="20" opacity=".45"/>
      <rect x="96"  y="292" width="320" height="40" rx="20" opacity=".62"/>
      <rect x="64"  y="356" width="384" height="40" rx="20" opacity=".82"/>
    </g>
  </g>
</svg>
SVG
}

svg 1 112 > icon.svg                 # "any" icon, rounded
svg 0.7 0 > icon-maskable.svg        # full bleed, inside the maskable safe zone
svg 0.84 0 > icon-apple.svg          # iOS rounds the corners itself

rsvg-convert -w 192 -h 192 icon.svg > icon-192.png
rsvg-convert -w 512 -h 512 icon.svg > icon-512.png
rsvg-convert -w 512 -h 512 icon-maskable.svg > icon-maskable-512.png
rsvg-convert -w 180 -h 180 icon-apple.svg > apple-touch-icon.png
rm icon-apple.svg

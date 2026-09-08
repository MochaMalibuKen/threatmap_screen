# VThree Global Situational Map — MVP

A lightweight ambient global intelligence display optimized for conference-room TVs and inexpensive streaming-stick browsers.

## MVP behavior

- Full-screen MapLibre GL JS WebGL map with a low-resolution Natural Earth world basemap.
- No map API key and no login required.
- Ambient scene cycling with slow pan/drift and restrained HUD.
- UI appears in Interactive Mode; automatically returns to Ambient Mode after 5 minutes of inactivity.
- Fire TV / TV-browser keyboard events: Enter/Space enters Interactive Mode; arrows pan; +/- zoom; Escape/Back returns to Ambient Mode.
- Live USGS M2.5+ earthquake feed.
- Periodically updated NASA EONET open wildfire and natural-event feeds.
- Static strategic maritime chokepoint reference layer.
- Unconfigured intelligence layers are shown as unavailable rather than populated with fabricated data.

## Architecture

`data sources -> adapters/normalization -> GeoJSON map sources -> WebGL layers -> ambient scene controller -> interaction`

## Deploy to GitHub Pages

This repository includes `.github/workflows/pages.yml`. In GitHub open **Settings -> Pages** and set **Source** to **GitHub Actions**. Pushes to `main` deploy automatically.

## Fire TV setup

1. Open Amazon Silk on the Fire TV Stick.
2. Enter the deployed HTTPS URL and bookmark it.
3. Leave the display untouched for Ambient Mode.
4. Press Select/Enter to reveal interactive controls; use the directional pad to pan.
5. Disable aggressive TV sleep/screensaver settings if room policy permits continuous display.

## Data sources

| Layer | Status | Source | Refresh |
|---|---|---|---|
| Earthquakes | Live | USGS Earthquake Hazards Program GeoJSON | app refresh every 15 min |
| Wildfires | Periodic | NASA EONET v3 | app refresh every 15 min |
| Natural disasters | Periodic | NASA EONET v3 | app refresh every 15 min |
| Strategic infrastructure | Static | Curated geographic chokepoints | bundled |
| Basemap | Static reference | Natural Earth 1:110m countries | browser cached |
| Conflict/geopolitical | Unavailable | Not configured | — |
| Military facilities | Unavailable | Not configured | — |
| Aircraft | Unavailable | Not configured | — |
| Maritime/AIS | Unavailable | Not configured | — |
| Space/satellites | Unavailable | Not configured | — |
| Submarine cables | Unavailable | Not configured | — |
| Pipelines/energy | Unavailable | Not configured | — |

## Performance decisions

The MVP defaults to 2D Mercator, renders intelligence points through WebGL rather than DOM markers, refreshes data every 15 minutes, uses slow `easeTo` camera movement rather than per-frame application animation, and avoids video backgrounds, particle systems, dense labels, and persistent feeds.

## Ambient Mode

Ambient Mode is the default. Each scene chooses a small set of relevant layers, eases the camera to a broad regional/global composition, then applies slow eastward drift. Scenes dwell roughly 50–70 seconds. User input pauses cycling. Five minutes after the last interaction, the interface hides and Ambient Mode resumes.

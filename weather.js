(() => {
  'use strict';

  const CPOCC_LAT = 33.540405;
  const CPOCC_LON = -81.684814;
  const ALERTS_URL = 'https://api.weather.gov/alerts/active?area=SC';
  const LOCAL_ALERTS_URL = `https://api.weather.gov/alerts/active?point=${CPOCC_LAT},${CPOCC_LON}`;
  const POINT_URL = `https://api.weather.gov/points/${CPOCC_LAT},${CPOCC_LON}`;
  const REFRESH_MS = 10 * 60 * 1000;
  const APP_NAME = 'VThree Mission Control threatmap_screen';
  const headers = { 'Accept': 'application/geo+json', 'User-Agent': APP_NAME };

  let map = null;
  let forecastHourlyUrl = null;
  let observationStationsUrl = null;

  function captureMap() {
    if (!window.maplibregl || window.__vthreeWeatherMapCaptureInstalled) return;
    window.__vthreeWeatherMapCaptureInstalled = true;
    const BaseMap = window.maplibregl.Map;
    class CapturedMap extends BaseMap {
      constructor(options) {
        super(options);
        window.__vthreeMap = this;
        map = this;
        this.once('load', () => {
          installWeatherLayers();
          refreshWeather();
        });
      }
    }
    window.maplibregl.Map = CapturedMap;
  }

  function installWeatherLayers() {
    if (!map || map.getSource('nws-alerts')) return;
    map.addSource('nws-alerts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'nws-alert-fill',
      type: 'fill',
      source: 'nws-alerts',
      paint: {
        'fill-color': [
          'match', ['get', 'severity'],
          'Extreme', '#C62828',
          'Severe', '#E67E22',
          'Moderate', '#E67E22',
          '#5F6B7A'
        ],
        'fill-opacity': 0.12
      }
    });
    map.addLayer({
      id: 'nws-alert-line',
      type: 'line',
      source: 'nws-alerts',
      paint: {
        'line-color': [
          'match', ['get', 'severity'],
          'Extreme', '#C62828',
          'Severe', '#E67E22',
          'Moderate', '#E67E22',
          '#5F6B7A'
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 1.8],
        'line-opacity': 0.75
      }
    });

    map.on('click', 'nws-alert-fill', e => {
      const f = e.features && e.features[0];
      if (!f) return;
      const p = f.properties || {};
      new window.maplibregl.Popup({ closeButton: true, maxWidth: '360px' })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="weather-popup"><b>${escapeHtml(p.event || 'NWS Alert')}</b><br><span>${escapeHtml(p.severity || 'Unknown')} · ${escapeHtml(p.urgency || '')}</span><p>${escapeHtml(p.headline || '')}</p></div>`)
        .addTo(map);
    });

    const sceneTitle = document.getElementById('sceneTitle');
    if (sceneTitle) {
      const observer = new MutationObserver(updateSceneVisibility);
      observer.observe(sceneTitle, { childList: true, characterData: true, subtree: true });
      updateSceneVisibility();
    }
  }

  function updateSceneVisibility() {
    if (!map) return;
    const title = (document.getElementById('sceneTitle')?.textContent || '').toUpperCase();
    const visible = title !== 'GEOPOLITICAL';
    ['nws-alert-fill', 'nws-alert-line'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    });
  }

  async function refreshAlerts() {
    try {
      const [stateResponse, localResponse] = await Promise.all([
        fetch(ALERTS_URL, { headers, cache: 'no-store' }),
        fetch(LOCAL_ALERTS_URL, { headers, cache: 'no-store' })
      ]);
      if (!stateResponse.ok) throw new Error(String(stateResponse.status));
      const d = await stateResponse.json();
      const features = (d.features || [])
        .filter(f => f.geometry)
        .map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: f.id || '',
            event: f.properties?.event || 'NWS Alert',
            severity: f.properties?.severity || 'Unknown',
            urgency: f.properties?.urgency || '',
            headline: f.properties?.headline || ''
          }
        }));
      map?.getSource('nws-alerts')?.setData({ type: 'FeatureCollection', features });
      updateAlertBadge((d.features || []).length);

      if (localResponse.ok) {
        const local = await localResponse.json();
        renderLocalAlert(local.features || []);
      } else {
        renderLocalAlert(null);
      }
    } catch (_) {
      updateAlertBadge(null);
      renderLocalAlert(null);
    }
  }

  function ensureWeatherCard() {
    let card = document.getElementById('localWeather');
    if (card) return card;
    card = document.createElement('section');
    card.id = 'localWeather';
    card.className = 'local-weather';
    card.innerHTML = '<div class="eyebrow">CPOCC WEATHER</div><div class="weather-main"><strong>--°</strong><span>Loading NWS…</span></div><div id="localWeatherAlert" class="local-weather-alert clear">LOCAL · NO ACTIVE ALERT</div><div class="weather-meta"><span id="weatherWind">--</span><span id="weatherAlertBadge">ALERTS --</span></div>';
    document.getElementById('app')?.appendChild(card);
    return card;
  }

  function renderLocalAlert(features) {
    ensureWeatherCard();
    const row = document.getElementById('localWeatherAlert');
    if (!row) return;
    if (features == null) {
      row.textContent = 'LOCAL · ALERT STATUS UNAVAILABLE';
      row.className = 'local-weather-alert offline';
      return;
    }
    if (!features.length) {
      row.textContent = 'LOCAL · NO ACTIVE ALERT';
      row.className = 'local-weather-alert clear';
      return;
    }
    const priority = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
    const sorted = [...features].sort((a, b) => (priority[b.properties?.severity] || 0) - (priority[a.properties?.severity] || 0));
    const top = sorted[0].properties || {};
    row.textContent = `LOCAL · ${top.event || 'NWS ALERT'}${features.length > 1 ? ` +${features.length - 1}` : ''}`;
    row.className = `local-weather-alert ${(top.severity === 'Extreme' || top.severity === 'Severe') ? 'active' : 'watch'}`;
    row.title = top.headline || top.description || top.event || 'NWS Alert';
  }

  function updateAlertBadge(count) {
    ensureWeatherCard();
    const badge = document.getElementById('weatherAlertBadge');
    if (!badge) return;
    if (count == null) {
      badge.textContent = 'ALERTS OFFLINE';
      badge.className = 'weather-alert-badge offline';
    } else if (count > 0) {
      badge.textContent = `${count} SC ALERT${count === 1 ? '' : 'S'}`;
      badge.className = 'weather-alert-badge active';
    } else {
      badge.textContent = 'NO SC ALERTS';
      badge.className = 'weather-alert-badge clear';
    }
  }

  async function discoverLocalEndpoints() {
    if (forecastHourlyUrl && observationStationsUrl) return;
    const r = await fetch(POINT_URL, { headers, cache: 'force-cache' });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    forecastHourlyUrl = d.properties?.forecastHourly || null;
    observationStationsUrl = d.properties?.observationStations || null;
  }

  async function refreshLocalWeather() {
    const card = ensureWeatherCard();
    try {
      await discoverLocalEndpoints();
      let weather = null;
      if (observationStationsUrl) {
        const sr = await fetch(observationStationsUrl, { headers, cache: 'force-cache' });
        if (sr.ok) {
          const sd = await sr.json();
          const station = sd.features?.[0]?.id;
          if (station) {
            const or = await fetch(`${station}/observations/latest`, { headers, cache: 'no-store' });
            if (or.ok) weather = normalizeObservation(await or.json());
          }
        }
      }
      if (!weather && forecastHourlyUrl) {
        const fr = await fetch(forecastHourlyUrl, { headers, cache: 'no-store' });
        if (fr.ok) weather = normalizeForecast(await fr.json());
      }
      if (!weather) throw new Error('No local NWS weather available');
      renderWeather(card, weather);
    } catch (_) {
      card.querySelector('.weather-main strong').textContent = '--°';
      card.querySelector('.weather-main span').textContent = 'NWS unavailable';
      const wind = document.getElementById('weatherWind');
      if (wind) wind.textContent = '--';
    }
  }

  function normalizeObservation(d) {
    const p = d.properties || {};
    const c = p.temperature?.value;
    const f = Number.isFinite(c) ? Math.round(c * 9 / 5 + 32) : null;
    const windMs = p.windSpeed?.value;
    const windMph = Number.isFinite(windMs) ? Math.round(windMs * 2.23694) : null;
    return {
      temp: f,
      text: p.textDescription || 'Current observation',
      wind: windMph != null ? `${windMph} MPH` : 'WIND --',
      source: 'NWS OBS'
    };
  }

  function normalizeForecast(d) {
    const p = d.properties?.periods?.[0];
    if (!p) return null;
    return {
      temp: p.temperature,
      text: p.shortForecast || 'Hourly forecast',
      wind: `${p.windSpeed || '--'} ${p.windDirection || ''}`.trim(),
      source: 'NWS FCST'
    };
  }

  function renderWeather(card, weather) {
    card.querySelector('.weather-main strong').textContent = `${weather.temp ?? '--'}°`;
    card.querySelector('.weather-main span').textContent = weather.text;
    const wind = document.getElementById('weatherWind');
    if (wind) wind.textContent = `${weather.source} · ${weather.wind}`;
  }

  async function refreshWeather() {
    await Promise.allSettled([refreshAlerts(), refreshLocalWeather()]);
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  captureMap();
  ensureWeatherCard();
  setInterval(refreshWeather, REFRESH_MS);
})();

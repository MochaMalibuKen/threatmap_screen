(() => {
  'use strict';

  const SCENE_DWELLS = {
    'PURE AMBIENT': 85000,
    'GLOBAL OVERVIEW': 80000,
    'GEOPOLITICAL': 70000,
    'NATURAL EVENTS': 80000
  };
  let map = null;
  let sceneStartedAt = Date.now();
  let sceneDwell = 80000;
  let lastScene = '';
  let pulsePhase = 0;

  function waitForMap() {
    map = window.__vthreeMap;
    if (!map || !map.loaded()) return setTimeout(waitForMap, 500);
    installTerminator();
    installProgress();
    startPulse();
  }

  function installProgress() {
    if (!document.getElementById('sceneProgress')) {
      const el = document.createElement('div');
      el.id = 'sceneProgress';
      el.className = 'scene-progress';
      el.innerHTML = '<i></i>';
      document.getElementById('app')?.appendChild(el);
    }
    const title = document.getElementById('sceneTitle');
    if (title) new MutationObserver(resetSceneProgress).observe(title, { childList: true, subtree: true, characterData: true });
    resetSceneProgress();
    requestAnimationFrame(updateProgress);
  }

  function resetSceneProgress() {
    const title = (document.getElementById('sceneTitle')?.textContent || '').trim().toUpperCase();
    if (!title || title === lastScene) return;
    lastScene = title;
    sceneStartedAt = Date.now();
    sceneDwell = SCENE_DWELLS[title] || 80000;
  }

  function updateProgress() {
    const bar = document.querySelector('#sceneProgress i');
    if (bar) {
      const interactive = document.getElementById('app')?.classList.contains('interactive');
      const progress = interactive ? 0 : Math.min(1, Math.max(0, (Date.now() - sceneStartedAt) / sceneDwell));
      bar.style.transform = `scaleX(${progress})`;
    }
    requestAnimationFrame(updateProgress);
  }

  function installTerminator() {
    if (map.getSource('day-night')) return;
    map.addSource('day-night', { type: 'geojson', data: nightPolygon(new Date()) });
    const before = map.getLayer('land') ? 'land' : undefined;
    map.addLayer({
      id: 'day-night-shade',
      type: 'fill',
      source: 'day-night',
      paint: { 'fill-color': '#020508', 'fill-opacity': 0.25 }
    }, before);
    updateTerminator();
    setInterval(updateTerminator, 5 * 60 * 1000);
  }

  function updateTerminator() {
    map?.getSource('day-night')?.setData(nightPolygon(new Date()));
  }

  function nightPolygon(date) {
    const subsolar = subsolarPoint(date);
    const points = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      const lat = terminatorLatitude(lon, subsolar.lon, subsolar.lat);
      points.push([lon, lat]);
    }
    const northIsNight = subsolar.lat < 0;
    const edgeLat = northIsNight ? 90 : -90;
    const ring = [[-180, edgeLat], ...points, [180, edgeLat], [-180, edgeLat]];
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  }

  function subsolarPoint(date) {
    const rad = Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    let L = (280.460 + 0.9856474 * n) % 360;
    let g = (357.528 + 0.9856003 * n) % 360;
    if (L < 0) L += 360;
    if (g < 0) g += 360;
    const lambda = (L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) * rad;
    const epsilon = (23.439 - 0.0000004 * n) * rad;
    const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / rad;
    const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / rad;
    let gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;
    let lon = ra - gmst;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return { lon, lat: decl };
  }

  function terminatorLatitude(lon, solarLon, solarLat) {
    const rad = Math.PI / 180;
    const dec = solarLat * rad;
    const h = (lon - solarLon) * rad;
    if (Math.abs(Math.tan(dec)) < 0.000001) return 0;
    return Math.atan(-Math.cos(h) / Math.tan(dec)) / rad;
  }

  function startPulse() {
    setInterval(() => {
      if (!map) return;
      pulsePhase = pulsePhase ? 0 : 1;
      if (map.getLayer('glow-home')) {
        map.setPaintProperty('glow-home', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 0, pulsePhase ? 19 : 13, 5, pulsePhase ? 34 : 24]);
        map.setPaintProperty('glow-home', 'circle-opacity', pulsePhase ? 0.22 : 0.10);
      }
      if (map.getLayer('nws-alert-line')) map.setPaintProperty('nws-alert-line', 'line-opacity', pulsePhase ? 0.9 : 0.58);
    }, 6500);
  }

  waitForMap();
})();

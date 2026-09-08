(() => {
  'use strict';
  const IDLE_MS=5*60*1000, REFRESH_MS=15*60*1000;
  const SATELLITE_REFRESH_MS=2*60*60*1000, SATELLITE_POSITION_MS=5000;
  const WORLD_GEOJSON='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
  const USGS='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const EONET='https://eonet.gsfc.nasa.gov/api/v3/events';
  const GDELT='https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict%20OR%20war%20OR%20missile%20OR%20attack%20OR%20ceasefire%20OR%20invasion)%20tone%3C-2&mode=pointdata&format=geojson&timespan=24h&maxpoints=80';
  const CELESTRAK_STATIONS='https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=JSON';
  const CELESTRAK_HUBBLE='https://celestrak.org/NORAD/elements/gp.php?CATNR=20580&FORMAT=JSON';
  const CELESTRAK_NOAA20='https://celestrak.org/NORAD/elements/gp.php?CATNR=43013&FORMAT=JSON';
  const SATELLITE_MODULE='https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm';

  const layerMeta={
    home:['Mission Control / CPOCC','static','CPOCC','VThree Mission Control origin at 640 Old Airport Rd, Aiken, South Carolina.'],
    geopolitical:['Geopolitical Signals','periodic','GDELT GEO 2.0','Recent geographic media attention related to conflict terms. Signals are not verified combat incidents.'],
    satellite:['Tracked Satellites','tracked','CelesTrak + SGP4','Current orbital elements propagated locally in the browser; not live GPS telemetry.'],
    infrastructure:['Strategic Reference','static','Curated geographic reference','Major global maritime chokepoints.'],
    disaster:['Natural Events','periodic','NASA EONET v3','Open severe storms, volcanoes and floods; refreshed every 15 minutes.'],
    earthquake:['Earthquakes','live','USGS','M2.5+ rolling 24-hour GeoJSON feed.'],
    fire:['Wildfires','periodic','NASA EONET v3','Open wildfire events; refreshed every 15 minutes.']
  };

  const colors={
    home:'#8C1D40',
    geopolitical:'#8C1D40',
    satellite:'#1565C0',
    infrastructure:'#5F6B7A',
    disaster:'#E67E22',
    earthquake:'#C62828',
    fire:'#E67E22'
  };

  const scenes=[
    {title:'PURE AMBIENT',subtitle:'QUIET LIVE WATCH · OPEN-SOURCE SIGNALS',center:[12,18],zoom:1.12,layers:['home','satellite','geopolitical','earthquake','fire','disaster','infrastructure'],dwell:85000,pure:true},
    {title:'GLOBAL OVERVIEW',subtitle:'LIVE + PERIODIC OPEN-SOURCE SIGNALS',center:[8,18],zoom:1.24,layers:['home','satellite','geopolitical','earthquake','fire','disaster','infrastructure'],dwell:80000},
    {title:'GEOPOLITICAL',subtitle:'GDELT MEDIA-GEOGRAPHY SIGNALS · PERIODIC',center:[30,28],zoom:1.55,layers:['home','geopolitical','infrastructure'],dwell:70000},
    {title:'NATURAL EVENTS',subtitle:'USGS + NASA EONET',center:[-8,8],zoom:1.30,layers:['home','earthquake','fire','disaster'],dwell:80000}
  ];

  function featureCollection(features=[]){return{type:'FeatureCollection',features};}
  function point(id,title,lon,lat,detail,layer='infrastructure',source='Curated geographic reference'){
    return{type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{id,title,layer,source,freshness:'static',detail}};
  }

  const staticInfrastructure=featureCollection([
    point('suez','Suez Canal',32.34,30.46,'Strategic maritime chokepoint reference location.'),
    point('panama','Panama Canal',-79.68,9.08,'Strategic maritime chokepoint reference location.'),
    point('hormuz','Strait of Hormuz',56.35,26.57,'Strategic maritime chokepoint reference location.'),
    point('malacca','Strait of Malacca',101,3.5,'Strategic maritime chokepoint reference location.'),
    point('mandeb','Bab el-Mandeb',43.32,12.58,'Strategic maritime chokepoint reference location.'),
    point('gibraltar','Strait of Gibraltar',-5.58,35.96,'Strategic maritime chokepoint reference location.'),
    point('bosporus','Bosporus',29.05,41.12,'Strategic maritime chokepoint reference location.')
  ]);

  const missionControl=featureCollection([
    point('cpocc-mission-control','MISSION CONTROL / CPOCC',-81.684814,33.540405,'VThree Mission Control · Citizens Park Office & Conference Center · 640 Old Airport Rd, Aiken, SC 29801.','home','CPOCC')
  ]);

  let map,interactive=false,sceneIndex=0,sceneTimer,driftTimer,idleTimer,satellitePositionTimer;
  let satelliteLib=null,satelliteRecords=[];
  const runtimeAvailable=Object.fromEntries(Object.keys(layerMeta).map(k=>[k,k!=='satellite']));
  const els=Object.fromEntries(['app','topHud','sourcePanel','sourceRows','sceneTitle','sceneSubtitle','ambientStatus','enterBtn','ambientBtn','remoteHelp','detailCard','detailBody','closeDetail'].map(id=>[id,document.getElementById(id)]));

  function sourceRow(kind){const[label,freshness]=layerMeta[kind],available=runtimeAvailable[kind];return `<div class="source-row"><i class="dot ${available?freshness:'unavailable'}"></i><span>${label}</span><small>${available?freshness.toUpperCase():'OFFLINE'}</small></div>`;}
  function renderSourceRows(){els.sourceRows.innerHTML=Object.keys(layerMeta).map(sourceRow).join('');}

  function setupMap(){
    if(!window.maplibregl){document.body.innerHTML='<div class="fatal">Map engine unavailable. Check network access to the MapLibre CDN.</div>';return;}
    map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#06090d'}}]},center:[8,18],zoom:1.25,minZoom:.7,maxZoom:9,attributionControl:false,dragRotate:false,pitchWithRotate:false,renderWorldCopies:true,fadeDuration:500});
    map.on('load',async()=>{await addWorld();Object.keys(layerMeta).forEach(addIntelLayer);setData('infrastructure',staticInfrastructure);setData('home',missionControl);await refreshData();await loadSatellites();runScene();});
  }

  async function addWorld(){
    try{
      const r=await fetch(WORLD_GEOJSON,{cache:'force-cache'});if(!r.ok)throw new Error(String(r.status));
      map.addSource('world',{type:'geojson',data:await r.json()});
      map.addLayer({id:'land',type:'fill',source:'world',paint:{'fill-color':'#0d1820','fill-opacity':.96,'fill-color-transition':{duration:5000}}});
      map.addLayer({id:'borders',type:'line',source:'world',paint:{'line-color':'#355060','line-opacity':.42,'line-width':.55,'line-opacity-transition':{duration:5000}}});
    }catch(_){ }
  }

  function addIntelLayer(kind){
    map.addSource(`source-${kind}`,{type:'geojson',data:featureCollection()});
    const isHome=kind==='home',isSatellite=kind==='satellite';
    map.addLayer({id:`glow-${kind}`,type:'circle',source:`source-${kind}`,paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],0,isHome?13:6,5,isHome?24:12],
      'circle-color':colors[kind],
      'circle-opacity':isHome?.14:isSatellite?.14:.08,
      'circle-blur':isHome?.72:.55
    }});
    map.addLayer({id:`intel-${kind}`,type:'circle',source:`source-${kind}`,paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],0,isHome?5.5:isSatellite?3.5:2.5,4,isHome?8:isSatellite?5.5:4.5,8,isHome?11:isSatellite?8:7],
      'circle-color':colors[kind],
      'circle-opacity':kind==='infrastructure'?.78:.92,
      'circle-stroke-color':isHome?'#FFFFFF':isSatellite?'#8AB4F8':'#071017',
      'circle-stroke-width':isHome?1.7:isSatellite?1.2:1
    }});
    if(isSatellite)map.addLayer({id:'label-satellite',type:'symbol',source:'source-satellite',layout:{'text-field':['get','title'],'text-size':9,'text-offset':[0,1.25],'text-anchor':'top','text-allow-overlap':false},paint:{'text-color':'#90CAF9','text-halo-color':'#061017','text-halo-width':1.2,'text-opacity':.82}});
    if(isHome)map.addLayer({id:'label-home',type:'symbol',source:'source-home',layout:{'text-field':['get','title'],'text-size':10,'text-offset':[0,1.55],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#FFFFFF','text-halo-color':'#06090d','text-halo-width':1.5,'text-opacity':.9}});
    map.on('click',`intel-${kind}`,e=>{const f=e.features&&e.features[0];if(f){showDetail(f.properties||{});enterInteractive();}});
    map.on('mouseenter',`intel-${kind}`,()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave',`intel-${kind}`,()=>map.getCanvas().style.cursor=interactive?'grab':'none');
  }

  function setData(kind,data){const src=map&&map.getSource(`source-${kind}`);if(src)src.setData(data);}

  async function refreshData(){
    await Promise.allSettled([loadGdelt(),loadUSGS(),loadEonet('fire','wildfires'),loadEonet('disaster','severeStorms,volcanoes,floods')]);
    renderSourceRows();renderAmbientStatus();
  }

  async function loadSatellites(){
    try{
      satelliteLib=satelliteLib||await import(SATELLITE_MODULE);
      const responses=await Promise.all([CELESTRAK_STATIONS,CELESTRAK_HUBBLE,CELESTRAK_NOAA20].map(u=>fetch(u,{cache:'no-store'})));
      responses.forEach(r=>{if(!r.ok)throw new Error(`CelesTrak ${r.status}`);});
      const groups=await Promise.all(responses.map(r=>r.json()));
      const wanted=new Set(['25544','48274','20580','43013']);
      const seen=new Set();satelliteRecords=[];
      groups.flat().forEach(omm=>{
        const id=String(omm.NORAD_CAT_ID||'');if(!wanted.has(id)||seen.has(id))return;seen.add(id);
        const label=id==='25544'?'ISS':id==='48274'?'TIANGONG':id==='20580'?'HUBBLE':id==='43013'?'NOAA-20':(omm.OBJECT_NAME||`SAT ${id}`);
        satelliteRecords.push({id,label,omm,satrec:satelliteLib.json2satrec(omm)});
      });
      runtimeAvailable.satellite=satelliteRecords.length>0;updateSatellitePositions();clearInterval(satellitePositionTimer);satellitePositionTimer=setInterval(updateSatellitePositions,SATELLITE_POSITION_MS);
    }catch(_){runtimeAvailable.satellite=false;satelliteRecords=[];setData('satellite',featureCollection());}
    renderSourceRows();renderAmbientStatus();
  }

  function updateSatellitePositions(){
    if(!satelliteLib||!satelliteRecords.length||!map)return;
    const now=new Date(),gmst=satelliteLib.gstime(now),features=[];
    satelliteRecords.forEach(rec=>{try{
      const pv=satelliteLib.propagate(rec.satrec,now);if(!pv||!pv.position)return;
      const gd=satelliteLib.eciToGeodetic(pv.position,gmst);const lon=satelliteLib.degreesLong(gd.longitude),lat=satelliteLib.degreesLat(gd.latitude),alt=Math.max(0,gd.height||0);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))return;
      features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{id:rec.id,title:rec.label,layer:'satellite',source:'CelesTrak GP + satellite.js SGP4',freshness:'tracked',observedAt:now.toISOString(),detail:`Propagated orbital position · altitude ${Math.round(alt).toLocaleString()} km · NORAD ${rec.id}. Not live GPS telemetry.`}});
    }catch(_){ }});setData('satellite',featureCollection(features));
  }

  async function loadGdelt(){
    try{
      const r=await fetch(GDELT,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));const d=await r.json(),features=[];
      (d.features||[]).slice(0,80).forEach((f,i)=>{if(!f.geometry||f.geometry.type!=='Point'||!Array.isArray(f.geometry.coordinates))return;const p=f.properties||{},count=Number(p.count||p.Count||p.numarticles||0);features.push({type:'Feature',geometry:{type:'Point',coordinates:[f.geometry.coordinates[0],f.geometry.coordinates[1]]},properties:{id:String(p.id||p.name||i),title:p.name||p.Name||p.location||'Geopolitical media signal',layer:'geopolitical',source:'GDELT GEO 2.0',freshness:'periodic',detail:`Recent conflict-related media geography${count?` · ${count} matching mentions`:''}. This is a media-attention signal, not a verified combat event.`}});});
      runtimeAvailable.geopolitical=true;setData('geopolitical',featureCollection(features));
    }catch(_){runtimeAvailable.geopolitical=false;setData('geopolitical',featureCollection());}
  }

  async function loadUSGS(){
    try{
      const r=await fetch(USGS,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));const d=await r.json();
      const features=(d.features||[]).filter(f=>f.geometry&&f.geometry.type==='Point').map(f=>({type:'Feature',geometry:{type:'Point',coordinates:[f.geometry.coordinates[0],f.geometry.coordinates[1]]},properties:{id:String(f.id),title:f.properties.place||'Earthquake',layer:'earthquake',source:'USGS',freshness:'live',observedAt:new Date(f.properties.time||Date.now()).toISOString(),detail:`Magnitude ${Number(f.properties.mag||0).toFixed(1)}`}}));
      runtimeAvailable.earthquake=true;setData('earthquake',featureCollection(features));
    }catch(_){runtimeAvailable.earthquake=false;setData('earthquake',featureCollection());}
  }

  async function loadEonet(kind,category){
    try{
      const u=`${EONET}?status=open&days=30&limit=100&category=${encodeURIComponent(category)}`,r=await fetch(u);if(!r.ok)throw new Error(String(r.status));const d=await r.json(),features=[];
      (d.events||[]).forEach(ev=>{const g=Array.isArray(ev.geometry)?ev.geometry[ev.geometry.length-1]:null;if(!g||g.type!=='Point'||!Array.isArray(g.coordinates))return;features.push({type:'Feature',geometry:{type:'Point',coordinates:[g.coordinates[0],g.coordinates[1]]},properties:{id:String(ev.id),title:ev.title||layerMeta[kind][0],layer:kind,source:'NASA EONET',freshness:'periodic',observedAt:g.date,detail:ev.description||(ev.categories||[]).map(c=>c.title).join(', ')||layerMeta[kind][0]}});});
      runtimeAvailable[kind]=true;setData(kind,featureCollection(features));
    }catch(_){runtimeAvailable[kind]=false;setData(kind,featureCollection());}
  }

  function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function showDetail(p){els.detailBody.innerHTML=`<div class="eyebrow">${esc((p.layer||'signal').toUpperCase())} · ${esc((p.freshness||'').toUpperCase())}</div><h2>${esc(p.title||'Signal')}</h2><p>${esc(p.detail||'No additional detail.')}</p><dl><dt>SOURCE</dt><dd>${esc(p.source||'Unknown')}</dd>${p.observedAt?`<dt>OBSERVED</dt><dd>${esc(new Date(p.observedAt).toLocaleString())}</dd>`:''}</dl>`;els.detailCard.classList.remove('hidden');}

  function setLayerVisibility(kinds){if(!map)return;Object.keys(layerMeta).forEach(k=>['glow-','intel-','label-'].forEach(prefix=>{const id=prefix+k;if(map.getLayer(id))map.setLayoutProperty(id,'visibility',kinds.includes(k)?'visible':'none');}));}
  function renderAmbientStatus(){const s=scenes[sceneIndex];els.ambientStatus.innerHTML=s.layers.map(k=>`<span><i class="dot ${runtimeAvailable[k]?layerMeta[k][1]:'unavailable'}"></i>${layerMeta[k][0]}</span>`).join('');}

  function applySceneVisuals(s){
    els.app.classList.toggle('pure-scene',!!s.pure);
    if(map&&map.getLayer('land'))map.setPaintProperty('land','fill-color',s.pure?'#0a141b':'#0d1820');
    if(map&&map.getLayer('borders'))map.setPaintProperty('borders','line-opacity',s.pure?.25:.42);
    Object.keys(layerMeta).forEach(k=>{
      if(map&&map.getLayer(`glow-${k}`))map.setPaintProperty(`glow-${k}`,'circle-opacity',s.pure?(k==='home'?.10:k==='satellite'?.07:.035):(k==='home'?.16:k==='satellite'?.14:.08));
      if(map&&map.getLayer(`intel-${k}`))map.setPaintProperty(`intel-${k}`,'circle-opacity',s.pure?(k==='home'?.82:k==='satellite'?.64:k==='infrastructure'?.34:.48):(k==='infrastructure'?.78:.90));
      if(k==='satellite'&&map&&map.getLayer('label-satellite'))map.setPaintProperty('label-satellite','text-opacity',s.pure?.58:.82);
      if(k==='home'&&map&&map.getLayer('label-home'))map.setPaintProperty('label-home','text-opacity',s.pure?.72:.92);
    });
  }

  function runScene(){
    if(interactive||!map)return;clearTimeout(sceneTimer);clearInterval(driftTimer);
    const s=scenes[sceneIndex];els.sceneTitle.textContent=s.title;els.sceneSubtitle.textContent=s.subtitle;setLayerVisibility(s.layers);applySceneVisuals(s);renderAmbientStatus();
    map.easeTo({center:s.center,zoom:s.zoom,duration:16000,essential:false});
    driftTimer=setInterval(()=>{if(interactive)return;const c=map.getCenter();map.easeTo({center:[c.lng+(s.pure?6:8),c.lat+Math.sin(Date.now()/30000)*(s.pure?.7:1.2)],duration:s.pure?24000:19000,easing:t=>t});},s.pure?25000:20000);
    sceneTimer=setTimeout(()=>{sceneIndex=(sceneIndex+1)%scenes.length;runScene();},s.dwell);
  }

  function enterInteractive(){interactive=true;clearTimeout(sceneTimer);clearInterval(driftTimer);els.app.classList.remove('ambient','pure-scene');els.app.classList.add('interactive');els.topHud.classList.add('visible');els.sourcePanel.classList.add('visible');els.remoteHelp.classList.add('visible');els.enterBtn.classList.add('hidden');if(map)map.getCanvas().style.cursor='grab';armIdle();}
  function enterAmbient(){interactive=false;clearTimeout(idleTimer);els.detailCard.classList.add('hidden');els.app.classList.add('ambient');els.app.classList.remove('interactive');els.topHud.classList.remove('visible');els.sourcePanel.classList.remove('visible');els.remoteHelp.classList.remove('visible');els.enterBtn.classList.remove('hidden');if(map)map.getCanvas().style.cursor='none';runScene();}
  function armIdle(){clearTimeout(idleTimer);if(interactive)idleTimer=setTimeout(enterAmbient,IDLE_MS);}

  function onKey(e){
    if(!map)return;if(!interactive&&(e.key==='Enter'||e.key===' ')){e.preventDefault();enterInteractive();return;}if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();enterAmbient();return;}if(!interactive)return;armIdle();const step=140;
    if(e.key==='ArrowLeft'){e.preventDefault();map.panBy([-step,0],{duration:350});}if(e.key==='ArrowRight'){e.preventDefault();map.panBy([step,0],{duration:350});}if(e.key==='ArrowUp'){e.preventDefault();map.panBy([0,-step],{duration:350});}if(e.key==='ArrowDown'){e.preventDefault();map.panBy([0,step],{duration:350});}if(e.key==='+'||e.key==='='){e.preventDefault();map.zoomIn({duration:350});}if(e.key==='-'||e.key==='_'){e.preventDefault();map.zoomOut({duration:350});}
  }

  els.enterBtn.addEventListener('click',enterInteractive);els.ambientBtn.addEventListener('click',enterAmbient);els.closeDetail.addEventListener('click',()=>els.detailCard.classList.add('hidden'));
  ['mousemove','pointerdown','touchstart'].forEach(ev=>window.addEventListener(ev,()=>{if(interactive)armIdle();},{passive:true}));
  window.addEventListener('keydown',onKey);renderSourceRows();setupMap();setInterval(refreshData,REFRESH_MS);setInterval(loadSatellites,SATELLITE_REFRESH_MS);
})();

(() => {
  'use strict';
  const IDLE_MS=5*60*1000, REFRESH_MS=15*60*1000;
  const WORLD_GEOJSON='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
  const USGS='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const EONET='https://eonet.gsfc.nasa.gov/api/v3/events';
  const GDELT='https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict%20OR%20war%20OR%20missile%20OR%20attack%20OR%20ceasefire%20OR%20invasion)%20tone%3C-2&mode=pointdata&format=geojson&timespan=24h&maxpoints=80';

  const layerMeta={
    geopolitical:['Geopolitical Signals','periodic','GDELT GEO 2.0','Recent geographic media attention related to conflict terms. Signals are not verified combat incidents.'],
    infrastructure:['Strategic Reference','static','Curated geographic reference','Major global maritime chokepoints.'],
    disaster:['Natural Events','periodic','NASA EONET v3','Open severe storms, volcanoes and floods; refreshed every 15 minutes.'],
    earthquake:['Earthquakes','live','USGS','M2.5+ rolling 24-hour GeoJSON feed.'],
    fire:['Wildfires','periodic','NASA EONET v3','Open wildfire events; refreshed every 15 minutes.']
  };

  const colors={geopolitical:'#d95d79',infrastructure:'#c9a96e',disaster:'#f59e0b',earthquake:'#ff7866',fire:'#ff9d4d'};

  const scenes=[
    {title:'PURE AMBIENT',subtitle:'GLOBAL GEOGRAPHY · QUIET WATCH',center:[12,18],zoom:1.12,layers:[],dwell:85000,pure:true},
    {title:'GLOBAL OVERVIEW',subtitle:'LIVE + PERIODIC OPEN-SOURCE SIGNALS',center:[8,18],zoom:1.24,layers:['geopolitical','earthquake','fire','disaster','infrastructure'],dwell:80000},
    {title:'GEOPOLITICAL',subtitle:'GDELT MEDIA-GEOGRAPHY SIGNALS · PERIODIC',center:[30,28],zoom:1.55,layers:['geopolitical','infrastructure'],dwell:70000},
    {title:'NATURAL EVENTS',subtitle:'USGS + NASA EONET',center:[-8,8],zoom:1.30,layers:['earthquake','fire','disaster'],dwell:80000}
  ];

  function featureCollection(features=[]){return{type:'FeatureCollection',features};}
  function point(id,title,lon,lat,detail){return{type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{id,title,layer:'infrastructure',source:'Curated geographic reference',freshness:'static',detail}};}

  const staticInfrastructure=featureCollection([
    point('suez','Suez Canal',32.34,30.46,'Strategic maritime chokepoint reference location.'),
    point('panama','Panama Canal',-79.68,9.08,'Strategic maritime chokepoint reference location.'),
    point('hormuz','Strait of Hormuz',56.35,26.57,'Strategic maritime chokepoint reference location.'),
    point('malacca','Strait of Malacca',101,3.5,'Strategic maritime chokepoint reference location.'),
    point('mandeb','Bab el-Mandeb',43.32,12.58,'Strategic maritime chokepoint reference location.'),
    point('gibraltar','Strait of Gibraltar',-5.58,35.96,'Strategic maritime chokepoint reference location.'),
    point('bosporus','Bosporus',29.05,41.12,'Strategic maritime chokepoint reference location.')
  ]);

  let map,interactive=false,sceneIndex=0,sceneTimer,driftTimer,idleTimer;
  const runtimeAvailable=Object.fromEntries(Object.keys(layerMeta).map(k=>[k,true]));
  const els=Object.fromEntries(['app','topHud','sourcePanel','sourceRows','sceneTitle','sceneSubtitle','ambientStatus','enterBtn','ambientBtn','remoteHelp','detailCard','detailBody','closeDetail'].map(id=>[id,document.getElementById(id)]));

  function sourceRow(kind){const[label,freshness]=layerMeta[kind],available=runtimeAvailable[kind];return `<div class="source-row"><i class="dot ${available?freshness:'unavailable'}"></i><span>${label}</span><small>${available?freshness.toUpperCase():'OFFLINE'}</small></div>`;}
  function renderSourceRows(){els.sourceRows.innerHTML=Object.keys(layerMeta).map(sourceRow).join('');}

  function setupMap(){
    if(!window.maplibregl){document.body.innerHTML='<div class="fatal">Map engine unavailable. Check network access to the MapLibre CDN.</div>';return;}
    map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#06090d'}}]},center:[8,18],zoom:1.25,minZoom:.7,maxZoom:9,attributionControl:false,dragRotate:false,pitchWithRotate:false,renderWorldCopies:true,fadeDuration:500});
    map.on('load',async()=>{await addWorld();Object.keys(layerMeta).forEach(addIntelLayer);setData('infrastructure',staticInfrastructure);await refreshData();runScene();});
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
    map.addLayer({id:`glow-${kind}`,type:'circle',source:`source-${kind}`,paint:{'circle-radius':['interpolate',['linear'],['zoom'],0,6,5,12],'circle-color':colors[kind],'circle-opacity':.08,'circle-blur':.55}});
    map.addLayer({id:`intel-${kind}`,type:'circle',source:`source-${kind}`,paint:{'circle-radius':['interpolate',['linear'],['zoom'],0,2.5,4,4.5,8,7],'circle-color':colors[kind],'circle-opacity':kind==='infrastructure'?.78:.88,'circle-stroke-color':'#071017','circle-stroke-width':1}});
    map.on('click',`intel-${kind}`,e=>{const f=e.features&&e.features[0];if(f){showDetail(f.properties||{});enterInteractive();}});
    map.on('mouseenter',`intel-${kind}`,()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave',`intel-${kind}`,()=>map.getCanvas().style.cursor=interactive?'grab':'none');
  }

  function setData(kind,data){const src=map&&map.getSource(`source-${kind}`);if(src)src.setData(data);}

  async function refreshData(){
    await Promise.allSettled([
      loadGdelt(),
      loadUSGS(),
      loadEonet('fire','wildfires'),
      loadEonet('disaster','severeStorms,volcanoes,floods')
    ]);
    renderSourceRows();renderAmbientStatus();
  }

  async function loadGdelt(){
    try{
      const r=await fetch(GDELT,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));
      const d=await r.json(),features=[];
      (d.features||[]).slice(0,80).forEach((f,i)=>{
        if(!f.geometry||f.geometry.type!=='Point'||!Array.isArray(f.geometry.coordinates))return;
        const p=f.properties||{},count=Number(p.count||p.Count||p.numarticles||0);
        features.push({type:'Feature',geometry:{type:'Point',coordinates:[f.geometry.coordinates[0],f.geometry.coordinates[1]]},properties:{
          id:String(p.id||p.name||i),
          title:p.name||p.Name||p.location||'Geopolitical media signal',
          layer:'geopolitical',source:'GDELT GEO 2.0',freshness:'periodic',
          detail:`Recent conflict-related media geography${count?` · ${count} matching mentions`:''}. This is a media-attention signal, not a verified combat event.`
        }});
      });
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

  function setLayerVisibility(kinds){if(!map)return;Object.keys(layerMeta).forEach(k=>['glow-','intel-'].forEach(prefix=>{const id=prefix+k;if(map.getLayer(id))map.setLayoutProperty(id,'visibility',kinds.includes(k)?'visible':'none');}));}
  function renderAmbientStatus(){const s=scenes[sceneIndex];els.ambientStatus.innerHTML=s.layers.map(k=>`<span><i class="dot ${runtimeAvailable[k]?layerMeta[k][1]:'unavailable'}"></i>${layerMeta[k][0]}</span>`).join('');}

  function applySceneVisuals(s){
    els.app.classList.toggle('pure-scene',!!s.pure);
    if(map&&map.getLayer('land'))map.setPaintProperty('land','fill-color',s.pure?'#0a141b':'#0d1820');
    if(map&&map.getLayer('borders'))map.setPaintProperty('borders','line-opacity',s.pure?.25:.42);
  }

  function runScene(){
    if(interactive||!map)return;
    clearTimeout(sceneTimer);clearInterval(driftTimer);
    const s=scenes[sceneIndex];els.sceneTitle.textContent=s.title;els.sceneSubtitle.textContent=s.subtitle;setLayerVisibility(s.layers);applySceneVisuals(s);renderAmbientStatus();
    map.easeTo({center:s.center,zoom:s.zoom,duration:16000,essential:false});
    driftTimer=setInterval(()=>{if(interactive)return;const c=map.getCenter();map.easeTo({center:[c.lng+(s.pure?6:8),c.lat+Math.sin(Date.now()/30000)*(s.pure?.7:1.2)],duration:s.pure?24000:19000,easing:t=>t});},s.pure?25000:20000);
    sceneTimer=setTimeout(()=>{sceneIndex=(sceneIndex+1)%scenes.length;runScene();},s.dwell);
  }

  function enterInteractive(){interactive=true;clearTimeout(sceneTimer);clearInterval(driftTimer);els.app.classList.remove('ambient','pure-scene');els.app.classList.add('interactive');els.topHud.classList.add('visible');els.sourcePanel.classList.add('visible');els.remoteHelp.classList.add('visible');els.enterBtn.classList.add('hidden');if(map)map.getCanvas().style.cursor='grab';armIdle();}
  function enterAmbient(){interactive=false;clearTimeout(idleTimer);els.detailCard.classList.add('hidden');els.app.classList.add('ambient');els.app.classList.remove('interactive');els.topHud.classList.remove('visible');els.sourcePanel.classList.remove('visible');els.remoteHelp.classList.remove('visible');els.enterBtn.classList.remove('hidden');if(map)map.getCanvas().style.cursor='none';runScene();}
  function armIdle(){clearTimeout(idleTimer);if(interactive)idleTimer=setTimeout(enterAmbient,IDLE_MS);}

  function onKey(e){
    if(!map)return;
    if(!interactive&&(e.key==='Enter'||e.key===' ')){e.preventDefault();enterInteractive();return;}
    if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();enterAmbient();return;}
    if(!interactive)return;armIdle();const step=140;
    if(e.key==='ArrowLeft'){e.preventDefault();map.panBy([-step,0],{duration:350});}
    if(e.key==='ArrowRight'){e.preventDefault();map.panBy([step,0],{duration:350});}
    if(e.key==='ArrowUp'){e.preventDefault();map.panBy([0,-step],{duration:350});}
    if(e.key==='ArrowDown'){e.preventDefault();map.panBy([0,step],{duration:350});}
    if(e.key==='+'||e.key==='='){e.preventDefault();map.zoomIn({duration:350});}
    if(e.key==='-'||e.key==='_'){e.preventDefault();map.zoomOut({duration:350});}
  }

  els.enterBtn.addEventListener('click',enterInteractive);els.ambientBtn.addEventListener('click',enterAmbient);els.closeDetail.addEventListener('click',()=>els.detailCard.classList.add('hidden'));
  ['mousemove','pointerdown','touchstart'].forEach(ev=>window.addEventListener(ev,()=>{if(interactive)armIdle();},{passive:true}));
  window.addEventListener('keydown',onKey);renderSourceRows();setupMap();setInterval(refreshData,REFRESH_MS);
})();

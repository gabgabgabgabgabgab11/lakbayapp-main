const mapContainer=document.getElementById("map");
const closeBtn=document.getElementById("close-map");
const maximizeBtn=document.getElementById("maximize-map");
let wakeLock=null;
let originalMapStyles={};

maximizeBtn.addEventListener("click", async ()=>{
  originalMapStyles={
    position: mapContainer.style.position,
    top: mapContainer.style.top,
    left: mapContainer.style.left,
    width: mapContainer.style.width,
    height: mapContainer.style.height,
    zIndex: mapContainer.style.zIndex
  };
  mapContainer.style.position="fixed";
  mapContainer.style.top="0";
  mapContainer.style.left="0";
  mapContainer.style.width="100vw";
  mapContainer.style.height="100vh";
  mapContainer.style.zIndex="9999";
  closeBtn.style.display="block";
  maximizeBtn.style.display="none";
  try { if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen'); } catch(e){console.warn(e);}
  setTimeout(()=>map.invalidateSize(),300);
});

closeBtn.addEventListener("click", async ()=>{
  Object.assign(mapContainer.style, originalMapStyles);
  closeBtn.style.display="none";
  maximizeBtn.style.display="inline-block";
  if(wakeLock){try{await wakeLock.release();wakeLock=null;}catch(e){console.warn(e);}}
  setTimeout(()=>map.invalidateSize(),300);
});

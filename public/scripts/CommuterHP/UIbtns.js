document.getElementById("show-btn")?.addEventListener("click", ()=>{ drawJeepneyRoutes(); drawSavedRoutes(); });
document.getElementById("highlight-btn")?.addEventListener("click", highlightNearestRoute);
document.getElementById("clear-btn")?.addEventListener("click", ()=>{
  if(destinationMarker) try{map.removeLayer(destinationMarker);}catch(e){}
  if(routingControl) try{map.removeControl(routingControl);}catch(e){}
  destinationMarker=routingControl=null;
  statusText.textContent="Destination cleared.";
});

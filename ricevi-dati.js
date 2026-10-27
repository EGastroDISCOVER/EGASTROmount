/* ============================================================
   RICEZIONE DATI DALL'APP MADRE
   ============================================================ */
(function() {
  function loadSharedData() {
    const params = new URLSearchParams(window.location.search);
    
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));
    const targetName = params.get('targetName');
    const targetRa = parseFloat(params.get('targetRa'));
    const targetDec = parseFloat(params.get('targetDec'));

    // 1. Imposta le coordinate GPS
    if (!isNaN(lat) && !isNaN(lon)) {
      MS.gpsLat = lat;
      MS.gpsLon = lon;
      MS.gpsActive = true;
      console.log('📍 GPS impostato da App Madre:', lat, lon);
      
      // Aggiorna l'interfaccia visiva del telescopio (se le funzioni esistono)
      if (typeof updateTelemetry === 'function') updateTelemetry();
      if (typeof updateLinkButtons === 'function') updateLinkButtons();
      if (typeof updateGPSDisplay === 'function') updateGPSDisplay();
      
      if (typeof showToast === 'function') {
        showToast(`📍 GPS: ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
      }
    }

    // 2. Imposta il target (se presente)
    if (targetName && !isNaN(targetRa) && !isNaN(targetDec)) {
      console.log('🎯 Target ricevuto da App Madre:', targetName);
      
      if (typeof showToast === 'function') {
        showToast(`🎯 Target: ${targetName}`);
      }
      
      // Imposta il target nell'app del telescopio
      MS.tRA = targetRa * DEG_TO_RAD;
      MS.tDEC = targetDec * DEG_TO_RAD;
      MS.slewMode = 'goto';
      MS.slewStartDist = 1;
      MS.customGotoRate = null;
      
      if (typeof saveFullState === 'function') saveFullState();
    }
  }

  // All'avvio, leggi i dati dall'URL
  window.addEventListener('load', () => {
    setTimeout(loadSharedData, 500);
  });
})();
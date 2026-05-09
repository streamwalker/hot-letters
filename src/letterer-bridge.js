// Bridge: expose serialize/load helpers + change events for the React shell.
(function () {
  function serialize() {
    return {
      version: "0.2",
      platformVersion: typeof PLATFORM_VERSION !== "undefined" ? PLATFORM_VERSION : "002",
      image: state.imageDataUrl,
      imageW: state.imageW, imageH: state.imageH,
      balloons: state.balloons,
      parsedLines: state.parsedLines,
      scriptPhotos: typeof scriptPhotos !== "undefined" ? scriptPhotos : [],
      nextId: state.nextId,
      ui: {
        mobileMode: state.mobileMode,
        sideBySide: state.sideBySide,
        scriptViewerIndex: state.scriptViewerIndex,
        scriptViewerZoom: state.scriptViewerZoom,
        zoom: state.zoom,
      },
    };
  }

  function load(data) {
    if (!data || typeof data !== "object") return;
    state.balloons = data.balloons || [];
    state.parsedLines = data.parsedLines || [];
    if (typeof scriptPhotos !== "undefined") {
      // eslint-disable-next-line no-global-assign
      scriptPhotos = data.scriptPhotos || [];
    }
    state.nextId = data.nextId || (state.balloons.length + 1);
    if (data.image) loadImage(data.image);
    else { state.imageW = data.imageW || 1000; state.imageH = data.imageH || 1500; render(); }
    renderChips();
    renderScriptThumbs();
    if (data.ui) {
      if (data.ui.mobileMode) setMobileMode(true);
      if (data.ui.sideBySide) setSideBySide(true);
      if (typeof data.ui.scriptViewerIndex === "number") state.scriptViewerIndex = data.ui.scriptViewerIndex;
      if (typeof data.ui.scriptViewerZoom === "number") state.scriptViewerZoom = data.ui.scriptViewerZoom;
      if (state.sideBySide) updateScriptViewer();
      if (typeof data.ui.zoom === "number") {
        state.zoom = data.ui.zoom;
        setTimeout(() => applyZoom(), 80);
      }
    }
  }

  // Lightweight change signal: fires after any pointerup or input. The React layer
  // debounces these into Supabase upserts.
  function emitChange() { window.dispatchEvent(new CustomEvent("letterer:change")); }
  window.addEventListener("pointerup", emitChange, true);
  window.addEventListener("input", emitChange, true);
  window.addEventListener("change", emitChange, true);

  window.__letterer = { serialize, load };
  window.dispatchEvent(new CustomEvent("letterer:ready"));
})();

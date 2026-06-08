"use strict";

// ============== PLATFORM VERSION ==============
// Bumped each iteration the user requests. Embedded in the saved project file so the file knows
// which version of the platform produced it; embedded in the toolbar tag so the user can confirm
// at a glance which build is running.
const PLATFORM_VERSION = "002";

// ============== STATE ==============
const SVG_NS = "http://www.w3.org/2000/svg";
const state = {
  imageDataUrl: null,
  imageW: 0, imageH: 0,
  zoom: 1,
  balloons: [],   // ordered z by index
  selectedId: null,
  nextId: 1,
  parsedLines: [], // {id, who, mod, text, placed}
  // Blambot rule #006: a page should have a single consistent tail width tied to the dialogue
  // font's letter-"O" opening. When set, new balloons inherit this instead of the preset's tailW.
  defaultTailW: null,
  // When non-null, the next canvas click on a balloon connects it to this balloon and exits the mode.
  connectPickerSourceId: null,
  // Remembers the most recent connection target so the user can quickly reconnect another balloon
  // to the same partner without re-picking it (keyboard "R").
  lastConnectTargetId: null,
  // When true, the exported image overlays measured line boxes + the computed
  // oval/box safe area so wrapping and auto-shrink behaviour can be verified.
  debugTextFit: false,
  // Per-shape default text inset (fraction 0..0.4) used when a balloon's edgeInset is "auto".
  // Lets the user fine-tune, per shape category, how close exported text gets to the outline.
  shapeInsets: { burst: 0.22, cloud: 0.16, oval: 0.10, box: 0.08 },
  // Trace-existing-balloon mode. When true, dragging on the canvas marquees a rectangle
  // around an existing on-page balloon; on release the rect is OCR'd and turned into an
  // editable balloon (with optional white-out of the original art beneath it).
  traceMode: false,
  // Per-balloon white-out rectangles in image coordinates. Rendered as solid white rects
  // BEFORE balloon shapes so they sit between the page image and the new editable balloon.
  // Each entry: { id, balloonId, x, y, w, h }. Saved with the project and included in PNG export.
  whiteoutMasks: [],
};

// Map a balloon shape name to one of the four inset categories.
function shapeInsetCategory(shapeName) {
  const s = (shapeName || "oval").toLowerCase();
  if (s === "burst") return "burst";
  if (s === "cloud") return "cloud";
  if (s === "rect" || s === "box" || s === "caption" || s === "square") return "box";
  return "oval";
}

// Resolve the effective text inset (0..0.4) for a balloon: explicit override wins,
// otherwise the configurable per-shape default.
function getEffectiveInset(b) {
  if (b && typeof b.edgeInset === "number") {
    return Math.max(0, Math.min(0.4, b.edgeInset));
  }
  const cat = shapeInsetCategory(b && b.shape);
  const v = state.shapeInsets && state.shapeInsets[cat];
  return (typeof v === "number") ? Math.max(0, Math.min(0.4, v)) : 0.1;
}

// Reflect state.shapeInsets values into the shape-default slider UI.
function syncShapeInsetInputs() {
  [["si-burst", "burst"], ["si-cloud", "cloud"], ["si-oval", "oval"], ["si-box", "box"]].forEach(([id, cat]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = Math.round((state.shapeInsets[cat] ?? 0.1) * 100);
    el.value = String(pct);
    const valEl = document.getElementById(id + "-val");
    if (valEl) valEl.textContent = pct + "%";
  });
}



// Style presets corresponding to the canonical Blambot/industry modifier set. Each preset is the
// professional default look for a balloon of that type; the user can override anything per-balloon
// in the inspector.
// `outline: "dashed"` triggers a dashed stroke on the body (whisper / radio conventions).
const PRESETS = {
  speech:     { shape: "ellipse", fill: "#ffffff", stroke: "#000000", strokeW: 2, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 16, weight: 400, italic: "normal", tracking: 0, textColor: "#000000", tail: true, tailStyle: "point", tailW: 14, outline: "solid", organic: false },
  thought:    { shape: "cloud",   fill: "#ffffff", stroke: "#000000", strokeW: 2, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 16, weight: 400, italic: "italic", tracking: 0, textColor: "#000000", tail: true, tailStyle: "bubbles", tailW: 12, outline: "solid", organic: false },
  shout:      { shape: "burst",   fill: "#ffffff", stroke: "#000000", strokeW: 2.5, font: "'Bangers', Impact, sans-serif", size: 22, weight: 700, italic: "normal", tracking: 0.5, textColor: "#000000", tail: true, tailStyle: "point", tailW: 16, outline: "solid", organic: false },
  whisper:    { shape: "ellipse", fill: "#ffffff", stroke: "#666666", strokeW: 1.5, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 13, weight: 400, italic: "italic", tracking: 0, textColor: "#000000", tail: true, tailStyle: "point", tailW: 10, outline: "dashed", organic: false },
  weak:       { shape: "ellipse", fill: "#ffffff", stroke: "#999999", strokeW: 1, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 11, weight: 400, italic: "italic", tracking: 0, textColor: "#666666", tail: true, tailStyle: "point", tailW: 8, outline: "solid", organic: false },
  singing:    { shape: "ellipse", fill: "#ffffff", stroke: "#000000", strokeW: 2, font: "'Kalam', cursive", size: 16, weight: 400, italic: "italic", tracking: 0, textColor: "#000000", tail: true, tailStyle: "point", tailW: 14, outline: "solid", organic: false },
  translated: { shape: "ellipse", fill: "#fff7c2", stroke: "#000000", strokeW: 2, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 16, weight: 400, italic: "italic", tracking: 0, textColor: "#000000", tail: true, tailStyle: "point", tailW: 14, outline: "solid", organic: false },
  // Blambot RADIO/TRANSMISSION: jagged burst silhouette + dashed outline, italic.
  radio:      { shape: "burst",   fill: "#ffffff", stroke: "#000000", strokeW: 2, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 14, weight: 400, italic: "italic", tracking: 0, textColor: "#000000", tail: true, tailStyle: "point", tailW: 12, outline: "dashed", organic: false },
  caption:    { shape: "rect",    fill: "#fff7c2", stroke: "#000000", strokeW: 2, font: "'Comic Neue', Comic Sans MS, sans-serif", size: 14, weight: 700, italic: "normal", tracking: 0, textColor: "#000000", tail: false, tailStyle: "point", tailW: 12, outline: "solid", organic: false },
  sfx:        { shape: "ellipse", fill: "transparent", stroke: "transparent", strokeW: 0, font: "'Bangers', Impact, sans-serif", size: 48, weight: 700, italic: "normal", tracking: 1, textColor: "#ffd400", tail: false, tailStyle: "point", tailW: 12, outline: "solid", organic: false },
};

function uid() { return "b" + (state.nextId++); }

function cloneBalloon(text, modifier) {
  let preset = "speech";
  if (modifier === "THOUGHT") preset = "thought";
  else if (modifier === "BURST" || modifier === "SHOUT") preset = "shout";
  else if (modifier === "WHISPER") preset = "whisper";
  else if (modifier === "WEAK") preset = "weak";
  else if (modifier === "SINGING" || modifier === "SING") preset = "singing";
  else if (modifier === "TRANSLATED" || modifier === "FOREIGN") preset = "translated";
  else if (modifier === "RADIO" || modifier === "TRANSMISSION") preset = "radio";
  else if (modifier === "CAPTION") preset = "caption";
  else if (modifier === "SFX") preset = "sfx";
  const p = PRESETS[preset];
  const b = {
    id: uid(),
    text: text || "Hello!",
    cx: state.imageW / 2,
    cy: state.imageH / 4,
    rx: 100, ry: 50,
    tailX: state.imageW / 2,
    tailY: state.imageH / 2,
    connectedTo: null,
    edgeInset: null, // null = use shape default at export time
    ...JSON.parse(JSON.stringify(p)),
  };
  // Page-level tail-width default takes priority over preset (Blambot #006 consistency rule).
  if (typeof state.defaultTailW === "number" && state.defaultTailW > 0) b.tailW = state.defaultTailW;
  return b;
}

// ============== DOM REFS ==============
const $ = (id) => document.getElementById(id);
const overlay = $("overlay");
const stage = $("canvas-stage");
const pageImg = $("page-img");
const placeholder = $("placeholder");
const inspector = $("inspector");
const inspectorEmpty = $("inspector-empty");
const chipList = $("chip-list");
const dropHint = $("drop-hint");
const canvasWrap = $("canvas-wrap");

// ============== TOAST ==============
let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove("show"), 1800);
}

// ============== MODAL (replaces native prompt/alert which are disabled in some webviews) ==============
function appModal(opts) {
  return new Promise((resolve) => {
    const { title = "", body = "", input = false, defaultValue = "", showCancel = true, okLabel = "OK", cancelLabel = "Cancel" } = opts;
    const backdrop = $("modal-backdrop");
    $("modal-title").textContent = title;
    $("modal-body").textContent = body;
    const inputEl = $("modal-input");
    inputEl.style.display = input ? "block" : "none";
    inputEl.value = defaultValue;
    $("modal-ok").textContent = okLabel;
    $("modal-cancel").textContent = cancelLabel;
    $("modal-cancel").style.display = showCancel ? "inline-block" : "none";
    backdrop.style.display = "flex";
    if (input) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

    const cleanup = () => {
      backdrop.style.display = "none";
      $("modal-ok").onclick = null;
      $("modal-cancel").onclick = null;
      backdrop.onclick = null;
      inputEl.onkeydown = null;
      window.removeEventListener("keydown", escHandler);
    };
    const escHandler = (e) => { if (e.key === "Escape") { cleanup(); resolve(null); } };
    window.addEventListener("keydown", escHandler);
    $("modal-ok").onclick = () => { const v = input ? inputEl.value : true; cleanup(); resolve(v); };
    $("modal-cancel").onclick = () => { cleanup(); resolve(null); };
    backdrop.onclick = (e) => { if (e.target === backdrop) { cleanup(); resolve(null); } };
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); const v = inputEl.value; cleanup(); resolve(v); }
      else if (e.key === "Escape") { e.preventDefault(); cleanup(); resolve(null); }
    };
  });
}
function appPrompt(message, defaultValue = "", title = "Input required") {
  return appModal({ title, body: message, input: true, defaultValue });
}
function appAlert(message, title = "Notice") {
  return appModal({ title, body: message, showCancel: false });
}

// ============== UNDO / REDO ==============
// Snapshot-based system. Each mutation that should be undoable calls pushUndo() FIRST, recording
// the pre-mutation state. Cmd-Z / Ctrl-Z restores; Cmd-Shift-Z / Ctrl-Y replays. The redo stack is
// cleared whenever a fresh mutation is recorded. Stack is capped to keep memory bounded.
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function snapshotState() {
  return JSON.stringify({
    balloons: state.balloons,
    nextId: state.nextId,
    parsedLines: state.parsedLines,
    defaultTailW: state.defaultTailW,
    shapeInsets: state.shapeInsets,
    whiteoutMasks: state.whiteoutMasks,
  });
}
function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}
function applySnapshot(snap) {
  const data = JSON.parse(snap);
  state.balloons = data.balloons || [];
  state.nextId = data.nextId || 1;
  state.parsedLines = data.parsedLines || [];
  state.defaultTailW = (typeof data.defaultTailW === "number") ? data.defaultTailW : null;
  if (data.shapeInsets && typeof data.shapeInsets === "object") {
    state.shapeInsets = { ...state.shapeInsets, ...data.shapeInsets };
  }
  state.whiteoutMasks = Array.isArray(data.whiteoutMasks) ? data.whiteoutMasks : [];
  syncShapeInsetInputs();
}
function undo() {
  if (!undoStack.length) { toast("Nothing to undo"); return; }
  redoStack.push(snapshotState());
  applySnapshot(undoStack.pop());
  state.selectedId = null;
  render();
  renderChips();
  toast("Undo");
}
function redo() {
  if (!redoStack.length) { toast("Nothing to redo"); return; }
  undoStack.push(snapshotState());
  applySnapshot(redoStack.pop());
  state.selectedId = null;
  render();
  renderChips();
  toast("Redo");
}
$("btn-undo").addEventListener("click", undo);
$("btn-redo").addEventListener("click", redo);

// ============== IMAGE LOAD ==============
$("file-image").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => loadImage(r.result);
  r.readAsDataURL(f);
});
function loadImage(dataUrl) {
  pageImg.onload = () => {
    state.imageW = pageImg.naturalWidth;
    state.imageH = pageImg.naturalHeight;
    overlay.setAttribute("viewBox", `0 0 ${state.imageW} ${state.imageH}`);
    overlay.setAttribute("width", state.imageW);
    overlay.setAttribute("height", state.imageH);
    pageImg.style.width = state.imageW + "px";
    pageImg.style.height = state.imageH + "px";
    stage.style.width = state.imageW + "px";
    stage.style.height = state.imageH + "px";
    stage.style.display = "inline-block";
    placeholder.style.display = "none";
    fitZoom();
    render();
  };
  pageImg.src = dataUrl;
  state.imageDataUrl = dataUrl;
}

// ============== ZOOM ==============
function applyZoom() {
  $("zoom-label").textContent = Math.round(state.zoom * 100) + "%";
  if (!state.imageW) return;
  const w = state.imageW * state.zoom;
  const h = state.imageH * state.zoom;
  // Resize the layout box of the stage and its children. Doing this with width/height (rather than
  // CSS transform: scale) keeps the parent's scrollable region in sync with the visual size, so
  // content above 100% zoom remains reachable via scrollbar. The SVG overlay's viewBox stays at the
  // original image dimensions; SVG handles the visual scaling automatically.
  stage.style.width = w + "px";
  stage.style.height = h + "px";
  pageImg.style.width = w + "px";
  pageImg.style.height = h + "px";
  overlay.setAttribute("width", w);
  overlay.setAttribute("height", h);
  // Clear any leftover CSS transform from a previous version.
  stage.style.transform = "";
  stage.style.transformOrigin = "";
}
function fitZoom() {
  const wrapW = canvasWrap.clientWidth - 48;
  const wrapH = canvasWrap.clientHeight - 48;
  const z = Math.min(wrapW / state.imageW, wrapH / state.imageH, 1);
  state.zoom = Math.max(z, 0.1);
  applyZoom();
}
$("btn-zoom-in").addEventListener("click", () => { state.zoom = Math.min(state.zoom * 1.2, 4); applyZoom(); });
$("btn-zoom-out").addEventListener("click", () => { state.zoom = Math.max(state.zoom / 1.2, 0.1); applyZoom(); });

// ============== SCRIPT PARSER ==============
let scriptPhotos = []; // [{id, dataUrl, mediaType}]
let touchDragChipState = null; // {ln, ghost} — used for finger-drag of chips on touch devices

$("btn-parse").addEventListener("click", async () => {
  const text = $("script-input").value;
  if (!text.trim()) { toast("Paste a script first"); return; }
  await runParse(() => parseScriptRegex(text), false);
});
$("btn-parse-ai").addEventListener("click", async () => {
  const text = $("script-input").value;
  if (!text.trim()) { toast("Paste a script first"); return; }
  toast("Parsing with Claude…");
  await runParse(() => parseScriptAI(text), true);
});
$("btn-parse-photo").addEventListener("click", async () => {
  if (!scriptPhotos.length) { toast("Upload a script photo first"); return; }
  toast(`Analyzing ${scriptPhotos.length} photo${scriptPhotos.length===1?"":"s"} with Claude…`);
  await runParse(parseScriptPhotos, true);
});
$("link-set-key").addEventListener("click", (e) => { e.preventDefault(); promptForApiKey(); });

async function runParse(fn, isAI) {
  let lines;
  try { lines = await fn(); }
  catch (err) { await appAlert(err.message || String(err), "Parse error"); return; }
  state.parsedLines = lines;
  renderChips();
  if (lines.length) {
    toast(`Parsed ${lines.length} line${lines.length===1?"":"s"}${isAI ? " with AI" : ""}`);
  } else {
    toast(isAI ? "No dialogue found in source" : "No dialogue found — try AI Parse for unusual formats");
  }
}

// ============== SCRIPT PHOTO HANDLING ==============
$("file-script-img").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const dataUrl = await readFileAsDataURL(f);
    let mediaType = f.type;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(mediaType)) mediaType = "image/jpeg";
    scriptPhotos.push({ id: "ph" + Math.random().toString(36).slice(2,8), dataUrl, mediaType });
  }
  e.target.value = "";
  renderScriptThumbs();
});

function readFileAsDataURL(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

function renderScriptThumbs() {
  const c = $("script-img-thumbs");
  c.innerHTML = "";
  scriptPhotos.forEach((ph, idx) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border);background:var(--bg);cursor:pointer;";
    wrap.title = "Click to view this page in the side-by-side viewer";
    const img = document.createElement("img");
    img.src = ph.dataUrl;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;";
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.title = "Remove";
    btn.style.cssText = "position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.75);color:#fff;border:0;border-radius:10px;width:18px;height:18px;cursor:pointer;font-size:14px;padding:0;line-height:18px;font-weight:700;";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      scriptPhotos = scriptPhotos.filter(x => x.id !== ph.id);
      // Clamp viewer index in case the current page was deleted.
      if (state.scriptViewerIndex >= scriptPhotos.length) state.scriptViewerIndex = Math.max(0, scriptPhotos.length - 1);
      renderScriptThumbs();
    });
    // Click the thumb itself to jump to that page in the side-by-side viewer (and open it if closed).
    wrap.addEventListener("click", () => {
      state.scriptViewerIndex = idx;
      if (!state.sideBySide) setSideBySide(true);
      else updateScriptViewer();
    });
    wrap.appendChild(img);
    wrap.appendChild(btn);
    c.appendChild(wrap);
  });
  $("btn-parse-photo").style.display = scriptPhotos.length ? "block" : "none";
  // If the viewer is open, refresh it (handles uploads, deletes, and re-orderings).
  if (state.sideBySide) updateScriptViewer();
}

async function parseScriptPhotos() {
  if (!scriptPhotos.length) throw new Error("No photos uploaded");
  let key = getApiKey();
  if (!key) {
    const k = await appPrompt(
      "Photo parsing requires an Anthropic API key. Stored only in this browser's localStorage on this machine. Format: sk-ant-...",
      "",
      "Anthropic API key required"
    );
    if (!k) throw new Error("No API key provided. Click \"Set Anthropic API key\" to add one.");
    setApiKey(k.trim()); key = k.trim();
  }

  const imageBlocks = scriptPhotos.map(ph => {
    const base64 = ph.dataUrl.split(",")[1];
    return { type: "image", source: { type: "base64", media_type: ph.mediaType, data: base64 }};
  });

  const sys = `You are an expert at reading comic book scripts in any format — typed, scanned, photographed, or handwritten. Extract every spoken line, caption, and sound effect from the supplied image(s) of a script page or pages. Output ONLY a JSON array — no preamble, no markdown fences, no explanation.

Each item:
{
  "who": "<character name in ALL CAPS, or CAPTION, or SFX>",
  "mod": "<one of: '', OFF, OS, CONT, BURST, WHISPER, WEAK, SINGING, THOUGHT, RADIO, ELECTRONIC, TELEPATHIC, TRANSLATED, CAPTION, SFX>",
  "text": "<spoken text exactly as written, preserving punctuation>",
  "panel": <integer panel number this dialogue belongs to, or null if no panel structure>,
  "page": <integer page number, or null>
}

Rules:
- Read the script in proper reading order across the page(s). If multiple images are supplied, treat them as consecutive pages.
- Skip panel descriptions, stage directions, and any prose that is not spoken or in a caption box.
- Combine multi-line dialogue from the same speaker into one "text" field, joined with single spaces.
- TRACK PANEL NUMBERS as you read. Panel headers appear in many forms — recognize all:
  • "PANEL 1", "PANEL 2"
  • "Panel 1" (mixed case)
  • "1 -", "1 –", "1.", "1)" at the start of a description line (Celtx / Final Draft / numbered)
  • "PAGE N" → set page to N, leave panel null until the first panel marker appears
  Every dialogue line MUST carry the panel number that was active when it appeared.
- Map modifier conventions to the canonical Blambot/industry set:
  • (O.S.), (OFF), (OFF-PANEL) → OFF
  • (CONT'D), (CONTINUED) → CONT
  • (yelling), (shouting), all-caps emphasis suggesting yelling, (BURST) → BURST
  • (whispered), (quietly), (WHISPER) → WHISPER
  • (WEAK), (weak voice), (dying), (faint) → WEAK
  • (SINGING), (singing), (sings) → SINGING
  • (thinking), THOUGHT BUBBLE → THOUGHT
  • /E, (RADIO), (COMMS), (over comm) → RADIO
  • (electronic), (robotic) → ELECTRONIC
  • (telepathic), <<text>> (double angle) → TELEPATHIC
  • Blambot foreign-language convention: dialogue in single < and > brackets such as <Hola amigo> → TRANSLATED, AND strip the brackets. Also (in Spanish), (FOREIGN), (TRANSLATED) → TRANSLATED.
- Use "who": "CAPTION" for narrator/caption boxes. Use "who": "SFX" for sound effects.
- If part of the image is hard to read, do your best with the legible portions and skip unreadable fragments rather than inventing content.

Return ONLY the JSON array.`;

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: sys,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: "Extract all dialogue, captions, and sound effects from these script page(s) and return as a JSON array per the schema." }
      ]
    }]
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Anthropic API error " + resp.status + ":\n" + errText.slice(0, 600));
  }
  const json = await resp.json();
  const content = (json.content && json.content[0] && json.content[0].text) || "";

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch (e2) { throw new Error("AI returned non-JSON output:\n" + content.slice(0, 600)); }
    } else {
      throw new Error("AI returned non-JSON output:\n" + content.slice(0, 600));
    }
  }
  if (!Array.isArray(parsed)) throw new Error("AI output was not a JSON array");

  return parsed.map(item => ({
    id: "p" + Math.random().toString(36).slice(2, 8),
    who: ((item.who || "") + "").trim() || "UNKNOWN",
    mod: ((item.mod || "") + "").trim().toUpperCase(),
    text: ((item.text || "") + "").trim(),
    placed: false,
    panel: typeof item.panel === "number" ? item.panel : null,
    page: typeof item.page === "number" ? item.page : null,
  })).filter(item => item.text);
}

// Stateful multi-line regex parser. Handles:
// - "CHARACTER:" alone on a line, dialogue on the following lines until next cue / panel header / blank line
// - "CHARACTER: dialogue" all on one line
// - "CHARACTER (MODIFIER):" with or without same-line dialogue
// - Celtx / Final Draft style: "CHARACTER" alone on a line WITHOUT a colon, dialogue on next lines
// - PANEL N / PAGE N / "1 - description" / "Panel 1" headers as section breaks
// - CAPTION and SFX are their own categories
// - Tracks current panel and page so each parsed line can be tagged with the panel it belongs to,
//   which Smart Place uses to constrain placement to the correct panel of the comic page.
function parseScriptRegex(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let speaker = null, mod = "", buffer = [];
  let currentPanel = null, currentPage = null;

  // Speaker cue with explicit colon: "CHARACTER:" or "CHARACTER (MOD):"
  const cueColon = /^\s*([A-Z][A-Z0-9 _'\.\-]{0,40}?)\s*(?:\(([^)]+)\))?\s*:\s*(.*)$/;
  // Speaker cue without colon (Celtx / Final Draft / user's format): line is just the name + optional mod.
  const cueNoColon = /^\s*([A-Z][A-Z0-9 _'\.\-]{1,40}?)\s*(?:\(([^)]+)\))?\s*$/;
  // Panel headers.
  const panelExplicit = /^\s*panel\s+(\d+)\b/i;        // "PANEL 1"
  const panelDash = /^\s*(\d+)\s*[-–—]\s+\S/;          // "1 - description" (Celtx / user format)
  const pageRe = /^\s*page\s+(\d+)\b/i;                // "PAGE 10"
  const reservedNames = /^(PAGE|PANEL|NOTE|FX|END|FIN|CONT|TBC)$/i;
  // Celtx / screenwriter artifacts to drop.
  const pageNumOnly = /^\s*\d+\s*\.?\s*$/;             // "20.", "10"
  const celtxFooter = /^\s*Created using Celtx\s*$/i;
  const revisionMark = /\s*\*+\s*$/;                   // Celtx revision asterisk at end of line

  function normalize(txt) {
    return txt
      .replace(/^\.{2,}/, "…")        // "....Yes" → "…Yes"
      .replace(/\.{3,}/g, "…")        // internal "..." → "…"
      .replace(/--/g, "—")            // em-dash
      .replace(/\s+/g, " ")
      .trim();
  }

  function flush() {
    if (speaker && buffer.length) {
      let txt = normalize(buffer.join(" "));
      if (txt) {
        let m = mod;
        const transMatch = txt.match(/^<\s*(.+?)\s*>$/);
        if (transMatch && !m) { txt = transMatch[1]; m = "TRANSLATED"; }
        if (speaker === "CAPTION") m = "CAPTION";
        else if (speaker === "SFX") m = "SFX";
        out.push({
          id: "p" + Math.random().toString(36).slice(2, 8),
          who: speaker, mod: m, text: txt, placed: false,
          panel: currentPanel, page: currentPage,
        });
      }
    }
    speaker = null; mod = ""; buffer = [];
  }

  for (const raw of lines) {
    // Strip Celtx trailing revision asterisk, then trim.
    let line = raw.replace(revisionMark, "").trim();

    if (!line) { flush(); continue; }
    if (celtxFooter.test(line)) { flush(); continue; }
    if (pageNumOnly.test(line)) { flush(); continue; }

    let mm = line.match(pageRe);
    if (mm) { flush(); currentPage = parseInt(mm[1], 10); currentPanel = null; continue; }

    mm = line.match(panelExplicit);
    if (mm) { flush(); currentPanel = parseInt(mm[1], 10); continue; }

    if (!speaker) {
      mm = line.match(panelDash);
      if (mm) { flush(); currentPanel = parseInt(mm[1], 10); continue; }
    }

    let m = line.match(cueColon);
    if (m) {
      const name = m[1].trim();
      if (reservedNames.test(name)) { flush(); continue; }
      flush();
      speaker = name;
      mod = (m[2] || "").trim().toUpperCase();
      const same = (m[3] || "").trim();
      if (same) buffer.push(same);
      continue;
    }

    if (!speaker) {
      m = line.match(cueNoColon);
      if (m) {
        const name = m[1].trim();
        if (name.length >= 2 && !reservedNames.test(name)) {
          flush();
          speaker = name;
          mod = (m[2] || "").trim().toUpperCase();
          continue;
        }
      }
    }

    if (speaker) buffer.push(line);
    // Else: panel description — ignored.
  }
  flush();
  return Promise.resolve(out);
}

// ============== AI PARSER ==============
const KEY_STORAGE = "letterer_anthropic_key";
function getApiKey() { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } }
function setApiKey(k) { try { localStorage.setItem(KEY_STORAGE, k); } catch {} }
async function promptForApiKey() {
  const cur = getApiKey();
  const masked = cur ? cur.slice(0, 7) + "…" + cur.slice(-4) : "(none set)";
  const k = await appPrompt(
    `Stored only in this browser's localStorage on this machine. Format: sk-ant-...\n\nCurrently: ${masked}\n\nLeave blank to clear.`,
    cur,
    "Anthropic API key"
  );
  if (k === null) return;
  setApiKey(k.trim());
  toast(k.trim() ? "API key saved locally" : "API key cleared");
}

async function parseScriptAI(text) {
  let key = getApiKey();
  if (!key) {
    const k = await appPrompt(
      "AI Parse requires an Anthropic API key. Stored only in this browser's localStorage on this machine. Format: sk-ant-...",
      "",
      "Anthropic API key required"
    );
    if (!k) throw new Error("No API key provided. Click \"Set Anthropic API key\" to add one.");
    setApiKey(k.trim()); key = k.trim();
  }

  const sys = `You extract spoken dialogue, captions, and sound effects from comic book scripts. The script may use any format. Output ONLY a JSON array — no preamble, no explanation, no markdown fences.

Each item represents one balloon, caption, or SFX, in the order it appears in the script:
{
  "who": "<character name in ALL CAPS, or CAPTION, or SFX>",
  "mod": "<one of: '', OFF, OS, CONT, BURST, WHISPER, WEAK, SINGING, THOUGHT, RADIO, ELECTRONIC, TELEPATHIC, TRANSLATED, CAPTION, SFX>",
  "text": "<the spoken text exactly as written, preserving punctuation>",
  "panel": <integer panel number this dialogue belongs to, or null if no panel structure>,
  "page": <integer page number, or null>
}

Rules:
- Skip panel descriptions and stage directions entirely. Extract only what goes inside a balloon, caption box, or sound effect.
- Combine multi-line dialogue from the same speaker into one "text" field, joined with single spaces.
- TRACK PANEL NUMBERS as you parse. Panel headers come in many forms — recognize all of them:
  • "PANEL 1", "PANEL 2", … (standard comic script)
  • "Panel 1", "Panel 2", … (mixed case)
  • "1 -", "1 –", "1.", "1)" at the start of a description line (Celtx / Final Draft / numbered)
  • "PAGE N" → set page to N, leave panel null until the first panel marker appears
  Every dialogue line you emit MUST carry the panel number that was active when it appeared in the script.
- Map modifier conventions to the canonical Blambot/industry set:
  • (O.S.), (OFF), (OFF-PANEL) → OFF
  • (CONT'D), (CONTINUED) → CONT
  • (yelling), (shouting), --!, (BURST) → BURST
  • (whispered), (quietly), (WHISPER) → WHISPER
  • (WEAK), (weak voice), (dying), (faint) → WEAK
  • (SINGING), (singing), (sings) → SINGING
  • (thinking), THOUGHT BUBBLE → THOUGHT
  • /E, (RADIO), (COMMS), (over comm) → RADIO
  • (electronic), (robotic) → ELECTRONIC
  • (telepathic), <<text>> (double angle) → TELEPATHIC
  • Blambot foreign-language convention: dialogue wrapped in single < and > brackets such as <Hola amigo> → TRANSLATED, AND strip the brackets from the text. Also (in Spanish), (FOREIGN), (TRANSLATED) → TRANSLATED.
- For caption/narrator/voiceover boxes, use "who": "CAPTION" and put any narrator name in mod if needed.
- For sound effects, use "who": "SFX".
- Preserve the original punctuation, ellipses, asterisks, and special characters in the dialogue text.

Return ONLY the JSON array.`;

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    system: sys,
    messages: [{ role: "user", content: text }],
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Anthropic API error " + resp.status + ":\n" + errText.slice(0, 500));
  }
  const json = await resp.json();
  const content = (json.content && json.content[0] && json.content[0].text) || "";

  // Strip optional markdown fence
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) {
    // Attempt to extract first array in the content
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch (e2) { throw new Error("AI returned non-JSON output:\n" + content.slice(0, 600)); }
    } else {
      throw new Error("AI returned non-JSON output:\n" + content.slice(0, 600));
    }
  }
  if (!Array.isArray(parsed)) throw new Error("AI output was not a JSON array");

  return parsed.map(item => ({
    id: "p" + Math.random().toString(36).slice(2, 8),
    who: ((item.who || "") + "").trim() || "UNKNOWN",
    mod: ((item.mod || "") + "").trim().toUpperCase(),
    text: ((item.text || "") + "").trim(),
    placed: false,
    panel: typeof item.panel === "number" ? item.panel : null,
    page: typeof item.page === "number" ? item.page : null,
  })).filter(item => item.text);
}

function renderChips() {
  chipList.innerHTML = "";
  if (!state.parsedLines.length) {
    chipList.innerHTML = '<div style="color:var(--text-dim);font-size:11px;font-style:italic;">No script parsed yet.</div>';
    return;
  }
  for (const ln of state.parsedLines) {
    const el = document.createElement("div");
    el.className = "chip" + (ln.placed ? " placed" : "");
    el.draggable = true;
    el.dataset.lineId = ln.id;
    el.innerHTML = `<div><span class="who">${escapeHtml(ln.who)}</span> ${ln.mod ? `<span class="mod">(${escapeHtml(ln.mod)})</span>` : ""}</div><div class="what">${escapeHtml(ln.text)}</div>`;
    // HTML5 drag-and-drop (desktop / mouse pointer)
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", ln.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    // Touch drag (iOS Safari and other touch devices do not fire drag events). Long-press the chip
    // and drag onto the canvas; a follow-finger ghost shows the active chip.
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const ghost = document.createElement("div");
      ghost.style.cssText = "position:fixed;background:rgba(245,166,35,0.92);color:#1a1d23;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;pointer-events:none;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.45);max-width:240px;line-height:1.3;";
      ghost.textContent = (ln.who ? ln.who + ": " : "") + (ln.text.length > 50 ? ln.text.slice(0, 50) + "…" : ln.text);
      ghost.style.left = (t.clientX + 12) + "px";
      ghost.style.top = (t.clientY + 12) + "px";
      document.body.appendChild(ghost);
      touchDragChipState = { ln, ghost };
      // Close any open mobile sheet so the canvas is reachable as a drop target.
      if (state.mobileMode) closeAllSheets();
    }, { passive: true });
    chipList.appendChild(el);
  }
}

// ============== DROP TARGET ==============
canvasWrap.addEventListener("dragover", (e) => {
  e.preventDefault(); e.dataTransfer.dropEffect = "copy"; dropHint.classList.add("show");
});
canvasWrap.addEventListener("dragleave", (e) => {
  if (e.target === canvasWrap) dropHint.classList.remove("show");
});
// Centralized chip-to-balloon placement, used by both HTML5 drag-drop and touch drag flows.
function placeChipOnCanvas(ln, pt) {
  if (!ln || !state.imageDataUrl) return;
  pushUndo();
  const b = cloneBalloon(ln.text, ln.mod);
  if (ln.who && ln.mod !== "CAPTION" && ln.mod !== "SFX") b.speaker = ln.who;
  // Carry panel and page from the chip onto the balloon. Smart Place reads these to constrain
  // each balloon's placement to the correct panel of the comic page.
  if (typeof ln.panel === "number") b.panel = ln.panel;
  if (typeof ln.page === "number") b.page = ln.page;
  b.cx = pt.x; b.cy = pt.y;
  b.tailX = pt.x; b.tailY = pt.y + 80;
  // Light auto-balance on drop (preserve case; full ALL-CAPS pass is reserved for Auto Format).
  if (b.text) {
    const dropShape = (b.shape || "oval").toLowerCase();
    const dropEllipse = dropShape === "oval" || dropShape === "ellipse" || dropShape === "thought" || dropShape === "whisper" || dropShape === "round" || dropShape === "radio";
    const cleaned = b.text.replace(/\s+/g, " ").trim();
    b.text = dropEllipse
      ? balanceLinesLens(cleaned, b.font, b.size, b.weight || 400, b.italic === "italic")
      : balanceLinesRect(cleaned, b.font, b.size, b.weight || 400, b.italic === "italic");
  }
  fitBalloonToText(b);
  state.balloons.push(b);
  ln.placed = true;
  state.selectedId = b.id;
  renderChips();
  render();
}

canvasWrap.addEventListener("drop", (e) => {
  e.preventDefault(); dropHint.classList.remove("show");
  const lineId = e.dataTransfer.getData("text/plain");
  const ln = state.parsedLines.find(l => l.id === lineId);
  placeChipOnCanvas(ln, clientToImage(e.clientX, e.clientY));
});

// Touch-drag pipeline for chips on iOS / Android / iPadOS. Listeners are document-level and no-op
// while no drag is in progress. They mirror the HTML5 dragmove/drop flow but use Touch events.
document.addEventListener("touchmove", (e) => {
  if (!touchDragChipState) return;
  const t = e.touches[0];
  if (!t) return;
  touchDragChipState.ghost.style.left = (t.clientX + 12) + "px";
  touchDragChipState.ghost.style.top = (t.clientY + 12) + "px";
  e.preventDefault();
}, { passive: false });

document.addEventListener("touchend", (e) => {
  if (!touchDragChipState) return;
  const t = e.changedTouches[0];
  touchDragChipState.ghost.remove();
  if (t && state.imageDataUrl) {
    const target = document.elementFromPoint(t.clientX, t.clientY);
    const onCanvas = target && target.closest && target.closest("#canvas-wrap");
    if (onCanvas) {
      placeChipOnCanvas(touchDragChipState.ln, clientToImage(t.clientX, t.clientY));
    }
  }
  touchDragChipState = null;
});

document.addEventListener("touchcancel", () => {
  if (!touchDragChipState) return;
  touchDragChipState.ghost.remove();
  touchDragChipState = null;
});

function clientToImage(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  return { x: (clientX - rect.left) / state.zoom, y: (clientY - rect.top) / state.zoom };
}

// ============== ADD BALLOON BUTTON ==============
$("btn-add-balloon").addEventListener("click", () => {
  if (!state.imageDataUrl) { toast("Load a page image first"); return; }
  pushUndo();
  const b = cloneBalloon("Type here…");
  state.balloons.push(b);
  state.selectedId = b.id;
  render();
});

// ============== TRACE EXISTING BALLOON ==============
// Allows the user to convert balloons already drawn on the uploaded page into editable
// balloons. Flow: toggle trace mode → drag a rectangle around an existing balloon →
// the rect is OCR'd into a new editable balloon over the same spot, with an optional
// white-out rectangle that hides the original art underneath.
function setTraceMode(on) {
  state.traceMode = !!on;
  const btn = $("btn-trace-balloon");
  if (btn) btn.classList.toggle("active", state.traceMode);
  if (stage) stage.classList.toggle("trace-mode", state.traceMode);
  const hint = $("trace-hint");
  if (hint) hint.style.display = state.traceMode ? "block" : "none";
}

$("btn-trace-balloon").addEventListener("click", () => {
  if (!state.imageDataUrl) { toast("Load a page image first"); return; }
  // Cancel any pending connect-picker mode so the two modal modes don't fight each other.
  if (state.connectPickerSourceId) state.connectPickerSourceId = null;
  setTraceMode(!state.traceMode);
  if (state.traceMode) toast("Drag a rectangle around an existing balloon");
});

// Marquee drag in image coordinates. Uses pointerdown CAPTURE on the stage so balloon
// hit-areas don't swallow the event when trace mode is active.
let traceDrag = null;
let traceMarqueeEl = null;

stage.addEventListener("pointerdown", (e) => {
  if (!state.traceMode) return;
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const p = clientToImage(e.clientX, e.clientY);
  traceDrag = { startX: p.x, startY: p.y, curX: p.x, curY: p.y };
  // Pre-create the marquee rect on the overlay so updates are cheap.
  if (traceMarqueeEl && traceMarqueeEl.parentNode) traceMarqueeEl.parentNode.removeChild(traceMarqueeEl);
  traceMarqueeEl = document.createElementNS(SVG_NS, "rect");
  traceMarqueeEl.setAttribute("fill", "rgba(245,166,35,0.18)");
  traceMarqueeEl.setAttribute("stroke", "#f5a623");
  traceMarqueeEl.setAttribute("stroke-width", Math.max(1, 2 / state.zoom));
  traceMarqueeEl.setAttribute("stroke-dasharray", `${6 / state.zoom} ${4 / state.zoom}`);
  traceMarqueeEl.setAttribute("pointer-events", "none");
  updateTraceMarquee();
  overlay.appendChild(traceMarqueeEl);
}, true);

function updateTraceMarquee() {
  if (!traceDrag || !traceMarqueeEl) return;
  const x = Math.min(traceDrag.startX, traceDrag.curX);
  const y = Math.min(traceDrag.startY, traceDrag.curY);
  const w = Math.abs(traceDrag.curX - traceDrag.startX);
  const h = Math.abs(traceDrag.curY - traceDrag.startY);
  traceMarqueeEl.setAttribute("x", x);
  traceMarqueeEl.setAttribute("y", y);
  traceMarqueeEl.setAttribute("width", w);
  traceMarqueeEl.setAttribute("height", h);
}

window.addEventListener("pointermove", (e) => {
  if (!traceDrag) return;
  const p = clientToImage(e.clientX, e.clientY);
  traceDrag.curX = p.x;
  traceDrag.curY = p.y;
  updateTraceMarquee();
});

window.addEventListener("pointerup", async (e) => {
  if (!traceDrag) return;
  const d = traceDrag;
  traceDrag = null;
  if (traceMarqueeEl && traceMarqueeEl.parentNode) traceMarqueeEl.parentNode.removeChild(traceMarqueeEl);
  traceMarqueeEl = null;

  const x = Math.round(Math.max(0, Math.min(d.startX, d.curX)));
  const y = Math.round(Math.max(0, Math.min(d.startY, d.curY)));
  const w = Math.round(Math.min(state.imageW - x, Math.abs(d.curX - d.startX)));
  const h = Math.round(Math.min(state.imageH - y, Math.abs(d.curY - d.startY)));

  // Ignore stray clicks / tiny rectangles to avoid accidental balloons.
  if (w < 20 || h < 20) return;

  try {
    await traceBalloonFromRect(x, y, w, h);
  } catch (err) {
    console.error(err);
    await appAlert("Trace failed: " + (err && err.message ? err.message : String(err)), "Trace");
  }
});

// Crop the page image to the given image-space rect and return base64 (no data: prefix) + mime.
function cropPageToBase64(x, y, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/png" });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("Could not read page image for cropping"));
    img.src = state.imageDataUrl;
  });
}

async function ocrBalloonRect(base64, mimeType) {
  const resp = await fetch("/api/ocr-balloon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("OCR failed (" + resp.status + "): " + errText.slice(0, 200));
  }
  const data = await resp.json();
  return (data && typeof data.text === "string") ? data.text : "";
}

async function traceBalloonFromRect(x, y, w, h) {
  toast("Reading balloon text…");
  // Push a single undo entry that covers both the new balloon and (optionally) its whiteout mask.
  pushUndo();

  // Build the new balloon centered on the traced rect.
  const b = cloneBalloon(" ");
  b.text = "";
  b.cx = x + w / 2;
  b.cy = y + h / 2;
  // Leave a small inset so the new outline sits just inside the traced area.
  b.rx = Math.max(40, w / 2 - 2);
  b.ry = Math.max(28, h / 2 - 2);
  // Tail points downward from the balloon by default; the user can drag it to the speaker.
  b.tailX = b.cx;
  b.tailY = Math.min(state.imageH, b.cy + b.ry + 60);
  state.balloons.push(b);
  state.selectedId = b.id;
  render();

  // OCR the cropped rect and fill the balloon with the result.
  let ocrText = "";
  try {
    const { base64, mimeType } = await cropPageToBase64(x, y, w, h);
    ocrText = await ocrBalloonRect(base64, mimeType);
  } catch (err) {
    console.error(err);
    toast("Couldn't read text — type it in");
  }
  b.text = (ocrText && ocrText.trim()) || "";
  if (!b.text) {
    b.text = "Type here…";
    toast("No text detected — edit balloon directly");
  } else {
    toast("Text extracted");
  }
  render();
  syncInspector();

  // Ask whether to erase the original balloon underneath.
  const erase = await appModal({
    title: "Erase original?",
    body: "White-out the original balloon underneath this new editable one? This covers the traced rectangle with white in the canvas and the exported PNG.",
    okLabel: "Erase",
    cancelLabel: "Keep original",
  });
  if (erase) {
    state.whiteoutMasks.push({
      id: "wo" + (state.nextId++),
      balloonId: b.id,
      x, y, w, h,
    });
    render();
    toast("Original erased");
  }
}

// Esc exits trace mode just like it exits connect-picker mode.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.traceMode) {
    setTraceMode(false);
    toast("Trace mode off");
  }
});

// ============== CLEAN UP (AI INPAINTING) ==============
// Apple iOS Clean Up-style tool. The user paints over stray marks / old lettering /
// unwanted objects on the page image; we send the page + a binary mask to Lovable AI
// and replace the page image with the AI-reconstructed result.
const cleanup = {
  active: false,
  brush: 40,           // brush radius in image pixels
  strokes: [],         // [{points:[{x,y}], r}]
  current: null,
  history: [],         // prior imageDataUrl values for revert
  busy: false,
};

function setCleanupMode(on) {
  cleanup.active = !!on;
  const btn = $("btn-cleanup");
  if (btn) btn.classList.toggle("active", cleanup.active);
  if (stage) stage.classList.toggle("cleanup-mode", cleanup.active);
  const hint = $("cleanup-hint");
  if (hint) hint.style.display = cleanup.active ? "block" : "none";
  const panel = $("cleanup-panel");
  if (panel) panel.style.display = cleanup.active ? "block" : "none";
  if (!cleanup.active) {
    cleanup.strokes = [];
    cleanup.current = null;
    redrawCleanupOverlay();
  } else {
    // Cancel other modal modes.
    if (state.traceMode) setTraceMode(false);
    if (state.connectPickerSourceId) state.connectPickerSourceId = null;
    updateCleanupRevertBtn();
  }
}

function updateCleanupRevertBtn() {
  const row = $("cleanup-revert-row");
  if (row) row.style.display = cleanup.history.length ? "block" : "none";
}

$("btn-cleanup").addEventListener("click", () => {
  if (!state.imageDataUrl) { toast("Load a page image first"); return; }
  setCleanupMode(!cleanup.active);
});

$("btn-cleanup-cancel").addEventListener("click", () => setCleanupMode(false));
$("btn-cleanup-clear").addEventListener("click", () => {
  cleanup.strokes = [];
  redrawCleanupOverlay();
});
$("btn-cleanup-undo").addEventListener("click", () => {
  cleanup.strokes.pop();
  redrawCleanupOverlay();
});
const brushInput = $("cleanup-brush");
const brushVal = $("cleanup-brush-val");
brushInput.addEventListener("input", () => {
  cleanup.brush = Number(brushInput.value) || 40;
  brushVal.textContent = String(cleanup.brush);
});
cleanup.brush = Number(brushInput.value) || 40;

// SVG overlay group for cleanup strokes (lives in #overlay, cleared on render()).
let cleanupOverlayGroup = null;
function ensureCleanupOverlay() {
  if (cleanupOverlayGroup && cleanupOverlayGroup.parentNode === overlay) return cleanupOverlayGroup;
  cleanupOverlayGroup = document.createElementNS(SVG_NS, "g");
  cleanupOverlayGroup.setAttribute("id", "cleanup-overlay");
  cleanupOverlayGroup.setAttribute("pointer-events", "none");
  overlay.appendChild(cleanupOverlayGroup);
  return cleanupOverlayGroup;
}
function redrawCleanupOverlay() {
  const g = ensureCleanupOverlay();
  while (g.firstChild) g.removeChild(g.firstChild);
  if (!cleanup.active) return;
  const all = cleanup.current ? cleanup.strokes.concat([cleanup.current]) : cleanup.strokes;
  for (const s of all) {
    if (!s.points.length) continue;
    let d = "";
    s.points.forEach((p, i) => { d += (i === 0 ? "M" : "L") + p.x + " " + p.y; });
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(78,161,255,0.55)");
    path.setAttribute("stroke-width", String(s.r * 2));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    g.appendChild(path);
  }
}

stage.addEventListener("pointerdown", (e) => {
  if (!cleanup.active) return;
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const p = clientToImage(e.clientX, e.clientY);
  cleanup.current = { points: [p], r: cleanup.brush };
  try { stage.setPointerCapture(e.pointerId); } catch {}
  redrawCleanupOverlay();
}, true);

stage.addEventListener("pointermove", (e) => {
  if (!cleanup.active || !cleanup.current) return;
  const p = clientToImage(e.clientX, e.clientY);
  const last = cleanup.current.points[cleanup.current.points.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1) {
    cleanup.current.points.push(p);
    redrawCleanupOverlay();
  }
}, true);

window.addEventListener("pointerup", () => {
  if (!cleanup.active || !cleanup.current) return;
  if (cleanup.current.points.length) cleanup.strokes.push(cleanup.current);
  cleanup.current = null;
  redrawCleanupOverlay();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cleanup.active) {
    setCleanupMode(false);
    toast("Clean Up cancelled");
  }
});

function buildCleanupMaskDataUrl() {
  // White on black PNG, image resolution. White = erase.
  const c = document.createElement("canvas");
  c.width = state.imageW; c.height = state.imageH;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of cleanup.strokes) {
    if (!s.points.length) continue;
    ctx.lineWidth = s.r * 2;
    ctx.beginPath();
    s.points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.stroke();
    // also dot endpoints so single-tap erases something
    for (const p of s.points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c.toDataURL("image/png");
}

$("btn-cleanup-apply").addEventListener("click", async () => {
  if (cleanup.busy) return;
  if (!cleanup.strokes.length) { toast("Paint over something to clean up first"); return; }
  if (!state.imageDataUrl) { toast("No page image"); return; }
  cleanup.busy = true;
  const busy = $("cleanup-busy");
  if (busy) busy.style.display = "flex";
  const applyBtn = $("btn-cleanup-apply");
  if (applyBtn) applyBtn.disabled = true;
  try {
    const maskDataUrl = buildCleanupMaskDataUrl();
    const resp = await fetch("/api/cleanup-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: state.imageDataUrl, maskDataUrl }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      if (resp.status === 429) throw new Error("Rate limited — please try again in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage to keep using Clean Up.");
      throw new Error(err.slice(0, 240) || ("HTTP " + resp.status));
    }
    const data = await resp.json();
    if (!data.imageDataUrl) throw new Error("AI did not return an image");
    // Push the prior image onto the revert stack and swap in the cleaned one.
    cleanup.history.push(state.imageDataUrl);
    state.imageDataUrl = data.imageDataUrl;
    // Reload into the <img> so canvas size stays in sync if dimensions differ.
    await new Promise((res) => {
      pageImg.onload = () => res();
      pageImg.src = state.imageDataUrl;
    });
    state.imageW = pageImg.naturalWidth;
    state.imageH = pageImg.naturalHeight;
    overlay.setAttribute("viewBox", `0 0 ${state.imageW} ${state.imageH}`);
    overlay.setAttribute("width", state.imageW);
    overlay.setAttribute("height", state.imageH);
    pageImg.style.width = state.imageW + "px";
    pageImg.style.height = state.imageH + "px";
    stage.style.width = state.imageW + "px";
    stage.style.height = state.imageH + "px";
    cleanup.strokes = [];
    redrawCleanupOverlay();
    render();
    updateCleanupRevertBtn();
    toast("Clean Up applied");
  } catch (err) {
    console.error(err);
    await appAlert((err && err.message) || String(err), "Clean Up failed");
  } finally {
    cleanup.busy = false;
    if (busy) busy.style.display = "none";
    if (applyBtn) applyBtn.disabled = false;
  }
});

$("btn-cleanup-revert").addEventListener("click", async () => {
  if (!cleanup.history.length) return;
  const prev = cleanup.history.pop();
  state.imageDataUrl = prev;
  await new Promise((res) => {
    pageImg.onload = () => res();
    pageImg.src = prev;
  });
  state.imageW = pageImg.naturalWidth;
  state.imageH = pageImg.naturalHeight;
  overlay.setAttribute("viewBox", `0 0 ${state.imageW} ${state.imageH}`);
  pageImg.style.width = state.imageW + "px";
  pageImg.style.height = state.imageH + "px";
  stage.style.width = state.imageW + "px";
  stage.style.height = state.imageH + "px";
  render();
  updateCleanupRevertBtn();
  toast("Clean Up reverted");
});



// ============== RENDER ==============
// Render a balloon's tail into the given parent SVG node. Used both inside per-balloon groups and during the
// linked-pair pre-pass (where tails must be drawn before the joined body fills cover them).
function renderTailFor(b, parent) {
  if (!b.tail) return;
  if (b.tailStyle === "bubbles") {
    const dx = b.tailX - b.cx, dy = b.tailY - b.cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const startX = b.cx + ux * (b.rx + 4);
    const startY = b.cy + uy * (b.ry + 4);
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4;
      const px = startX + (b.tailX - startX) * t;
      const py = startY + (b.tailY - startY) * t;
      const r = 4 + (1 - t) * 4;
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", px); c.setAttribute("cy", py); c.setAttribute("r", r);
      c.setAttribute("fill", b.fill); c.setAttribute("stroke", b.stroke); c.setAttribute("stroke-width", b.strokeW);
      parent.appendChild(c);
    }
  } else if (b.tailStyle === "offpanel") {
    // Long, curving tail that gently sweeps out toward an unseen speaker (Fig. 5.1 "Off-Panel Tail").
    const tail = makeOffPanelTailPath(b);
    const tp = document.createElementNS(SVG_NS, "path");
    tp.setAttribute("d", tail);
    tp.setAttribute("fill", b.fill);
    tp.setAttribute("stroke", b.stroke);
    tp.setAttribute("stroke-width", b.strokeW);
    tp.setAttribute("stroke-linejoin", "round");
    tp.setAttribute("stroke-linecap", "round");
    parent.appendChild(tp);
  } else {
    const tail = makeTailPath(b);
    const tp = document.createElementNS(SVG_NS, "path");
    tp.setAttribute("d", tail);
    tp.setAttribute("fill", b.fill);
    tp.setAttribute("stroke", b.stroke);
    tp.setAttribute("stroke-width", b.strokeW);
    tp.setAttribute("stroke-linejoin", "round");
    parent.appendChild(tp);
  }
}

// Build a mask that is white (visible) everywhere EXCEPT inside `other`'s body shape, which is black (hidden).
// Used so that one linked balloon's stroke does not draw inside its partner's silhouette — producing a clean
// peanut/dumbbell outline without having to compute ellipse-ellipse union paths.
function makeNotMask(id, other) {
  const m = document.createElementNS(SVG_NS, "mask");
  m.setAttribute("id", id);
  m.setAttribute("maskUnits", "userSpaceOnUse");
  m.setAttribute("maskContentUnits", "userSpaceOnUse");
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", -10000);
  rect.setAttribute("y", -10000);
  rect.setAttribute("width", 20000);
  rect.setAttribute("height", 20000);
  rect.setAttribute("fill", "white");
  m.appendChild(rect);
  const e = makeBodyShape(other);
  e.setAttribute("fill", "black");
  e.setAttribute("stroke", "none");
  m.appendChild(e);
  return m;
}

function render() {
  // Clear overlay
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

  // Defs container for masks (created once per render)
  const defs = document.createElementNS(SVG_NS, "defs");
  overlay.appendChild(defs);

  // ---- Whiteout masks (Trace Existing Balloon) ----
  // Rendered FIRST so they sit underneath every balloon, tail, and connector — but on top
  // of the page <img>. Each mask is a solid white rectangle covering the original on-page
  // balloon the user chose to erase. Included in PNG export because the export clones the
  // whole overlay SVG.
  if (state.whiteoutMasks && state.whiteoutMasks.length) {
    for (const m of state.whiteoutMasks) {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", m.x);
      r.setAttribute("y", m.y);
      r.setAttribute("width", m.w);
      r.setAttribute("height", m.h);
      r.setAttribute("fill", "#ffffff");
      r.setAttribute("stroke", "none");
      r.setAttribute("data-whiteout", m.id);
      overlay.appendChild(r);
    }
  }


  // ---- First pass: render linked pairs as joined shapes ----
  // For each linked pair, draw both tails (behind), both fills (no stroke), and both strokes
  // with masks so each balloon's stroke does not intrude into its partner's silhouette.
  const renderedPairs = new Set();
  for (const b of state.balloons) {
    if (b.linkedTo && !renderedPairs.has(b.id)) {
      const partner = state.balloons.find(x => x.id === b.linkedTo);
      if (partner) {
        renderTailFor(b, overlay);
        renderTailFor(partner, overlay);
        const maskA = `mask-${b.id}-not-${partner.id}`;
        const maskB = `mask-${partner.id}-not-${b.id}`;
        defs.appendChild(makeNotMask(maskA, partner));
        defs.appendChild(makeNotMask(maskB, b));
        const fA = makeBodyShape(b); fA.setAttribute("stroke", "none"); overlay.appendChild(fA);
        const fB = makeBodyShape(partner); fB.setAttribute("stroke", "none"); overlay.appendChild(fB);
        if (b.strokeW > 0) {
          const sA = makeBodyShape(b);
          sA.setAttribute("fill", "none");
          sA.setAttribute("mask", `url(#${maskA})`);
          overlay.appendChild(sA);
        }
        if (partner.strokeW > 0) {
          const sB = makeBodyShape(partner);
          sB.setAttribute("fill", "none");
          sB.setAttribute("mask", `url(#${maskB})`);
          overlay.appendChild(sB);
        }
        renderedPairs.add(b.id);
        renderedPairs.add(partner.id);
      }
    }
  }

  // ---- 1.5 pass: render connector tubes (Blambot "Balloon Connector" — Fig. 5.1) ----
  // Each balloon may set connectedTo: <otherId>. Draw one tube per pair, behind the bodies.
  // When `connectorSeamless` is on (default), draw only tube FILL here; a top-pass overdraw +
  // side strokes are applied AFTER the bodies so the join reads as one continuous shape with
  // no visible chord/seam line where the tube meets each balloon.
  const renderedConnectors = new Set();
  const seamlessConnectors = []; // [{owner, geom}]
  for (const b of state.balloons) {
    if (b.connectedTo && !renderedConnectors.has(b.id)) {
      const partner = state.balloons.find(x => x.id === b.connectedTo);
      if (!partner) continue;
      const connKey = [b.id, partner.id].sort().join("-");
      if (renderedConnectors.has(connKey)) continue;
      renderedConnectors.add(connKey);
      const tube = makeConnectorTubePath(b, partner);
      if (!tube) continue;
      const { owner } = getConnectorOwner(b, partner);
      const seamless = owner.connectorSeamless !== false; // default ON
      const fill = document.createElementNS(SVG_NS, "path");
      fill.setAttribute("d", tube);
      fill.setAttribute("fill", owner.fill);
      if (seamless) {
        fill.setAttribute("stroke", "none");
        seamlessConnectors.push({ owner, geom: connectorGeometry(b, partner), tubeD: tube });
      } else {
        fill.setAttribute("stroke", owner.stroke);
        fill.setAttribute("stroke-width", owner.strokeW);
        fill.setAttribute("stroke-linejoin", "round");
      }
      overlay.appendChild(fill);
    }
  }


  // ---- Second pass: per-balloon groups (tail + body for unlinked, hit-area + text for all) ----
  for (const b of state.balloons) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-id", b.id);

    if (!b.linkedTo) {
      // Unlinked balloon rendering. Three cases, all aimed at producing a seamless professional outline:
      //   (a) ellipse + point tail → single unified SVG path traces body and tail as one continuous outline
      //   (b) cloud/burst/rect + point tail → mask the body's stroke inside the tail polygon so the
      //       internal seam where the tail attaches is hidden, while the body's perimeter remains visible
      //   (c) anything with bubbles tail or no tail → original separate rendering (no seam to hide)
      if (b.tail && b.tailStyle === "point" && b.shape === "ellipse" && b.outline !== "dashed" && !b.organic) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", makeUnifiedEllipsePath(b));
        path.setAttribute("fill", b.fill);
        path.setAttribute("stroke", b.stroke);
        path.setAttribute("stroke-width", b.strokeW);
        path.setAttribute("stroke-linejoin", "round");
        path.classList.add("balloon-body");
        path.setAttribute("data-id", b.id);
        path.addEventListener("pointerdown", (e) => onBalloonPointerDown(e, b));
        g.appendChild(path);
      } else if (b.tail && b.tailStyle === "point" && (b.shape === "cloud" || b.shape === "burst" || b.shape === "rect")) {
        const tailPathStr = makeTailPath(b);
        // Tail (fill + stroke) drawn first.
        const tp = document.createElementNS(SVG_NS, "path");
        tp.setAttribute("d", tailPathStr);
        tp.setAttribute("fill", b.fill);
        tp.setAttribute("stroke", b.stroke);
        tp.setAttribute("stroke-width", b.strokeW);
        tp.setAttribute("stroke-linejoin", "round");
        g.appendChild(tp);
        // Body fill (no stroke) covers tail's stroke that fell inside the body.
        const bodyFill = makeBodyShape(b);
        bodyFill.setAttribute("stroke", "none");
        g.appendChild(bodyFill);
        // Body stroke, masked so it does not draw inside the tail polygon (the seam region).
        if (b.strokeW > 0) {
          const maskId = `mask-tailcut-${b.id}`;
          const mask = document.createElementNS(SVG_NS, "mask");
          mask.setAttribute("id", maskId);
          mask.setAttribute("maskUnits", "userSpaceOnUse");
          mask.setAttribute("maskContentUnits", "userSpaceOnUse");
          const rect = document.createElementNS(SVG_NS, "rect");
          rect.setAttribute("x", -10000); rect.setAttribute("y", -10000);
          rect.setAttribute("width", 20000); rect.setAttribute("height", 20000);
          rect.setAttribute("fill", "white");
          mask.appendChild(rect);
          const tailMask = document.createElementNS(SVG_NS, "path");
          tailMask.setAttribute("d", tailPathStr);
          tailMask.setAttribute("fill", "black");
          tailMask.setAttribute("stroke", "black");
          // Slightly oversize the masked region so the body stroke at the boundary is fully covered.
          tailMask.setAttribute("stroke-width", Math.max(b.strokeW * 2, 4));
          mask.appendChild(tailMask);
          defs.appendChild(mask);
          const bodyStroke = makeBodyShape(b);
          bodyStroke.setAttribute("fill", "none");
          bodyStroke.setAttribute("mask", `url(#${maskId})`);
          g.appendChild(bodyStroke);
        }
        // Transparent hit area covering the body so clicks select this balloon.
        const hit = makeBodyShape(b);
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute("pointer-events", "all");
        hit.classList.add("balloon-body");
        hit.setAttribute("data-id", b.id);
        hit.addEventListener("pointerdown", (e) => onBalloonPointerDown(e, b));
        g.appendChild(hit);
      } else {
        renderTailFor(b, g);
        const body = makeBodyShape(b);
        body.classList.add("balloon-body");
        body.setAttribute("data-id", b.id);
        body.addEventListener("pointerdown", (e) => onBalloonPointerDown(e, b));
        g.appendChild(body);
      }
    } else {
      // Linked balloon: body and tail were rendered in the first pass; just add a transparent hit area
      // here so the user can click and drag this lobe.
      const hit = makeBodyShape(b);
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("pointer-events", "all");
      hit.classList.add("balloon-body");
      hit.setAttribute("data-id", b.id);
      hit.addEventListener("pointerdown", (e) => onBalloonPointerDown(e, b));
      g.appendChild(hit);
    }

    // Text via foreignObject (per-balloon, including each lobe of a linked pair)
    const fo = document.createElementNS(SVG_NS, "foreignObject");
    // Mirror the export's oval-curve fitting so on-canvas text can't overflow the
    // outline. For ovals the editable box is the rectangle inscribed in the
    // ellipse (half-axes rx/√2, ry/√2), shrunk by the same edge inset the export
    // uses. For rect-like shapes a simple padded box is enough.
    const shapeName = (b.shape || "oval").toLowerCase();
    const isOvalShape = shapeName === "oval" || shapeName === "ellipse" || shapeName === "thought"
      || shapeName === "whisper" || shapeName === "round" || shapeName === "radio"
      || shapeName === "cloud" || shapeName === "burst";
    const edgeInsetPv = getEffectiveInset(b);
    // Use the SAME layout solver the export uses so the preview matches the
    // rasterized result exactly: the font auto-shrinks to fit and the text box
    // tracks the oval's curve-based safe area (instead of a tiny inscribed
    // rectangle, which left huge whitespace and clipped text when shrunk).
    const layoutPv = computeBalloonTextLayout(b);
    let w, h;
    if (isOvalShape) {
      // Width tracks the chord available at the computed line count (so text
      // fills the oval), height is the full vertical safe area.
      w = Math.max(8, layoutPv.maxWidthAllowed);
      h = Math.max(8, b.ry * 2 * (1 - edgeInsetPv));
    } else {
      const padX = 14, padY = 8;
      w = Math.max(8, b.rx * 2 - padX * 2);
      h = Math.max(8, b.ry * 2 - padY * 2);
    }
    fo.setAttribute("x", b.cx - w / 2);
    fo.setAttribute("y", b.cy - h / 2);
    fo.setAttribute("width", w);
    fo.setAttribute("height", h);
    const div = document.createElement("div");
    div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    div.className = "balloon-text";
    div.contentEditable = "true";
    div.style.width = w + "px";
    div.style.height = h + "px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.fontFamily = b.font;
    div.style.fontSize = layoutPv.fontSize + "px";
    div.style.fontWeight = b.weight;
    div.style.fontStyle = b.italic;
    div.style.letterSpacing = (b.tracking || 0) + "px";
    div.style.color = b.textColor;
    div.style.textAlign = "center";
    div.style.overflow = "hidden";
    div.style.wordBreak = "break-word";
    div.innerText = b.text;
    div.addEventListener("input", () => {
      b.text = div.innerText;
      if (state.selectedId === b.id) $("i-text").value = b.text;
    });
    div.addEventListener("focus", () => { selectBalloon(b.id); });
    fo.appendChild(div);
    g.appendChild(fo);

    overlay.appendChild(g);

    if (state.selectedId === b.id) {
      drawSelectionChrome(b);
    }
  }

  // ---- Seamless connector overdraw ----
  // For each seamless connector pair, paint the tube polygon (fill only, no stroke) ON TOP of
  // the balloons to hide the segment of each balloon's outline that crosses the tube opening.
  // Then stroke only the two side curves of the tube (omitting the chord at each end), so the
  // tube reads as continuous with each balloon's outline rather than a separate shape with a
  // seam line. Mirrors how unclicking "Organic" removes the seam between tail and body.
  for (const sc of seamlessConnectors) {
    const o = sc.owner;
    // 1) Overdraw fill — hides the body stroke that crosses the tube mouth on each side.
    const cover = document.createElementNS(SVG_NS, "path");
    cover.setAttribute("d", sc.tubeD);
    cover.setAttribute("fill", o.fill);
    cover.setAttribute("stroke", "none");
    cover.setAttribute("pointer-events", "none");
    overlay.appendChild(cover);
    // 2) Stroke only the two curved sides of the tube — no chord across either balloon end.
    if (o.strokeW > 0) {
      const g = sc.geom;
      const halfW = g.width / 2;
      const a1 = { x: g.eOwner.x + g.nx * halfW, y: g.eOwner.y + g.ny * halfW };
      const a2 = { x: g.eOwner.x - g.nx * halfW, y: g.eOwner.y - g.ny * halfW };
      const c1 = { x: g.ePartner.x + g.nx * halfW, y: g.ePartner.y + g.ny * halfW };
      const c2 = { x: g.ePartner.x - g.nx * halfW, y: g.ePartner.y - g.ny * halfW };
      const cp1 = { x: g.midCenter.x + g.nx * halfW, y: g.midCenter.y + g.ny * halfW };
      const cp2 = { x: g.midCenter.x - g.nx * halfW, y: g.midCenter.y - g.ny * halfW };
      const sideA = `M ${a1.x.toFixed(2)} ${a1.y.toFixed(2)} Q ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}`;
      const sideB = `M ${a2.x.toFixed(2)} ${a2.y.toFixed(2)} Q ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}`;
      for (const d of [sideA, sideB]) {
        const s = document.createElementNS(SVG_NS, "path");
        s.setAttribute("d", d);
        s.setAttribute("fill", "none");
        s.setAttribute("stroke", o.stroke);
        s.setAttribute("stroke-width", o.strokeW);
        s.setAttribute("stroke-linecap", "round");
        s.setAttribute("pointer-events", "none");
        overlay.appendChild(s);
      }
    }
  }

  // ---- Connect-mode highlights ----
  // When the user has armed a balloon as the connect source, ring the source in a solid color
  // and ring every other balloon with a pulsing dashed outline so it's obvious which balloons
  // are valid click targets for completing the connection.
  if (state.connectPickerSourceId) {
    for (const b of state.balloons) {
      const isSrc = b.id === state.connectPickerSourceId;
      const pad = Math.max(6, (b.strokeW || 1) * 2 + 4);
      const ring = document.createElementNS(SVG_NS, "ellipse");
      ring.setAttribute("cx", b.cx);
      ring.setAttribute("cy", b.cy);
      ring.setAttribute("rx", b.rx + pad);
      ring.setAttribute("ry", b.ry + pad);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", isSrc ? "#22c55e" : "#38bdf8");
      ring.setAttribute("stroke-width", isSrc ? 3 : 2.5);
      if (!isSrc) ring.setAttribute("stroke-dasharray", "8 5");
      ring.setAttribute("class", isSrc ? "conn-pick-source" : "conn-pick-target");
      ring.setAttribute("pointer-events", "none");
      overlay.appendChild(ring);
    }
  }

  // Klein-style overlays (crossings always; trail/badges if toggled on) drawn last so they sit on top.
  renderReadingOrderOverlay();

  syncInspector();
}

function makeBodyShape(b) {
  let el;
  if (b.shape === "rect") {
    el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("x", b.cx - b.rx);
    el.setAttribute("y", b.cy - b.ry);
    el.setAttribute("width", b.rx * 2);
    el.setAttribute("height", b.ry * 2);
    el.setAttribute("rx", Math.min(b.rx, b.ry) * 0.18);
    el.setAttribute("ry", Math.min(b.rx, b.ry) * 0.18);
    el.setAttribute("fill", b.fill); el.setAttribute("stroke", b.stroke); el.setAttribute("stroke-width", b.strokeW);
  } else if (b.shape === "cloud") {
    el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", makeCloudPath(b.cx, b.cy, b.rx, b.ry));
    el.setAttribute("fill", b.fill); el.setAttribute("stroke", b.stroke); el.setAttribute("stroke-width", b.strokeW);
  } else if (b.shape === "burst") {
    el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", makeBurstPath(b.cx, b.cy, b.rx, b.ry));
    el.setAttribute("fill", b.fill); el.setAttribute("stroke", b.stroke); el.setAttribute("stroke-width", b.strokeW);
    el.setAttribute("stroke-linejoin", "miter");
  } else if (b.organic) {
    // Blambot #019 "Organic vs Symmetrical Balloons": replace the perfect ellipse with a closed
    // cubic-bezier ring whose anchors are perturbed deterministically per balloon id.
    el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", makeOrganicEllipsePath(b));
    el.setAttribute("fill", b.fill); el.setAttribute("stroke", b.stroke); el.setAttribute("stroke-width", b.strokeW);
    el.setAttribute("stroke-linejoin", "round");
  } else {
    el = document.createElementNS(SVG_NS, "ellipse");
    el.setAttribute("cx", b.cx); el.setAttribute("cy", b.cy);
    el.setAttribute("rx", b.rx); el.setAttribute("ry", b.ry);
    el.setAttribute("fill", b.fill); el.setAttribute("stroke", b.stroke); el.setAttribute("stroke-width", b.strokeW);
  }
  // Dashed outline (whisper / radio / sotto-voce). Length scales with stroke so it reads at any size.
  if (b.outline === "dashed" && b.strokeW > 0) {
    const dash = Math.max(4, b.strokeW * 3);
    const gap = Math.max(3, b.strokeW * 2);
    el.setAttribute("stroke-dasharray", `${dash} ${gap}`);
  }
  return el;
}

// Deterministic pseudo-random in [-1,1] from a string id + integer index. Stable across renders so
// "organic" balloons don't jitter while the user edits them.
function seedRand(id, i) {
  let h = 2166136261 >>> 0;
  const s = id + "|" + i;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}

// Closed cubic-bezier ring around an ellipse with small per-anchor perturbations. 8 anchors gives
// a smooth result; amplitude ~3% of rx so the irregularity stays "subtle" per Blambot's guidance.
function makeOrganicEllipsePath(b) {
  const N = 8;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const jr = 1 + seedRand(b.id, i) * 0.03;
    pts.push({
      x: b.cx + Math.cos(a) * b.rx * jr,
      y: b.cy + Math.sin(a) * b.ry * jr,
      a,
    });
  }
  // Catmull-Rom → Bezier for a closed loop.
  const out = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    if (i === 0) out.push(`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    out.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  out.push("Z");
  return out.join(" ");
}

function makeCloudPath(cx, cy, rx, ry) {
  // a series of arcs around an ellipse approximation
  const bumps = 14;
  const path = [];
  for (let i = 0; i < bumps; i++) {
    const a0 = (i / bumps) * Math.PI * 2;
    const a1 = ((i + 1) / bumps) * Math.PI * 2;
    const r0x = cx + Math.cos(a0) * rx, r0y = cy + Math.sin(a0) * ry;
    const r1x = cx + Math.cos(a1) * rx, r1y = cy + Math.sin(a1) * ry;
    if (i === 0) path.push(`M ${r0x.toFixed(2)} ${r0y.toFixed(2)}`);
    const mx = (r0x + r1x) / 2, my = (r0y + r1y) / 2;
    const dx = r1x - r0x, dy = r1y - r0y; const d = Math.hypot(dx, dy);
    const nx = -dy / d, ny = dx / d;
    const bump = d * 0.5;
    const cxp = mx + nx * bump, cyp = my + ny * bump;
    path.push(`Q ${cxp.toFixed(2)} ${cyp.toFixed(2)} ${r1x.toFixed(2)} ${r1y.toFixed(2)}`);
  }
  path.push("Z");
  return path.join(" ");
}

function makeBurstPath(cx, cy, rx, ry) {
  const spikes = 18;
  const path = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.78;
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r;
    path.push((i === 0 ? "M " : "L ") + x.toFixed(2) + " " + y.toFixed(2));
  }
  path.push("Z");
  return path.join(" ");
}

// Approximate edge point of a balloon's body along the ray from center toward (tx,ty).
// Used by the connector tube to find where the tube should attach to each balloon.
function balloonEdgePoint(b, tx, ty) {
  const dx = tx - b.cx, dy = ty - b.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (b.shape === "rect") {
    // intersect ray with axis-aligned rect
    const sx = ux !== 0 ? b.rx / Math.abs(ux) : Infinity;
    const sy = uy !== 0 ? b.ry / Math.abs(uy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: b.cx + ux * s, y: b.cy + uy * s };
  }
  // ellipse / cloud / burst — use parametric ellipse approximation along the ray angle
  const ang = Math.atan2(uy, ux);
  return ellipsePoint(b.cx, b.cy, b.rx, b.ry, ang);
}

// Resolve the "owner" balloon of a connector pair — the one whose properties
// store the per-connector overrides (width, curve, attach angles). We pick the
// balloon with the lexicographically smaller id so the choice is deterministic
// regardless of which balloon the user selected first.
function getConnectorOwner(a, c) {
  return (a.id < c.id) ? { owner: a, partner: c } : { owner: c, partner: a };
}

// Full geometry of a connector — endpoints, midpoints, perpendicular vector,
// width, curve. Used by both path rendering and the drag handles.
function connectorGeometry(a, c) {
  const { owner, partner } = getConnectorOwner(a, c);
  const defOwnerAng = Math.atan2(partner.cy - owner.cy, partner.cx - owner.cx);
  const defPartnerAng = Math.atan2(owner.cy - partner.cy, owner.cx - partner.cx);
  const ownerAng = (typeof owner.connectorAngleOwner === "number") ? owner.connectorAngleOwner : defOwnerAng;
  const partnerAng = (typeof owner.connectorAnglePartner === "number") ? owner.connectorAnglePartner : defPartnerAng;
  const eOwner = ellipsePoint(owner.cx, owner.cy, owner.rx, owner.ry, ownerAng);
  const ePartner = ellipsePoint(partner.cx, partner.cy, partner.rx, partner.ry, partnerAng);
  const dx = ePartner.x - eOwner.x, dy = ePartner.y - eOwner.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const width = Math.max(4, owner.connectorW || 10);
  const curve = (typeof owner.connectorCurve === "number") ? owner.connectorCurve : 0;
  const midAxis = { x: (eOwner.x + ePartner.x) / 2, y: (eOwner.y + ePartner.y) / 2 };
  const midCenter = { x: midAxis.x + nx * curve, y: midAxis.y + ny * curve };
  return { owner, partner, eOwner, ePartner, ux, uy, nx, ny, len, width, curve, midAxis, midCenter, ownerAng, partnerAng };
}

function makeConnectorTubePath(a, c) {
  const g = connectorGeometry(a, c);
  if (g.len < 4) return null;
  const halfW = g.width / 2;
  const a1 = { x: g.eOwner.x + g.nx * halfW, y: g.eOwner.y + g.ny * halfW };
  const a2 = { x: g.eOwner.x - g.nx * halfW, y: g.eOwner.y - g.ny * halfW };
  const c1 = { x: g.ePartner.x + g.nx * halfW, y: g.ePartner.y + g.ny * halfW };
  const c2 = { x: g.ePartner.x - g.nx * halfW, y: g.ePartner.y - g.ny * halfW };
  const cp1 = { x: g.midCenter.x + g.nx * halfW, y: g.midCenter.y + g.ny * halfW };
  const cp2 = { x: g.midCenter.x - g.nx * halfW, y: g.midCenter.y - g.ny * halfW };
  return [
    `M ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`,
    `Q ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}`,
    `L ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}`,
    `Q ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${a2.x.toFixed(2)} ${a2.y.toFixed(2)}`,
    `Z`,
  ].join(" ");
}

function makeTailPath(b) {
  // Triangle from balloon edge to tail tip — with Blambot rule #006 "no needlepoint" guard:
  // the tip retains a small but non-zero half-width so the two sides of the tail never collapse
  // into a single hair-line in the printed art.
  const dx = b.tailX - b.cx, dy = b.tailY - b.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const halfArc = Math.min(0.5, b.tailW / Math.max(b.rx, 30));
  const a1 = ang - halfArc, a2 = ang + halfArc;
  const p1 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a1);
  const p2 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a2);
  // Tip half-width: a minimum based on stroke so the two edges stay separated visibly.
  const tipHalf = Math.max(0.8, (b.strokeW || 1) * 0.7);
  const px = -Math.sin(ang) * tipHalf, py = Math.cos(ang) * tipHalf;
  const t1 = { x: b.tailX + px, y: b.tailY + py };
  const t2 = { x: b.tailX - px, y: b.tailY - py };
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
         `L ${t1.x.toFixed(2)} ${t1.y.toFixed(2)} ` +
         `L ${t2.x.toFixed(2)} ${t2.y.toFixed(2)} ` +
         `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}

// Long, curving tail for an off-panel speaker (Fig. 5.1). Cubic bezier with one perpendicular
// control point, so the tail sweeps gracefully out toward the unseen speaker.
function makeOffPanelTailPath(b) {
  const dx = b.tailX - b.cx, dy = b.tailY - b.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const halfArc = Math.min(0.4, b.tailW / Math.max(b.rx, 30));
  const a1 = ang - halfArc, a2 = ang + halfArc;
  const p1 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a1);
  const p2 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a2);
  const tipHalf = Math.max(1.2, (b.strokeW || 1) * 0.9);
  const px = -Math.sin(ang) * tipHalf, py = Math.cos(ang) * tipHalf;
  const t1 = { x: b.tailX + px, y: b.tailY + py };
  const t2 = { x: b.tailX - px, y: b.tailY - py };
  // Perpendicular sweep amount — proportional to tail length, capped so it stays graceful.
  const sweep = Math.min(80, dist * 0.35);
  const sx = -Math.sin(ang) * sweep, sy = Math.cos(ang) * sweep;
  // Control points on each side push outward perpendicular at ~60% of the path.
  const cp1 = { x: p1.x + (b.tailX - p1.x) * 0.6 + sx * 0.4, y: p1.y + (b.tailY - p1.y) * 0.6 + sy * 0.4 };
  const cp2 = { x: p2.x + (b.tailX - p2.x) * 0.6 - sx * 0.4, y: p2.y + (b.tailY - p2.y) * 0.6 - sy * 0.4 };
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
         `Q ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${t1.x.toFixed(2)} ${t1.y.toFixed(2)} ` +
         `L ${t2.x.toFixed(2)} ${t2.y.toFixed(2)} ` +
         `Q ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}

// Build a single SVG path that traces the union outline of an ellipse balloon and its point-style tail —
// no internal seam where the tail meets the body. Used in place of separate body+tail rendering for the
// ellipse + point-tail case so the result matches professional comic lettering.
function makeUnifiedEllipsePath(b) {
  const dx = b.tailX - b.cx, dy = b.tailY - b.cy;
  const ang = Math.atan2(dy, dx);
  const halfArc = Math.min(0.5, b.tailW / Math.max(b.rx, 30));
  const a1 = ang - halfArc;
  const a2 = ang + halfArc;
  const p1 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a1);
  const p2 = ellipsePoint(b.cx, b.cy, b.rx, b.ry, a2);
  // Path: start at tail tip, line to first anchor on the ellipse, arc the LONG way (around the back of
  // the ellipse) to the second anchor, then close back to the tail tip. large-arc-flag=1 selects the
  // longer of the two possible arcs; sweep-flag=0 traces counter-clockwise so the closed path winds
  // consistently and fills correctly under the default non-zero winding rule.
  return `M ${b.tailX.toFixed(2)} ${b.tailY.toFixed(2)} ` +
         `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
         `A ${b.rx.toFixed(2)} ${b.ry.toFixed(2)} 0 1 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} ` +
         `Z`;
}
// True if line segments (p1,p2) and (p3,p4) cross. Used by the Klein-style crossing-tail detector
// to flag tails that visually intersect, which Klein's guide explicitly says to avoid.
function segmentsIntersect(p1, p2, p3, p4) {
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Render Klein-style overlays: crossing-tail warnings (always on), plus optional reading-order
// numbered badges and dotted trail when state.showTrail is true.
function renderReadingOrderOverlay() {
  // 1. Detect tail crossings between every pair of point-tailed balloons.
  const tailed = state.balloons.filter(b => b.tail && b.tailStyle === "point");
  const crossing = new Set();
  for (let i = 0; i < tailed.length; i++) {
    for (let j = i + 1; j < tailed.length; j++) {
      const a = tailed[i], b = tailed[j];
      if (segmentsIntersect(
        { x: a.cx, y: a.cy }, { x: a.tailX, y: a.tailY },
        { x: b.cx, y: b.cy }, { x: b.tailX, y: b.tailY }
      )) {
        crossing.add(a.id);
        crossing.add(b.id);
      }
    }
  }
  // Draw a red dashed overlay along each offending tail.
  for (const b of state.balloons) {
    if (!crossing.has(b.id)) continue;
    const warn = document.createElementNS(SVG_NS, "line");
    warn.setAttribute("x1", b.cx);
    warn.setAttribute("y1", b.cy);
    warn.setAttribute("x2", b.tailX);
    warn.setAttribute("y2", b.tailY);
    warn.setAttribute("class", "tail-cross-warning");
    overlay.appendChild(warn);
  }

  // 2. Reading-order trail + numbered badges (Klein's "implied trail" of placement).
  if (state.showTrail) {
    if (state.balloons.length > 1) {
      const pts = state.balloons.map(b => `${b.cx.toFixed(2)} ${b.cy.toFixed(2)}`);
      const trail = document.createElementNS(SVG_NS, "path");
      trail.setAttribute("d", "M " + pts.join(" L "));
      trail.setAttribute("class", "reading-trail");
      overlay.appendChild(trail);
    }
    state.balloons.forEach((b, i) => {
      const cx = b.cx - b.rx + 14;
      const cy = b.cy - b.ry + 14;
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", 13);
      circle.setAttribute("class", "reading-badge");
      overlay.appendChild(circle);
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy);
      text.setAttribute("class", "reading-badge-text");
      text.textContent = (i + 1).toString();
      overlay.appendChild(text);
    });
  }
}

function ellipsePoint(cx, cy, rx, ry, ang) {
  return { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry };
}

function drawSelectionChrome(b) {
  // bounding box
  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", b.cx - b.rx); box.setAttribute("y", b.cy - b.ry);
  box.setAttribute("width", b.rx * 2); box.setAttribute("height", b.ry * 2);
  box.setAttribute("class", "selection-box");
  overlay.appendChild(box);

  // 4 resize handles
  const handles = [
    {x: b.cx - b.rx, y: b.cy - b.ry, dir: "nw"},
    {x: b.cx + b.rx, y: b.cy - b.ry, dir: "ne"},
    {x: b.cx - b.rx, y: b.cy + b.ry, dir: "sw"},
    {x: b.cx + b.rx, y: b.cy + b.ry, dir: "se"},
  ];
  for (const h of handles) {
    const r = document.createElementNS(SVG_NS, "rect");
    const sz = state.mobileMode ? 22 : 10;
    r.setAttribute("x", h.x - sz/2); r.setAttribute("y", h.y - sz/2);
    r.setAttribute("width", sz); r.setAttribute("height", sz);
    r.setAttribute("class", "handle");
    r.addEventListener("pointerdown", (e) => onHandlePointerDown(e, b, h.dir));
    overlay.appendChild(r);
  }

  // tail tip handle (enlarged in mobile mode for finger-sized targets)
  if (b.tail) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", b.tailX); c.setAttribute("cy", b.tailY);
    c.setAttribute("r", state.mobileMode ? 14 : 7);
    c.setAttribute("class", "tail-handle");
    c.addEventListener("pointerdown", (e) => onTailPointerDown(e, b));
    overlay.appendChild(c);
  }

  // Connector handles: width, curve, and one attachment handle on each balloon.
  // Shown when this balloon is connected to another so the letterer can shape the tube
  // directly on the canvas (Blambot Fig. 5.1 — connectors are hand-tuned, not auto-fit).
  if (b.connectedTo) {
    const partner = state.balloons.find(x => x.id === b.connectedTo);
    if (partner) drawConnectorHandles(b, partner);
  }
}

// Draw width/curve/attachment handles for a connector pair.
function drawConnectorHandles(a, c) {
  const g = connectorGeometry(a, c);
  if (g.len < 4) return;
  const sz = state.mobileMode ? 20 : 10;
  const dot = state.mobileMode ? 12 : 6;

  // Attachment handle on owner edge
  const hA = document.createElementNS(SVG_NS, "circle");
  hA.setAttribute("cx", g.eOwner.x); hA.setAttribute("cy", g.eOwner.y);
  hA.setAttribute("r", dot);
  hA.setAttribute("class", "conn-handle conn-attach");
  hA.addEventListener("pointerdown", (e) => onConnectorHandleDown(e, a, c, "attach-owner"));
  overlay.appendChild(hA);

  // Attachment handle on partner edge
  const hC = document.createElementNS(SVG_NS, "circle");
  hC.setAttribute("cx", g.ePartner.x); hC.setAttribute("cy", g.ePartner.y);
  hC.setAttribute("r", dot);
  hC.setAttribute("class", "conn-handle conn-attach");
  hC.addEventListener("pointerdown", (e) => onConnectorHandleDown(e, a, c, "attach-partner"));
  overlay.appendChild(hC);

  // Curve handle — on the tube centerline at the (possibly-offset) midpoint.
  const hCurve = document.createElementNS(SVG_NS, "circle");
  hCurve.setAttribute("cx", g.midCenter.x); hCurve.setAttribute("cy", g.midCenter.y);
  hCurve.setAttribute("r", dot);
  hCurve.setAttribute("class", "conn-handle conn-curve");
  hCurve.addEventListener("pointerdown", (e) => onConnectorHandleDown(e, a, c, "curve"));
  overlay.appendChild(hCurve);

  // Width handle — a square sitting on the +n edge of the tube at midCenter.
  const halfW = g.width / 2;
  const wx = g.midCenter.x + g.nx * halfW;
  const wy = g.midCenter.y + g.ny * halfW;
  const hW = document.createElementNS(SVG_NS, "rect");
  hW.setAttribute("x", wx - sz / 2); hW.setAttribute("y", wy - sz / 2);
  hW.setAttribute("width", sz); hW.setAttribute("height", sz);
  hW.setAttribute("class", "conn-handle conn-width");
  hW.addEventListener("pointerdown", (e) => onConnectorHandleDown(e, a, c, "width"));
  overlay.appendChild(hW);
}

// ============== INTERACTION ==============
let drag = null;

function connectBalloons(src, b) {
  if (!src || !b || src.id === b.id) return false;
  pushUndo();
  // Clear any existing connectors on either side, then bind both ways
  [src, b].forEach(x => {
    if (x.connectedTo) {
      const p = state.balloons.find(y => y.id === x.connectedTo);
      if (p) p.connectedTo = null;
    }
    // Reset per-connector overrides so the new pairing starts clean.
    x.connectorAngleOwner = null;
    x.connectorAnglePartner = null;
    x.connectorCurve = 0;
  });
  src.connectedTo = b.id;
  b.connectedTo = src.id;
  const { owner } = getConnectorOwner(src, b);
  const baseW = Math.round(Math.min(src.rx, b.rx) * 0.18);
  owner.connectorW = Math.max(8, Math.min(16, baseW));
  owner.connectorSeamless = true;
  // Remember the target so "R" can reconnect another balloon to the same partner.
  state.lastConnectTargetId = b.id;
  return true;
}

function onBalloonPointerDown(e, b) {
  e.stopPropagation();
  // Connect-balloon picker: if a source is armed, treat this click as the target
  if (state.connectPickerSourceId && state.connectPickerSourceId !== b.id) {
    const src = state.balloons.find(x => x.id === state.connectPickerSourceId);
    connectBalloons(src, b);
    state.connectPickerSourceId = null;
    selectBalloon(b.id);
    toast("Balloons connected");
    return;
  }
  selectBalloon(b.id);
  const start = clientToImage(e.clientX, e.clientY);
  drag = { type: "move", b, ox: b.cx - start.x, oy: b.cy - start.y, otx: b.tailX - start.x, oty: b.tailY - start.y };
  overlay.setPointerCapture?.(e.pointerId);
}
function onHandlePointerDown(e, b, dir) {
  e.stopPropagation();
  drag = { type: "resize", b, dir, startCx: b.cx, startCy: b.cy, startRx: b.rx, startRy: b.ry, start: clientToImage(e.clientX, e.clientY) };
}
function onTailPointerDown(e, b) {
  e.stopPropagation();
  selectBalloon(b.id);
  drag = { type: "tail", b };
}
function onConnectorHandleDown(e, a, c, mode) {
  e.stopPropagation();
  const g = connectorGeometry(a, c);
  drag = { type: "connector", a, c, mode, startWidth: g.width, startCurve: g.curve };
  overlay.setPointerCapture?.(e.pointerId);
}

window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  // Snapshot for undo only on the FIRST move of a drag — clicks that do not move never enter here,
  // so a click without drag does not produce a wasted undo entry.
  if (!drag.snapshotPushed) { pushUndo(); drag.snapshotPushed = true; }
  const pt = clientToImage(e.clientX, e.clientY);
  if (drag.type === "move") {
    drag.b.cx = pt.x + drag.ox; drag.b.cy = pt.y + drag.oy;
    drag.b.tailX = pt.x + drag.otx; drag.b.tailY = pt.y + drag.oty;
  } else if (drag.type === "resize") {
    const sx = drag.dir.includes("e") ? 1 : -1;
    const sy = drag.dir.includes("s") ? 1 : -1;
    const dx = (pt.x - drag.start.x) * sx;
    const dy = (pt.y - drag.start.y) * sy;
    drag.b.rx = Math.max(20, drag.startRx + dx / 2);
    drag.b.ry = Math.max(15, drag.startRy + dy / 2);
    drag.b.cx = drag.startCx + (sx * dx) / 2;
    drag.b.cy = drag.startCy + (sy * dy) / 2;
  } else if (drag.type === "tail") {
    drag.b.tailX = pt.x; drag.b.tailY = pt.y;
  } else if (drag.type === "connector") {
    const g = connectorGeometry(drag.a, drag.c);
    const owner = g.owner;
    if (drag.mode === "width") {
      // Projection of pointer offset (from axis midpoint) onto perpendicular n = half-width.
      const dx = pt.x - g.midAxis.x, dy = pt.y - g.midAxis.y;
      const proj = Math.abs(dx * g.nx + dy * g.ny);
      // Subtract the curve component so width and curve handles don't fight each other.
      const halfW = Math.max(2, proj - Math.abs(g.curve));
      owner.connectorW = Math.max(4, Math.min(80, halfW * 2));
    } else if (drag.mode === "curve") {
      const dx = pt.x - g.midAxis.x, dy = pt.y - g.midAxis.y;
      let curve = dx * g.nx + dy * g.ny;
      if (Math.abs(curve) < 5) curve = 0; // snap to straight
      owner.connectorCurve = Math.max(-200, Math.min(200, curve));
    } else if (drag.mode === "attach-owner" || drag.mode === "attach-partner") {
      const target = (drag.mode === "attach-owner") ? g.owner : g.partner;
      const field = (drag.mode === "attach-owner") ? "connectorAngleOwner" : "connectorAnglePartner";
      const ang = Math.atan2(pt.y - target.cy, pt.x - target.cx);
      owner[field] = ang;
    }
  }
  render();
});
window.addEventListener("pointerup", () => { drag = null; });

overlay.addEventListener("pointerdown", (e) => {
  // background click deselects
  if (e.target === overlay) { state.selectedId = null; render(); }
});

// ============== SELECTION & INSPECTOR ==============
function selectBalloon(id) {
  state.selectedId = id;
  syncInspector();
  // re-render so selection chrome appears
  render();
}

function getSelected() { return state.balloons.find(b => b.id === state.selectedId); }

function syncInspector() {
  const b = getSelected();
  if (!b) {
    inspector.style.display = "none";
    inspectorEmpty.style.display = "block";
    $("btn-connect-toolbar").disabled = true;
    $("btn-connect-toolbar").textContent = "Connect Balloons";
    return;
  }
  inspector.style.display = "block";
  inspectorEmpty.style.display = "none";
  $("i-text").value = b.text;
  $("i-font").value = b.font;
  $("i-size").value = b.size;
  $("i-weight").value = b.weight;
  $("i-style-italic").value = b.italic;
  $("i-tracking").value = b.tracking || 0;
  $("i-text-color").value = toHex(b.textColor);
  $("i-fill").value = toHex(b.fill);
  $("i-stroke").value = toHex(b.stroke);
  $("i-stroke-w").value = b.strokeW;
  $("i-shape").value = b.shape;
  $("i-tail-on").checked = !!b.tail;
  $("i-tail-w").value = b.tailW;
  $("i-tail-style").value = b.tailStyle;
  $("i-organic").checked = !!b.organic;
  $("i-dashed").checked = b.outline === "dashed";
  const insetPct = (typeof b.edgeInset === "number") ? Math.round(b.edgeInset * 100) : -1;
  $("i-inset").value = String(insetPct);
  $("i-inset-val").textContent = insetPct < 0 ? "auto" : (insetPct + "%");
  // highlight active preset
  document.querySelectorAll(".style-preset").forEach(el => el.classList.remove("active"));
  // Toggle Split / Unlink visibility based on whether this balloon is part of a linked pair
  $("btn-split-balloon").style.display = b.linkedTo ? "none" : "block";
  $("btn-unlink-balloon").style.display = b.linkedTo ? "block" : "none";
  $("btn-connect-balloon").style.display = b.connectedTo ? "none" : "block";
  $("btn-disconnect-balloon").style.display = b.connectedTo ? "block" : "none";
  // Connector shape controls — only when this balloon is connected.
  const shapeCtl = $("conn-shape-controls");
  if (shapeCtl) {
    if (b.connectedTo) {
      const partner = state.balloons.find(x => x.id === b.connectedTo);
      if (partner) {
        const { owner } = getConnectorOwner(b, partner);
        const w = Math.round(owner.connectorW || 10);
        const cv = Math.round(owner.connectorCurve || 0);
        $("i-conn-w").value = String(w);
        $("i-conn-w-val").textContent = String(w);
        $("i-conn-curve").value = String(cv);
        $("i-conn-curve-val").textContent = String(cv);
        $("i-conn-seamless").checked = owner.connectorSeamless !== false;
        shapeCtl.style.display = "block";
      } else {
        shapeCtl.style.display = "none";
      }
    } else {
      shapeCtl.style.display = "none";
    }
  }
  $("btn-connect-balloon").textContent = state.connectPickerSourceId
    ? "Click another balloon… (Esc to cancel)"
    : "Connect to Another Balloon…";
  $("btn-connect-toolbar").disabled = false;
  $("btn-connect-toolbar").textContent = state.connectPickerSourceId
    ? "Click target balloon…"
    : "Connect Balloons";
  // Scroll the Connect / Split section into view when a balloon is selected
  const connSection = $("inspector-connect-split");
  if (connSection) {
    connSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function toHex(c) {
  // accept "transparent" → fall back to white
  if (!c || c === "transparent") return "#ffffff";
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  // crude conversion via canvas
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = c; return ctx.fillStyle;
}

function bindInspector() {
  $("i-text").addEventListener("input", () => { const b = getSelected(); if (!b) return; b.text = $("i-text").value; render(); });
  $("i-font").addEventListener("change", () => withSel(b => b.font = $("i-font").value));
  $("i-size").addEventListener("input", () => withSel(b => b.size = +$("i-size").value));
  $("i-weight").addEventListener("change", () => withSel(b => b.weight = +$("i-weight").value));
  $("i-style-italic").addEventListener("change", () => withSel(b => b.italic = $("i-style-italic").value));
  $("i-tracking").addEventListener("input", () => withSel(b => b.tracking = +$("i-tracking").value));
  $("i-text-color").addEventListener("input", () => withSel(b => b.textColor = $("i-text-color").value));
  $("i-fill").addEventListener("input", () => withSel(b => b.fill = $("i-fill").value));
  $("i-stroke").addEventListener("input", () => withSel(b => b.stroke = $("i-stroke").value));
  $("i-stroke-w").addEventListener("input", () => withSel(b => b.strokeW = +$("i-stroke-w").value));
  $("i-shape").addEventListener("change", () => withSel(b => b.shape = $("i-shape").value));
  $("i-tail-on").addEventListener("change", () => withSel(b => b.tail = $("i-tail-on").checked));
  $("i-tail-w").addEventListener("input", () => withSel(b => b.tailW = +$("i-tail-w").value));
  $("i-tail-style").addEventListener("change", () => withSel(b => b.tailStyle = $("i-tail-style").value));
  $("i-delete").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    deleteBalloon(b);
  });
  $("btn-split-balloon").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    splitBalloon(b);
  });
  $("btn-unlink-balloon").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    unlinkBalloons(b);
  });
  $("i-organic").addEventListener("change", () => withSel(b => b.organic = $("i-organic").checked));
  $("i-dashed").addEventListener("change", () => withSel(b => b.outline = $("i-dashed").checked ? "dashed" : "solid"));
  $("i-inset").addEventListener("input", () => {
    const v = +$("i-inset").value;
    withSel(b => { b.edgeInset = (v < 0) ? null : (v / 100); });
    $("i-inset-val").textContent = v < 0 ? "auto" : (v + "%");
  });
  // Per-shape default inset sliders.
  [["si-burst", "burst"], ["si-cloud", "cloud"], ["si-oval", "oval"], ["si-box", "box"]].forEach(([id, cat]) => {
    $(id).addEventListener("input", () => {
      const v = +$(id).value;
      state.shapeInsets[cat] = v / 100;
      $(id + "-val").textContent = v + "%";
      render();
    });
  });
  syncShapeInsetInputs();
  $("btn-connect-balloon").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    state.connectPickerSourceId = state.connectPickerSourceId ? null : b.id;
    syncInspector();
    toast(state.connectPickerSourceId ? "Click another balloon to connect" : "Connect cancelled");
  });
  $("btn-connect-toolbar").addEventListener("click", () => {
    const b = getSelected();
    if (!b) { toast("Select a balloon first"); return; }
    state.connectPickerSourceId = state.connectPickerSourceId ? null : b.id;
    syncInspector();
    toast(state.connectPickerSourceId ? "Click another balloon to connect" : "Connect cancelled");
  });
  $("btn-disconnect-balloon").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    pushUndo();
    const partner = state.balloons.find(x => x.id === b.connectedTo);
    if (partner && partner.connectedTo === b.id) partner.connectedTo = null;
    b.connectedTo = null;
    render(); syncInspector();
  });
  // Connector shape controls
  const connWithOwner = (fn) => {
    const b = getSelected(); if (!b || !b.connectedTo) return;
    const partner = state.balloons.find(x => x.id === b.connectedTo);
    if (!partner) return;
    const { owner } = getConnectorOwner(b, partner);
    pushUndo();
    fn(owner, b, partner);
    render(); syncInspector();
  };
  $("i-conn-w").addEventListener("input", () => {
    const v = +$("i-conn-w").value;
    $("i-conn-w-val").textContent = String(v);
    connWithOwner(o => { o.connectorW = v; });
  });
  $("i-conn-curve").addEventListener("input", () => {
    const v = +$("i-conn-curve").value;
    $("i-conn-curve-val").textContent = String(v);
    connWithOwner(o => { o.connectorCurve = v; });
  });
  $("btn-conn-straighten").addEventListener("click", () => {
    connWithOwner(o => { o.connectorCurve = 0; });
  });
  $("btn-conn-flip").addEventListener("click", () => {
    connWithOwner((o, b, partner) => {
      const g = connectorGeometry(b, partner);
      o.connectorAngleOwner = g.ownerAng + Math.PI;
      o.connectorAnglePartner = g.partnerAng + Math.PI;
    });
  });
  $("i-conn-seamless").addEventListener("change", () => {
    const on = $("i-conn-seamless").checked;
    connWithOwner(o => { o.connectorSeamless = on; });
  });
  $("btn-match-tail-o").addEventListener("click", () => {
    const b = getSelected(); if (!b) return;
    pushUndo();
    // Measure rendered width of "O" in this balloon's font
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${b.italic === "italic" ? "italic " : ""}${b.weight || 400} ${b.size}px ${b.font}`;
    const w = ctx.measureText("O").width;
    state.defaultTailW = w;
    state.balloons.forEach(x => { x.tailW = w; });
    render(); syncInspector();
    toast(`Tail width matched to "O" (${w.toFixed(1)}px)`);
  });
  document.querySelectorAll(".style-preset").forEach(el => {
    el.addEventListener("click", () => {
      const b = getSelected(); if (!b) return;
      pushUndo();
      const preset = el.dataset.preset;
      Object.assign(b, JSON.parse(JSON.stringify(PRESETS[preset])));
      // Blambot SINGING convention: bracket the dialogue with music notes when the preset is applied,
      // unless the user has already added them.
      if (preset === "singing") {
        let t = (b.text || "").trim();
        if (!t.startsWith("♪")) t = "♪ " + t;
        if (!t.endsWith("♪")) t = t + " ♪";
        b.text = t;
      }
      // Blambot TRANSLATED convention: wrap the dialogue in angle brackets, the standard mark for
      // "this dialogue is rendered in English but is actually being spoken in another language."
      if (preset === "translated") {
        let t = (b.text || "").trim();
        if (!/^<.*>$/.test(t)) t = "<" + t + ">";
        b.text = t;
      }
      render();
    });
  });
}
function withSel(fn) { const b = getSelected(); if (!b) return; fn(b); render(); }

// Delete a balloon, properly clearing the link on its partner if it had one.
function deleteBalloon(b) {
  pushUndo();
  if (b.linkedTo) {
    const partner = state.balloons.find(x => x.id === b.linkedTo);
    if (partner) partner.linkedTo = null;
  }
  state.balloons = state.balloons.filter(x => x.id !== b.id);
  // Remove any whiteout mask anchored to this balloon so deleting the balloon also reveals
  // the original art underneath.
  if (state.whiteoutMasks && state.whiteoutMasks.length) {
    state.whiteoutMasks = state.whiteoutMasks.filter(m => m.balloonId !== b.id);
  }
  state.selectedId = null;
  render();
}

// Split a balloon into two linked balloons (a "double bubble"). The original keeps its text and tail;
// the new lobe is positioned to the right and starts with a placeholder for the user to overwrite.
function splitBalloon(b) {
  if (b.linkedTo) return; // already linked — split is a no-op
  pushUndo();
  const clone = JSON.parse(JSON.stringify(b));
  clone.id = uid();
  // Place the new lobe far enough right to NOT overlap by default — letterers expect to see two distinct
  // balloons connected by a join. Distance is tuned so the masks produce a clean peanut shape.
  const offsetDist = (b.rx + 60);
  clone.cx = b.cx + offsetDist;
  clone.cy = b.cy;
  clone.tail = false;            // only the original keeps its tail
  clone.text = "...";            // placeholder — user types the second beat
  clone.linkedTo = b.id;
  b.linkedTo = clone.id;
  state.balloons.push(clone);
  fitBalloonToText(clone);
  state.selectedId = clone.id;
  render();
  toast("Balloon split — type the second part of the dialogue");
}

// Sever the link between two joined balloons. Both balloons remain in place and become independent.
function unlinkBalloons(b) {
  if (!b.linkedTo) return;
  pushUndo();
  const partner = state.balloons.find(x => x.id === b.linkedTo);
  if (partner) partner.linkedTo = null;
  b.linkedTo = null;
  render();
  toast("Balloons unlinked");
}

// Resize balloon to fit its text snugly, using actual text metrics.
function fitBalloonToText(b) {
  const ctx = document.createElement("canvas").getContext("2d");
  const fw = b.weight || 400;
  const fs = b.italic === "italic" ? "italic " : "";
  ctx.font = `${fs}${fw} ${b.size}px ${b.font}`;
  const lines = (b.text || "").split("\n");
  const widest = Math.max(...lines.map(l => ctx.measureText(l || " ").width), 1);
  const lineH = b.size * 1.18;
  const totalH = Math.max(1, lines.length) * lineH;
  // Padding chosen so the text does not crowd the balloon edge. The lens-shape
  // partitioner can push middle lines very near the chord, so add extra pad.
  const padX = 32, padY = 20;
  b.rx = Math.max(40, widest / 2 + padX);
  b.ry = Math.max(28, totalH / 2 + padY);
}

// ============== AUTO FORMAT (PROFESSIONAL CONVENTIONS) ==============
// Cleans up typography, capitalizes, and rebalances line breaks into a
// lens / oval silhouette per Blambot pro-lettering conventions.
function autoFormatBalloon(b) {
  let t = b.text || "";

  // 1. Typography corrections
  t = t.replace(/----+/g, "—")        // multi-hyphen → em-dash
       .replace(/--/g, "—")             // double-hyphen → em-dash
       .replace(/\.\.\.+/g, "…")        // ellipsis character
       .replace(/\s+([,.!?;:])/g, "$1") // remove space before punctuation
       .replace(/\s+/g, " ")            // collapse whitespace
       .trim();

  // 2. ALL CAPS — the dominant comic-book convention.
  t = t.toUpperCase();

  // 3. Choose balancer by shape. Ellipse-family balloons get the lens
  // profile; rect / cloud / burst keep a rectangular fit (min-max DP).
  const shape = (b.shape || "oval").toLowerCase();
  const isEllipse = shape === "oval" || shape === "ellipse" || shape === "thought" || shape === "whisper" || shape === "round" || shape === "radio";
  if (isEllipse) {
    t = balanceLinesLens(t, b.font, b.size, b.weight || 400, b.italic === "italic");
  } else {
    t = balanceLinesRect(t, b.font, b.size, b.weight || 400, b.italic === "italic");
  }

  b.text = t;

  // 4. Resize balloon to fit
  fitBalloonToText(b);
}

// Split text into sentence fragments, keeping terminal punctuation attached.
// "CAPTAIN RHEA! THE RYUKEN WILL..." → ["CAPTAIN RHEA!", "THE RYUKEN WILL..."]
function segmentSentences(text) {
  const out = [];
  const re = /[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out.length ? out : [text];
}

// Lens-profile target widths: chord of an ellipse, normalized to [0,1] of the
// widest middle line. For N=8 this is roughly [.33,.66,.87,.99,.99,.87,.66,.33].
function lensTargetWidths(N) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * i + 1) / N - 1; // -1..1, evaluated at row midpoint
    const v = Math.sqrt(Math.max(0, 1 - t * t));
    // Lift the very ends slightly so a 2- or 3-word line still fits there.
    out.push(Math.max(0.28, v));
  }
  return out;
}

// Greedy left-to-right fitter against a per-line target width budget. Returns
// null if the words don't fit into exactly N lines under the given budget.
function fitToTargets(words, targets, budgetW, ctx, sentenceBreakIdx) {
  const N = targets.length;
  const lines = [];
  let i = 0;
  const slackBase = 1.05;
  const slackSentence = 1.18; // generous if breaking lands on a sentence boundary
  for (let row = 0; row < N; row++) {
    const isLast = row === N - 1;
    const linesLeft = N - row;
    const wordsLeft = words.length - i;
    if (wordsLeft < linesLeft) return null; // not enough words to fill remaining lines
    const target = budgetW * targets[row];
    let cur = [words[i]]; i++;
    while (i < words.length) {
      // Reserve at least one word for each remaining line.
      const remainingLines = N - row - 1;
      if (words.length - i <= remainingLines) break;
      const trial = cur.concat(words[i]);
      const w = ctx.measureText(trial.join(" ")).width;
      const atSentence = sentenceBreakIdx.has(i);
      const slack = atSentence ? slackSentence : slackBase;
      // On the last line we must take everything left.
      if (isLast) { cur = trial; i++; continue; }
      if (w <= target * slack) { cur = trial; i++; }
      else break;
    }
    lines.push(cur.join(" "));
  }
  let overflow = false;
  if (i < words.length) {
    // Append leftover words to the last line.
    lines[lines.length - 1] = lines[lines.length - 1] + " " + words.slice(i).join(" ");
    overflow = true;
  }
  lines.overflow = overflow;
  return lines;
}

// Lens balancer: try multiple N values + budget widths, score by deviation
// from the lens target shape + bonus for sentence-aligned breaks.
function balanceLinesLens(text, fontFamily, fontSize, fontWeight, italic) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${italic ? "italic " : ""}${fontWeight} ${fontSize}px ${fontFamily}`;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return text;

  // Build the set of word indices that begin a new sentence.
  const sentences = segmentSentences(text);
  const sentenceBreakIdx = new Set();
  let acc = 0;
  for (let s = 0; s < sentences.length - 1; s++) {
    acc += sentences[s].split(/\s+/).filter(Boolean).length;
    sentenceBreakIdx.add(acc);
  }

  // Force-isolate a very short opening sentence (e.g. "CAPTAIN RHEA!").
  let forcedFirst = null;
  let wordsRest = words;
  let sentenceBreakIdxRest = sentenceBreakIdx;
  if (sentences.length >= 2) {
    const firstW = ctx.measureText(sentences[0]).width;
    const firstChars = sentences[0].length;
    const firstWords = sentences[0].split(/\s+/).filter(Boolean).length;
    if (firstChars <= 16 && firstWords <= 3) {
      forcedFirst = sentences[0];
      wordsRest = words.slice(firstWords);
      sentenceBreakIdxRest = new Set();
      let acc2 = 0;
      for (let s = 1; s < sentences.length - 1; s++) {
        acc2 += sentences[s].split(/\s+/).filter(Boolean).length;
        sentenceBreakIdxRest.add(acc2);
      }
    }
  }

  if (wordsRest.length === 0) return forcedFirst || text;

  const fullW = ctx.measureText(wordsRest.join(" ")).width;

  let bestLines = null;
  let bestScore = Infinity;

  const maxN = Math.min(10, Math.max(2, Math.ceil(wordsRest.length / 2)));
  for (let N = 2; N <= maxN; N++) {
    const targets = lensTargetWidths(N);
    // Try a few budget widths (the "W" in the lens profile). Wider budget →
    // shorter overall block; narrower budget → taller, more rounded.
    const meanTarget = targets.reduce((a, b) => a + b, 0) / N;
    const idealBudget = fullW / (N * meanTarget);
    for (const k of [0.75, 0.9, 1.0, 1.1, 1.25]) {
      const budgetW = idealBudget * k;
      const lines = fitToTargets(wordsRest, targets, budgetW, ctx, sentenceBreakIdxRest);
      if (!lines) continue;
      const widths = lines.map(l => ctx.measureText(l).width);
      const maxW = Math.max(...widths);
      // Cap absolute line width: no line may exceed ~55% of the all-words width.
      // This forces taller stacks for long text instead of a few flat lines.
      if (maxW > fullW * 0.55 && N < maxN) continue;
      // Score: sum of squared deviations from lens shape (normalized to maxW).
      let score = 0;
      for (let i = 0; i < N; i++) {
        const want = maxW * targets[i];
        const dev = (widths[i] - want) / maxW;
        score += dev * dev;
      }
      // Pull toward a tall lens stack (block aspect ≈ 1.75) instead of flat lines.
      const aspect = maxW / (N * fontSize * 1.18);
      score += Math.pow(aspect - 1.75, 2) * 0.6;
      // Penalize first/last being wider than their neighbors (anti-oval).
      if (N >= 3) {
        if (widths[0] >= widths[1] * 0.9) score += 0.9;
        if (widths[N - 1] >= widths[N - 2] * 0.9) score += 0.9;
      }
      // Penalize overflow (leftover words crammed into the last line).
      if (lines.overflow) score += 1.0;
      // Bonus when line breaks align with sentence boundaries.
      let cum = 0;
      let bonus = 0;
      for (let i = 0; i < N - 1; i++) {
        cum += lines[i].split(/\s+/).filter(Boolean).length;
        if (sentenceBreakIdxRest.has(cum)) bonus += 0.15;
      }
      score -= bonus;
      if (score < bestScore) { bestScore = score; bestLines = lines; }
    }
  }

  const finalLines = bestLines || [wordsRest.join(" ")];
  if (forcedFirst) finalLines.unshift(forcedFirst);
  return finalLines.join("\n");
}

// Rectangular balancer (legacy DP) — used for rect / cloud / burst shapes.
function balanceLinesRect(text, fontFamily, fontSize, fontWeight, italic) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${italic ? "italic " : ""}${fontWeight} ${fontSize}px ${fontFamily}`;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text;

  let bestPart = null;
  let bestScore = Infinity;

  for (let N = 1; N <= Math.min(6, words.length); N++) {
    const part = partition(words, N, ctx);
    if (!part) continue;
    const widths = part.map(line => ctx.measureText(line).width);
    const maxW = Math.max(...widths);
    const totalH = N * fontSize * 1.18;
    const aspect = maxW / totalH;
    let score = Math.abs(aspect - 1.7) + N * 0.05;
    if (score < bestScore) { bestScore = score; bestPart = part; }
  }

  return (bestPart || [text]).join("\n");
}

// DP: split words into exactly N consecutive groups, minimizing max group width.
function partition(words, N, ctx) {
  if (N === 1) return [words.join(" ")];
  if (N > words.length) return null;

  const memo = new Map();
  const measureRange = (i, j) => ctx.measureText(words.slice(i, j).join(" ")).width;

  function solve(start, linesLeft) {
    if (linesLeft === 1) {
      return { width: measureRange(start, words.length), breaks: [words.length] };
    }
    const key = start + "," + linesLeft;
    if (memo.has(key)) return memo.get(key);

    let best = null;
    const lastEnd = words.length - linesLeft + 1;
    for (let end = start + 1; end <= lastEnd; end++) {
      const lineW = measureRange(start, end);
      const sub = solve(end, linesLeft - 1);
      const maxW = Math.max(lineW, sub.width);
      if (!best || maxW < best.width) best = { width: maxW, breaks: [end, ...sub.breaks] };
    }
    memo.set(key, best);
    return best;
  }

  const result = solve(0, N);
  if (!result) return null;
  const lines = [];
  let s = 0;
  for (const b of result.breaks) { lines.push(words.slice(s, b).join(" ")); s = b; }
  return lines;
}

// Wire up the buttons.
$("btn-auto-format").addEventListener("click", () => {
  const b = getSelected();
  if (!b) { toast("Select a balloon first"); return; }
  pushUndo();
  autoFormatBalloon(b);
  render();
  toast("Balloon formatted");
});
$("btn-auto-format-all").addEventListener("click", () => {
  if (!state.balloons.length) { toast("No balloons to format"); return; }
  pushUndo();
  for (const b of state.balloons) autoFormatBalloon(b);
  render();
  toast(`Formatted ${state.balloons.length} balloon${state.balloons.length===1?"":"s"}`);
});

// ============== SMART PLACE (AI vision-based balloon positioning) ==============
// Sends the loaded comic page image plus a description of one or all balloons to Claude vision,
// asking it to compute coordinates that avoid characters' faces, bodies, hands, effects, and power
// signatures, and prefer negative space (sky, background, panel gaps).
async function smartPlaceCall(prompt) {
  if (!state.imageDataUrl) throw new Error("Load a comic page image first.");
  let key = getApiKey();
  if (!key) {
    const k = await appPrompt(
      "Smart Place requires an Anthropic API key. Stored only in this browser's localStorage on this machine.",
      "",
      "Anthropic API key required"
    );
    if (!k) throw new Error("No API key provided.");
    setApiKey(k.trim()); key = k.trim();
  }
  const base64 = state.imageDataUrl.split(",")[1];
  const mediaType = (state.imageDataUrl.match(/^data:([^;]+);/) || [])[1] || "image/png";

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 }},
        { type: "text", text: prompt }
      ]
    }]
  };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Anthropic API error " + resp.status + ":\n" + errText.slice(0, 600));
  }
  const json = await resp.json();
  const content = (json.content && json.content[0] && json.content[0].text) || "";
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  return { rawText: cleaned };
}

// Rules synthesized from Todd Klein's "Balloon Placement" guide (kleinletters.com/BalloonPlacement.html)
// and Blambot's lettering tips. Klein is the most awarded letterer in modern American comics and his
// published rules are the de facto standard. The Smart Place AI is instructed to apply them verbatim.
//
// CRITICAL: panel-bounded placement is enforced first. The model must identify each panel on the
// page and constrain each balloon to its assigned panel before applying any other placement rule.
// Without this, the AI tends to cluster balloons in the first panel it sees, leaving later panels
// empty.
const SMART_PLACE_RULES = `STEP 1 — PANEL ANALYSIS (do this first, before placing any balloon):
- Examine the page image and identify EACH panel — the rectangular subdivisions that make up the page.
- Number them in reading order: panel 1 = top-left, then proceeding left-to-right within each row,
  then top-to-bottom across rows. A four-panel grid is 1 (top-left), 2 (top-right), 3 (bottom-left),
  4 (bottom-right). A vertical stack is 1, 2, 3, 4 from top to bottom.
- Note each panel's approximate bounding box on the page.

STEP 2 — PANEL ASSIGNMENT (mandatory constraint):
- Each balloon below carries a [Panel N] tag indicating the panel it belongs to.
- Place each balloon STRICTLY INSIDE that panel's bounding box. NEVER place a balloon assigned to
  Panel 2 anywhere inside Panel 1's borders. NEVER cluster multiple panels' balloons into a single
  panel — every panel that has dialogue assigned to it MUST receive its dialogue.
- If multiple balloons share a panel, arrange them in reading order WITHIN that panel:
  top-to-bottom, left-to-right.

STEP 3 — APPLY THESE RULES WITHIN EACH PANEL:
Apply Klein's "Balloon Placement" guide:

KLEIN'S CORE RULES:
- "Ideally, balloons and captions shouldn't cover figures. When they must, try not to cover hands and feet, and NEVER cover faces of important characters." Faces are absolutely protected.
- "Generally balloons look best ABOVE and AWAY from the speaker."
- "Jamming balloons in a narrow space between figures is not a good idea."
- Tails must NEVER cross each other — Klein notes crossed tails "look rather silly."
- "Within a panel it's always best if the character on the LEFT speaks first." Place the balloon for the leftmost speaker higher and/or further left so it is read first.
- Lead the reader's eye in an implied trail from the TOP-LEFT to the BOTTOM-RIGHT of the page; this is the natural English reading flow.
- "When copy won't fit in the panel it's intended for, consider [a smaller/taller shape]" — make the balloon narrower / taller before letting it crowd the artwork.
- Visual surprises belong at the TOP of the page (readers scan first); avoid burying the most striking imagery under balloons.

ARTWORK PROTECTION:
- Do NOT cover power signatures, energy auras, lightning, glows, fire, smoke, magical effects, motion lines, action effects, or impact bursts. These are "the artwork" in Klein's sense.
- Do NOT cover signs, logos, or sound effects (SFX) the artist drew into the panel.
- Do NOT cover hands, feet, or weapons held by characters.
- Prefer "negative space": sky, plain backgrounds, gutters between panels, blurred or out-of-focus areas, dark or empty corners.

GEOMETRY:
- The balloon should be near its speaker so the tail can naturally point at the speaker's mouth or head, but NOT directly on top of the speaker.
- Balloons must NOT overlap each other.
- Tails from different balloons must NOT cross.
- Balloons in proper comic reading order: top-to-bottom, left-to-right within each panel; panels in their layout order.
- Balloon size proportional to dialogue length: ~1 line per 25 characters; line height ≈ 22px; ≈ 14px width per character; aim for an oval ~1.6× wider than tall, but reduce rx (make narrower / taller) if a wider oval would intrude on art.`;

async function smartPlaceBalloon(b) {
  if (b.linkedTo) {
    await appAlert(
      "This balloon is part of a linked pair (\"double bubble\"). Smart Place treats each balloon independently and would break the join. Unlink the pair first if you want to reposition each lobe individually.",
      "Smart Place"
    );
    return;
  }
  toast("Analyzing page art…");
  const others = state.balloons
    .filter(x => x.id !== b.id)
    .map(x => `- ${typeof x.panel === "number" ? `[Panel ${x.panel}] ` : ""}(${Math.round(x.cx)},${Math.round(x.cy)}) rx=${Math.round(x.rx)} ry=${Math.round(x.ry)}: "${(x.text || "").slice(0, 40)}"`)
    .join("\n") || "(none)";
  const panelTag = typeof b.panel === "number" ? `[Panel ${b.panel}] ` : "";

  const prompt = `You are an expert comic-book letterer. Look at this comic page image and determine the best position for a single word balloon.

Page dimensions: ${state.imageW} × ${state.imageH} pixels.
${panelTag}Speaker: ${b.speaker || "unknown"}
Dialogue: "${b.text}"
Current size hint: rx≈${Math.round(b.rx)}, ry≈${Math.round(b.ry)}.
${typeof b.panel === "number" ? `\nPANEL CONSTRAINT: This balloon belongs to Panel ${b.panel} of the page. You MUST place it inside Panel ${b.panel}'s boundaries on the comic page. Identify Panel ${b.panel} first, then place the balloon within it.\n` : ""}
Other balloons already placed on this page (avoid overlapping these):
${others}

${SMART_PLACE_RULES}

Return ONLY this JSON object — no markdown, no preamble, no explanation outside the JSON:
{
  "cx": <integer pixel x of balloon center>,
  "cy": <integer pixel y of balloon center>,
  "rx": <integer half-width in pixels>,
  "ry": <integer half-height in pixels>,
  "tailX": <integer pixel x of tail tip — should land just outside the speaker's mouth>,
  "tailY": <integer pixel y of tail tip>,
  "reasoning": "<one short sentence explaining placement and what is being avoided>"
}`;

  const { rawText } = await smartPlaceCall(prompt);
  let parsed;
  try { parsed = JSON.parse(rawText); }
  catch (e) {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error("AI returned non-JSON output:\n" + rawText.slice(0, 600));
  }

  pushUndo();
  if (typeof parsed.cx === "number") b.cx = clamp(parsed.cx, 0, state.imageW);
  if (typeof parsed.cy === "number") b.cy = clamp(parsed.cy, 0, state.imageH);
  if (typeof parsed.rx === "number") b.rx = clamp(parsed.rx, 40, state.imageW * 0.5);
  if (typeof parsed.ry === "number") b.ry = clamp(parsed.ry, 28, state.imageH * 0.5);
  if (typeof parsed.tailX === "number") b.tailX = clamp(parsed.tailX, 0, state.imageW);
  if (typeof parsed.tailY === "number") b.tailY = clamp(parsed.tailY, 0, state.imageH);

  render();
  toast(parsed.reasoning ? `Placed: ${parsed.reasoning.slice(0, 80)}` : "Smart-placed");
}

async function smartPlaceAll() {
  if (!state.balloons.length) { toast("No balloons to place"); return; }
  // Skip linked pairs — they require coordinated placement and the unified renderer assumes the two
  // halves are positioned by hand. The user is told the count so they can act on the rest manually.
  const placeable = state.balloons.filter(b => !b.linkedTo);
  const skipped = state.balloons.length - placeable.length;
  if (!placeable.length) {
    await appAlert(
      "All balloons on this page are part of linked pairs. Unlink them before running Smart Place All.",
      "Smart Place"
    );
    return;
  }
  if (skipped > 0) toast(`Skipping ${skipped} linked balloon${skipped===1?"":"s"} — placing ${placeable.length}…`);
  else toast(`Analyzing page art for ${placeable.length} balloon${placeable.length===1?"":"s"}…`);

  // List the balloons with panel tags so the AI knows which panel each one belongs to. The
  // tag is the operative cue; without it the AI tends to cluster balloons in one panel.
  const list = placeable.map((b, i) => {
    const panelTag = typeof b.panel === "number" ? `[Panel ${b.panel}]` : "[Panel ?]";
    return `${i + 1}. ${panelTag} Speaker: ${b.speaker || "unknown"} | Dialogue: "${b.text}" | Current size hint: rx≈${Math.round(b.rx)}, ry≈${Math.round(b.ry)}`;
  }).join("\n");

  // Summarize the panel distribution so the AI sees the full structure at a glance.
  const panelCounts = {};
  for (const b of placeable) {
    const k = typeof b.panel === "number" ? b.panel : "?";
    panelCounts[k] = (panelCounts[k] || 0) + 1;
  }
  const panelSummary = Object.keys(panelCounts).sort((a, b) => (a === "?" ? 1 : b === "?" ? -1 : Number(a) - Number(b)))
    .map(k => `Panel ${k}: ${panelCounts[k]} balloon${panelCounts[k] === 1 ? "" : "s"}`).join(", ");

  const prompt = `You are an expert comic-book letterer. Look at this comic page image and place ${placeable.length} word balloons in optimal positions.

Page dimensions: ${state.imageW} × ${state.imageH} pixels.

Panel-to-balloon distribution: ${panelSummary}.
Every panel listed above MUST receive its share of balloons. Do NOT cluster balloons from multiple panels into a single panel.

Balloons to place (in the SAME ORDER they should appear in your output, with [Panel N] tags
indicating the panel each balloon belongs to):
${list}

${SMART_PLACE_RULES}

Return ONLY a JSON array of length ${placeable.length}, in the same order as the input list — no markdown, no preamble:
[
  {
    "cx": <integer pixel x of balloon center>,
    "cy": <integer pixel y of balloon center>,
    "rx": <integer half-width in pixels>,
    "ry": <integer half-height in pixels>,
    "tailX": <integer pixel x of tail tip>,
    "tailY": <integer pixel y of tail tip>,
    "reasoning": "<one short sentence>"
  },
  ...
]`;

  const { rawText } = await smartPlaceCall(prompt);
  let parsed;
  try { parsed = JSON.parse(rawText); }
  catch (e) {
    const m = rawText.match(/\[[\s\S]*\]/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error("AI returned non-JSON output:\n" + rawText.slice(0, 600));
  }
  if (!Array.isArray(parsed)) throw new Error("AI output was not a JSON array");

  pushUndo();
  parsed.forEach((p, i) => {
    const b = placeable[i];
    if (!b) return;
    if (typeof p.cx === "number") b.cx = clamp(p.cx, 0, state.imageW);
    if (typeof p.cy === "number") b.cy = clamp(p.cy, 0, state.imageH);
    if (typeof p.rx === "number") b.rx = clamp(p.rx, 40, state.imageW * 0.5);
    if (typeof p.ry === "number") b.ry = clamp(p.ry, 28, state.imageH * 0.5);
    if (typeof p.tailX === "number") b.tailX = clamp(p.tailX, 0, state.imageW);
    if (typeof p.tailY === "number") b.tailY = clamp(p.tailY, 0, state.imageH);
  });
  render();
  toast(`Smart-placed ${parsed.length} balloon${parsed.length===1?"":"s"}`);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

$("btn-smart-place").addEventListener("click", async () => {
  const b = getSelected();
  if (!b) { toast("Select a balloon first"); return; }
  try { await smartPlaceBalloon(b); }
  catch (err) { await appAlert(err.message || String(err), "Smart Place failed"); }
});
$("btn-smart-place-all").addEventListener("click", async () => {
  try { await smartPlaceAll(); }
  catch (err) { await appAlert(err.message || String(err), "Smart Place failed"); }
});

// ============== SAVE / LOAD ==============
$("btn-save").addEventListener("click", () => {
  const data = {
    version: "0.2",
    platformVersion: PLATFORM_VERSION,
    image: state.imageDataUrl,
    imageW: state.imageW, imageH: state.imageH,
    balloons: state.balloons,
    parsedLines: state.parsedLines,
    scriptPhotos: scriptPhotos,
    nextId: state.nextId,
    defaultTailW: state.defaultTailW,
    shapeInsets: state.shapeInsets,
    whiteoutMasks: state.whiteoutMasks,
    ui: {
      mobileMode: state.mobileMode,
      sideBySide: state.sideBySide,
      scriptViewerIndex: state.scriptViewerIndex,
      scriptViewerZoom: state.scriptViewerZoom,
      zoom: state.zoom,
    },
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "letterer-project.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Project saved");
});

$("file-load").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      state.balloons = data.balloons || [];
      state.parsedLines = data.parsedLines || [];
      scriptPhotos = data.scriptPhotos || [];
      state.nextId = data.nextId || (state.balloons.length + 1);
      if (typeof data.defaultTailW === "number") state.defaultTailW = data.defaultTailW;
      if (data.shapeInsets && typeof data.shapeInsets === "object") state.shapeInsets = { ...state.shapeInsets, ...data.shapeInsets };
      state.whiteoutMasks = Array.isArray(data.whiteoutMasks) ? data.whiteoutMasks : [];
      syncShapeInsetInputs();
      if (data.image) loadImage(data.image);
      else { state.imageW = data.imageW || 1000; state.imageH = data.imageH || 1500; render(); }
      renderChips();
      renderScriptThumbs();
      // Restore UI preferences (set after content loads so layout reflows correctly).
      if (data.ui) {
        if (data.ui.mobileMode) setMobileMode(true);
        if (data.ui.sideBySide) setSideBySide(true);
        if (typeof data.ui.scriptViewerIndex === "number") state.scriptViewerIndex = data.ui.scriptViewerIndex;
        if (typeof data.ui.scriptViewerZoom === "number") state.scriptViewerZoom = data.ui.scriptViewerZoom;
        if (state.sideBySide) updateScriptViewer();
        if (typeof data.ui.zoom === "number") {
          state.zoom = data.ui.zoom;
          // Apply after the loaded image has finished its onload pass that calls fitZoom.
          setTimeout(() => applyZoom(), 80);
        }
      }
      toast("Project loaded");
    } catch (err) { appAlert("Invalid project file: " + err.message, "Load failed"); }
  };
  r.readAsText(f);
});

// ============== EXPORT PNG ==============
// ============== EXPORT PNG ==============
const GOOGLE_FONT_FAMILIES = {
  "Bangers": "Bangers",
  "Bungee": "Bungee",
  "Comic Neue": "Comic+Neue:wght@400;700",
  "Kalam": "Kalam:wght@400;700",
  "Luckiest Guy": "Luckiest+Guy",
  "Permanent Marker": "Permanent+Marker",
};
const fontCssCache = new Map(); // family -> inlined @font-face CSS
function familyFromStack(stack) {
  const m = (stack || "").match(/'([^']+)'|"([^"]+)"|([^,]+)/);
  return ((m && (m[1] || m[2] || m[3])) || "").trim();
}
async function inlineGoogleFont(family) {
  if (fontCssCache.has(family)) return fontCssCache.get(family);
  const spec = GOOGLE_FONT_FAMILIES[family];
  if (!spec) { fontCssCache.set(family, ""); return ""; }
  // Fetch the Google Fonts CSS — browser UA gets woff2 by default.
  const cssResp = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
  if (!cssResp.ok) throw new Error(`CSS fetch ${cssResp.status}`);
  let css = await cssResp.text();
  // Find every woff2 URL and replace with a base64 data URL.
  const urls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)).map(m => m[1]);
  const unique = Array.from(new Set(urls));
  for (const u of unique) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`font fetch ${r.status}`);
    const buf = await r.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);
    const dataUrl = `data:font/woff2;base64,${b64}`;
    // Replace every occurrence of this URL.
    css = css.split(u).join(dataUrl);
  }
  fontCssCache.set(family, css);
  return css;
}

// ============== SHARED TEXT-FIT LAYOUT ==============
// Pure layout solver that mirrors the export wrap+shrink+safe-area math exactly,
// without touching the DOM. Returns the final lines, font size, widest measured
// line, and whether everything stays inside the balloon's safe area. The export
// path and the regression gallery both rely on this identical formula so the
// gallery faithfully verifies real export behaviour.
const _layoutMeasureCtx = (() => {
  const c = document.createElement("canvas");
  return c.getContext("2d");
})();

function computeBalloonTextLayout(b) {
  const mctx = _layoutMeasureCtx;
  const text = (b.text ?? "").replace(/\s+\n/g, "\n");
  const fontFamily = b.font || "sans-serif";
  const fontWeight = b.weight || "normal";
  const fontStyle = b.italic || "normal";
  const letterSpacing = b.tracking || 0;
  let fontSize = b.size || 16;

  const rx = b.rx, ry = b.ry;
  const shape = (b.shape || "oval").toLowerCase();
  const isOval = shape === "ellipse" || shape === "oval" || shape === "cloud"
    || shape === "burst" || shape === "thought" || shape === "whisper"
    || shape === "round" || shape === "radio";
  const edgeInset = getEffectiveInset(b);
  // The foreignObject box used for non-oval shapes mirrors the render() math.
  const foW = isOval ? (rx * 2 / Math.SQRT2) * (1 - edgeInset) : (rx * 2 - 28);
  const foH = isOval ? (ry * 2 / Math.SQRT2) * (1 - edgeInset) : (ry * 2 - 16);

  const measure = (s) => {
    let w = mctx.measureText(s).width;
    if (letterSpacing) w += Math.max(0, s.length - 1) * letterSpacing;
    return w;
  };
  const widthAt = (numLines) => {
    const lineH = fontSize * 1.18;
    const blockH = Math.max(lineH, numLines * lineH);
    if (!isOval) return Math.max(8, foW - 2 * (foW * edgeInset));
    const yOff = blockH / 2;
    const safeRy = ry * (1 - edgeInset);
    const safeRx = rx * (1 - edgeInset);
    const t = Math.min(1, Math.abs(yOff) / safeRy);
    const halfW = safeRx * Math.sqrt(Math.max(0, 1 - t * t));
    return Math.max(8, 2 * halfW);
  };
  const breakWord = (word, maxW) => {
    const parts = []; let buf = "";
    for (const ch of word) {
      if (measure(buf + ch) <= maxW) buf += ch;
      else { if (buf) parts.push(buf); buf = ch; }
    }
    if (buf) parts.push(buf);
    return parts.length ? parts : [word];
  };
  const wrap = () => {
    mctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const paragraphs = text.split(/\r?\n/);
    let lines = []; let pass = 0; let estLines = Math.max(1, paragraphs.length);
    while (pass < 4) {
      lines = [];
      const maxAllowed = widthAt(estLines);
      for (const para of paragraphs) {
        if (!para) { lines.push(""); continue; }
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { lines.push(""); continue; }
        let cur = "";
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          if (measure(word) > maxAllowed) {
            if (cur) { lines.push(cur); cur = ""; }
            const chunks = breakWord(word, maxAllowed);
            for (let c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
            cur = chunks[chunks.length - 1];
            continue;
          }
          const next = cur ? cur + " " + word : word;
          if (measure(next) <= maxAllowed) cur = next;
          else { lines.push(cur); cur = word; }
        }
        if (cur) lines.push(cur);
      }
      if (lines.length === estLines) break;
      estLines = lines.length; pass++;
    }
    let widest = 0;
    for (const ln of lines) widest = Math.max(widest, measure(ln));
    return { lines, widest };
  };

  const minSize = Math.max(8, (b.size || 16) * 0.55);
  let lines, widest, fits = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = wrap();
    lines = r.lines; widest = r.widest;
    const lineH = fontSize * 1.18;
    const blockH = lines.length * lineH;
    const safeH = isOval ? 2 * ry * (1 - edgeInset) : foH;
    if (blockH <= safeH && widest <= widthAt(lines.length) + 0.5) { fits = true; break; }
    if (fontSize <= minSize) { fits = false; break; }
    fontSize = Math.max(minSize, fontSize * 0.94);
  }
  const lineH = fontSize * 1.18;
  const blockH = lines.length * lineH;
  const safeH = isOval ? 2 * ry * (1 - edgeInset) : foH;
  const maxWidthAllowed = widthAt(lines.length);
  return {
    lines, fontSize: Math.round(fontSize * 10) / 10, widest: Math.round(widest),
    maxWidthAllowed: Math.round(maxWidthAllowed), blockH: Math.round(blockH),
    safeH: Math.round(safeH), fits,
    widthOverflow: Math.max(0, Math.round(widest - (maxWidthAllowed + 0.5))),
    heightOverflow: Math.max(0, Math.round(blockH - safeH)),
  };
}

// ============== REGRESSION GALLERY (worst-case text fit) ==============
// A curated set of pathological balloon contents that have historically broken
// wrapping or auto-shrink. Each case is laid out with the real solver above and
// verified to stay within the balloon's safe area.
const TEXT_FIT_GALLERY = [
  { name: "Long unbreakable token", shape: "ellipse", rx: 100, ry: 50, text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
  { name: "URL with no spaces", shape: "ellipse", rx: 110, ry: 55, text: "https://www.example.com/really/long/path?query=value&more=stuff" },
  { name: "Many tiny words", shape: "ellipse", rx: 120, ry: 60, text: "a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a" },
  { name: "Huge paragraph", shape: "ellipse", rx: 130, ry: 65, text: "CAPTAIN RHEA! THE RYUKEN WILL MAINTAIN GEOSYNCHRONOUS ORBIT OVER CONSTERYA MINOR AS OUR LAST LINE OF DEFENSE. IF THE NEPTUNIANS OR THE GAIANS REACH THE LUMINATOR, THERE WON'T BE ANYONE LEFT TO SAVE." },
  { name: "Hyphen-heavy compound", shape: "ellipse", rx: 100, ry: 50, text: "ANTI-MATTER-CONTAINMENT-FIELD-GENERATOR-OVERLOAD-IMMINENT" },
  { name: "Forced newlines", shape: "ellipse", rx: 100, ry: 60, text: "ONE\nTWO\nTHREE\nFOUR\nFIVE\nSIX\nSEVEN\nEIGHT" },
  { name: "Burst tiny balloon", shape: "burst", rx: 70, ry: 45, text: "WHAAAAAAAAAAAAAAAAAT?!?!" },
  { name: "Caption box long", shape: "rect", rx: 140, ry: 40, text: "MEANWHILE, ACROSS THE SHATTERED REMAINS OF THE OUTER COLONIES, A NEW THREAT STIRS IN THE DARK BETWEEN STARS." },
  { name: "Single giant word", shape: "ellipse", rx: 90, ry: 45, text: "SUPERCALIFRAGILISTICEXPIALIDOCIOUS" },
  { name: "Punctuation storm", shape: "ellipse", rx: 95, ry: 48, text: "!!!???...---,,,;;;:::!!!???...---,,,;;;:::" },
];

function runTextFitRegression() {
  const results = [];
  for (const c of TEXT_FIT_GALLERY) {
    const b = {
      text: c.text, shape: c.shape, rx: c.rx, ry: c.ry,
      cx: c.rx + 10, cy: c.ry + 10,
      font: c.font || "Arial, sans-serif",
      size: c.size || 16, weight: c.weight || 400, italic: c.italic || "normal",
      tracking: c.tracking || 0, edgeInset: typeof c.edgeInset === "number" ? c.edgeInset : null,
    };
    const layout = computeBalloonTextLayout(b);
    results.push({ name: c.name, ...layout });
  }
  return results;
}



// Convert all <foreignObject> nodes in `root` into native SVG <text> elements.
// This is required for canvas rasterization: SVGs with foreignObject taint the
// canvas in Safari/Firefox, causing toBlob/toDataURL to throw SecurityError.
function foreignObjectsToSvgText(root, balloons, debug) {
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  const byId = new Map((balloons || []).map(b => [b.id, b]));
  const fos = Array.from(root.querySelectorAll("foreignObject"));

  // Wrap `text` to fit within `widthAt(i, total)` per line; never let any line overflow
  // even if a single word is too wide (in which case break the word).
  function wrapText(text, fontStyle, fontWeight, fontFamily, fontSize, letterSpacing, widthAt) {
    mctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const measure = (s) => {
      let w = mctx.measureText(s).width;
      if (letterSpacing) w += Math.max(0, s.length - 1) * letterSpacing;
      return w;
    };
    // Hard-break a single token that exceeds maxW into chunks <= maxW.
    const breakWord = (word, maxW) => {
      const parts = [];
      let buf = "";
      for (const ch of word) {
        if (measure(buf + ch) <= maxW) buf += ch;
        else { if (buf) parts.push(buf); buf = ch; }
      }
      if (buf) parts.push(buf);
      return parts.length ? parts : [word];
    };

    const paragraphs = text.split(/\r?\n/);
    // Two-pass: we don't know the final line count yet, so use an upper-bound width
    // (widest of all lines) for an initial pass, then re-wrap if needed.
    let lines = [];
    let pass = 0;
    let estLines = Math.max(1, paragraphs.length);
    while (pass < 4) {
      lines = [];
      const maxAllowed = widthAt(estLines);
      for (const para of paragraphs) {
        if (!para) { lines.push(""); continue; }
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { lines.push(""); continue; }
        let cur = "";
        for (let i = 0; i < words.length; i++) {
          let word = words[i];
          // If the word alone is wider than the line, hard-break it.
          if (measure(word) > maxAllowed) {
            if (cur) { lines.push(cur); cur = ""; }
            const chunks = breakWord(word, maxAllowed);
            for (let c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
            cur = chunks[chunks.length - 1];
            continue;
          }
          const next = cur ? cur + " " + word : word;
          if (measure(next) <= maxAllowed) cur = next;
          else { lines.push(cur); cur = word; }
        }
        if (cur) lines.push(cur);
      }
      if (lines.length === estLines) break;
      estLines = lines.length;
      pass++;
    }
    // Final measurement of widest line.
    let widest = 0;
    for (const ln of lines) widest = Math.max(widest, measure(ln));
    return { lines, widest, measure };
  }

  for (const fo of fos) {
    const x = parseFloat(fo.getAttribute("x")) || 0;
    const y = parseFloat(fo.getAttribute("y")) || 0;
    const w = parseFloat(fo.getAttribute("width")) || 0;
    const h = parseFloat(fo.getAttribute("height")) || 0;
    const div = fo.querySelector("div");
    if (!div) { fo.remove(); continue; }
    const idEl = fo.closest("[data-id]");
    const balloon = idEl ? byId.get(idEl.getAttribute("data-id")) : null;
    const text = (balloon?.text ?? div.textContent ?? "").replace(/\s+\n/g, "\n");
    const fontFamily = div.style.fontFamily || "sans-serif";
    let fontSize = parseFloat(div.style.fontSize) || 16;
    const fontWeight = div.style.fontWeight || "normal";
    const fontStyle = div.style.fontStyle || "normal";
    const color = div.style.color || "#000";
    const letterSpacing = parseFloat(div.style.letterSpacing) || 0;

    // Balloon geometry (in image-pixel space). Use the balloon record so we know
    // its true shape; the foreignObject is a rectangle inscribed inside it.
    const cx = balloon ? balloon.cx : x + w / 2;
    const cy = balloon ? balloon.cy : y + h / 2;
    const rx = balloon ? balloon.rx : w / 2;
    const ry = balloon ? balloon.ry : h / 2;
    const isOval = !balloon || balloon.shape === "ellipse" || balloon.shape === "cloud" || balloon.shape === "burst";

    // Inset from the balloon edge so text never touches the stroke. Burst/cloud have
    // wavy outlines so they need more room than a clean ellipse. A per-balloon
    // `edgeInset` override (0..0.4) replaces the shape default — useful for
    // fine-tuning tight layouts where the default crops or wastes space. When auto,
    // the configurable per-shape default (state.shapeInsets) is used.
    const edgeInset = getEffectiveInset(balloon);

    // Compute the maximum line width allowed when the block will be `numLines` tall.
    // For ovals, the narrowest line in the block sits closest to top/bottom; we size
    // the wrap width to that narrowest row so no line escapes the curve.
    const widthAt = (numLines) => {
      const lineH = fontSize * 1.18;
      const blockH = Math.max(lineH, numLines * lineH);
      if (!isOval) {
        return Math.max(8, w - 2 * (w * edgeInset));
      }
      // Half-height of the top/bottom-most line, relative to balloon center.
      const yOff = blockH / 2;
      const safeRy = ry * (1 - edgeInset);
      const safeRx = rx * (1 - edgeInset);
      const t = Math.min(1, Math.abs(yOff) / safeRy);
      const halfW = safeRx * Math.sqrt(Math.max(0, 1 - t * t));
      return Math.max(8, 2 * halfW);
    };

    // Try the current font size; if the block is too tall to fit, shrink and retry.
    const minSize = Math.max(8, fontSize * 0.55);
    let lines, widest;
    for (let attempt = 0; attempt < 20; attempt++) {
      const r = wrapText(text, fontStyle, fontWeight, fontFamily, fontSize, letterSpacing, widthAt);
      lines = r.lines; widest = r.widest;
      const lineH = fontSize * 1.18;
      const blockH = lines.length * lineH;
      const safeH = isOval ? 2 * ry * (1 - edgeInset) : h;
      if (blockH <= safeH && widest <= widthAt(lines.length) + 0.5) break;
      if (fontSize <= minSize) break;
      fontSize = Math.max(minSize, fontSize * 0.94);
    }

    const lineHeight = fontSize * 1.18;
    const totalH = lines.length * lineHeight;
    // Center the block vertically in the balloon, then move down by ~0.78em so the
    // first baseline sits at the top of the visible block.
    const startY = cy - totalH / 2 + fontSize * 0.82;

    const textEl = document.createElementNS(SVG_NS, "text");
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("fill", color);
    textEl.setAttribute("font-family", fontFamily);
    textEl.setAttribute("font-size", String(fontSize));
    textEl.setAttribute("font-weight", String(fontWeight));
    textEl.setAttribute("font-style", fontStyle);
    if (letterSpacing) textEl.setAttribute("letter-spacing", String(letterSpacing));
    textEl.setAttribute("xml:space", "preserve");

    for (let i = 0; i < lines.length; i++) {
      const tspan = document.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", String(cx));
      tspan.setAttribute("y", String(startY + i * lineHeight));
      tspan.textContent = lines[i];
      textEl.appendChild(tspan);
    }

    // Debug overlay: measured per-line boxes + the computed safe area. Drawn as a
    // sibling group so it sits above the text and is easy to strip out.
    if (debug) {
      const dbg = document.createElementNS(SVG_NS, "g");
      dbg.setAttribute("data-debug-textfit", "1");
      mctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

      // Safe area: ellipse for ovals, rect for boxes.
      if (isOval) {
        const ell = document.createElementNS(SVG_NS, "ellipse");
        ell.setAttribute("cx", String(cx));
        ell.setAttribute("cy", String(cy));
        ell.setAttribute("rx", String(rx * (1 - edgeInset)));
        ell.setAttribute("ry", String(ry * (1 - edgeInset)));
        ell.setAttribute("fill", "none");
        ell.setAttribute("stroke", "#00b3ff");
        ell.setAttribute("stroke-width", "1.5");
        ell.setAttribute("stroke-dasharray", "6 4");
        dbg.appendChild(ell);
      } else {
        const safeW = w - 2 * (w * edgeInset);
        const safeRect = document.createElementNS(SVG_NS, "rect");
        safeRect.setAttribute("x", String(cx - safeW / 2));
        safeRect.setAttribute("y", String(cy - h / 2));
        safeRect.setAttribute("width", String(safeW));
        safeRect.setAttribute("height", String(h));
        safeRect.setAttribute("fill", "none");
        safeRect.setAttribute("stroke", "#00b3ff");
        safeRect.setAttribute("stroke-width", "1.5");
        safeRect.setAttribute("stroke-dasharray", "6 4");
        dbg.appendChild(safeRect);
      }

      // Per-line measured boxes (width = measured text width, height = lineHeight).
      for (let i = 0; i < lines.length; i++) {
        const lw = mctx.measureText(lines[i]).width + (letterSpacing * Math.max(0, lines[i].length - 1));
        const boxTop = (startY + i * lineHeight) - fontSize * 0.82;
        const overflow = lw > widthAt(lines.length) + 0.5;
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(cx - lw / 2));
        rect.setAttribute("y", String(boxTop));
        rect.setAttribute("width", String(Math.max(1, lw)));
        rect.setAttribute("height", String(lineHeight));
        rect.setAttribute("fill", overflow ? "rgba(255,0,0,0.12)" : "rgba(0,255,120,0.10)");
        rect.setAttribute("stroke", overflow ? "#ff2d2d" : "#16c060");
        rect.setAttribute("stroke-width", "1");
        dbg.appendChild(rect);
      }

      // Label: final font size + line count.
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(cx));
      label.setAttribute("y", String(cy - ry * (1 - edgeInset) - 4));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#00b3ff");
      label.setAttribute("font-family", "monospace");
      label.setAttribute("font-size", "11");
      label.textContent = `${Math.round(fontSize)}px · ${lines.length}L`;
      dbg.appendChild(label);

      fo.parentNode.insertBefore(dbg, fo.nextSibling);
    }

    fo.parentNode.replaceChild(textEl, fo);
  }
}

$("btn-export-png").addEventListener("click", async () => {
  if (!state.imageDataUrl) { toast("Load a page image first"); return; }
  // Deselect so selection chrome doesn't render
  const wasSelected = state.selectedId; state.selectedId = null; render();
  try {
    const w = state.imageW, h = state.imageH;

    // Collect all Google font families actually used by balloons.
    const families = new Set();
    for (const b of state.balloons) {
      const fam = familyFromStack(b.font);
      if (GOOGLE_FONT_FAMILIES[fam]) families.add(fam);
    }
    let inlinedCss = "";
    for (const fam of families) {
      try { inlinedCss += await inlineGoogleFont(fam) + "\n"; }
      catch (e) { toast(`Could not embed ${fam} — using fallback`); }
    }

    // Make sure any in-page font faces are loaded before rasterizing.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) { /* ignore */ }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Draw image
    const img = new Image();
    img.src = state.imageDataUrl;
    await new Promise(res => { img.onload = res; });
    ctx.drawImage(img, 0, 0, w, h);
    // Serialize SVG and draw on top
    const svgClone = overlay.cloneNode(true);
    svgClone.setAttribute("xmlns", SVG_NS);
    svgClone.setAttribute("width", w);
    svgClone.setAttribute("height", h);
    // CRITICAL: foreignObject taints the canvas in Safari/Firefox ("The operation is insecure").
    // Convert each foreignObject to native SVG <text> with wrapped tspans for export.
    foreignObjectsToSvgText(svgClone, state.balloons, state.debugTextFit);
    // Inline used Google Fonts so the SVG has no external network deps.
    if (inlinedCss) {
      const defs = document.createElementNS(SVG_NS, "defs");
      const style = document.createElementNS(SVG_NS, "style");
      style.setAttribute("type", "text/css");
      style.textContent = inlinedCss;
      defs.appendChild(style);
      svgClone.insertBefore(defs, svgClone.firstChild);
    }
    const ser = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([ser], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const overlayImg = new Image();
    overlayImg.src = url;
    await new Promise((res, rej) => { overlayImg.onload = res; overlayImg.onerror = rej; });
    ctx.drawImage(overlayImg, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lettered-page.png";
      a.click();
    }, "image/png");
    toast("PNG exported");
  } catch (err) {
    await appAlert("Export failed: " + err.message + "\n\nTry Save Project and reload, or pick a system font (Arial, Comic Sans MS) for the balloons.", "Export failed");
  } finally {
    state.selectedId = wasSelected; render();
  }
});

// ============== UTILS ==============
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

// ============== KLEIN-STYLE READING ORDER ==============
state.showTrail = false;
$("btn-reading-order").addEventListener("click", () => {
  state.showTrail = !state.showTrail;
  $("btn-reading-order").classList.toggle("active", state.showTrail);
  render();
  if (state.showTrail) toast(state.balloons.length ? `Reading order shown — ${state.balloons.length} balloon${state.balloons.length===1?"":"s"}` : "Reading order shown — drop balloons to see numbering");
});

// ============== TEXT FIT DEBUG TOGGLE ==============
$("btn-text-fit-debug").addEventListener("click", () => {
  state.debugTextFit = !state.debugTextFit;
  $("btn-text-fit-debug").classList.toggle("active", state.debugTextFit);
  toast(state.debugTextFit
    ? "Text Fit Debug ON — exported PNG will show line boxes + safe area"
    : "Text Fit Debug OFF");
});

// ============== FIT TESTS (regression gallery) ==============
$("btn-fit-tests").addEventListener("click", async () => {
  const results = runTextFitRegression();
  const passed = results.filter(r => r.fits).length;
  const allPass = passed === results.length;
  const lines = results.map(r => {
    const status = r.fits ? "PASS" : "FAIL";
    const detail = r.fits
      ? `${r.lines.length}L @ ${r.fontSize}px (w ${r.widest}/${r.maxWidthAllowed})`
      : `overflow w+${r.widthOverflow} h+${r.heightOverflow} @ ${r.fontSize}px`;
    return `[${status}] ${r.name} — ${detail}`;
  });
  const summary = `${passed}/${results.length} cases within bounds\n\n` + lines.join("\n");
  // Also log full detail to the console for CI-style inspection.
  console.table(results.map(r => ({
    case: r.name, fits: r.fits, lines: r.lines.length, fontSize: r.fontSize,
    widest: r.widest, maxW: r.maxWidthAllowed, blockH: r.blockH, safeH: r.safeH,
    wOver: r.widthOverflow, hOver: r.heightOverflow,
  })));
  toast(allPass ? `Fit Tests: all ${results.length} passed` : `Fit Tests: ${results.length - passed} FAILED`);
  await appAlert(summary, allPass ? "Fit Tests — all passed ✓" : "Fit Tests — failures detected");
});





// ============== SIDE-BY-SIDE SCRIPT VIEWER ==============
state.sideBySide = false;
state.scriptViewerIndex = 0;
state.scriptViewerZoom = 1;

function setSideBySide(on) {
  document.body.classList.toggle("side-by-side", on);
  $("btn-side-by-side").classList.toggle("active", on);
  state.sideBySide = on;
  if (on) updateScriptViewer();
  // Width of canvas pane changed; refit zoom so the comic page sizes correctly.
  setTimeout(() => { if (state.imageW) fitZoom(); }, 80);
}

function updateScriptViewer() {
  const img = $("script-viewer-img");
  const empty = $("script-viewer-empty");
  if (!scriptPhotos.length) {
    img.style.display = "none";
    empty.style.display = "block";
    $("script-page-indicator").textContent = "0 / 0";
    $("btn-script-prev").disabled = true;
    $("btn-script-next").disabled = true;
    return;
  }
  state.scriptViewerIndex = Math.max(0, Math.min(state.scriptViewerIndex, scriptPhotos.length - 1));
  const ph = scriptPhotos[state.scriptViewerIndex];
  img.src = ph.dataUrl;
  img.style.display = "block";
  empty.style.display = "none";
  $("script-page-indicator").textContent = `${state.scriptViewerIndex + 1} / ${scriptPhotos.length}`;
  $("btn-script-prev").disabled = state.scriptViewerIndex === 0;
  $("btn-script-next").disabled = state.scriptViewerIndex === scriptPhotos.length - 1;
  applyScriptZoom();
}
function applyScriptZoom() {
  const img = $("script-viewer-img");
  $("script-zoom-label").textContent = Math.round(state.scriptViewerZoom * 100) + "%";
  // Use width/height scaling rather than CSS transform so the parent's scrollable area grows with
  // zoom. Wait for naturalWidth to be available; if the image is still loading, defer.
  const apply = () => {
    if (!img.naturalWidth) return;
    img.style.width = (img.naturalWidth * state.scriptViewerZoom) + "px";
    img.style.height = (img.naturalHeight * state.scriptViewerZoom) + "px";
    img.style.transform = "";
  };
  if (img.naturalWidth) apply();
  else img.onload = apply;
}

$("btn-side-by-side").addEventListener("click", () => setSideBySide(!state.sideBySide));
$("btn-script-prev").addEventListener("click", () => { state.scriptViewerIndex--; updateScriptViewer(); });
$("btn-script-next").addEventListener("click", () => { state.scriptViewerIndex++; updateScriptViewer(); });
$("btn-script-zoom-in").addEventListener("click", () => { state.scriptViewerZoom = Math.min(4, state.scriptViewerZoom * 1.2); applyScriptZoom(); });
$("btn-script-zoom-out").addEventListener("click", () => { state.scriptViewerZoom = Math.max(0.2, state.scriptViewerZoom / 1.2); applyScriptZoom(); });
$("btn-script-fit").addEventListener("click", () => { state.scriptViewerZoom = 1; applyScriptZoom(); });
$("btn-script-close").addEventListener("click", () => setSideBySide(false));

// Divider drag — resize the script viewer pane (horizontal in desktop, vertical in mobile).
let dividerDrag = null;
$("canvas-divider").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const isVert = state.mobileMode;
  const sv = $("script-viewer");
  const svRect = sv.getBoundingClientRect();
  const wsRect = $("workspace").getBoundingClientRect();
  dividerDrag = {
    isVert,
    start: isVert ? e.clientY : e.clientX,
    startSize: isVert ? svRect.height : svRect.width,
    wsSize: isVert ? wsRect.height : wsRect.width,
  };
  $("canvas-divider").setPointerCapture(e.pointerId);
});
window.addEventListener("pointermove", (e) => {
  if (!dividerDrag) return;
  const { isVert, start, startSize, wsSize } = dividerDrag;
  const delta = (isVert ? e.clientY : e.clientX) - start;
  const newSize = Math.max(180, Math.min(wsSize - 180, startSize + delta));
  const pct = (newSize / wsSize) * 100;
  $("script-viewer").style.flex = `0 0 ${pct}%`;
  if (state.imageW) fitZoom();
});
window.addEventListener("pointerup", () => { dividerDrag = null; });

// ============== MOBILE MODE (iOS-optimized) ==============
state.mobileMode = false;

function setMobileMode(on) {
  document.body.classList.toggle("mobile-mode", on);
  $("btn-mobile-toggle").classList.toggle("active", on);
  state.mobileMode = on;
  closeAllSheets();
  // After layout reflows, refit zoom and re-render so handles resize correctly.
  setTimeout(() => { if (state.imageW) fitZoom(); render(); }, 50);
}

$("btn-mobile-toggle").addEventListener("click", () => setMobileMode(!state.mobileMode));
const btnExitMobile = $("btn-exit-mobile");
if (btnExitMobile) {
  btnExitMobile.addEventListener("click", () => {
    setMobileMode(false);
    toast("Switched to desktop view");
  });
}

function closeAllSheets() {
  document.querySelector("aside.left").classList.remove("sheet-open");
  document.querySelector("aside.right").classList.remove("sheet-open");
  $("sheet-backdrop").classList.remove("show");
  document.querySelectorAll("#mobile-tabbar button").forEach(b => b.classList.remove("active"));
  const canvasBtn = document.querySelector('#mobile-tabbar button[data-tab="canvas"]');
  if (canvasBtn) canvasBtn.classList.add("active");
}
function openSheet(tab) {
  closeAllSheets();
  if (tab === "script") document.querySelector("aside.left").classList.add("sheet-open");
  else if (tab === "inspector") document.querySelector("aside.right").classList.add("sheet-open");
  $("sheet-backdrop").classList.add("show");
  document.querySelectorAll("#mobile-tabbar button").forEach(b => b.classList.remove("active"));
  const tabBtn = document.querySelector(`#mobile-tabbar button[data-tab="${tab}"]`);
  if (tabBtn) tabBtn.classList.add("active");
}
document.querySelectorAll("#mobile-tabbar button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "canvas") {
      closeAllSheets();
    } else if (tab === "format") {
      const sel = getSelected();
      if (sel) { autoFormatBalloon(sel); render(); toast("Formatted"); }
      else toast("Select a balloon first");
    } else if (tab === "desktop") {
      setMobileMode(false);
      toast("Switched to desktop view");
    } else {
      openSheet(tab);
    }
  });
});

// Tap the dimmed backdrop to dismiss any open sheet — iOS sheet convention.
$("sheet-backdrop").addEventListener("click", () => closeAllSheets());

// Auto-detect mobile on first load. Use UA + viewport width rather than pointer:coarse so a
// touch-screen Windows laptop is NOT treated as a phone. Mobile mode can always be toggled manually.
(() => {
  const ua = navigator.userAgent || "";
  const isMobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  if (isMobileUA && window.innerWidth < 1100) setMobileMode(true);
})();

// ============== INIT ==============
bindInspector();
window.addEventListener("resize", () => { if (state.imageW) fitZoom(); });
window.addEventListener("keydown", (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable);
  const isMod = e.metaKey || e.ctrlKey;

  // Esc cancels the connect-balloon picker
  if (e.key === "Escape" && state.connectPickerSourceId) {
    state.connectPickerSourceId = null;
    syncInspector();
    toast("Connect cancelled");
    return;
  }

  // Connector shortcuts (only when a balloon is selected and we're not editing text):
  //   C            — arm connect mode from the selected balloon (then click another, or Esc)
  //   Shift+C / X  — remove the connector on the selected balloon, if any
  if (!isEditing && !isMod && state.selectedId) {
    const b = state.balloons.find(x => x.id === state.selectedId);
    if (b) {
      if (e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        state.connectPickerSourceId = state.connectPickerSourceId === b.id ? null : b.id;
        render(); syncInspector();
        toast(state.connectPickerSourceId ? "Click another balloon to connect (Esc to cancel)" : "Connect cancelled");
        return;
      }
      if ((e.key === "C" || (e.key === "c" && e.shiftKey) || e.key === "x" || e.key === "X") && b.connectedTo) {
        e.preventDefault();
        pushUndo();
        const partner = state.balloons.find(x => x.id === b.connectedTo);
        if (partner && partner.connectedTo === b.id) partner.connectedTo = null;
        b.connectedTo = null;
        render(); syncInspector();
        toast("Connector removed");
        return;
      }
      // R — quick-reconnect the selected balloon to the last connection target
      if ((e.key === "r" || e.key === "R") && state.lastConnectTargetId) {
        const target = state.balloons.find(x => x.id === state.lastConnectTargetId);
        if (!target || target.id === b.id) {
          toast("No previous target available");
          return;
        }
        e.preventDefault();
        if (connectBalloons(b, target)) {
          state.connectPickerSourceId = null;
          render(); syncInspector();
          toast("Reconnected to last target");
        }
        return;
      }
    }
  }

  // Undo / Redo (do not fire while typing in an input/textarea/contenteditable — let the browser
  // handle native text undo there).
  if (isMod && !isEditing) {
    if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); return; }
  }

  // Delete selected balloon (Delete or Backspace, when not editing text)
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId && !isEditing) {
    const b = state.balloons.find(x => x.id === state.selectedId);
    if (b) deleteBalloon(b);
    e.preventDefault();
  }
});

// ============== SCRIPT VIEWER: OCR + SELECTABLE TEXT ==============
(function () {
  state.scriptViewerMode = "image"; // "image" | "text"

  // --- OCR: call /api/ocr-script for any photo lacking ocrText ---
  async function ocrPhoto(ph) {
    if (ph.ocrText || ph._ocrLoading) return;
    ph._ocrLoading = true;
    refreshScriptViewerText();
    try {
      const base64 = (ph.dataUrl || "").split(",")[1] || "";
      const resp = await fetch("/api/ocr-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: ph.mediaType }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        ph.ocrError = "OCR failed: " + t.slice(0, 200);
      } else {
        const data = await resp.json();
        ph.ocrText = (data && data.text) || "";
        ph.ocrError = null;
      }
    } catch (err) {
      ph.ocrError = "OCR failed: " + (err && err.message ? err.message : String(err));
    } finally {
      ph._ocrLoading = false;
      refreshScriptViewerText();
      window.dispatchEvent(new CustomEvent("letterer:change"));
    }
  }

  // Watch for new photos uploaded — kick off OCR for any without text.
  const origRender = renderScriptThumbs;
  // eslint-disable-next-line no-global-assign
  renderScriptThumbs = function () {
    origRender.apply(this, arguments);
    if (typeof scriptPhotos !== "undefined") {
      scriptPhotos.forEach((ph) => { if (!ph.ocrText && !ph._ocrLoading && !ph.ocrError) ocrPhoto(ph); });
    }
  };

  // --- Mode toggle (Image / Text) ---
  function setScriptMode(mode) {
    state.scriptViewerMode = mode;
    const img = $("script-viewer-img");
    const txt = $("script-viewer-text");
    const empty = $("script-viewer-empty");
    $("btn-script-mode-image").classList.toggle("active", mode === "image");
    $("btn-script-mode-text").classList.toggle("active", mode === "text");
    if (!scriptPhotos.length) {
      img.style.display = "none";
      txt.style.display = "none";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    if (mode === "text") {
      img.style.display = "none";
      txt.style.display = "block";
      refreshScriptViewerText();
    } else {
      txt.style.display = "none";
      img.style.display = "block";
      applyScriptZoom();
    }
  }
  function refreshScriptViewerText() {
    const txt = $("script-viewer-text");
    if (!txt) return;
    const ph = scriptPhotos[state.scriptViewerIndex];
    if (!ph) { txt.textContent = ""; return; }
    if (ph._ocrLoading) {
      txt.classList.add("loading");
      txt.textContent = "Transcribing this page with AI…";
    } else if (ph.ocrError) {
      txt.classList.add("loading");
      txt.textContent = ph.ocrError + "\n\n(Click Image to view the photo.)";
    } else {
      txt.classList.remove("loading");
      txt.textContent = ph.ocrText || "(No text transcribed yet.)";
    }
  }
  $("btn-script-mode-image").addEventListener("click", () => setScriptMode("image"));
  $("btn-script-mode-text").addEventListener("click", () => {
    setScriptMode("text");
    const ph = scriptPhotos[state.scriptViewerIndex];
    if (ph && !ph.ocrText && !ph._ocrLoading) ocrPhoto(ph);
  });

  // Refresh text pane when navigating pages.
  ["btn-script-prev", "btn-script-next"].forEach((id) => {
    $(id).addEventListener("click", () => {
      if (state.scriptViewerMode === "text") setScriptMode("text");
    });
  });

  // --- Selection action toolbar ---
  const actions = $("script-selection-actions");
  const btnToParse = $("btn-selection-to-parse");
  const btnToBalloon = $("btn-selection-to-balloon");

  function getSelectionInTextPane() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const txt = $("script-viewer-text");
    const range = sel.getRangeAt(0);
    if (!txt.contains(range.commonAncestorContainer)) return null;
    const text = sel.toString();
    if (!text.trim()) return null;
    return { text, rect: range.getBoundingClientRect() };
  }
  function updateSelectionToolbar() {
    const info = getSelectionInTextPane();
    if (!info) { actions.style.display = "none"; return; }
    const sv = $("script-viewer").getBoundingClientRect();
    actions.style.display = "flex";
    // Position above the selection, clamped within the viewer.
    let top = info.rect.top - sv.top - actions.offsetHeight - 6;
    if (top < 4) top = info.rect.bottom - sv.top + 6;
    let left = info.rect.left - sv.left + info.rect.width / 2 - actions.offsetWidth / 2;
    left = Math.max(6, Math.min(sv.width - actions.offsetWidth - 6, left));
    actions.style.top = top + "px";
    actions.style.left = left + "px";
    btnToBalloon.disabled = !state.selectedId;
  }
  document.addEventListener("selectionchange", () => {
    if (state.scriptViewerMode !== "text") { actions.style.display = "none"; return; }
    // Defer to next frame so getBoundingClientRect is current.
    requestAnimationFrame(updateSelectionToolbar);
  });

  btnToParse.addEventListener("mousedown", (e) => e.preventDefault());
  btnToParse.addEventListener("click", () => {
    const info = getSelectionInTextPane();
    if (!info) return;
    const ta = $("script-input");
    const cur = ta.value;
    ta.value = (cur && !cur.endsWith("\n") ? cur + "\n" : cur) + info.text + "\n";
    ta.focus();
    ta.scrollTop = ta.scrollHeight;
    toast("Added selection to Parse Script");
    window.dispatchEvent(new CustomEvent("letterer:change"));
  });

  btnToBalloon.addEventListener("mousedown", (e) => e.preventDefault());
  btnToBalloon.addEventListener("click", () => {
    const info = getSelectionInTextPane();
    if (!info) return;
    const b = getSelected();
    if (!b) { toast("Select a balloon first"); return; }
    b.text = info.text;
    $("i-text").value = info.text;
    render();
    toast("Updated balloon text");
    window.dispatchEvent(new CustomEvent("letterer:change"));
  });

  // Hook into setSideBySide / updateScriptViewer to refresh text view.
  const origUpdate = updateScriptViewer;
  // eslint-disable-next-line no-global-assign
  updateScriptViewer = function () {
    origUpdate.apply(this, arguments);
    if (state.scriptViewerMode === "text") setScriptMode("text");
  };
})();

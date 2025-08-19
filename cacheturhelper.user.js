// ==UserScript==
// @name            The Cachetur Assistant
// @name:no         Cacheturassistenten
// @author          cachetur.no, thomfre
// @namespace       http://cachetur.no/
// @version         3.5.2.4
// @description     Companion script for cachetur.no
// @description:no  Hjelper deg å legge til cacher i cachetur.no
// @icon            https://cachetur.net/img/logo_top.png
// @match           https://www.geocaching.com/play/map*
// @match           http://www.geocaching.com/play/map*
// @match           https://www.geocaching.com/map/*
// @match           http://www.geocaching.com/map/*
// @match           https://www.geocaching.com/live/play/map*
// @match           http://www.geocaching.com/live/play/map*
// @match           https://www.geocaching.com/geocache/*
// @match           http://www.geocaching.com/geocache/*
// @match           https://www.geocaching.com/seek/cache_details.aspx*
// @match           https://www.geocaching.com/plan/*
// @match           https://www.geocaching.com/play/geotours*
// @match           http://project-gc.com/*
// @match           https://project-gc.com/*
// @match           http*://cachetur.no/bobilplasser
// @connect         cachetur.no
// @connect         cachetur.net
// @connect         raw.githubusercontent.com
// @connect         github.com
// @connect         self
// @grant           GM_xmlhttpRequest
// @grant           GM_info
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_openInTab
// @grant           GM_registerMenuCommand
// @grant           GM_addStyle
// @grant           unsafeWindow
// @run-at          document-end
// @copyright       2017+, cachetur.no
// @require         https://raw.githubusercontent.com/cghove/GM_config/master/gm_config.js
// @require         https://code.jquery.com/jquery-latest.js
// @require         https://unpkg.com/i18next@22.4.9/i18next.min.js
// @require         https://unpkg.com/i18next-xhr-backend@3.2.2/i18nextXHRBackend.js
// @require         https://unpkg.com/i18next-browser-languagedetector@7.0.1/i18nextBrowserLanguageDetector.js
// @require         https://gist.github.com/raw/2625891/waitForKeyElements.js
// @updateURL       https://github.com/cachetur-no/cachetur-assistant/blob/master/cacheturhelper.meta.js
// @downloadURL     https://github.com/cachetur-no/cachetur-assistant/raw/master/cacheturhelper.user.js
// @supportURL      https://github.com/cachetur-no/cachetur-assistant/issues
// ==/UserScript==

// === DRY helpers injected by refactor (phase 1) ===

function ctInsert(data, $target, mode) {
    try {
        if ($target && typeof $target[mode] === 'function') {
            $target[mode](data);
        }
    } catch (e) {
        console.log("ctInsert error:", e);
    }
}

function ctIsGoogleMapsActive() {
    return !!(document.querySelector("script[src*='//maps.googleapis.com/']") ||
              document.querySelector("script[src*='maps.googleapis.com/maps-api-v3']") ||
              document.querySelector("script[src*='maps.googleapis.com/maps-api-v3.js']"));
}

// Optional marker helpers (not automatically wired to avoid regressions)
function ctBuildDivIcon(html, className) {
    if (typeof L === 'undefined' || !L.divIcon) return null;
    return L.divIcon({ html: html, className: className || '' });
}

function ctBuildMarkersLayer(items) {
    if (!Array.isArray(items) || typeof L === 'undefined') return null;
    const markers = items.map(it => L.marker(it.latlng, { icon: it.icon }).bindPopup(it.popup || ""));
    return L.layerGroup(markers);
}
// === end DRY helpers ===


/* globals jQuery, $, waitForKeyElements, L, i18next, i18nextXHRBackend, i18nextBrowserLanguageDetector, cloneInto, gm_config */

this.$ = this.jQuery = jQuery.noConflict(true);
let path = window.location.pathname;
let _ctLastCount = 0;
let _ctCacheturUser = "";
let _ctLanguage = "";
let _ctCodesAdded = [];
let _ctPage = "unknown";
let _routeLayer = [];
let _waypointLayer = [];
let _cacheLayer = [];
let _initialized = false;
let _ctNewMapActiveCache = "";
let _ctBrowseMapActiveCache = "";
let _codenm = "";
let settings = "";
let optionsHtml = "";

console.log("Starting Cacheturassistenten V. " + GM_info.script.version);

let pathname = window.location.pathname;
let domain = document.domain;
let href = window.location.href;

// --- page detection ---

function ctDetectPage() {
  const host   = (window.location.hostname || "").toLowerCase();
  const path   = (window.location.pathname || "").toLowerCase();
  const search = (window.location.search   || "").toLowerCase();

// Geocaching.com (with/without www)
  if (host === "geocaching.com" || host === "www.geocaching.com") {
    if (path.includes("/seek/") || path.includes("/geocache/")) return "gc_geocache";
    if (path.includes("/plan/lists") || path.includes("/plan/")) return "gc_bmlist";
    if (path === "/map" || path.includes("/map/")) return "gc_map";
    if (path.includes("/live/play/map") || path.includes("/play/map")) return "gc_map_new";
    if (path.includes("/play/geotours")) return "gc_gctour";
  }

  // cachetur.no (all subdomains)
  if (host.endsWith("cachetur.no")) {
    if (/^\/bobilplasser\/?/.test(path)) return "bobil";
    if (/^\/fellestur\/?/.test(path))    return "fellestur";
  }

  // Project-GC (with/without www) – case-insensitive
  if (host === "project-gc.com" || host === "www.project-gc.com") {
    if (path.includes("/user/virtualgps") && !search.includes("map=")) return "pgc_vgps";
    if (path.includes("/livemap/") || path.includes("/tools/"))       return "pgc_map";
    if (path.includes("/maps/")) return "pgc_map2";

  }

  return "unknown";
}

// Set the page EARLY (before logging and before page-specific hooks):
_ctPage = ctDetectPage();
console.log("Detected page:", _ctPage);


// --- continue startup ---
window.onload = function () {
  // Note: _ctPage is already set above.
  console.log("Running in " + _ctPage + " mode");

  $(document).ready(function () {
    loadTranslations();
  });

function loadTranslations() {
    i18next
        .use(i18nextXHRBackend)
        .use(i18nextBrowserLanguageDetector)
        .init({
            whitelist: ['nb_NO', 'en', 'de_DE', 'sv_SE', 'en_US', 'da_DK', 'nl_NL', 'fr_FR', 'cs_CZ', 'fi_FI', 'es_ES'],
            preload: ['nb_NO', 'en', 'de_DE', 'sv_SE', 'en_US', 'da_DK', 'nl_NL', 'fr_FR', 'cs_CZ', 'fi_FI', 'es_ES'],
            fallbackLng: ['nb_NO', 'en', 'de_DE', 'sv_SE', 'en_US', 'da_DK', 'nl_NL', 'fr_FR', 'cs_CZ', 'fi_FI', 'es_ES'],
            lng: navigator.language || navigator.userLanguage,
            ns: ['cachetur'],
            defaultNS: 'cachetur',
            backend: {
                loadPath: 'https://cachetur.no/monkey/language/{{ns}}.{{lng}}.json',
                crossDomain: true
            }
        }, (err, t) => {
            if (err) {
                if (err.indexOf("failed parsing" > -1)) {
                    i18next.changeLanguage('en');
                    return loadTranslations();
                }
                return console.log("Error occurred when loading language data", err);
            }

            // Log the resolved language correctly
            const resolvedLanguage = i18next.language; // This will give you the actual language used
            console.log("Translation fetched successfully " + resolvedLanguage);

            ctStart();
            ctStartmenu();
        });
}

/// --- Dirty trick: multi-context hook + property spy + prototype sniffer ---
if (typeof _ctPage !== 'undefined' && (_ctPage === 'gc_map_new' || _ctPage === 'gc_gctour')) (function(){
  const log = (...a)=>console.info('[cachetur]', ...a);

  // 0) Property spy on gcMap – captures when the page sets it (now or later)
  (function installGcMapSpy(){
    try {
      const d = Object.getOwnPropertyDescriptor(unsafeWindow, 'gcMap');
      if (!d || d.configurable) {
        let _v = d && 'value' in d ? d.value : undefined;
        Object.defineProperty(unsafeWindow, 'gcMap', {
          configurable: true, enumerable: true,
          get(){ return _v; },
          set(v){
            _v = v;
            try { unsafeWindow.cacheturGCMap = v; } catch {}
            unsafeWindow.__cacheturMapHookInstalled = true;
            console.info('[cachetur] gcMap property spy captured a map instance');
          }
        });
        console.debug('[cachetur] Installed gcMap property spy');
      } else {
        console.debug('[cachetur] gcMap not configurable; skipping property spy');
      }
    } catch (e) {
      console.warn('[cachetur] Failed installing gcMap property spy', e);
    }
  })();

  // 1) Find all Leaflet contexts (unsafeWindow, userscript window, same-origin iframes)
  function findLeafletContexts(rootDoc = document) {
    const out = [];
    const tryAdd = (win, label) => {
      try { if (win && win.L && win.L.Map) out.push({ win, label }); } catch {}
    };
    tryAdd(unsafeWindow, 'unsafeWindow');
    tryAdd(window, 'userscript window');
    const ifr = rootDoc.querySelectorAll('iframe');
    for (const f of ifr) {
      try { tryAdd(f.contentWindow, `iframe:${f.id||f.name||'(anon)'}`); } catch {}
    }
    return out;
  }

  // 2) Install hook in ONE context (ctor+factory wrap + prototype sniffer)
  function hookContext(ctx) {
    const { win, label } = ctx;
    try {
      const L = win.L;
      if (!L || !L.Map || win.__cacheturMapHookInstalled) return;

      const OriginalMap = L.Map;
      const OriginalFactory = typeof L.map === 'function' ? L.map : null;

      // Prototype sniffer to capture already-existing maps on next interaction
      try {
        const onceExpose = (fn) => {
          let done = false;
          return function(...args){
            if (!done) {
              done = true;
              try {
                unsafeWindow.cacheturGCMap = this;
                unsafeWindow.gcMap = this;
                unsafeWindow.__cacheturMapHookInstalled = true;
                console.info('[cachetur] Prototype sniffer captured existing map instance');
              } catch (e) { console.warn('[cachetur] Failed to expose captured map', e); }
            }
            return fn.apply(this, args);
          };
        };
        const p = L.Map.prototype;
        ['setView','fitBounds','addLayer','panTo','invalidateSize','remove'].forEach(m=>{
          if (typeof p[m] === 'function' && !p[m].__ctWrapped) {
            const orig = p[m];
            p[m] = onceExpose(orig);
            p[m].__ctWrapped = true;
          }
        });
        console.debug('[cachetur] Prototype sniffer installed on', label);
      } catch (e) {
        console.warn('[cachetur] Prototype sniffer failed on', label, e);
      }

      // Wrap constructor and factory – decorate the instance, but return the real Leaflet Map
      L.Map = function(div, options){
        const map = new OriginalMap(div, options);
        try { decorateMap(win, L, map); } catch(e){ console.warn('[cachetur] decorate failed', e); }
        try { unsafeWindow.cacheturGCMap = map; } catch {}
        try { unsafeWindow.gcMap = map; } catch {}
        unsafeWindow.__cacheturMapHookInstalled = true;
        console.info('[cachetur] Map created & decorated in', label);
        // Restore after first init in THIS context
        L.Map = OriginalMap;
        if (OriginalFactory) L.map = OriginalFactory;
        return map;
      };
      Object.setPrototypeOf(L.Map, OriginalMap);
      L.Map.prototype = OriginalMap.prototype;
      for (const k of Object.getOwnPropertyNames(OriginalMap)) {
        if (!(k in L.Map)) { try { L.Map[k] = OriginalMap[k]; } catch {} }
      }
      if (OriginalFactory) {
        L.map = function(div, opts){ return new L.Map(div, opts); };
      }

      console.info('[cachetur] L.Map/L.map wrapped in', label, '; awaiting first initialization.');
    } catch (e) {
      console.warn('[cachetur] hookContext failed for', ctx.label, e);
    }
  }

  // 3) Decoration: our pane + FeatureGroup + helper API (careful not to break page layers)
  function decorateMap(win, L, map) {
    if (!map.getPanes || !map.createPane) return;
    if (!map.getPanes()['ct-pane']) {
      const pane = map.createPane('ct-pane'); pane.style.zIndex = '420'; pane.style.pointerEvents = 'none';
        }
    const ctRoot = L.featureGroup([]).addTo(map);
    const defaultStyle = { pane: 'ct-pane' };
    const orig = {
      addLayer: map.addLayer, removeLayer: map.removeLayer,
      setView: map.setView, fitBounds: map.fitBounds,
    };
    map.addLayer = function(layer){ try { map.__ct._seen.add(layer); } catch{} return orig.addLayer.call(this, layer); };
    map.removeLayer = function(layer){ try { map.__ct._seen.delete(layer); } catch{} return orig.removeLayer.call(this, layer); };
    map.setView = function(c,z,o){ return orig.setView.call(this,c,z,o); };
    map.fitBounds = function(b,o){ return orig.fitBounds.call(this,b,o); };

    Object.defineProperty(map, '__ct', { configurable:true, enumerable:false, value: {
      _seen: new WeakSet(), root: ctRoot, pane: 'ct-pane',
      addMarker(lat,lng,opts={}){ const m=L.marker([lat,lng],{...defaultStyle,...opts}); ctRoot.addLayer(m); return m; },
      addCircle(lat,lng,opts={radius:50}){ const c=L.circle([lat,lng],{...defaultStyle,...opts}); ctRoot.addLayer(c); return c; },
      addPolyline(latlngs,opts={}){ const pl=L.polyline(latlngs,{...defaultStyle,...opts}); ctRoot.addLayer(pl); return pl; },
      addGeoJSON(geojson,opts={}){ const gj=L.geoJSON(geojson,{...opts,pane:opts.pane??'ct-pane'}); ctRoot.addLayer(gj); return gj; },
      clear(){ ctRoot.clearLayers(); },
      bringToFront(){ try { (map.getPane('ct-pane')||{}).style.zIndex='650'; } catch {} ctRoot.eachLayer(l=>l.bringToFront&&l.bringToFront()); },
      sendToBack(){ try { (map.getPane('ct-pane')||{}).style.zIndex='350'; } catch {} ctRoot.eachLayer(l=>l.bringToBack&&l.bringToBack()); },
      listPageLayers(){ const arr=[]; map.eachLayer(l=>{ if(!ctRoot.hasLayer(l)) arr.push(l); }); return arr; }
    }});
    try { unsafeWindow.cacheturAddMarker = (lat,lng,opts)=>map.__ct.addMarker(lat,lng,opts); } catch {}
  }

  // 4) Hook in all current contexts + auto-hook new iframes
  function hookAllContexts() {
    const ctxs = findLeafletContexts();
    ctxs.forEach(hookContext);
  }
  hookAllContexts();

  // When new iframes appear (GC often builds late), hook them as well
  const mo = new MutationObserver((muts)=>{
    let need = false;
    for (const m of muts) for (const n of m.addedNodes) if (n.tagName === 'IFRAME') need = true;
    if (need) hookAllContexts();
  });
  try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch {}
})();
/// --- end ---

/// Check for new version of the assistant (with README changelog toast + snooze)
(function () {
  // Use the RAW host to avoid redirect blocks (remember @connect raw.githubusercontent.com)
  const README_RAW_URL = "https://raw.githubusercontent.com/cachetur-no/cachetur-assistant/refs/heads/master/README.md";
  const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  const LAST_NOTIFIED_KEY = "ct_last_notified_ver"; // {version:string, at:number}
  const REMIND_AFTER_MS = 24 * 60 * 60 * 1000; // remind again after 24h

  function escHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  function isNewerVersion(latest, current){
    if(!latest || !current) return false;
    const a = latest.split(".").map(Number), b = current.split(".").map(Number);
    for (let i=0, len=Math.max(a.length,b.length); i<len; i++){
      const x=a[i]||0, y=b[i]||0; if(x>y) return true; if(x<y) return false;
    }
    return false;
  }

  function getVersionFromMeta(metaStr){
    const m = /@version\s+([0-9.]+)/i.exec(metaStr || "");
    return m ? m[1] : null;
  }

  function gmFetch(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:"GET", url,
        headers: { "Accept": "text/plain; charset=utf-8" },
        onload:res=>res.status===200 ? resolve(res.responseText) : reject(new Error("HTTP "+res.status)),
        onerror:e=>reject(e)
      });
    });
  }

 // --- robust README parser (exact section + date) ---
function extractReleaseNotes(mdText, version) {
  try {
    let txt = String(mdText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

    // Work line-by-line to get clean boundaries
    const lines = txt.split("\n");

    // Match headings like "##/###/#### Version 3.5.2.4"
    const escVer   = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const thisHdr  = new RegExp("^\\s{0,3}#{2,6}\\s*Version\\s*" + escVer + "\\b.*$", "i");
    const anyHdr   = /^\s{0,3}#{2,6}\s*Version\s*\d[\d.]*/i;

    // Find start of the requested version, else fall back to first "Version ..." section
    let start = lines.findIndex(l => thisHdr.test(l));
    if (start === -1) start = lines.findIndex(l => anyHdr.test(l));
    if (start === -1) return "";

    // Find end at next "Version ..." heading
    let end = lines.slice(start + 1).findIndex(l => anyHdr.test(l));
    if (end !== -1) end = start + 1 + end; else end = lines.length;

    // Content between headings
    const block = lines.slice(start + 1, end).map(l => l.trim());

    // First non-empty, non-bullet line is treated as the date line
    const dateLine = block.find(l => l && !/^[-*]\s+/.test(l));
    const bullets  = block.filter(l => /^[-*]\s+/.test(l)).map(l => l.replace(/^[-*]\s+/, ""));

    // Build HTML (include date if present)
    let html = "";
    if (dateLine) html += `<div class="ct-date">${escHtml(dateLine)}</div>`;
    if (bullets.length) {
      html += "<ul>" + bullets.map(li => "<li>" + escHtml(li) + "</li>").join("") + "</ul>";
    } else {
      // Fallback: show up to 6 lines of plain text if there are no bullet points
      const snippet = block.filter(Boolean).slice(dateLine ? 1 : 0, 6).join("\n");
      if (snippet) html += "<pre style='white-space:pre-wrap;margin:0'>" + escHtml(snippet) + "</pre>";
    }
    return html;
  } catch (e) {
    console.warn("[Cachetur/update] extractReleaseNotes failed:", e);
    return "";
  }
}

	function ensureToastCss(){
    if(window.__ctToastCss) return;
    window.__ctToastCss = true;
    GM_addStyle(`
      .ct-toast { position:fixed; right:16px; bottom:16px; z-index:999999;
        max-width:420px; padding:14px 14px 12px; border-radius:10px;
        background:#1f2937; color:#e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.35);
        font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
      .ct-toast h4{ margin:0 0 6px; font-size:16px; color:#fff; }
      .ct-toast p{ margin:0 0 8px; color:#cbd5e1; }
      .ct-toast ul{ margin:6px 0 10px 18px; padding:0; }
      .ct-toast li{ margin:4px 0; }
	  .ct-toast .ct-date { font-size:12px; color:#9ca3af; margin:2px 0 6px; }
      .ct-toast .ct-actions{ display:flex; gap:8px; margin-top:10px; }
      .ct-toast button{ border:0; border-radius:8px; padding:8px 12px; cursor:pointer;
        background:#10b981; color:#001; font-weight:600; }
      .ct-toast button.ct-secondary{ background:#374151; color:#e5e7eb; }
      .ct-toast .ct-close{ position:absolute; right:10px; top:8px; cursor:pointer; color:#9ca3af; }
      @media (max-width:600px){ .ct-toast{ left:16px; right:16px; } }
    `);
  }

  function showUpdateToast(version, htmlNotes, downloadUrl, onLater, onUpdate){
    ensureToastCss();
    const wrap = document.createElement("div");
    wrap.className = "ct-toast";
    wrap.innerHTML =
      `<div class="ct-close" aria-label="Close">✕</div>
       <h4>The Cachetur Assistant ${escHtml(version)} is available</h4>
       <p><strong>What's new</strong></p>
       <div class="ct-notes">${htmlNotes || "<em>(No notes)</em>"}</div>
       <div class="ct-actions">
         <button class="ct-update">Update</button>
         <button class="ct-secondary ct-later">Later</button>
       </div>`;
    document.body.appendChild(wrap);

    const close = ()=>wrap.remove();
    wrap.querySelector(".ct-later").onclick = ()=>{ onLater && onLater(); close(); };
    wrap.querySelector(".ct-close").onclick = ()=>{ onLater && onLater(); close(); }; // treat X as Later
    wrap.querySelector(".ct-update").onclick = ()=>{
      onUpdate && onUpdate();
      GM_openInTab(downloadUrl, {active:true});
      close();
    };
  }

  function getLastNotified(){
    const v = GM_getValue(LAST_NOTIFIED_KEY, null);
    if (typeof v === "string") return { version: v, at: 0 }; // migration from old format
    if (v && typeof v === "object" && v.version) return v;
    return null;
  }

  async function checkForUpdates(){
    try{
      const updateURL   = GM_info.script.updateURL;
      const downloadURL = GM_info.script.downloadURL;
      const current     = GM_info.script.version;
      console.log(`[Cachetur/update] Checking… current=${current}`);
      if (!updateURL){ console.warn("[Cachetur/update] No updateURL in metadata"); return; }

      const meta   = await gmFetch(updateURL);
      const latest = getVersionFromMeta(meta);
      console.log(`[Cachetur/update] Latest in meta: ${latest}`);
      if (!latest || !isNewerVersion(latest, current)) return;

      // Snooze logic: don't nag again within REMIND_AFTER_MS for the same version
      const last = getLastNotified();
      if (last && last.version === latest && (Date.now() - last.at) < REMIND_AFTER_MS) {
        const left = Math.ceil((REMIND_AFTER_MS - (Date.now() - last.at)) / (60*60*1000));
        console.debug(`[Cachetur/update] Snoozed ${latest}, ~${left}h left`);
        return;
      }

      let notesHtml = "";
      try{
        const readme = await gmFetch(README_RAW_URL);
        notesHtml = extractReleaseNotes(readme, latest);
        if (!notesHtml) console.debug("[Cachetur/update] README fetched but notes parsed empty");
      } catch(e){
        console.warn("[Cachetur/update] README fetch failed:", e);
      }

      const snooze = ()=>GM_setValue(LAST_NOTIFIED_KEY, { version: latest, at: Date.now() });
      const silenceNow = ()=>GM_setValue(LAST_NOTIFIED_KEY, { version: latest, at: Date.now() });

      try{
        showUpdateToast(latest, notesHtml, downloadURL, snooze, silenceNow);
      } catch(e){
        console.warn("[Cachetur/update] Toast failed, fallback to confirm():", e);
        if (confirm(`A new version (${latest}) of The Cachetur Assistant is available.\nDo you want to update now?`)) {
          GM_openInTab(downloadURL, {active:true});
          silenceNow();
        } else {
          snooze();
        }
      }
    } catch (err){
      console.warn("[Cachetur/update] Update check failed:", err);
    }
  }

  // small delay so <body> exists; then poll hourly
  setTimeout(checkForUpdates, 2000);
  setInterval(checkForUpdates, CHECK_INTERVAL);
})();
/// End of version check/update

   //Fill Menu
function ctStartmenu() {
    // Check if GM_config is available
    if (typeof GM_config !== "undefined") {
        // Initialize the configuration menu
        GM_config.init({
            'id': 'MyConfig',
            'title': i18next.t('edit.assistant') + ' ' + i18next.t('edit.settings') + '<br>',
            'fields': {
                'uc1': {
                    'label': '<b>' + i18next.t('edit.toggle') + '</b><br><i class="small">' + i18next.t('edit.default') + ' ' + i18next.t('edit.off') + '</i>',
                    'type': 'checkbox',
                    'default': false
                },
                'uc2': {
                    'label': '<b>' + i18next.t('edit.open') + '</b><br>' + i18next.t('edit.warning') + '</b><br><i class="small">' + i18next.t('edit.default') + ' ' + i18next.t('edit.off') + '</i>',
                    'type': 'checkbox',
                    'default': false
                },
                'uc3': {
                    'label': '<b>' + i18next.t('edit.dt') + '</b><br><i class="small">' + i18next.t('edit.default') + ' ' + i18next.t('edit.off') + '</i>',
                    'type': 'checkbox',
                    'default': false
                }
            },
        });

        // Register the menu command to open the configuration
        GM_registerMenuCommand(GM_info.script.name + i18next.t('edit.configure'), function() {
            GM_config.open();
        }, "C");

        // Retrieve user selections
        var uc1 = GM_config.get("uc1");
        var uc2 = GM_config.get("uc2");
        var uc3 = GM_config.get("uc3");

        // Execute functions based on user selections
        if (uc1) {
            updatecoord(); // Call the function related to uc1
        }

        if (uc2) {
            open_new_page(); // Call the function related to uc2
        }

        if (uc3) {
            // Set up a condition to call the function related to uc3
            var existCondition = setInterval(function() {
                if ($('#cachetur-tur-valg').length) {
                    clearInterval(existCondition);
                    tvinfo(); // Call the function related to uc3
                }
            }, 100);
        }
    } else {
        // Handle the case where GM_config is not available
        console.log("Could not load GM_config! External resource may be temporarily down. Using default settings for now.", 1, "error");
        GM_registerMenuCommand(GM_info.script.name + ' Settings', function() {
            console.log("Could not load GM_config! External resource may be temporarily down. Using default settings for now.");
        });
    }
}

  // open new page
    function open_new_page() {
        var existCondition = setInterval(function() {
 if ($('#cachetur-tur-valg').length) {
    clearInterval(existCondition);
    var addresses = document.querySelectorAll("#ctl00_ContentBody_LongDescription a")

for (var i = 0; i < addresses.length; i++) {
  addresses[i].addEventListener("click", function() {
    event.stopImmediatePropagation();
  },true);
  addresses[i].setAttribute('target', '_blank');
};
 }
}, 100);
        }

  // open new page end

function ctStart() {


    let lastUse = GM_getValue("cachetur_last_action", 0);
    let timeSinceLastUse = (Date.now() - lastUse) / 1000;
    console.log("The Cachetur Assistant was last used " + timeSinceLastUse + " seconds ago");

    if (timeSinceLastUse > 3600) {

        ctInitInactive();

    } else {
        ctPreInit();
    }
}

function ctPreInit() {
    console.log("Continuing init of Cacheturassistenten");
    if (_ctPage !== "pgc_map" && _ctPage !== "pgc_map2" && _ctPage !== "pgc_vgps" && _ctPage !== "bobil" && _ctPage !== "gc_map_new" && _ctPage !== "gc_gctour" && _ctPage !== "gc_map_live" && _ctPage !== "gc_map" && _ctPage !== "gc_geocache" && _ctPage !== "gc_bmlist" && $(".logged-in-user").length < 1) {
        $(document).bind("DOMSubtreeModified.cachetur-init", function() {
            if ($(".profile-panel.detailed").length > 0) {
                $(document).unbind("DOMSubtreeModified.cachetur-init");
                ctCheckLogin();
            }
        });
    } else if (_ctPage === "gc_map_new" || _ctPage === "gc_gctour" || _ctPage === "gc_map_live") {
        ctCheckLogin();
    } else {
        ctCheckLogin();
    }
}


function ctCheckLogin() {
  console.log("Checking login");
  ctApiCall("user_get_current", "", function(response) {
    _ctCacheturUser = response.username || "";
    _ctLanguage = response.language || "en";
    i18next.changeLanguage(_ctLanguage);

    if (!_ctCacheturUser) {
      console.log("Not logged in");
      _initialized = false;            // ikke lås
      ctInitNotLoggedIn();
    } else {
      console.log("Login OK");
      _initialized = false;            // tving reinit på SPA (gc_gctour)
      ctInit(true);
    }
  });
}



function ctInvalidateLogin() {
    _ctCacheturUser = '';
    $("#cachetur-header").remove();
}

function ctApiCall(call, params, callback) {
    let appId = "Cacheturassistenten " + GM_info.script.version + " - " + _ctPage;

    GM_xmlhttpRequest({
        method: "POST",
        url: "https://cachetur.no/api/" + call,
        data: "appid=" + encodeURIComponent(appId) + "&json=" + encodeURIComponent(JSON.stringify(params)),
        withCredentials: true,
        crossDomain: true,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        onload: function(data) {
            try {
                let response = $.parseJSON(data.responseText);

                if (response.error === "UNAUTHORIZED") {
                    ctInvalidateLogin();
                    callback("");
                }

                if (response.error.length <= 0) {
                    callback(response.data);
                } else {
                    callback("");
                }
            } catch (e) {
                console.warn("Failed to verify response from cachetur.no: " + e);
                callback("");
            }
        },
        onerror: function() {
            callback("");
        },
        ontimeout: function() {
            callback("");
        }
    });
}

function ctInit(force) {
  if (_initialized && !force) return;
  console.log("Initializing Cacheturassistenten");
  console.log("-> calling ctCreateTripList");
  ctCreateTripList();
  console.log("-> calling ctInitAddLinks");
  ctInitAddLinks();
  _initialized = true;
}

function ctInitNotLoggedIn() {
    if (_initialized) return;
        if (_ctPage === "gc_geocache" || _ctPage === "gc_bmlist" || _ctPage === "bobil") GM_addStyle("nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 18px 2em; } #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } ");
        else if (_ctPage === "gc_map_new" || _ctPage === "gc_gctour" || _ctPage === "gc_map_live") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px; }");
        else if (_ctPage === "gc_map") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px; }");
        else if (_ctPage === "pgc_map" || _ctPage === "pgc_map2" || _ctPage === "pgc_vgps") GM_addStyle("#cachetur-header { margin-top: 7px; }");
        if ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]) {
            ctPrependToHeader2('<li id="cachetur-header"><span id="cachetur-header-text"><a href="https://cachetur.no/" target="_blank"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> ' + i18next.t('menu.notloggedin') + '<br>' + i18next.t('menu.deactivated') + '</span></a></li>');
            var liText = '',
                liList = $('#ctl00_uxLoginStatus_divSignedIn li'),
                listForRemove = [];

            $(liList).each(function() {

                var text = $(this).text();

                if (liText.indexOf('|' + text + '|') == -1)
                    liText += '|' + text + '|';
                else
                    listForRemove.push($(this));

            });

            $(listForRemove).each(function() {
                $(this).remove();
            });
        } else {
            ctPrependToHeader('<li id="cachetur-header"><span id="cachetur-header-text"><a href="https://cachetur.no/" target="_blank"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> ' + i18next.t('menu.notloggedin') + '<br>' + i18next.t('menu.deactivated') + '</span></a></li>');
            var liText2 = '',
                liList2 = $('.user-menu li'),
                listForRemove2 = [];

            $(liList2).each(function() {

                var text = $(this).text();

                if (liText2.indexOf('|' + text + '|') == -1)
                    liText2 += '|' + text + '|';
                else
                    listForRemove2.push($(this));

            });

            $(listForRemove2).each(function() {
                $(this).remove();
            });
        }


        _initialized = true;

}

function ctInitInactive() {

        if (_initialized) return;
        console.log("Assistant not being actively used, disabling");
        if (_ctPage === "gc_geocache" || _ctPage === "gc_bmlist" || _ctPage === "bobil") GM_addStyle("nav .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } ");
        else if (_ctPage === "gc_map") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header-text { padding-right: 3px; float:left; }");
        else if (_ctPage === "gc_map_new"  || _ctPage === "gc_gctour" || _ctPage === "gc_map_live") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header-text { padding-right: 3px; float:left; }");
        else if (_ctPage === "pgc_map" || _ctPage === "pgc_map2" || _ctPage === "pgc_vgps") GM_addStyle("#cachetur-header { margin-top: 12px; }");

        if ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]) {

            ctPrependToHeader2('<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> <a href id="cachetur-activate">' + i18next.t("activate.button") + '</a></li>');
            $('#cachetur-activate')[0].onclick = function() {
                GM_setValue("cachetur_last_action", Date.now());
            };

            $("#cachetur-activate").click(function(e) {
                GM_setValue("cachetur_last_action", Date.now());
            });
        } else {

            ctPrependToHeader('<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> <a href id="cachetur-activate">' + i18next.t("activate.button") + '</a></li>');
            $('#cachetur-activate')[0].onclick = function() {
                GM_setValue("cachetur_last_action", Date.now());
            };

            $("#cachetur-activate").click(function(e) {
                GM_setValue("cachetur_last_action", Date.now());
            });
        }
        _initialized = true;

}

// ─────────────────────────────────────────────────────────────────────────────
// 0) Mark the <body> with the current page type (call once early during init)
// ─────────────────────────────────────────────────────────────────────────────
function ctMarkPageOnBody() {
  try { document.body.classList.add('ct-page-' + _ctPage); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Give the header a page-specific class
// ─────────────────────────────────────────────────────────────────────────────
function ctHeaderClass() {
  if (_ctPage === 'pgc_map' || _ctPage === "pgc_map2" || _ctPage === 'pgc_vgps') return 'ct-pgc';
  if (_ctPage === 'gc_gctour') return 'ct-gctour';
  if (_ctPage === 'gc_map_new' || _ctPage === 'gc_map_live' || _ctPage === 'gc_bmlist') return 'ct-gc-react';
  if (_ctPage === 'gc_geocache' || _ctPage === 'gc_map') return 'ct-gc-classic';
  if (_ctPage === 'bobil') return 'ct-cachetur';
  return 'ct-default';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Build the header HTML (use this when you inject the header)
// ─────────────────────────────────────────────────────────────────────────────
function ctBuildHeaderHtml(optionsHtml) {
  return '' +
  '<li id="cachetur-header" class="' + ctHeaderClass() + '">' +
  '  <span id="cachetur-header-text">' +
  '    <img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" ' +
  '         title="' + i18next.t('menu.loggedinas') + ' ' + _ctCacheturUser + '"/> ' +
           i18next.t('menu.addto') +
  '  </span>' +
  '  <select id="cachetur-tur-valg">' + optionsHtml + '</select>' +
  '  <button id="cachetur-tur-open" class="cachetur-menu-button" type="button" ' +
  '          title="' + i18next.t('menu.opentrip') + '"><img src="https://cachetur.no/api/img/arrow.png" style="height:16px;"/></button>' +
  '  <button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" ' +
  '          title="' + i18next.t('menu.refresh') + '"><img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/></button>' +
  '  <button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" ' +
  '          title="' + i18next.t('menu.showonmap') + '"><img src="https://cachetur.no/api/img/map.png" style="height:16px;"/></button>' +
  '  <button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" ' +
  '          title="' + i18next.t('menu.fitroute') + '"><img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/></button>' +
  '  <span id="cachetur-tur-antall-container">(<span id="cachetur-tur-antall"></span>)</span>' +
  '</li>';
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Apply theme class to the injected header (call after you insert headerHtml)
// ─────────────────────────────────────────────────────────────────────────────
function ctApplyHeaderTheme() {
  const klass = ctHeaderClass();
  const $el = $('#cachetur-header');
  if (!$el.length) return;
  const base = ($el.attr('class') || '')
    .split(/\s+/)
    .filter(n => n && !/^ct-/.test(n));
  $el.attr('class', base.concat(klass).join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Install all header styles once (call once during init)
// ─────────────────────────────────────────────────────────────────────────────
function ctInstallHeaderStylesOnce() {
  if (window.__ctHeaderCssLoaded) return;
  window.__ctHeaderCssLoaded = true;

  GM_addStyle(`
    /* ================= Base (applies everywhere) ================= */
    #cachetur-header{
      display:flex; align-items:center; gap:8px;
      position:relative; z-index:1050; /* keep <select> above the navbar */
    }
    #cachetur-header img[alt="cachetur.no"]{
      height:20px; margin-right:4px; vertical-align:middle;
    }
    #cachetur-header .cachetur-menu-button{
      display:inline-flex; align-items:center; justify-content:center;
      height:28px; width:28px; padding:0; line-height:0;
      border-radius:14px; border:1px solid transparent;
      background:transparent; cursor:pointer;
    }
    #cachetur-header .cachetur-menu-button img{
      display:block; width:16px; height:16px;
    }
    #cachetur-tur-valg{
      min-width:240px; max-width:45vw;
      height:32px; line-height:32px; padding:0 8px;
      background:#fff; color:#4a4a4a; border:1px solid rgba(0,0,0,.15);
      appearance:auto; -webkit-appearance:auto; overflow:visible;
      border-radius:6px;
    }
    #cachetur-tur-antall-container{ margin-left:4px; font-weight:600 }

    /* Don't clip dropdowns in the top bars (GC & PGC) */
    #gc-header, #gc-header nav, .user-menu, .header-top,
    #pgc-navbar-body, #pgcMainMenu, #pgcMainMenu .navbar, #pgcMainMenu .navbar-nav {
      overflow: visible !important;
    }

    /* ================= Project-GC (Bootstrap-like navbar) ================= */
    #cachetur-header.ct-pgc{
      font-family: var(--bs-font-sans-serif) !important;
      color: var(--bs-body-color);
      padding: .25rem 0;
      gap: .375rem;
      font-size: .875rem;
    }
    #cachetur-header.ct-pgc #cachetur-tur-valg{
      min-width:200px;
      height:28px; line-height:28px; padding:0 .5rem;
      background: var(--bs-white);
      color: var(--bs-body-color);
      border: 1px solid var(--bs-border-color);
      border-radius: .25rem;
    }
    #cachetur-header.ct-pgc .cachetur-menu-button{
      height:10px; width:10px; line-height:0;
      border: 1px solid var(--bs-border-color);
      border-radius: .25rem;
      background: var(--bs-light-bg-subtle);
      box-shadow: none;
    }
    #cachetur-header.ct-pgc .cachetur-menu-button:hover{
      background: var(--bs-gray-200);
      border-color: var(--bs-gray-400);
    }
    #cachetur-header.ct-pgc .cachetur-menu-button img{
      width:10px; height:10px;
    }

    /* ================= GC React pages (map_new, map_live, bmlist) ================= */
    #cachetur-header.ct-gc-react{ color:#fff; padding:8px 0 }
    #cachetur-header.ct-gc-react #cachetur-tur-valg{ min-width:260px }
    #cachetur-header.ct-gc-react .cachetur-menu-button{
      background: rgba(255,255,255,.08);
      border-color: rgba(255,255,255,.25);
    }
    #cachetur-header.ct-gc-react .cachetur-menu-button:hover{
      background: rgba(255,255,255,.18);
      border-color: rgba(255,255,255,.45);
    }

    /* ================= GC classic (gc_map, gc_geocache) ================= */
    #cachetur-header.ct-gc-classic{ color:#fff; padding:8px 0 }
    #cachetur-header.ct-gc-classic #cachetur-tur-valg{ min-width:220px }
    #cachetur-header.ct-gc-classic .cachetur-menu-button{
      background: rgba(255,255,255,.08);
      border-color: rgba(255,255,255,.25);
    }
    #cachetur-header.ct-gc-classic .cachetur-menu-button:hover{
      background: rgba(255,255,255,.18);
      border-color: rgba(255,255,255,.45);
    }

    /* ================= GC GeoTours ================= */
    #cachetur-header.ct-gctour{ color:#fff; padding:8px 0 }
    #cachetur-header.ct-gctour #cachetur-tur-valg{ min-width:260px }
    #cachetur-header.ct-gctour .cachetur-menu-button{
      background: rgba(255,255,255,.08);
      border-color: rgba(255,255,255,.25);
    }
    #cachetur-header.ct-gctour .cachetur-menu-button:hover{
      background: rgba(255,255,255,.18);
      border-color: rgba(255,255,255,.45);
    }

    /* ================= cachetur.no (bobil) ================= */
    #cachetur-header.ct-cachetur{ color:#333; padding:8px 0 }
    #cachetur-header.ct-cachetur .cachetur-menu-button{
      background:#eee; border-color:rgba(0,0,0,.1);
    }
    #cachetur-header.ct-cachetur .cachetur-menu-button:hover{
      background:#e2e2e2; border-color:rgba(0,0,0,.2);
    }

    /* ================= Page-specific exceptions ================= */
    body.ct-page-gc_bmlist #cachetur-tur-fitbounds,
    body.ct-page-gc_bmlist #cachetur-tur-add-ct-caches { display:none; }

    /* Widen the nav area & trip dropdown specifically on gc_geocache and gc_gctour */
    body.ct-page-gc_geocache #gc-header nav,
    body.ct-page-gc_gctour  #gc-header nav {
      max-width: none !important;
      width: 100vw !important;
    }
    body.ct-page-gc_geocache #gc-header .user-menu,
    body.ct-page-gc_gctour  #gc-header .user-menu { flex-wrap: nowrap !important; }
    body.ct-page-gc_geocache #cachetur-header #cachetur-tur-valg,
    body.ct-page-gc_gctour  #cachetur-header #cachetur-tur-valg {
      min-width:320px !important;
      width: clamp(320px, 32vw, 520px) !important;
      height: 28px !important;
    }
  `);
}


function ctPrependToHeader(data) {
  console.log("Injecting cachetur.no in menu");
  waitForKeyElements("div.user-menu");
  $(".hamburger--squeeze").remove();

  let header = null;
  if (["gc_map","gc_gctour","gc_map_new","gc_bmlist","gc_geocache"].includes(_ctPage)) {
    header = $('.user-menu');
  } else if (_ctPage === "bobil") {
    header = $('.navbar-right');
  } else if (["pgc_map","pgc_map2","pgc_vgps"].includes(_ctPage)) {
    header = $('#pgc-navbar-body > ul.navbar-nav').last();
  }

  if (header && header.length) {
    ctInsert(data, header, 'prepend');
    ctApplyHeaderTheme(); // <— legger på riktig tema-klasse
  }
}

function ctPrependToHeader2(data) {
  console.log("Injecting cachetur.no in menu (GClh-nav)");

  // Find GClh wrapper + both lists
  const $wrap  = $('gclh_nav#ctl00_gcNavigation .wrapper');
  const $menu  = $wrap.find('ul.menu').first();
  const $login = $wrap.find('ul#ctl00_uxLoginStatus_divSignedIn').first();

  // Only do the "between" placement on gc_map / gc_gctour when GClh II is present
  const onGcOldTopbar =
    $('#GClh_II_running').length > 0 &&
    $wrap.length > 0 && $menu.length > 0 && $login.length > 0 &&
    (_ctPage === 'gc_map' || _ctPage === 'gc_gctour');

  if (onGcOldTopbar) {
    if (!document.getElementById('cachetur-header')) {
      // Insert Cachetur <li> right AFTER the main menu list (i.e. between menu and login area)
      $menu.after(data);
    }

    // Layout + theme fixes for classic GClh topbar
    GM_addStyle(`
      /* Make the outer nav and wrapper span the full width and start from the very left */
      gclh_nav {
        width: 100% !important;
        display: block !important;
        height: auto !important;            /* auto height, we keep min-height on wrapper */
        position: static !important;
      }

      gclh_nav .wrapper {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important; /* start everything at the left edge */
        gap: 10px !important;
        flex-wrap: nowrap !important;

        width: 100% !important;
        height: auto !important;
        min-height: 80px !important;

        /* kill any centering/max-width from site CSS */
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;

        overflow: visible !important;
        background-color: #02874d !important; /* keep GC green */
        box-sizing: border-box !important;
      }

      /* Main menu as a horizontal row */
      gclh_nav ul.menu {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      gclh_nav ul.menu > li { list-style: none !important; }
      gclh_nav ul.menu > li::marker { content: none !important; }

      /* User panel on the far right */
      gclh_nav #ctl00_uxLoginStatus_divSignedIn {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin-left: auto !important; /* push to the right */
        padding: 0 !important;
      }
      gclh_nav #ctl00_uxLoginStatus_divSignedIn > li { list-style: none !important; }
      gclh_nav #ctl00_uxLoginStatus_divSignedIn > li::marker { content: none !important; }

      /* Our injected Cachetur header (<li>) */
      gclh_nav #cachetur-header {
        list-style: none !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin: 0 6px !important;
        padding: 0 !important;
        height: auto !important;            /* never force 80px height here */
        line-height: 1.3 !important;
      }
      gclh_nav #cachetur-header::marker { content: none !important; }
      gclh_nav #cachetur-header select { height: 28px !important; }

      /* Prevent clipping of any dropdowns/menus */
      gclh_nav .wrapper, gclh_nav { overflow: visible !important; }
    `);

  } else {
    // Fallback for other pages
    let header = null;
    if (["gc_map","gc_gctour","gc_map_new","gc_bmlist","gc_geocache"].includes(_ctPage)) {
      header = $('#ctl00_uxLoginStatus_divSignedIn');
      GM_addStyle(`
        /* Full-width, left-aligned on React/new pages too */
        gclh_nav { width: 100% !important; display: block !important; height: auto !important; }
        gclh_nav .wrapper {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 10px !important;
          width: 100% !important;
          height: auto !important;
          min-height: 80px !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background-color: #02874d !important;
          box-sizing: border-box !important;
        }
      `);
    } else if (_ctPage === "bobil") {
      header = $('.navbar-right');
    } else if (["pgc_map","pgc_map2","pgc_vgps"].includes(_ctPage)) {
      header = $('#pgcMainMenu ul.navbar-right');
    }

    if (header && header.length && !document.getElementById('cachetur-header')) {
      // Keep it a <li> inside the existing <ul>
      header.prepend(data);
      GM_addStyle(`
        #cachetur-header { list-style: none !important; display: inline-flex !important; align-items: center !important; gap: 8px !important; }
        #cachetur-header::marker { content: none !important; }
      `);
    }
  }

  // Apply current theme/colors for Cachetur header content (existing helper)
  ctApplyHeaderTheme();
}

function ctPrependTouser(data) {

    let header;
    if (_ctPage === "gc_map" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live" || _ctPage === "gc_gctour" || _ctPage === "gc_bmlist" || _ctPage === "gc_geocache") header = $('span.username');

    if (header) {
        ctInsert(data, header, 'append');
        waitForKeyElements("#pgc", function() {
            $("#cachetur-header1").remove();
            $("#cachetur-header1").remove();

        });
    }

}

function ctPrependTousergclh(data) {

    let header;
    if (_ctPage === "gc_map" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live" || _ctPage === "gc_gctour" || _ctPage === "gc_bmlist" || _ctPage === "gc_geocache") header = $('.user-name');

    if (header) {
        ctInsert(data, header, 'append');
        waitForKeyElements("#pgc_gclh", function() {
            $("#cachetur-header2").remove();

        });
    }

}

function ctCreateTripList() {
  console.log("ctCreateTripList: start; user =", _ctCacheturUser || "(empty)", "page =", _ctPage);

  if (!_ctCacheturUser) {
    console.log("ctCreateTripList: abort (not logged in)");
    return;
  }

  // give body a page class for possible special exceptions in CSS
  document.body.classList.add('ct-page-' + _ctPage);

  ctApiCall("planlagt_list_editable", { includetemplates: "true" }, function (available) {
    const hasTrips = Array.isArray(available) && available.length > 0;

    // build the <option> list robustly
    if (hasTrips) {
      optionsHtml = available.map(function (item) {
        return '<option value="' + item.id + '">' + item.turnavn + '</option>';
      }).join("");
    } else {
      // fallback when no trips are found
      optionsHtml = '<option value="" disabled selected>' + i18next.t('menu.notrips') + '</option>';
    }

    // If the select already exists in the DOM, update it
    const $sel = $("#cachetur-tur-valg");
    if ($sel.length) {
      $sel.html(optionsHtml);
    }

    // HTML for the header (markup only)
    const headerHtml =
      '<li id="cachetur-header">' +
      '  <span id="cachetur-header-text">' +
      '    <img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" title="' + i18next.t('menu.loggedinas') + ' ' + _ctCacheturUser + '"/> ' +
           i18next.t('menu.addto') +
      '  </span>' +
      '  <select id="cachetur-tur-valg">' + optionsHtml + '</select>' +
      '  <button id="cachetur-tur-open" class="cachetur-menu-button" type="button" title="' + i18next.t('menu.opentrip') + '"><img src="https://cachetur.no/api/img/arrow.png" style="height:16px;"/></button>' +
      '  <button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" title="' + i18next.t('menu.refresh') + '"><img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/></button>' +
      '  <button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" title="' + i18next.t('menu.showonmap') + '"><img src="https://cachetur.no/api/img/map.png" style="height:16px;"/></button>' +
      '  <button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" title="' + i18next.t('menu.fitroute') + '"><img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/></button>' +
      '  <span id="cachetur-tur-antall-container">(<span id="cachetur-tur-antall"></span>)</span>' +
      '</li>';

    function bindHeaderEvents() {
      const $tripSelector = $("#cachetur-tur-valg");
      if (!$tripSelector.length) return;

      /// no trips → disable buttons and done
      if (!hasTrips) {
        $("#cachetur-tur-open,#cachetur-tur-refresh,#cachetur-tur-add-ct-caches,#cachetur-tur-fitbounds").prop('disabled', true);
        $("#cachetur-tur-antall").text("0");
        return;
      }

      // initialize selected trip from storage (or first)
      let storedTrip = GM_getValue("cachetur_selected_trip", 0);
      if ($tripSelector.find('option[value="'+storedTrip+'"]').length === 0) {
        storedTrip = $tripSelector.children("option").first().val() || 0;
        GM_setValue("cachetur_selected_trip", storedTrip);
      }
      $tripSelector.val(storedTrip);

      // load data for selected trip
      ctGetAddedCodes(storedTrip);
      ctGetTripRoute(storedTrip);

      // avoid double binding
      $("#cachetur-tur-open,#cachetur-tur-refresh,#cachetur-tur-add-ct-caches,#cachetur-tur-fitbounds").off("click");
      $tripSelector.off("change");

      $tripSelector.on("change", function () {
        const id = $tripSelector.val();
        ctGetAddedCodes(id);
        ctGetTripRoute(id);
        GM_setValue("cachetur_selected_trip", id);
        GM_setValue("cachetur_last_action", Date.now());
      });

      $("#cachetur-tur-open").on("click", function () {
        const selected = $tripSelector.val();
        let url = "https://cachetur.no/";
        if (selected.endsWith("L")) url += "liste/" + selected.slice(0, -1);
        else if (selected.endsWith("T")) url += "template/" + selected.slice(0, -1);
        else url += "fellestur/" + selected;
        GM_openInTab(url);
      });

      $("#cachetur-tur-refresh").on("click", function () {
        const id = $tripSelector.val();
        $("#cachetur-tur-antall").text("Loading");

        ctApiCall("planlagt_list_editable", { includetemplates: "true" }, function (avail) {
          const ok = Array.isArray(avail) && avail.length > 0;
          let opts = ok ? avail.map(it => '<option value="'+it.id+'">'+it.turnavn+'</option>').join("") :
                          '<option value="" disabled selected>' + i18next.t('menu.notrips') + '</option>';

          $tripSelector.empty().append(opts);
          if (ok && $tripSelector.find('option[value="'+id+'"]').length) {
            $tripSelector.val(id);
            ctGetAddedCodes(id);
            ctGetTripRoute(id);
          } else {
            $("#cachetur-tur-open,#cachetur-tur-add-ct-caches,#cachetur-tur-fitbounds").prop('disabled', !ok);
            $("#cachetur-tur-antall").text(ok ? "" : "0");
          }
          GM_setValue("cachetur_last_action", Date.now());
        });
      });

      $("#cachetur-tur-add-ct-caches").on("click", function () {
        const id = $tripSelector.val();
        ctAddCacheMarkersToMap(id);
      });

      $("#cachetur-tur-fitbounds").on("click", function () {
        const map = ctGetUnsafeLeafletObject();
        if (map && unsafeWindow.cacheturRouteLayer) {
          map.fitBounds(unsafeWindow.cacheturRouteLayer.getBounds());
        }
        if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
          $("#clear-map-control").trigger("click");
        }
      });
    }

    // inject header (avoid duplicates)
 function injectHeaderOnce() {
      if (document.getElementById("cachetur-header")) {
        bindHeaderEvents();
        return;
      }
      const useOldTopbar = ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]);
      if (useOldTopbar) ctPrependToHeader2(headerHtml);
      else ctPrependToHeader(headerHtml);

      // add the correct theme class
      ctApplyHeaderTheme();
      bindHeaderEvents();
    }

    injectHeaderOnce();

    // Re-inject on SPA updates (map_new/geotours/live)
    if (["gc_gctour","gc_map_new","gc_map_live"].includes(_ctPage) && !window.__cacheturHeaderWatcher) {
      window.__cacheturHeaderWatcher = true;
      const mo = new MutationObserver(function () {
        if (_ctCacheturUser && !document.getElementById("cachetur-header")) {
          injectHeaderOnce();
        }
      });
      try { mo.observe(document.body, { childList: true, subtree: true }); } catch {}
    }
  });
}


function ctGetAddedCodes(id) {
    ctApiCall("planlagt_get_codes", {
            "tur": id,
            "useid": false
        },
        function(codes) {
            if (codes.length <= 0) return;

            _ctCodesAdded = [];

            codes.forEach(function(item) {
                _ctCodesAdded.push(item);
            });

            ctUpdateAddImage();
            ctPGCMarkFound();
            ctPGCCheckVgps();
            ctCheckList();

            $('#cachetur-tur-antall').html(_ctCodesAdded.length);
        }
    );
}

function ctGetTripRoute(id) {
    if (!id || id.endsWith('L')) {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        return;
    }

    let unsafeLeafletObject = ctGetUnsafeLeafletObject();
    if (unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        $("#cachetur-tur-add-ct-caches").prop('disabled', true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    if (unsafeWindow.cacheturCacheLayer) {
        unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
    }

    console.log("Attempting to fetch route for selected trip");

    ctApiCall("planlagt_get_route", {
            "tur": id
        },
        function(data) {
            if (unsafeWindow.cacheturRouteLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturRouteLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any route for given trip/list");
                $("#cachetur-tur-fitbounds").prop('disabled', true);
                return;
            }

            console.log("Route data received, constructing route");

            _routeLayer = L.polyline(data, {
                color: 'purple'
            });
            _routeLayer.getAttribution = function() {
                return 'Directions powered by <a href="https://www.graphhopper.com/" target="_blank">GraphHopper API</a>, delivered by <a href="https://cachetur.no">cachetur.no</a>';
            };
            unsafeWindow.cacheturRouteLayer = cloneInto(_routeLayer, unsafeWindow);

            console.log("Injecting route");
            unsafeLeafletObject.addLayer(unsafeWindow.cacheturRouteLayer);

            $("#cachetur-tur-fitbounds").prop('disabled', false);
            $("#cachetur-tur-add-ct-caches").prop('disabled', false);
        });

    ctApiCall("planlagt_get_noncaches", {
            "tur": id
        },
        function(data) {
            if (unsafeWindow.cacheturWaypointsLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturWaypointsLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any waypoints for given trip/list");
                return;
            }

            let markers = [];
            data.forEach(function(item) {
                markers.push(L.marker([item.lat, item.lon], {
                    icon: L.divIcon({
                        className: 'cachetur-map_marker',
                        iconSize: [18, 18],
                        riseOnHover: true,
                        html: '<div class="cachetur-map_marker_symbol " title="' + item.name + '"><img src="' + item.typeicon + '" /></div><span class="label label-default"></span>'
                    })
                }));
            });

            _waypointLayer = L.layerGroup(markers);
            unsafeWindow.cacheturWaypointsLayer = cloneInto(_waypointLayer, unsafeWindow);

            console.log("Injecting waypoints");
            unsafeLeafletObject.addLayer(unsafeWindow.cacheturWaypointsLayer);

            $("#cachetur-tur-fitbounds").prop('disabled', false);
            $("#cachetur-tur-add-ct-caches").prop('disabled', false);
        });
}

function ctAddCacheMarkersToMap(id) {
    console.log("Attempting to fetch cache coordinates for selected trip");

    let unsafeLeafletObject = ctGetUnsafeLeafletObject();
    if (unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        $("#cachetur-tur-add-ct-caches").prop('disabled', true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    ctApiCall("planlagt_get_cachecoordinates", {
            "tur": id
        },
        function(data) {
            if (unsafeWindow.cacheturCacheLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any cache data for given trip/list");
                $("#cachetur-tur-fitbounds").prop('disabled', true);
                return;
            }

            console.log("Cache data received, constructing markers");

            let markers = [];
            data.forEach(function(item) {
                markers.push(L.marker([item.lat, item.lon], {
                    icon: L.divIcon({
                        className: 'cachetur-map_marker',
                        iconSize: [18, 18],
                        riseOnHover: true,
                        html: '<div class="cachetur-map_marker_symbol " title="' + item.name + '"><img src="' + item.typeicon + '" /></div><span class="label label-default"></span>'
                    })
                }));
            });

            _cacheLayer = L.layerGroup(markers);
            unsafeWindow.cacheturCacheLayer = cloneInto(_cacheLayer, unsafeWindow);

            console.log("Injecting caches");
            unsafeLeafletObject.addLayer(unsafeWindow.cacheturCacheLayer);

            $("#cachetur-tur-fitbounds").prop('disabled', false);
        });
}

function ctGetPublicLists(cache) {
    ctApiCall("cache_get_lists", {
            "code": cache
        },
        function(data) {
            if (data.length <= 0) {
                console.log("Couldn't find any lists or trip templates for the given cache");
                return;
            }

            console.log("Injecting list of lists");
            let alternate = false;
            let listHtml = '<div class="CacheDetailNavigationWidget"><h3 class="WidgetHeader"><img src="https://cachetur.no/api/img/cachetur-15.png" /> Cachetur.no</h3><div class="WidgetBody"><ul class="BookmarkList">';
            data.forEach(function(list) {
                let listElement = '<li class="' + (alternate ? 'AlternatingRow' : '') + '"><a href="https://cachetur.no/' + (list.source === 'triptemplate' ? 'tur' : (list.source === 'trip' ? 'fellestur' : 'liste')) + '/' + list.id + '">' + list.name + '</a><br>' + i18next.t('template.by') + ' ' + list.owner + '</li>';
                alternate = !alternate;
                listHtml = listHtml + listElement;
            });
            listHtml = listHtml + '</ul></div></div>';

            $('.sidebar').append(listHtml);
        });
}

function ctGetPublicLists_gc_map_new(cache) {
    ctApiCall("cache_get_lists", {
            "code": cache
        },
        function(data) {
            if (data.length <= 0) {
                console.log("Couldn't find any lists or trip templates for the given cache");
                return;
            }

            console.log("Injecting list of lists to geocache ");
            let alternate = false;
            let listHtml = '<div class="cachetur-controls-container"><h3 class="WidgetHeader"><img src="https://cachetur.no/api/img/cachetur-15.png" /> Cachetur.no</h3><div class="WidgetBody"><h5>' + i18next.t('lists.in') + '</h5>';
            data.forEach(function(list) {
                let listElement = '<li class="' + (alternate ? 'AlternatingRow' : '') + '"><a href="https://cachetur.no/' + (list.source === 'triptemplate' ? 'tur' : (list.source === 'trip' ? 'fellestur' : 'liste')) + '/' + list.id + '">' + list.name + '</a><br>' + i18next.t('template.by') + ' ' + list.owner + '</li>';
                alternate = !alternate;
                listHtml = listHtml + listElement;
            });
            listHtml = listHtml + '</ul></div></div>';

            $('.cache-preview-action-menu').prepend(listHtml);
        });
}

function ctGetPublicLists_gc_map_live(cache) {
    ctApiCall("cache_get_lists", {
            "code": cache
        },
        function(data) {
            if (data.length <= 0) {
                console.log("Couldn't find any lists or trip templates for the given cache");
                return;
            }

            console.log("Injecting list of lists to geocache ");
            let alternate = false;
            let listHtml = '<div class="cachetur-controls-container"><h3 class="WidgetHeader"><img src="https://cachetur.no/api/img/cachetur-15.png" /> Cachetur.no</h3><div class="WidgetBody"><h5>' + i18next.t('lists.in') + '</h5>';
            data.forEach(function(list) {
                let listElement = '<li class="' + (alternate ? 'AlternatingRow' : '') + '"><a href="https://cachetur.no/' + (list.source === 'triptemplate' ? 'tur' : (list.source === 'trip' ? 'fellestur' : 'liste')) + '/' + list.id + '">' + list.name + '</a><br>' + i18next.t('template.by') + ' ' + list.owner + '</li>';
                alternate = !alternate;
                listHtml = listHtml + listElement;
            });
            listHtml = listHtml + '</ul></div></div>';

            $('.cache-preview-action-menu').prepend(listHtml);
        });
}

function ctGetUnsafeLeafletObject() {
    const resolvers = {
        "gc_map": () => unsafeWindow.MapSettings ? unsafeWindow.MapSettings.Map : null,
        "gc_map_new": () => unsafeWindow.cacheturGCMap || null,
        "gc_gctour":   () => unsafeWindow.cacheturGCMap || null,  // NY
        "bobil": () => unsafeWindow.map || null,
        "pgc_map": () => (unsafeWindow.PGC_LiveMap ? unsafeWindow.PGC_LiveMap.map : (unsafeWindow.freeDraw && unsafeWindow.freeDraw.map ? unsafeWindow.freeDraw.map : null)),
        "pgc_map2": () => (unsafeWindow.PGC_LiveMap ? unsafeWindow.PGC_LiveMap.map : (unsafeWindow.freeDraw && unsafeWindow.freeDraw.map ? unsafeWindow.freeDraw.map : null))

    };
    const fn = resolvers[_ctPage];
    return fn ? fn() : null;
}

function ctInitAddLinks() {
  if (_ctCacheturUser === "") return;

  switch (_ctPage) {
    case "gc_geocache":
      ctAddToCoordInfoLink($("#ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode"));
      tvinfostart();
      break;

    case "gc_bmlist":
      ctAddSendListButton();
      break;

    case "gc_map":
      // If Google Maps is loaded -> show warning and stop further processing
      if (document.querySelector("script[src*='//maps.googleapis.com/']")) {
        waitForKeyElements(".map-cta", function () {
          $(".map-wrapper").append(
            '<large style="color:red; position:absolute; top:62px; right:25px;">' +
              i18next.t("alerts.google") +
            "</large>"
          );
        });
        tvinfostart();
        return;
      }
      ctInstallGcPopupWatcher();
      tvinfostart();
      break;

    case "gc_gctour":
      ctInstallGcPopupWatcher();
      tvinfostart();
      break;

    case "gc_map_new":
      if (document.querySelector("script async[src*='maps.googleapis.com/maps-api-v3']")) {
        console.log("google map");
        waitForKeyElements("#clear-map-control", function () {
          $(".map-container").append(
            '<large style="color:red; position:absolute; top:62px; right:25px;">' +
              i18next.t("alerts.google") +
            "</large>"
          );
        });
        tvinfostart();
        break;
      }
      if (!document.querySelector("primary log-geocache")) ctWatchNewMap();
      break;

    case "gc_map_live":
      if (document.querySelector("script async[src*='maps.googleapis.com/maps-api-v3']")) {
        console.log("google map");
        waitForKeyElements("#clear-map-control", function () {
          $(".map-container").append(
            '<large style="color:red; position:absolute; top:62px; right:25px;">' +
              i18next.t("alerts.google") +
            "</large>"
          );
        });

        tvinfostart();
        break;
      }
      if (!document.querySelector("primary log-geocache")) ctWatchNewMap();
      break;

   case "pgc_map":
        ctInitPGCMap();
    break;

    case "pgc_map2":
        ctInitPGCMap();
    break;

    case "pgc_vgps":
      ctAddSendPgcVgpsButton();
      break;
  }
}

// Shared watcher for gc_map and gc_gctour (with loop protection)
function ctInstallGcPopupWatcher() {
 console.log("start mutationobserver");
    let targetNode = document.body;
    let config = {
        attributes: true,
        childList: true,
        subtree: true
    };

    // Callback function to execute when mutations are observed
    let callback = function(mutationsList, observer) {
        // Check if there are any .code elements present
        let codeElements = targetNode.getElementsByClassName("code");
        if (codeElements.length === 0) {
            return; // Exit if no .code elements are found
        }

        // Get the cache code from the first .code element
        let cacheCode = codeElements[0].innerText;

        // If the cache code hasn't changed, exit
        if (cacheCode === _ctBrowseMapActiveCache) {
            return;
        }

        // Update the active cache code
        _ctBrowseMapActiveCache = cacheCode;

        // Update the data attribute and call the necessary functions
        $(".cachetur-add-code").data("code", cacheCode);
        ctAddToCoordInfoLink($('.code'));
        ctUpdateAddImage();
    };

    // Create an instance of MutationObserver with the callback
    let observer = new MutationObserver(callback);

    // Start observing the target node for configured mutations
    if (targetNode) {
        observer.observe(targetNode, config);
        console.log("MutationObserver is set up to watch for changes on browse map.");
    } else {
        console.error("Target node #gmCacheInfo not found.");
    }

    // Event listener for clicks on .cachetur-add-code elements
    $("body").on("click", ".cachetur-add-code", function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");

        ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code
        }, function(data) {
            if (data === "Ok") {
                _ctCodesAdded.push(code);
                ctUpdateAddImage(true);
                $('#cachetur-tur-antall').html(_ctCodesAdded.length);
            } else {
                if (_ctPage === "gc_geocache") {
                    img.addClass("cachetur-add-code-error");
                } else if (_ctPage === "gc_map") {
                    img.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t('send'));
                } else {
                    img.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
                }
            }
        });
    });
}

function ctWatchNewMap() {
    console.log("start mutationobserver on new search map");
    let targetNode = document.body;
    let config = {
        attributes: true,
        childList: true,
        subtree: true
    };
    let callback = function(mutationsList, observer) {

        if (document.getElementsByClassName("primary log-geocache").length === 0) {
            return;
        }
        let cacheCode = document.getElementsByClassName("cache-metadata-code")[0].innerText;

        if (cacheCode === _ctNewMapActiveCache) {
            return;
        }
        _ctNewMapActiveCache = cacheCode;
        $(".cachetur-add-code").data("code", cacheCode);
        ctAddToCoordInfoLink($('.cache-metadata-code'));
        ctUpdateAddImage();

    };


    let observer = new MutationObserver((callback));
    observer.observe(targetNode, config);

    $("body").on("click", ".cachetur-add-code", function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code

        }, function(data) {
            if (data === "Ok") {
                _ctCodesAdded.push(code);
                ctUpdateAddImage(true);
                $('#cachetur-tur-antall').html(_ctCodesAdded.length);
            } else {
                if (_ctPage === "gc_geocache") {
                    img.addClass("cachetur-add-code-error");
                } else if (_ctPage === "gc_map") {
                    img.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t('send'));
                } else {
                    img.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
                }
            }
        });

    });

}

// --- PGC init: inject on data-cacheid changes (robust for re-renders) ---
function ctInitPGCMap() {
// Allow both PGC map modes; require a Leaflet-based Tools or Maps page
const path = (window.location.pathname || "").toLowerCase();
if ((_ctPage !== "pgc_map" && _ctPage !== "pgc_map2") || !(path.includes("/tools/") || path.includes("/maps/"))) {
  return;
}
    if (window.__ctPGCInitDone) return;
    const map = ctGetUnsafeLeafletObject();
    if (!map) return;

    console.log("[Cachetur] PGC init (watching data-cacheid)");

    // Helper: inject menu into the popup that owns a given .addtovgps element
    function injectForAddToVgps(el) {
        try {
            // Find the real popup content
            const content = el.closest(".leaflet-popup-content");
            if (!content) return;

            // Find the coord.info link (source of the GC code text)
            const link = content.querySelector("a[href*='//coord.info/']");
            if (!link) return;

            // Parent is where we inject (your code expects a jQuery object)
            const $parent = $(link).parent();

            // Clean any stale injection if popup node has been reused
            $parent.find(".cachetur-controls-container").remove();

            // Only inject if our button is missing
            if (!$parent.find(".cachetur-add-code").length) {
                console.log("[Cachetur] Injecting (data-cacheid watcher):", link.textContent.trim());
                ctAddToVGPSLink($parent);
            }
        } catch (err) {
            console.error("[Cachetur] Injection error:", err);
        }
    }

    // Debounce map-wide: if multiple mutations fire rapidly, batch to next tick
    let pending = new Set();
    let flushTimer = null;
    function schedule(el) {
        pending.add(el);
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            const els = Array.from(pending);
            pending.clear();
            flushTimer = null;
            els.forEach(injectForAddToVgps);
        }, 60); // small debounce; adjust if needed
    }

    // Observe:
    //  - attribute changes to data-cacheid on .addtovgps
    //  - added popups that include an .addtovgps (first open)
    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === "attributes" &&
                m.attributeName === "data-cacheid" &&
                m.target.classList?.contains("addtovgps")) {
                // PGC just changed which cache this popup represents
                schedule(m.target);
            }
            if (m.type === "childList") {
                // Check newly added subtrees for .addtovgps (new popup content)
                m.addedNodes && m.addedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    if (n.matches?.(".leaflet-popup-content")) {
                        const btn = n.querySelector(".addtovgps");
                        if (btn) schedule(btn);
                    } else {
                        const btns = n.querySelectorAll?.(".leaflet-popup-content .addtovgps");
                        btns && btns.forEach(schedule);
                    }
                });
            }
        }
    });

    mo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-cacheid"]
    });

    // Also handle the moment a popup opens (helpful first-run trigger)
    map.on("popupopen", (e) => {
        const btn = $(e.popup._container).find(".leaflet-popup-content .addtovgps").get(0);
        if (btn) schedule(btn);
    });

    // Keep your layer marking (if you use it)
    map.on("layeradd", (layer) => {
        setTimeout(() => {
            try { ctPGCCheckAndMarkLayer(layer); } catch (err) {
                console.error("[Cachetur] layeradd error:", err);
            }
        }, 50);
    });

    window.__ctPGCInitDone = true;
    console.log("[Cachetur] PGC observers ready (data-cacheid + popupopen)");
}

function ctAddToVGPSLink(vgps) {
  // Guard: ensure we have a jQuery object
  if (!vgps || !vgps.length) return;

  // Inject only if the Cachetur button is not already present
  if (vgps.find(".cachetur-add-code").length === 0) {
    // Prefer the coord.info link when extracting the GC code
    const cacheLink = vgps.find("a[href*='//coord.info/']")[0] || vgps.find("a")[0];
    if (!cacheLink) return;

    // Extract GC code robustly
    let gcCode = "";
    try {
      gcCode = (cacheLink.href.split(".info/")[1] || "").toUpperCase();
      if (!gcCode) {
        const m = (cacheLink.text || "").match(/GC[A-Z0-9]+/i);
        if (m) gcCode = m[0].toUpperCase();
      }
    } catch (e) {
      console.warn("[Cachetur] Failed to extract GC code:", e);
      return;
    }
    if (!gcCode) return;

    // Clean any stale controls if popup DOM was reused
    vgps.find(".cachetur-controls-container").remove();

    // Inject Cachetur button (same look & feel as before)
    vgps.append(
      '<br><img src="https://cachetur.no/api/img/cachetur-15.png" ' +
      'title="' + i18next.t("send") + '" class="cachetur-add-code" ' +
      'style="cursor: pointer; left:20px;" data-code="' + gcCode + '" /><br> '
    );

    // Optional: remove the extra link on non-LiveMap pages (keep original behavior)
    if (window.location.pathname.indexOf("/Tools/LiveMap") === -1) {
      vgps.find("a")[1]?.remove();
    }

    console.log("[Cachetur] Injected Cachetur button for", gcCode);
    ctUpdateAddImage();
  }

  // Bind delegated click handler once (prevents duplicate bindings across popups)
  if (!window.__ctAddCodeClickBound) {
    window.__ctAddCodeClickBound = true;

    $(document)
      .off("click.ct", ".cachetur-add-code")
      .on("click.ct", ".cachetur-add-code", function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        const tur  = $("#cachetur-tur-valg").val();
        const $btn = $(this);
        const code = String($btn.data("code") || "").toUpperCase();

        ctApiCall("planlagt_add_codes", { tur: tur, code: code }, function (data) {
          if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);

            // Refresh the Cachetur header/select/count immediately (no page reload)
            try { ctCreateTripList(); } catch (e) { console.warn("[Cachetur] ctCreateTripList refresh failed:", e); }
          } else {
            // Show error state on the button icon
            $btn.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
          }
        });

        GM_setValue("cachetur_last_action", Date.now());
      });
  }
}

function ctAddToCoordInfoLink(code) {
    if (!code || !code.length) return;

    // Extract GC code from element text or coord.info href
    function extractGcCode($el) {
        try {
            if ($el.is("a[href*='//coord.info/']")) {
                const href = String($el.attr("href") || "");
                return href.split("/").pop().trim().toUpperCase();
            }
            const txt = ($el.text() || $el.html() || "").trim();
            const m = txt.match(/GC[A-Z0-9]+/i);
            return (m ? m[0] : txt).toUpperCase();
        } catch(_) { return ""; }
    }

    // Find a stable root for the popup (varies across views)
    function findRoot($from) {
        return $from.closest(".map-item, #gmCacheInfo, .geotour-cache-info, #box, .leaflet-popup-content");
    }

    // Insert AFTER the last ".links Clear" if present; otherwise after heading or at the end
    function insertAfterLinks($root, html) {
        if (!$root || !$root.length) return;

        // Remove stale controls (popups often reuse DOM)
        $root.find("> .cachetur-controls-container, .links.Clear > .cachetur-controls-container").remove();

        const $lastLinks = $root.find("> .links.Clear").last();
        if ($lastLinks.length) { $lastLinks.after(html); return; }

        const $heading = $root.find("> h3, > h4").last();
        if ($heading.length) { $heading.after(html); return; }

        $root.append(html);
    }

    const gcCode = extractGcCode(code);
    if (!gcCode) return;

    if (_ctPage === "gc_map") {
        // === Revert to 3.5.1.4 behaviour for classic browse map ===
        // 1) Place our control as a new ".links Clear" block inside the map-item (same spot as 3.5.1.4)
        const $root = findRoot(code);
        if (!$root || !$root.length) return;

        // Clean old control (same as 3.5.1.4 did implicitly by re-render)
        $root.find(".cachetur-controls-container").remove();

        const html =
            '<div class="links Clear cachetur-controls-container">' +
              '<a href="#" class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '">' +
                '<img src="https://cachetur.no/api/img/cachetur-15.png" /> ' + i18next.t("send") +
              '</a>' +
            '</div>';

        // Append (3.5.1.4 used "code.parent().append(...)" which resolved to the same map-item container)
        $root.append(html);

        // 2) Bind a DIRECT click handler like 3.5.1.4 (avoid relying on delegated bubbling)
        const $btn = $root.find(".cachetur-controls-container .cachetur-add-code");
        $btn.off("click.ctaMap").on("click.ctaMap", function (evt) {
            evt.preventDefault();
            evt.stopImmediatePropagation();

            const tur = $("#cachetur-tur-valg").val();
            const $self = $(this);
            const gc    = String($self.data("code") || "").toUpperCase();

            // Basic busy guard to avoid double-send on rapid clicks
            if ($self.data("ctaBusy")) return false;
            $self.data("ctaBusy", true);

            ctApiCall("planlagt_add_codes", { tur: tur, code: gc }, function (res) {
                // Accept both legacy "Ok" and object {ok:true}
                const success = (res === "Ok") || (res && res.ok === true);

                if (success) {
                    _ctCodesAdded.push(gc);
                    ctUpdateAddImage(true);
                    $("#cachetur-tur-antall").html(_ctCodesAdded.length);
                } else {
                    // Keep the old visual error for gc_map (as in 3.5.1.4)
                    $self.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t("send"));
                }

                // Release lock shortly after response
                setTimeout(() => $self.data("ctaBusy", false), 600);
            });

            GM_setValue("cachetur_last_action", Date.now());
            return false;
        });

        // Update icon to reflect current state
        ctUpdateAddImage();
        return; // leave all other pages untouched

    } else if (_ctPage === "gc_geocache") {
        // Cache details page (unchanged)
        ctGetPublicLists(gcCode);
        $(".CacheDetailNavigation").append(
            '<ul id="cachetur-controls-container"><li>' +
            '<a href class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '">' +
            i18next.t("send") + '</a></li></ul>'
        );

   } else if (_ctPage === "gc_gctour") {
    // Geotour: place control as the last child of #box (fallback to root if #box is missing)
    const $root = findRoot(code);
    if (!$root || !$root.length) return;

    // Prefer #box if present
    const $host = $root.find("#box").first().length ? $root.find("#box").first() : $root;

    // Remove any previous Cachetur controls (popup DOM is often reused)
    $host.find("> .cachetur-controls-container, .links.Clear > .cachetur-controls-container").remove();

    // Build control (button avoids anchor default navigation/refresh)
    const html =
      '<div class="links Clear cachetur-controls-container">' +
        '<button type="button" class="cachetur-add-code" ' +
                'style="cursor:pointer; background:none; border:none; padding:0;" ' +
                'data-code="' + gcCode + '">' +
          '<img src="https://cachetur.no/api/img/cachetur-15.png" /> ' + i18next.t("send") +
        '</button>' +
      '</div>';

    // Always append as last child of #box (or root fallback)
    $host.append(html);

    // Direct click binding (not dependent on delegated bubbling)
    const $btn = $host.find(".cachetur-controls-container .cachetur-add-code");
    $btn.off("click.ctaGctour").on("click.ctaGctour", function(evt){
        evt.preventDefault();
        evt.stopImmediatePropagation();

        const tur = $("#cachetur-tur-valg").val();
        const $self = $(this);
        const gc    = String($self.data("code") || "").toUpperCase();

        // Simple in-flight guard
        if ($self.data("ctaBusy")) return false;
        $self.data("ctaBusy", true);

        ctApiCall("planlagt_add_codes", { tur: tur, code: gc }, function(res){
            const success = (res === "Ok") || (res && res.ok === true);
            if (success) {
                _ctCodesAdded.push(gc);
                ctUpdateAddImage(true);
                $("#cachetur-tur-antall").html(_ctCodesAdded.length);
            } else {
                // Use same error visual as gc_map/gctour
                $self.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t("send"));
            }
            setTimeout(() => $self.data("ctaBusy", false), 600);
        });

        GM_setValue("cachetur_last_action", Date.now());
        return false;
    });

    // Refresh UI state/icons
    ctUpdateAddImage();


    } else if (_ctPage === "pgc_map") {
        // Project-GC (unchanged)
        const $root = findRoot(code);
        insertAfterLinks($root,
            '<div class="links Clear cachetur-controls-container">' +
              '<a href="#" class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '">' +
                '<img src="https://cachetur.no/api/img/cachetur-15.png" /> ' + i18next.t("send") +
              '</a>' +
            '</div>'
        );
        ctUpdateAddImage();

    } else if (_ctPage === "pgc_map2") {
        // Project-GC (unchanged)
        const $root = findRoot(code);
        insertAfterLinks($root,
            '<div class="links Clear cachetur-controls-container">' +
              '<a href="#" class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '">' +
                '<img src="https://cachetur.no/api/img/cachetur-15.png" /> ' + i18next.t("send") +
              '</a>' +
            '</div>'
        );
        ctUpdateAddImage();

    } else if (_ctPage === "gc_map_new") {
        // New GC map (unchanged)
        $(".cache-preview-action-menu").prepend(
            '<br><ul id="cachetur-controls-container"><li>' +
            '<img src="https://cachetur.no/api/img/cachetur-15.png" />' +
            '<a href class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '"> ' +
            i18next.t("send") + '</a></li></ul>'
        );
        ctGetPublicLists_gc_map_new(gcCode);
        tvinfostart();
        ctUpdateAddImage();

    } else if (_ctPage === "gc_map_live") {
        // Live map (unchanged)
        $(".cache-preview-action-menu").prepend(
            '<br><ul id="cachetur-controls-container"><li>' +
            '<img src="https://cachetur.no/api/img/cachetur-15.png" />' +
            '<a href class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '"> ' +
            i18next.t("send") + '</a></li></ul>'
        );
        ctGetPublicLists_gc_map_live(gcCode);
        tvinfostart();
        ctUpdateAddImage();

    } else {
        // Fallback (unchanged)
        const img =
            '<img src="https://cachetur.no/api/img/cachetur-15.png" title="' + i18next.t("send") + '" ' +
            'class="cachetur-add-code" style="cursor:pointer;" data-code="' + gcCode + '" /> ';
        code.prepend(img);
        ctUpdateAddImage();
    }

    // Keep the global delegated handler as a safety net for other pages/new nodes
    if (!window.__ctAddCodeClickBound) {
        window.__ctAddCodeClickBound = true;
        $(document)
            .off("click.cacheturAddCode")
            .on("click.cacheturAddCode", ".cachetur-add-code", function (evt) {
                // Only use the delegated path if no direct handler is bound
                const $self = $(this);
                const hasDirect = $._data(this, "events")?.click?.some(h => h.namespace === "ctaMap");
                if (hasDirect) return; // gc_map uses direct binding

                evt.preventDefault();
                evt.stopImmediatePropagation();

                const tur = $("#cachetur-tur-valg").val();
                const gc  = String($self.data("code") || "").toUpperCase();

                ctApiCall("planlagt_add_codes", { tur: tur, code: gc }, function (res) {
                    const success = (res === "Ok") || (res && res.ok === true);
                    if (success) {
                        _ctCodesAdded.push(gc);
                        ctUpdateAddImage(true);
                        $("#cachetur-tur-antall").html(_ctCodesAdded.length);
                    } else {
                        if (_ctPage === "gc_geocache" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                            $self.addClass("cachetur-add-code-error").text(i18next.t("send"));
                        } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                            $self.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t("send"));
                        } else {
                            $self.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
                        }
                    }
                });

                GM_setValue("cachetur_last_action", Date.now());
                return false;
            });
    }
}

    //fake update posted coordinates
function updatecoord() {
    var existCondition = setInterval(function() {
 if ($('#cachetur-tur-valg').length) {
    clearInterval(existCondition);
if (_ctPage === "gc_geocache"){
  $('.LocationData').append('<span class="cachetur-header" span id="copy"> <button id="cp_btn" title="' + i18next.t('corrected.title') + '"><img src="https://raw.githubusercontent.com/cghove/bobil/main/l1515.png">' + i18next.t('corrected.button') + '<img src="https://raw.githubusercontent.com/cghove/bobil/main/1515.png"></button> </span>');
document.getElementById("cp_btn").addEventListener("click", clipboard);

function clipboard() {
  event.preventDefault();
  var text = $("#uxLatLon").text()
  var $temp = $("<input>");
  $("body").append($temp);
  $temp.val(text).select();
  document.execCommand("copy");
  $temp.remove();
    $("#uxLatLon").trigger("click");
    waitForKeyElements("#newCoordinates", function() {
    $('#newCoordinates').val(text);
    $(".btn-cc-parse").trigger("click");
        });



}
};
 }
}, 100);
}



//end fake update posted coordinates

function ctAddSendPgcVgpsButton() {
    let container = $("#vgps_newList").parent();
    container.append('<button  type="button" class="btn btn-default btn-xs cachetur-send-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' + i18next.t('send') + '" style="cursor: pointer;" /> ' + i18next.t('vgps.sendmarked') + '</button> ');
    container.append('<button  type="button" class="btn btn-default btn-xs cachetur-select-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' + i18next.t('vgps.markfromtrip') + '" style="cursor: pointer;" /> ' + i18next.t('vgps.markfromtrip') + '</button> ');

    $(".cachetur-send-vgps").click(function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        ctPGCSendVGPSSelected();
    });

    $(".cachetur-select-vgps").click(function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        ctPGCSelectVGPS();
    });
}

function ctPGCSendVGPSSelected() {
    let selected = $("#vgpsTable").find(".jqgrow.ui-row-ltr.ui-widget-content.ui-state-highlight").find("[aria-describedby*='vgpsTable_gccode']").find("a").toArray();

    if (selected.length === 0) {
        return;
    }

    let tur = $("#cachetur-tur-valg").val();
    let codes = [];
    selected.forEach(function(item) {
        codes.push(item.text);
    });

    ctApiCall("planlagt_add_codes", {
        tur: tur,
        code: codes
    }, function(data) {
        if (data === "Ok") {
            ctGetAddedCodes(tur);
            ctGetTripRoute(tur);
            alert(i18next.t('vgps.sent'));
        } else {
            alert(i18next.t('vgps.error'));
        }
    });

    GM_setValue("cachetur_last_action", Date.now());
}

function ctPGCSelectVGPS() {
    let inCachetur = $('.cachetur-pgc-added').closest('tr').toArray();

    if (inCachetur.length === 0) {
        return;
    }

    inCachetur.forEach(function(item) {
        $('#jqg_vgpsTable_' + item.id).prop('checked', true).trigger('click');
    });
}

function ctPGCMarkFound() {
  // Run on both PGC Live Map and other Tools maps that use Leaflet
  if (_ctPage !== "pgc_map" && _ctPage !== "pgc_map2") return;

  const map = ctGetUnsafeLeafletObject();
  if (!map) {
    console.warn("[Cachetur] ctPGCMarkFound: Leaflet map not found");
    return;
  }

  // Iterate over all layers and apply marker logic
  map.eachLayer(function (layer) {
    try {
      ctPGCCheckAndMarkLayer(layer);
    } catch (err) {
      console.error("[Cachetur] ctPGCMarkFound: error while marking layer:", err);
    }
  });
}


function ctPGCCheckAndMarkLayer(layer) {
    let realLayer = layer.layer ? layer.layer : layer;

    if (realLayer instanceof L.Marker && realLayer.label) {
        let cacheCode = realLayer.label._content.split(" - ")[0];
        if (ctCodeAlreadyAdded(cacheCode)) {
            realLayer._icon.classList.add("cachetur-marker-added");
        } else {
            realLayer._icon.classList.remove("cachetur-marker-added");
        }
    }
}


function ctPGCCheckVgps() {
    if (_ctPage !== "pgc_vgps") return;

    $(".cachetur-pgc-added").remove();

    $("#vgpsTable").find(".jqgrow.ui-row-ltr.ui-widget-content").each(function() {
        let code = $(this).find("[aria-describedby*='vgpsTable_gccode']").find("a").html();
        if (ctCodeAlreadyAdded(code)) {
            $(this).find("[aria-describedby*='vgpsTable_name']").prepend('<img class="cachetur-pgc-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="' + i18next.t('sent') + '"> ');
        }
    });
}

function ctAddSendListButton() {
    waitForKeyElements(".actions", function() {
        console.log("Injecting send to cachetur button");
        $(".actions").append('<button type="button" class="cachetur-send-bmlist gc-button multi-select-action-bar-button gc-button-has-type gc-button-primary" style="margin-left: 5px;"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' + i18next.t('send') + '" style="cursor: pointer;" /> ' + i18next.t('vgps.sendmarked') + '</button>');

        $(".cachetur-send-bmlist").click(function(evt) {
            evt.stopImmediatePropagation();
            evt.preventDefault();
            ctListSendSelected();
        });
    });
}

function ctListSendSelected() {
    if (_ctPage === "gc_bmlist") {
        console.log("Sending selected geocaches from gc_bmlist");
        let selected = $('.list-details-table tbody tr input[type="checkbox"]:checked');

        if (selected.length > 0) {
            let codes = [];
            let names = []; // Array to hold the names of the geocaches

            selected.each(function() {
                let code = $(this).closest("tr").find(".geocache-meta span").last().text().trim();
                codes.push(code);

                // Extract the geocache name from the anchor tag
                let name = $(this).closest("tr").find("a.text-grey-600").text().trim();
                names.push(name); // Add the name to the names array
            });

            let tur = $("#cachetur-tur-valg").val();

            ctApiCall("planlagt_add_codes", {
                tur: tur,
                code: codes
            }, function(data) {
                if (data === "Ok") {
                    ctGetAddedCodes(tur);
                    ctGetTripRoute(tur);

                    // Create a string of names to include in the alert
                    let namesString = names.join(", "); // Join names with a comma
                    alert(i18next.t('vgps.sent') + ": " + namesString); // Include names in the alert

                    // Update the UI to reflect the sent status
                    selected.each(function() {
                        let code = $(this).closest("tr").find(".geocache-meta span").last().text().trim();
                        let correspondingRow = $(".list-details-table tbody tr").filter(function() {
                            return $(this).find(".geocache-meta span").last().text().trim() === code;
                        });

                        if (correspondingRow.length) {
                            correspondingRow.find(".sent-status").remove(); // Remove any existing status
                            correspondingRow.find("td.geocache-details").append('<span class="sent-status" style="color: green;"> - Sent</span>');
                        }
                    });
                } else {
                    alert(i18next.t('vgps.error'));
                }
            });

            GM_setValue("cachetur_last_action", Date.now());
        }
    }
}

function ctCheckList() {
    if (_ctPage !== "gc_bmlist") return;

    waitForKeyElements(".list-details-table", function() {
        console.log("Checking list for added caches");
        $(".cachetur-bmlist-added").remove(); // Remove existing indicators

        $("table.list-details-table").find("tr").each(function() {
            let codeInfo = $(this).find(".geocache-meta span").last().text().trim();
            if (ctCodeAlreadyAdded(codeInfo)) {
                $(this).find(".geocache-meta").prepend('<img class="cachetur-bmlist-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="' + i18next.t('sent') + '"> ');
            }
        });
    });
}

function ctUpdateAddImage(codeAddedTo) {
    // Update all "send to cachetur" controls in the current popup(s)
    const imgs = $(".cachetur-add-code");
    if (imgs.length <= 0) return;

    imgs.each(function () {
        const img = $(this);
        const code = img.data("code");

        // Added just now OR previously added
        const codeIsAdded = codeAddedTo === code || ctCodeAlreadyAdded(code);

        // Keep existing behavior (e.g., found-by text on GC pages)
        ctSetIconForCode(code);

        // ---------- PGC: ensure a dedicated toolbar row placed BELOW vGPS ----------
        if (_ctPage === "pgc_map" || _ctPage === "pgc_map2") {
            const content = img.closest('.leaflet-popup-content');
            const vgpsBr = content.find('.addtovgps').first().next('br');

            // Create/find toolbar row
            let toolbar = content.find(".cachetur-pgc-toolbar");
            if (toolbar.length === 0) {
                toolbar = $('<div class="cachetur-pgc-toolbar" ' +
                    'style="display:block; clear:both; position:relative; height:18px; margin-top:4px; z-index:2;"></div>');
                if (vgpsBr.length) vgpsBr.after(toolbar); else toolbar.insertBefore(img);
            }

            // Move the "send" icon into the toolbar and position it (left: 20px)
            toolbar.append(img);
            img.css({ position: "absolute", top: 0, left: "20px", cursor: "pointer", zIndex: 2 });
            img.attr("title", codeIsAdded ? i18next.t('sent') : i18next.t('send'));
            img.attr("src", codeIsAdded
                ? "https://cachetur.no/api/img/cachetur-15-success.png"
                : "https://cachetur.no/api/img/cachetur-15.png");

            // If added → ensure comment + priorities exist (idempotent)
            if (codeIsAdded) {
                // Comment icon (left: 60px)
                if (toolbar.find('.cachetur-add-comment[data-code="' + code + '"]').length === 0) {
                    const commentControl = $(
                        '<img src="https://cachetur.no/api/img/cachetur-comment.png" ' +
                        ' data-code="' + code + '" title="' + i18next.t('comments.add') + '" ' +
                        ' class="cachetur-add-comment" ' +
                        ' style="position:absolute; top:0; left:60px; cursor:pointer; z-index:2;" />'
                    );
                    toolbar.append(commentControl);

                    // Dedicated click handler for PGC image button
                    commentControl.on("click", function (evt) {
                        // Prevent closing of Leaflet popup and default behavior
                        evt.stopImmediatePropagation();
                        evt.preventDefault();

                        const tur = $("#cachetur-tur-valg").val();
                        const commentImg = $(this);
                        const commentCode = commentImg.data("code");
                        const comment = prompt(i18next.t('comments.description'));
                        if (comment == null) return false; // User cancelled

                        ctApiCall("planlagt_add_code_comment", { tur: tur, code: commentCode, comment: comment }, function (data) {
                            if (data === "Ok" || (data && data.ok === true)) {
                                commentImg.attr("src", "https://cachetur.no/api/img/cachetur-comment-success.png")
                                          .attr("title", i18next.t('comments.saved'));
                            } else {
                                commentImg.attr("src", "https://cachetur.no/api/img/cachetur-comment-error.png")
                                          .attr("title", i18next.t('comments.error'));
                            }
                        });

                        try { GM_setValue("cachetur_last_action", Date.now()); } catch (_) {}
                        return false;
                    });
                }

                // Priority icons only for non-template trips (ID NOT ending with 'T')
                if (!$("#cachetur-tur-valg").val().endsWith('T')) {
                    if (toolbar.find('.cachetur-set-pri-1[data-code="' + code + '"]').length === 0) ctCreatePriorityControl(img, code, 1);
                    if (toolbar.find('.cachetur-set-pri-2[data-code="' + code + '"]').length === 0) ctCreatePriorityControl(img, code, 2);
                    if (toolbar.find('.cachetur-set-pri-3[data-code="' + code + '"]').length === 0) ctCreatePriorityControl(img, code, 3);
                }
            } else {
                // Not added → keep only the send icon inside the toolbar on PGC
                const toolbarParent = img.parent();
                toolbarParent.find('.cachetur-add-comment, .cachetur-set-pri-1, .cachetur-set-pri-2, .cachetur-set-pri-3').remove();
            }

            // Do NOT return; geocaching.com branches below should still execute for their pages
        }
        // ---------- /PGC toolbar handling ----------

        if (codeIsAdded) {
            if (_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-error");
                img.addClass("cachetur-add-code-success");
                img.html(i18next.t('sent'));
            } else if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                img.html('<img src="https://cachetur.no/api/img/cachetur-15-success.png" /> ' + i18next.t('sent'));
            } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                img.html('<img src="https://cachetur.no/api/img/cachetur-15-success.png" /> ' + i18next.t('sent'));
            } else {
                // PGC handled above; keep as-is here for other IMG-only pages
                img.attr("src", "https://cachetur.no/api/img/cachetur-15-success.png");
                img.attr("title", i18next.t('sent'));
            }

            // Only create GC comment/priority controls on GC pages (PGC handled above)
            if (_ctPage === "gc_geocache") {
                if ($("#cachetur-controls-container .cachetur-add-comment[data-code='" + code + "']").length === 0) {
                    const li = $('<li></li>');
                    // Use href="#" to avoid navigation; delegated handler will catch clicks
                    const commentControl = $('<a href="#" class="cachetur-add-comment" data-code="' + code + '">' + i18next.t('comments.add') + '</a>');
                    li.append(commentControl);
                    $("#cachetur-controls-container").append(li);
                }
                if (!$("#cachetur-tur-valg").val().endsWith('T')) {
                    ctCreatePriorityControl(img, code, 1);
                    ctCreatePriorityControl(img, code, 2);
                    ctCreatePriorityControl(img, code, 3);
                }
            } else if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                if ($("#cachetur-controls-container .cachetur-add-comment[data-code='" + code + "']").length === 0) {
                    const li = $('<li></li>');
                    const commentControl = $('<a href="#" class="cachetur-add-comment" data-code="' + code + '"><img src="https://cachetur.no/api/img/cachetur-comment.png" /> ' + i18next.t('comments.add') + ' </a>');
                    li.append(commentControl);
                    $("#cachetur-controls-container").append(li);
                }
                if (!$("#cachetur-tur-valg").val().endsWith('T')) {
                    ctCreatePriorityControl(img, code, 1);
                    ctCreatePriorityControl(img, code, 2);
                    ctCreatePriorityControl(img, code, 3);
                }
            } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                if (img.parent().find(".cachetur-add-comment[data-code='" + code + "']").length === 0) {
                    const commentControl = $('<a href="#" class="cachetur-add-comment" data-code="' + code + '"><img src="https://cachetur.no/api/img/cachetur-comment.png" /> ' + i18next.t('comments.add') + ' </a>');
                    img.parent().append(commentControl);

                    // IMPORTANT: bind a direct click handler here (popup may live in another document)
                    commentControl.on("click", function (evt) {
                        // Prevent default navigation and stop bubbling to Leaflet
                        evt.preventDefault();
                        evt.stopImmediatePropagation();

                        const $link = $(this);
                        const commentCode = String($link.data("code") || "").toUpperCase();
                        const tur = $("#cachetur-tur-valg").val();

                        const comment = prompt(i18next.t("comments.description"));
                        if (comment == null) return false; // User cancelled

                        ctApiCall("planlagt_add_code_comment", { tur: tur, code: commentCode, comment: comment }, function (res) {
                            const ok = (res === "Ok") || (res && res.ok === true);
                            $link.html(
                                '<img src="https://cachetur.no/api/img/cachetur-comment' +
                                (ok ? '-success' : '-error') + '.png" /> ' +
                                i18next.t(ok ? "comments.saved" : "comments.error")
                            );
                        });

                        try { GM_setValue("cachetur_last_action", Date.now()); } catch (_) {}
                        return false;
                    });
                }
                if (!$("#cachetur-tur-valg").val().endsWith('T')) {
                    ctCreatePriorityControl(img, code, 1);
                    ctCreatePriorityControl(img, code, 2);
                    ctCreatePriorityControl(img, code, 3);
                }
            }
        } else {
            if (_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-success").removeClass("cachetur-add-code-error").html(i18next.t('send'));
                img.parent().parent().find(".cachetur-add-comment").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-1").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-2").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-3").parent().remove();
                $("#cachetur-found-by-container").remove();
            } else if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                img.removeClass("cachetur-add-code-success").removeClass("cachetur-add-code-error").html(i18next.t('send'));
                img.parent().parent().find(".cachetur-add-comment").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-1").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-2").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-3").parent().remove();
            } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                img.html('<img src="https://cachetur.no/api/img/cachetur-15.png" /> ' + i18next.t('send'));
                img.parent().find(".cachetur-add-comment, .cachetur-set-pri-1, .cachetur-set-pri-2, .cachetur-set-pri-3, .cachetur-found-by").remove();
            } else {
                // PGC: already removed extras above; ensure default send icon
                img.attr("src", "https://cachetur.no/api/img/cachetur-15.png").attr("title", i18next.t('send'));
                img.parent().find(".cachetur-found-by").remove();
            }
        }
    });

    // ---------- One-time delegated handler for GC comment links (works for same-document popups) ----------
    // On gc_map, popup may live in a different document; we also bind direct handlers above when creating the link.
    if (!window.__ctAddCommentBound) {
        window.__ctAddCommentBound = true;

        $(document)
            .off("click.cacheturAddComment")
            .on("click.cacheturAddComment", ".cachetur-add-comment", function (evt) {
                // Prevent default navigation and stop bubbling to Leaflet
                evt.preventDefault();
                evt.stopImmediatePropagation();

                const $link = $(this);
                const code = String($link.data("code") || "").toUpperCase();
                const tur  = $("#cachetur-tur-valg").val();

                const comment = prompt(i18next.t("comments.description"));
                if (comment == null) return false; // User cancelled

                ctApiCall("planlagt_add_code_comment", { tur: tur, code: code, comment: comment }, function (res) {
                    const ok = (res === "Ok") || (res && res.ok === true);

                    // Visual feedback depending on current GC page
                    if (_ctPage === "gc_geocache" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                        $link.text(i18next.t(ok ? "comments.saved" : "comments.error"));
                    } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                        $link.html(
                            '<img src="https://cachetur.no/api/img/cachetur-comment' +
                            (ok ? '-success' : '-error') + '.png" /> ' +
                            i18next.t(ok ? "comments.saved" : "comments.error")
                        );
                    } else {
                        // Fallback
                        $link.attr("title", i18next.t(ok ? "comments.saved" : "comments.error"));
                    }
                });

                try { GM_setValue("cachetur_last_action", Date.now()); } catch (_) {}
                return false;
            });
    }
}

function ctCreatePriorityControl(img, code, priority) {
    let control;

    if (_ctPage === "gc_geocache") {
        // GC cache page: use the controls container and avoid duplicates
        const container = $("#cachetur-controls-container");
        const selector = '.cachetur-set-pri-' + priority + '[data-code="' + code + '"]';
        if (container.find(selector).length > 0) return;

        const li = $('<li></li>');
        control = $('<a href class="cachetur-set-pri-' + priority + '" data-code="' + code + '">' +
                    i18next.t('priority.set' + priority) + '</a>');
        li.append(control);
        container.append(li);

    } else if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
        // GC new/live map: use the controls container and avoid duplicates
        const container = $("#cachetur-controls-container");
        const selector = '.cachetur-set-pri-' + priority + '[data-code="' + code + '"]';
        if (container.find(selector).length > 0) return;

        const li = $('<li></li>').insertAfter(".cachetur-add-comment");
        control = $('<a href class="cachetur-set-pri-' + priority + '" data-code="' + code + '">' +
                    '<img src="https://cachetur.no/api/img/p' + priority + '.png" /> ' +
                    i18next.t('priority.set' + priority) + '</a>');
        li.append(control);
        container.append(li);

    } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
        // GC classic map / GCTour: append next to the "sent" label and avoid duplicates
        const container = img.parent(); // same parent as the "sent" link
        const selector = '.cachetur-set-pri-' + priority + '[data-code="' + code + '"]';
        if (container.find(selector).length > 0) return;

        control = $('<a href class="cachetur-set-pri-' + priority + '" data-code="' + code + '">' +
                    '<img src="https://cachetur.no/api/img/p' + priority + '.png" /> ' +
                    i18next.t('priority.set' + priority) + '</a>');
        container.append(control);

    } else {
        // PGC: add to the toolbar (row 1) at 80/100/120px; avoid duplicates
        let toolbar = img.parent(); // on PGC, img.parent() should already be the toolbar
        if (!toolbar.hasClass('cachetur-pgc-toolbar')) {
            // Fallback: create toolbar below vGPS if missing, then move img into it
            const content = img.closest('.leaflet-popup-content');
            const vgpsBr = content.find('.addtovgps').first().next('br');
            toolbar = $('<div class="cachetur-pgc-toolbar" ' +
                        'style="display:block; clear:both; position:relative; height:18px; margin-top:4px; z-index:2;"></div>');
            if (vgpsBr.length) vgpsBr.after(toolbar); else toolbar.insertBefore(img);
            toolbar.append(img);
            img.css({ position: "absolute", top: 0, left: "20px", cursor: "pointer", zIndex: 2 });
        }

        const selector = '.cachetur-set-pri-' + priority + '[data-code="' + code + '"]';
        if (toolbar.find(selector).length > 0) return;

        const left = 60 + priority * 20; // p1=80, p2=100, p3=120
        control = $('<img src="https://cachetur.no/api/img/p' + priority + '.png" data-code="' + code + '"' +
                    ' title="' + i18next.t('priority.set' + priority) + '" class="cachetur-set-pri-' + priority + '"' +
                    ' style="position:absolute; top:0; left:' + left + 'px; cursor:pointer; z-index:2;" />');
        toolbar.append(control);
    }

    // Click handler (unchanged semantics)
    control.click(function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        const tur = $("#cachetur-tur-valg").val();
        const priorityImg = $(this);
        const priorityCode = priorityImg.data('code');

        ctApiCall("planlagt_set_code_priority", { tur: tur, code: priorityCode, priority: priority }, function (data) {
            if (data === "Ok") {
                if (_ctPage === "gc_geocache" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                    priorityImg.addClass("cachetur-set-pri-" + priority + "-success").html(i18next.t('priority.saved'));
                } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                    priorityImg.html('<img src="https://cachetur.no/api/img/p' + priority + '_success.png" /> ' + i18next.t('priority.saved'));
                } else {
                    priorityImg.attr("src", "https://cachetur.no/api/img/p" + priority + "_success.png")
                               .attr("title", i18next.t('priority.saved'));
                }
            } else {
                if (_ctPage === "gc_geocache" || _ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
                    priorityImg.addClass("cachetur-set-pri-" + priority + "-error").html(i18next.t('priority.error'));
                } else if (_ctPage === "gc_map" || _ctPage === "gc_gctour") {
                    priorityImg.html('<img src="https://cachetur.no/api/img/p' + priority + '_error.png" /> ' + i18next.t('priority.error'));
                } else {
                    priorityImg.attr("src", "https://cachetur.no/api/img/p" + priority + "_error.png")
                               .attr("title", i18next.t('priority.error'));
                }
            }
        });

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctCodeAlreadyAdded(code) {
    return _ctCodesAdded.indexOf(code) > -1;
}

function ctSetIconForCode(code) {
    // Query backend for "found by" info for this code in the selected trip
    const id = $("#cachetur-tur-valg").val();

    ctApiCall("planlagt_check_find", { tur: id, code: code }, function(foundBy) {

        if (foundBy === "") return "";

        const img = $(".cachetur-add-code[data-code='" + code + "']");
        if (img.length <= 0) return;

        // Avoid duplicates globally and per-popup
        if ($(".cachetur-found-by[data-code='" + code + "']").length > 0) return;
        const content = img.closest('.leaflet-popup-content');
        if (content.find(".cachetur-found-by-container").length > 0) return;

        // ----- Keep existing GC behavior unchanged -----
        if (_ctPage === "gc_geocache") {
            $("#cachetur-found-by-container").remove();
            $("#cachetur-controls-container").parent().append(
                '<ul id="cachetur-found-by-container">' +
                    '<li><b><img src="https://cachetur.no/api/img/attfind.png" /> ' + i18next.t('foundby') + '</b></li>' +
                    '<li>' + foundBy + '</li>' +
                '</ul>'
            );
            return;
        }
        if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
            $("#cachetur-found-by-container").remove();
            $("#cachetur-controls-container").parent().append(
                '<ul id="cachetur-found-by-container">' +
                    '<li><b><img src="https://cachetur.no/api/img/attfind.png" /> ' + i18next.t('foundby') + '</b></li>' +
                    '<li>' + foundBy + '</li>' +
                '</ul>'
            );
            return;
        }
        if (_ctPage === "gc_map") {
            img.closest(".map-item").find(".cachetur-found-by-container").remove();
            img.closest(".map-item").append(
                '<div class="links Clear cachetur-found-by-container">' +
                    '<b><img src="https://cachetur.no/api/img/attfind.png" /> ' + i18next.t('foundby') + '</b> ' + foundBy +
                '</div>'
            );
            return;
        }
        // ----- /GC behavior -----

        // ----- PGC: put "Found by" on its own row BELOW the toolbar (and below vGPS) -----
        const vgpsBr  = content.find('.addtovgps').first().next('br');
        const toolbar = content.find('.cachetur-pgc-toolbar').last();

        const foundLine = $(
            '<div class="cachetur-found-by-container" ' +
            '     style="display:block; clear:both; margin-top:4px; position:relative; z-index:2; ' +
            '            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
                '<b><img src="https://cachetur.no/api/img/attfind.png" style="vertical-align:text-bottom; margin-right:4px;" /> ' +
                i18next.t('foundby') + '</b> ' + foundBy +
            '</div>'
        );

        if (toolbar.length) {
            foundLine.insertAfter(toolbar);
        } else if (vgpsBr.length) {
            foundLine.insertAfter(vgpsBr);
        } else {
            foundLine.insertAfter(img);
        }
        // ----- /PGC -----
    });
}

    // Get url parameter.
    function getURLParam(key) {
        var query = window.location.search.substring(1);
        var pairs = query.split('&');
        for (let i=0; i<pairs.length; i++) {
            var pair = pairs[i].split('=');
            if (pair[0] == key) {
                if (pair[1].length > 0) return pair[1];
            }
        }
        return undefined;
    };
function ctFixNewGcMapIssues() {
    if (window.location.href.indexOf("bm=") > -1) return;

    unsafeWindow.cacheturGCMap.on('zoomend', function() {
            var latHighG = false;
            var latLowG = false;
            var lngHighG = false;
            var lngLowG = false;
            var firstRun = true;
            const ONE_MINUTE_MS = 60*1000;
            function searchThisArea(waitCount) {
                if ($('.leaflet-gl-layer.mapboxgl-map')[0] || $('div.gm-style')[0]) { // Leaflet or GM
                    if (!$('.loading-container.show')[0] && !$('li.active svg.my-lists-toggle-icon')[0] && ($('#clear-map-control')[0] && firstRun)) {
                        setTimeout(function() {
                            if ($('.loading-container.show')[0]) return;
                            var pxHeight = window.innerHeight;
                            var pxWidth = window.innerWidth;
                            var lat = parseFloat(getURLParam('lat'));
                            var lng = parseFloat(getURLParam('lng'));
                            var zoom = parseInt(getURLParam('zoom'));
                            var metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
                            var latMeterDistance = metersPerPx * pxHeight;
                            var lngMeterDistance = metersPerPx * pxWidth;
                            var latHalfDezDistance = latMeterDistance / 1850 / 60 / 2;
                            var lngHalfDezDistance = lngMeterDistance / (1850 * Math.cos(lat * Math.PI / 180)) / 60 / 2;
                            var latHigh = (lat + latHalfDezDistance).toFixed(4);
                            var latLow = (lat - latHalfDezDistance).toFixed(4);
                            var lngHigh = (lng + lngHalfDezDistance).toFixed(4);
                            var lngLow = (lng - lngHalfDezDistance).toFixed(4);
                            if (latHighG == false || latHigh > latHighG || latLow < latLowG || lngHigh > lngHighG || lngLow < lngLowG) {
                                latHighG = latHigh;
                                latLowG = latLow;
                                lngHighG = lngHigh;
                                lngLowG = lngLow;
                                if (!firstRun) {
                                    let times = JSON.parse(GM_getValue("search_this_area_times", "[]"));
                                    if (times.length < 9) {
                                        $('#clear-map-control').click().click();
                                        times.push(Date.now());
                                           GM_setValue("search_this_area_times", JSON.stringify(times));
                                    } else {
                                        let t = Date.now();
                                        // check 1min limit
                                        if ((t - times[0]) > ONE_MINUTE_MS) {
                                            $('#clear-map-control').click().click();
                                            times.splice(0, 1);
                                            times.push(t);
                                            GM_setValue("search_this_area_times", JSON.stringify(times));
                                        } else {
                                            if ($('body.cta-waiting-msg').length === 0) {
                                                $('body').addClass('cta-waiting-msg');
                                                var wait = Math.ceil((ONE_MINUTE_MS-(t-times[0]))/1000);
                                                function countdown(waitTime) {
                                                    if (waitTime < 1) {
                                                        $('#cta-waiting-msg').remove();
                                                        $('div.loading-container').css('display', 'none').removeClass('show');
                                                        $('body').removeClass('cta-waiting-msg');
                                                    } else {
                                                        $('div.loading-container').css('display', 'flex').addClass('show');
                                                        $('#cta-waiting-msg').remove();
                                                        $('.loading-display').append('<span id="cta-waiting-msg" role="alert" aria-live="assertive">' + i18next.t('refresh.tomany ') +' '+ + waitTime + ' ' + i18next.t(' refresh.s') + '</span>');

                                                        setTimeout(function() {countdown(--waitTime);}, 1000);
                                                    }
                                                }
                                                countdown(wait);
                                            }
                                        }
                                    }
                                }
                                firstRun = false;
                            }
                        }, 400);
                    }
                } else {waitCount++; if (waitCount <= 200) setTimeout(function(){searchThisArea(waitCount);}, 50);}
            }
            window.history.pushState = new Proxy(window.history.pushState, {
                apply: (target, thisArg, argArray) => {
                    searchThisArea(0);
                    return target.apply(thisArg, argArray);
                }
            });
    });

    unsafeWindow.cacheturGCMap.on("dragend", function() {
            var latHighG = false;
            var latLowG = false;
            var lngHighG = false;
            var lngLowG = false;
            var firstRun = true;
            const ONE_MINUTE_MS = 60*1000;
            function searchThisArea(waitCount) {
                if ($('.leaflet-gl-layer.mapboxgl-map')[0] || $('div.gm-style')[0]) { // Leaflet or GM
                    if (!$('.loading-container.show')[0] && !$('li.active svg.my-lists-toggle-icon')[0] && ($('#clear-map-control')[0] || firstRun) ) {
                        setTimeout(function() {
                            if ($('.loading-container.show')[0]) return;
                            var pxHeight = window.innerHeight;
                            var pxWidth = window.innerWidth;
                            var lat = parseFloat(getURLParam('lat'));
                            var lng = parseFloat(getURLParam('lng'));
                            var zoom = parseInt(getURLParam('zoom'));
                            var metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
                            var latMeterDistance = metersPerPx * pxHeight;
                            var lngMeterDistance = metersPerPx * pxWidth;
                            var latHalfDezDistance = latMeterDistance / 1850 / 60 / 2;
                            var lngHalfDezDistance = lngMeterDistance / (1850 * Math.cos(lat * Math.PI / 180)) / 60 / 2;
                            var latHigh = (lat + latHalfDezDistance).toFixed(4);
                            var latLow = (lat - latHalfDezDistance).toFixed(4);
                            var lngHigh = (lng + lngHalfDezDistance).toFixed(4);
                            var lngLow = (lng - lngHalfDezDistance).toFixed(4);
                            if (latHighG == false || latHigh > latHighG || latLow < latLowG || lngHigh > lngHighG || lngLow < lngLowG) {
                                latHighG = latHigh;
                                latLowG = latLow;
                                lngHighG = lngHigh;
                                lngLowG = lngLow;

                                if (!firstRun) {
                                    let times = JSON.parse(GM_getValue("search_this_area_times", "[]"));
                                    if (times.length < 9) {
                                        $('#clear-map-control').click().click();
                                        times.push(Date.now());
                                        GM_setValue("search_this_area_times", JSON.stringify(times));
                                    } else {
                                        let t = Date.now();
                                        if ((t - times[0]) > ONE_MINUTE_MS) {
                                            $('#clear-map-control').click().click();
                                            times.splice(0, 1);
                                            times.push(t);
                                            GM_setValue("search_this_area_times", JSON.stringify(times));
                                        } else {
                                            if ($('body.cta-waiting-msg').length === 0) {
                                                $('body').addClass('cta-waiting-msg');
                                                var wait = Math.ceil((ONE_MINUTE_MS-(t-times[0]))/1000);
                                                function countdown(waitTime) {
                                                    if (waitTime < 1) {
                                                        $('#cta-waiting-msg').remove();
                                                        $('div.loading-container').css('display', 'none').removeClass('show');
                                                        $('body').removeClass('cta-waiting-msg');
                                                    } else {
                                                        $('div.loading-container').css('display', 'flex').addClass('show');
                                                        $('#cta-waiting-msg').remove();
                                                        $('.loading-display').append('<span id="cta-waiting-msg" role="alert" aria-live="assertive">' + i18next.t('refresh.tomany') + ' ' + waitTime + ' ' + i18next.t('refresh.s') + '</span>');

                                                        setTimeout(function() {countdown(--waitTime);}, 1000);
                                                    }
                                                }
                                                countdown(wait);
                                            }
                                        }
                                    }
                                }
                                firstRun = false;
                            }
                        }, 400);
                    }
                } else {waitCount++; if (waitCount <= 200) setTimeout(function(){searchThisArea(waitCount);}, 50);}
            }
            window.history.pushState = new Proxy(window.history.pushState, {
                apply: (target, thisArg, argArray) => {
                    searchThisArea(0);
                    return target.apply(thisArg, argArray);
                }
            });
    });
    };
// Add D/T info on a cache page

/*
Fork of Geocaching - Add D/T info on a cache page.
By Francois Crevola

Copyright (c) 2014-2018, Francois Crevola
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/


function tvinfostart() {
  // Respekter innstillingen "uc3" hvis den finnes (ellers: på)
  let enabled = true;
  try { enabled = !!GM_config.get("uc3"); } catch (e) {}
  if (!enabled) return;

  function isReady() {
    if (_ctPage === "gc_gctour")   return !!document.querySelector("#gmCacheInfo .geotour-cache-info");
    if (_ctPage === "gc_map")      return !!document.querySelector("#gmCacheInfo .code");
    if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live")
                                   return !!document.querySelector(".cache-preview-attributes");
    if (_ctPage === "gc_geocache") return !!document.querySelector("#ctl00_ContentBody_diffTerr");
    return true;
  }

  (function wait() {
    if (isReady()) { tvinfo(); return; }
    setTimeout(wait, 250);
  })();
}

function tvinfo(){

      if (_ctPage === "gc_geocache") {

           var resultDifficultyTerrainCaches = "";

GM_xmlhttpRequest({
    method: "GET",
    url: "http://www.geocaching.com/my/statistics.aspx",
    onload: function(response) {
	obj = $.parseHTML(response.responseText);
        resultDifficultyTerrainCaches = $(obj).find("#DifficultyTerrainCaches");

        D = $("#ctl00_ContentBody_uxLegendScale").html();
        D = D.substring(D.indexOf("stars/stars")+11,D.indexOf(".gif"));
        D = D.replace("_",".");

        T = $("#ctl00_ContentBody_Localize12").html();
        T = T.substring(T.indexOf("stars/stars")+11,T.indexOf(".gif"));
        T = T.replace("_",".");

        var nbDT = "0";
        if (resultDifficultyTerrainCaches!=="") {
            nbDT = resultDifficultyTerrainCaches.find("#"+(((D-1)*2)+1)+"_"+(((T-1)*2)+1)).text();
        }

        if (nbDT != "0") {
            $("#ctl00_ContentBody_diffTerr").before("<div> " + i18next.t('dt.you') + "   "+nbDT+" " + i18next.t('dt.caches') + "</div><br>");
        } else {
            $("#ctl00_ContentBody_diffTerr").before('<div><strong>' + i18next.t('dt.new') + '</strong></p></div><br>');
            $("#ctl00_ContentBody_uxLegendScale").attr("style","background-color: lightgreen");
            $("#ctl00_ContentBody_Localize12").attr("style","background-color: lightgreen");
        }
    }
});
    } else if (_ctPage === "gc_map_new" || _ctPage === "gc_map_live") {
if ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]) {
    const delay = (n) => new Promise( r => setTimeout(r, n*2000));
}
waitForKeyElements (".cache-preview-attributes", function() {
var resultDifficultyTerrainCaches = "";
GM_xmlhttpRequest({
    method: "GET",
    url: "http://www.geocaching.com/my/statistics.aspx",
    onload: function(response) {
	obj = $.parseHTML(response.responseText);
        resultDifficultyTerrainCaches = $(obj).find("#DifficultyTerrainCaches");
       var D = document.querySelectorAll(".attribute-val")[0].innerHTML;
         D = D.replace(",",".");

             var T = document.querySelectorAll(".attribute-val")[1].innerHTML;
          T = T.replace(",",".");


        var nbDT = "0";
        if (resultDifficultyTerrainCaches!=="") {

            nbDT = resultDifficultyTerrainCaches.find("#"+(((D-1)*2)+1)+"_"+(((T-1)*2)+1)).text();

        }

        if (nbDT != "0") {
            if ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]) {
            $("div.cache-preview-action-menu").append("<div> " + i18next.t('dt.you') + "   "+nbDT+" " + i18next.t('dt.caches') + "</div><br>");
            }
            $("div.header-top").append("<div> " + i18next.t('dt.you') + "   "+nbDT+" " + i18next.t('dt.caches') + "</div><br>");
        } else {
            if ($('#GClh_II_running')[0] && $('gclh_nav#ctl00_gcNavigation')[0]) {
            $("div.cache-preview-action-menu").append("<div>" + i18next.t('dt.new') + "</div>");
            }
            $("div.header-top").append("<div>" + i18next.t('dt.new') + "</div>");
        }
    }
          });

})
    } else if (_ctPage === "gc_map") {
        waitForKeyElements (".code", function() {

var resultDifficultyTerrainCaches = "";
GM_xmlhttpRequest({
    method: "GET",
    url: "http://www.geocaching.com/my/statistics.aspx",
    onload: function(response) {
	obj = $.parseHTML(response.responseText);
        resultDifficultyTerrainCaches = $(obj).find("#DifficultyTerrainCaches");

        D = document.querySelectorAll("DD")[1].innerHTML

        D = D.substring(D.indexOf("stars/stars")+11,D.indexOf(".gif"));

        D = D.replace("_",".");

        T = document.querySelectorAll("DD")[4].innerHTML

        T = T.substring(T.indexOf("stars/stars")+11,T.indexOf(".gif"));

        T = T.replace("_",".");

        var nbDT = "0";
        if (resultDifficultyTerrainCaches!=="") {

            nbDT = resultDifficultyTerrainCaches.find("#"+(((D-1)*2)+1)+"_"+(((T-1)*2)+1)).text();

        }

        if (nbDT != "0") {
            $("#gmCacheInfo").append("<div>" + i18next.t('dt.you') + " "+nbDT+" " + i18next.t('dt.caches') + "</div>");
        } else {
            $("#gmCacheInfo").append("<div>" + i18next.t('dt.new') + "</div>");

         }
    }
            });

});
        } else if (_ctPage === "gc_gctour") {
  // Vent til geotour-popupen er bygd
  waitForKeyElements("#gmCacheInfo .geotour-cache-info", function () {
    GM_xmlhttpRequest({
      method: "GET",
      url: "https://www.geocaching.com/my/statistics.aspx",
      onload: function (response) {
        const obj = $.parseHTML(response.responseText);
        const resultDifficultyTerrainCaches = $(obj).find("#DifficultyTerrainCaches");

        const box = document.querySelector("#gmCacheInfo .geotour-cache-info") || document;
        // Finn dt/dd for Difficulty/Terrain
        const dDt = Array.from(box.querySelectorAll("dt")).find(dt => dt.textContent.trim().toLowerCase().startsWith("difficulty"));
        const tDt = Array.from(box.querySelectorAll("dt")).find(dt => dt.textContent.trim().toLowerCase().startsWith("terrain"));
        const dImg = dDt && dDt.nextElementSibling ? dDt.nextElementSibling.querySelector("img") : null;
        const tImg = tDt && tDt.nextElementSibling ? tDt.nextElementSibling.querySelector("img") : null;

        // Parse D/T fra title (fallback: fra src: ".../1.5stars.png")
        function parseStars(img) {
          if (!img) return NaN;
          const title = img.getAttribute("title") || "";
          let m = title.match(/^([0-9](?:\.[05])?)/);
          if (m) return parseFloat(m[1]);
          const src = img.getAttribute("src") || "";
          m = src.match(/\/([0-9](?:\.5)?)stars\.(?:png|gif)$/i);
          return m ? parseFloat(m[1]) : NaN;
        }

        const D = parseStars(dImg);
        const T = parseStars(tImg);

        let nbDT = "0";
        if (!isNaN(D) && !isNaN(T) && resultDifficultyTerrainCaches.length) {
          const cellId = ((D - 1) * 2 + 1) + "_" + ((T - 1) * 2 + 1);
          nbDT = resultDifficultyTerrainCaches.find("#" + cellId).text() || "0";
        }

        // Rydd evt. forrige og vis tekst
        $("#gmCacheInfo .ct-dtinfo").remove();
        if (nbDT !== "0") {
          $("#gmCacheInfo").append('<div class="ct-dtinfo">' + i18next.t('dt.you') + ' ' + nbDT + ' ' + i18next.t('dt.caches') + '</div>');
        } else {
          $("#gmCacheInfo").append('<div class="ct-dtinfo">' + i18next.t('dt.new') + '</div>');
        }
      }
    });
  });


    } else {
    }
    }



    }


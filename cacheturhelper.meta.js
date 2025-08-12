// ==UserScript==
// @name            The Cachetur Assistant
// @name:no         Cacheturassistenten
// @author          cachetur.no, thomfre
// @namespace       http://cachetur.no/
// @version         3.5.2.1
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
/* globals jQuery, $, waitForKeyElements, L, i18next, i18nextXHRBackend, i18nextBrowserLanguageDetector, cloneInto, gm_config */




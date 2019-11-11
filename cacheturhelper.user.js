// ==UserScript==
// @name            The Cachetur Assistant
// @name:no         Cacheturassistenten
// @author          cachetur.no, thomfre
// @namespace       http://cachetur.no/
// @version         3.3.0.1
// @description     Companion script for cachetur.no
// @description:no  Hjelper deg å legge til cacher i cachetur.no
// @icon            https://cachetur.net/img/logo_top.png
// @include         https://www.geocaching.com/map/*
// @include         http://www.geocaching.com/map/*
// @include         https://www.geocaching.com/play/map*
// @include         http://www.geocaching.com/play/map*
// @include         https://www.geocaching.com/geocache/*
// @include         http://www.geocaching.com/geocache/*
// @include         https://www.geocaching.com/seek/cache_details.aspx*
// @include         https://www.geocaching.com/plan/lists/BM*
// @include         http://www.geocaching.com/play/geotours/*
// @include         https://www.geocaching.com/play/geotours/*
// @include         http://project-gc.com/*
// @include         https://project-gc.com/*
// @connect         cachetur.no
// @connect         cachetur.net
// @connect         self
// @grant           GM_xmlhttpRequest
// @grant           GM_info
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_openInTab
// @grant           GM_addStyle
// @grant           unsafeWindow
// @run-at          document-end
// @copyright       2017+, cachetur.no
// @require         https://code.jquery.com/jquery-latest.js
// @require         https://unpkg.com/i18next@15.1.3/i18next.min.js
// @require         https://unpkg.com/i18next-xhr-backend/i18nextXHRBackend.js
// @require         https://unpkg.com/i18next-browser-languagedetector/i18nextBrowserLanguageDetector.js
// @require         https://gist.github.com/raw/2625891/waitForKeyElements.js
// @downloadURL     https://cachetur.no/monkey/cacheturhelper.user.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

let _ctLastCount = 0;
let _ctCacheturUser = "";
let _ctLanguage = "en";
let _ctCodesAdded = [];
let _ctPage = "unknown";
let _routeLayer = [];
let _waypointLayer = [];
let _cacheLayer = [];
let _initialized = false;
let _ctNewMapActiveCache = "";

console.log("Starting Cacheturassistenten V. " + GM_info.script.version);

let pathname = window.location.pathname;
let domain = document.domain;

if(domain === "www.geocaching.com" || domain === "www.geocaching.com") {
    if (pathname.indexOf("/seek/") > -1) _ctPage = "gc_geocache";
    else if (pathname.indexOf("/plan/lists") > -1) _ctPage = "gc_bmlist";
    else if (pathname.indexOf("/geocache/") > -1) _ctPage = "gc_geocache";
    else if (pathname.indexOf("/map/") > -1) _ctPage = "gc_map";
    else if (pathname.indexOf("/play/map") > -1) _ctPage = "gc_map_new";
    else if (pathname.indexOf("/geotours/") > -1) _ctPage = "gc_geotour";
}
else if (domain === "project-gc.com" && pathname.indexOf("/User/VirtualGPS") > -1 && window.location.search.indexOf("?map=") === -1) _ctPage = "pgc_vgps";
else if (domain === "project-gc.com") {
    _ctPage = "pgc_map";
}

console.log("Running in " + _ctPage + " mode");

if(_ctPage === "gc_map_new") {
    console.log("Doing dirty trick to take over Geocaching.com's leaflet object");
    let originalLMap = L.Map;

    L.Map = function(div, settings) {
        unsafeWindow.cacheturGCMap = new originalLMap(div, settings);
        L.Map = originalLMap;
        ctFixNewGcMapIssues();
        return unsafeWindow.cacheturGCMap;
    };
}

$(document).ready(function() {
    loadTranslations();
});

function loadTranslations() {
    i18next
        .use(i18nextXHRBackend)
        .use(i18nextBrowserLanguageDetector)
        .init({
          fallbackLng: 'en-US',
          ns: ['cachetur'],
          defaultNS: 'cachetur',
          backend: {
              loadPath: 'https://cachetur.no/monkey/language/{{ns}}.{{lng}}.json',
              crossDomain: true
            }
        }, (err, t) => {
            if(err) {
                if(err.indexOf("failed parsing" > -1)) {
                    i18next.changeLanguage('en-US');

                    return loadTranslations();
                }
                return console.log("Error occurred when loading language data", err);
            }

            console.log("Translation fetched successfully");
            ctStart();
        });
}

function ctStart() {
    let lastUse = GM_getValue("cachetur_last_action", 0);
    let timeSinceLastUse = (Date.now() - lastUse) / 1000;
    console.log("The Cachetur Assistant was last used " + timeSinceLastUse + " seconds ago");

    if(timeSinceLastUse > 3600) {
        if(_ctPage === "gc_map_new") {
            waitForKeyElements(".profile-panel.user-nav", function() {
                ctInitInactive();
            });
        } else {
            ctInitInactive();
        }
    } else {
        ctPreInit();
    }
}

function ctPreInit() {
    console.log("Continuing init of Cacheturassistenten");
    if (_ctPage !== "pgc_map" && _ctPage !== "pgc_vgps" && _ctPage !== "gc_geotour" && _ctPage !== "gc_map_new" && _ctPage !== "gc_bmlist" && $(".logged-in-user").length < 1) {
        $(document).bind("DOMSubtreeModified.cachetur-init", function () {
            if ($(".profile-panel.detailed").length > 0) {
                $(document).unbind("DOMSubtreeModified.cachetur-init");
                ctCheckLogin();
            }
        });
    } else if(_ctPage === "gc_map_new") {
        ctCheckLogin();
    } else if(_ctPage === "gc_geotour" && $(".profile-panel.detailed").length < 1) {
        $(document).bind("DOMSubtreeModified.cachetur-init", function () {
            if ($(".logged-in-user").length > 0) {
                $(document).unbind("DOMSubtreeModified.cachetur-init");
                ctCheckLogin();
            }
        });
    }
    else {
        ctCheckLogin();
    }
}

function ctCheckLogin() {
    console.log("Checking login");

    _ctCacheturUser = ctApiCall("user_get_current", "", function(data) {
        _ctCacheturUser = data.username;
        _ctLanguage = data.language;
        i18next.changeLanguage(_ctLanguage);

        if (_ctCacheturUser === undefined || _ctCacheturUser === '') {
            console.log("Not logged in");
            ctInitNotLoggedIn();
        }
        else {
            console.log("Login OK");
            ctInit();
        }
    });
}


function ctInvalidateLogin() {
    _ctCacheturUser = '';
    $("#cachetur-header").remove();
}

function ctApiCall(call, params, callback) {
    let appId = "Cacheturassistenten " + GM_info.script.version  + " - " + _ctPage;

    GM_xmlhttpRequest({
        method: "POST",
        url: "https://cachetur.no/api/" + call,
        data: "appid=" + encodeURIComponent(appId) + "&json=" + encodeURIComponent(JSON.stringify(params)),
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
                }
                else {
                    callback("");
                }
            }
            catch (e) {
                console.warn("Failed to verify response from cachetur.no: " + e);
                callback("");
            }
        },
        onerror: function() { callback(""); },
        ontimeout: function() { callback(""); }
    });
}

function ctInit() {
    if(_initialized) return;
    console.log("Initializing Cacheturassistenten");
    ctCreateTripList();
    ctInitAddLinks();
    ctInitPGCLiveMapListener();
    _initialized = true;
}

function ctInitNotLoggedIn() {
    if(_initialized) return;

    if(_ctPage === "gc_geocache" || _ctPage === "gc_bmlist") GM_addStyle("nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } ");
    else if(_ctPage === "gc_map") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px; }");
    else if(_ctPage === "gc_geotour") GM_addStyle("#cachetur-header { padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; }");
    else if(_ctPage === "pgc_map" || _ctPage === "pgc_vgps") GM_addStyle("#cachetur-header { margin-top: 7px; }");

    ctPrependToHeader('<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> '+i18next.t('menu.notloggedin')+'<br>'+i18next.t('menu.deactivated')+'</span></li>');

    _initialized = true;
}

function ctInitInactive() {
    if(_initialized) return;

    console.log("Assistant not being actively used, disabling");

    if(_ctPage === "gc_geocache" || _ctPage === "gc_bmlist") GM_addStyle("nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } ");
    else if(_ctPage === "gc_map") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; }");
    else if(_ctPage === "gc_geotour") GM_addStyle("#cachetur-header { padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; }");
    else if(_ctPage === "pgc_map" || _ctPage === "pgc_vgps") GM_addStyle("#cachetur-header { margin-top: 12px; }");

    ctPrependToHeader('<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> <a href id="cachetur-activate">'+i18next.t('activate.button')+'</a></li>');

    $("#cachetur-activate").click(function(e) {
        GM_setValue("cachetur_last_action", Date.now());
    });

    _initialized = true;
}

function ctPGCMapInit() {
    console.log("Continuing initialization - PGC Live Map mode");
    $("#map").bind("DOMSubtreeModified", ctPgcMapBindToChanges);

    let storedTrip = GM_getValue("cachetur_selected_trip", 0);
    ctGetAddedCodes(storedTrip);
    ctGetTripRoute(storedTrip);
}

function ctPrependToHeader(data) {
    console.log("Injecting cachetur.no in menu");

    let header;
    if(_ctPage === "gc_map") header = $('#uxLoginStatus_divSignedIn');
    else if(_ctPage === "gc_map_new") header = $('.profile-panel.user-nav ul');
    else if(_ctPage === "gc_bmlist") header = $('.profile-widget');
    else if(_ctPage === "gc_geocache") header = $('#ctl00_uxLoginStatus_divSignedIn');
    else if(_ctPage === "gc_geotour") header = $('ul.detailed');
    else if(_ctPage === "pgc_map" || _ctPage === "pgc_vgps") header = $('#pgcMainMenu ul.navbar-right');

    if(header) {
        header.prepend(data);
    }
}

function ctCreateTripList() {
    if (_ctCacheturUser === "") return;

    ctApiCall("planlagt_list_editable", {includetemplates: "true"},
        function (available) {
            let options = "";

            if (available.length > 0) {
                available.forEach(function (item) {
                    options = options + '<option value="' + item.id + '">' + item.turnavn + '</option>';
                });
            }

            if(_ctPage === "gc_geocache") GM_addStyle("nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-tur-fitbounds { display: none; } #cachetur-tur-add-ct-caches { display: none; } .cachetur-menu-button { background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { padding-left: 4px; } .cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }");
            else if(_ctPage === "gc_bmlist") GM_addStyle(".gc-nav-menu .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-tur-fitbounds { display: none; } #cachetur-tur-add-ct-caches { display: none; } .cachetur-menu-button { background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { padding-left: 4px; } .cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }");
            else if(_ctPage === "gc_map") GM_addStyle("#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .cachetur-menu-button { background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px; }");
            else if(_ctPage === "gc_geotour") GM_addStyle("#cachetur-header { padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; font: 13.3333px Arial; padding:1px; } .cachetur-menu-button { background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px; }");
            else if(_ctPage === "pgc_map" || _ctPage === "pgc_vgps") GM_addStyle("#cachetur-header { margin-top: 7px; } #cachetur-tur-valg { width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; }");

            GM_addStyle(".cachetur-menu-button { cursor: pointer; } .cachetur-marker-added { opacity: 0.75; border: 1px solid green; border-radius: 4px; }");
            GM_addStyle(".cachetur-map_marker { width: 18px; height: 18px; font-size: 10px; text-align: center; } " +
                ".cachetur-map_marker_symbol { border: 1px solid gray; -moz-border-radius: 3px; border-radius: 3px; background: #F8F8FF no-repeat center; width: 18px; height: 18px; padding-top: 1px; padding-bottom: 1px; padding-right: 1px; }" +
                ".cachetur-map_marker_disabled { border: 1px solid #ffffff; background-color: #ff0000; } " +
                ".cachetur-map_marker_corrected { border: 1px solid #ffffff; background-color: greenyellow; } " +
                ".cachetur-map_marker_dnf { border: 1px solid #ffffff; background-color: dodgerblue; } ");

            ctPrependToHeader('<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" title="'+i18next.t('menu.loggedinas')+' ' + _ctCacheturUser + '" /> '+i18next.t('menu.addto')+' </span><select id="cachetur-tur-valg">' + options + '</select><button id="cachetur-tur-open" class="cachetur-menu-button" type="button" title="'+i18next.t('menu.opentrip')+'"><img src="https://cachetur.no/api/img/arrow.png" style="height:16px;"/></button><button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" title="'+i18next.t('menu.refresh')+'"><img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/></button><button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" title="'+i18next.t('menu.showonmap')+'"><img src="https://cachetur.no/api/img/map.png" style="height:16px;"/></button><button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" title="'+i18next.t('menu.fitroute')+'"><img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/></button> <span id="cachetur-tur-antall-container">(<span id="cachetur-tur-antall"></span>)</span></li>');

            let tripSelector = $("#cachetur-tur-valg");
            let storedTrip = GM_getValue("cachetur_selected_trip", 0);

            let storedIsInList = false;
            let selectorOptions = tripSelector.children('option');
            selectorOptions.each(function(){
                if ($(this).val() === storedTrip) {
                    storedIsInList = true;
                    tripSelector.val($(this).val());
                    return false;
                }
            });

            if(!storedIsInList) {
                if(selectorOptions.length > 0) {
                    storedTrip = selectorOptions.first().val();
                } else {
                    storedTrip = 0;
                }

                GM_setValue("cachetur_selected_trip", storedTrip);
            }

            ctGetAddedCodes(storedTrip);
            ctGetTripRoute(storedTrip);

            tripSelector.change(function () {
                let id = $("#cachetur-tur-valg").val();
                ctGetAddedCodes(id);
                ctGetTripRoute(id);
                GM_setValue("cachetur_selected_trip", id);
                GM_setValue("cachetur_last_action", Date.now());
            });

            $("#cachetur-tur-open").click(function() {
                let selected = $("#cachetur-tur-valg").val();
                let url = 'https://cachetur.no/';
                if (selected.endsWith('L')) url = url + 'liste/' + selected.substring(0, selected.length-1);
                else if (selected.endsWith('T')) url = url + 'template/' + selected.substring(0, selected.length-1);
                else url = url + 'fellestur/' + selected;

                GM_openInTab(url);
            });

            $("#cachetur-tur-refresh").click(function() {
                console.log("Refreshing list of trips and data for selected trip");
                let id = $("#cachetur-tur-valg").val();
                $("#cachetur-tur-antall").text("Loading");

                ctApiCall("planlagt_list_editable", {includetemplates: "true"}, function (available) {
                    let options = "";

                    if (available.length > 0) {
                        available.forEach(function (item) {
                            options = options + '<option value="' + item.id + '">' + item.turnavn + '</option>';
                        });
                    }

                    $("#cachetur-tur-valg").empty().append(options).val(id);

                    ctGetAddedCodes(id);
                    ctGetTripRoute(id);
                    GM_setValue("cachetur_last_action", Date.now());
                    console.log("Finished refreshing list of trips and data for selected trip");
                });
            });

            $("#cachetur-tur-add-ct-caches").click(function() {
                console.log("Adding caches from cachetur.no");
                let id = $("#cachetur-tur-valg").val();
                ctAddCacheMarkersToMap(id);
            });

            $("#cachetur-tur-fitbounds").click(function() {
                let unsafeLeafletObject = ctGetUnsafeLeafletObject();
                if(unsafeLeafletObject !== null && unsafeWindow.cacheturRouteLayer) unsafeLeafletObject.fitBounds(unsafeWindow.cacheturRouteLayer.getBounds());
                if(_ctPage === "gc_map_new") {
                    $("#clear-map-control").trigger("click");
                }
            });
        }
    );
}

function ctGetAddedCodes(id) {
    ctApiCall("planlagt_get_codes", {
            "tur": id,
            "useid": false
        },
        function (codes) {
            if (codes.length <= 0) return;

            _ctCodesAdded = [];

            codes.forEach(function (item) {
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
    if(!id || id.endsWith('L'))  {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        return;
    }

    let unsafeLeafletObject = ctGetUnsafeLeafletObject();
    if(unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        $("#cachetur-tur-add-ct-caches").prop('disabled', true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    if(unsafeWindow.cacheturCacheLayer) {
        unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
    }

    console.log("Attempting to fetch route for selected trip");

    ctApiCall("planlagt_get_route", {
            "tur": id
        },
        function(data) {
            if(unsafeWindow.cacheturRouteLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturRouteLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any route for given trip/list");
                $("#cachetur-tur-fitbounds").prop('disabled', true);
                return;
            }

            console.log("Route data received, constructing route");

            _routeLayer = L.polyline(data, {color: 'purple'});
            _routeLayer.getAttribution = function() { return 'Directions powered by <a href="https://www.graphhopper.com/" target="_blank">GraphHopper API</a>, delivered by <a href="https://cachetur.no">cachetur.no</a>'; };
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
            if(unsafeWindow.cacheturWaypointsLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturWaypointsLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any waypoints for given trip/list");
                return;
            }

            let markers = [];
            data.forEach(function (item) {
                markers.push(L.marker([item.lat, item.lon], {
                    icon: L.divIcon({ className:'cachetur-map_marker', iconSize: [18, 18], riseOnHover: true, html:'<div class="cachetur-map_marker_symbol " title="' + item.name + '"><img src="' + item.typeicon + '" /></div><span class="label label-default"></span>'})
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
    if(unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop('disabled', true);
        $("#cachetur-tur-add-ct-caches").prop('disabled', true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    ctApiCall("planlagt_get_cachecoordinates", {
            "tur": id
        },
        function(data) {
            if(unsafeWindow.cacheturCacheLayer) {
                unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
            }

            if (data.length <= 0) {
                console.log("Couldn't find any cache data for given trip/list");
                $("#cachetur-tur-fitbounds").prop('disabled', true);
                return;
            }

            console.log("Cache data received, constructing markers");

            let markers = [];
            data.forEach(function (item) {
                markers.push(L.marker([item.lat, item.lon], {
                    icon: L.divIcon({ className:'cachetur-map_marker', iconSize: [18, 18], riseOnHover: true, html:'<div class="cachetur-map_marker_symbol " title="' + item.name + '"><img src="' + item.typeicon + '" /></div><span class="label label-default"></span>'})
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
                let listElement = '<li class="'+(alternate ? 'AlternatingRow' : '')+'"><a href="https://cachetur.no/'+(list.source === 'triptemplate' ? 'tur' : (list.source === 'trip' ? 'fellestur' : 'liste'))+'/'+list.id+'">'+list.name+'</a><br>'+i18next.t('template.by')+' '+list.owner+'</li>';
                alternate = !alternate;
                listHtml = listHtml + listElement;
            });
            listHtml = listHtml + '</ul></div></div>';

            $('.sidebar').append(listHtml);
        });
}

function ctGetUnsafeLeafletObject() {
    if(_ctPage === "gc_map" && unsafeWindow.MapSettings) {
        return unsafeWindow.MapSettings.Map;
    } else if(_ctPage === "gc_map_new" && unsafeWindow.cacheturGCMap) {
        return unsafeWindow.cacheturGCMap;
    } else if(_ctPage === "gc_geotour" && unsafeWindow.map) {
        return unsafeWindow.map;
    } else if(_ctPage === "pgc_map" && unsafeWindow.PGC_LiveMap) {
        return unsafeWindow.PGC_LiveMap.map;
    } else if(_ctPage === "pgc_map" && unsafeWindow.freeDraw && unsafeWindow.freeDraw.map) {
        return unsafeWindow.freeDraw.map;
    } else {
        return null;
    }
}

function ctInitAddLinks() {
    if (_ctCacheturUser === "") return;

    switch (_ctPage) {
        case "gc_geocache":
            ctAddToCoordInfoLink($("#ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode"));
            break;
        case "gc_bmlist":
            ctAddSendListButton();
            break;
        case "gc_map":
            $("#form1").bind("DOMSubtreeModified", ctMapBindToDOMChanges);
            break;
        case "gc_map_new":
            ctWatchNewMap();
            waitForKeyElements("#browse-map-cta", function() {
                $(".app-main").append('<small style="color: red; position: absolute; top: 52px; right: 15px;">' + i18next.t('alerts.browsemap') + '</small>');
            });
            break;
        case "gc_geotour":
            $("#map_container").bind("DOMSubtreeModified", ctMapBindToDOMChanges);
            break;
        case "pgc_map":
            waitForKeyElements("#map", function() {
                ctPGCMapInit();
            });
            break;
        case "pgc_vgps":
            ctAddSendPgcVgpsButton();
            break;
    }
}

function ctWatchNewMap() {
    let targetNode = document.body;
    let config = { attributes: true, childList: true, subtree: true };

    let callback = function(mutationsList, observer) {
        if(!$("#sidebar").hasClass("has-active-cache")) {
            _ctNewMapActiveCache = "";
            return;
        }

        let cacheCode = $(".cache-metadata-code").html();

        if(cacheCode === _ctNewMapActiveCache) {
            return;
        }

        _ctNewMapActiveCache = cacheCode;

        let cacheId = parseInt(document.getElementsByClassName("more-info-link")[0].getAttribute("data-id"));

        let content = '<a class="cachetur-add-code" style="cursor: pointer;" data-code="' + cacheCode + '"><img src="https://cachetur.no/api/img/cachetur-15.png" /> '+i18next.t('send')+'</a>';
        //ctUpdateAddImage();
    };

    let observer = new MutationObserver(callback);
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

        }, function (data) {
            if (data === "Ok") {
                _ctCodesAdded.push(code);
                ctUpdateAddImage(true);
                $('#cachetur-tur-antall').html(_ctCodesAdded.length);
            }
            else {
                if(_ctPage === "gc_geocache") {
                    img.addClass("cachetur-add-code-error");
                } else if(_ctPage === "gc_map") {
                    img.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t('send'));
                } else {
                    img.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
                }
            }
        });

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctInitPGCLiveMapListener() {
    if(_ctPage !== "pgc_map" || window.location.pathname.indexOf("/Tools/LiveMap") === -1) return;

    ctPGCMapInit();

    console.log("Initializing PGC Live Map layeradd-listener");

    let map = ctGetUnsafeLeafletObject();
    if(map === null) return;

    map.on("layeradd", function(layer) {
        setTimeout(ctPGCCheckAndMarkLayer.bind(null,layer), 50);
    });
}

function ctPgcMapBindToChanges() {
    if ($("#map").length) {
        let popup = $(".leaflet-popup-content").children().last();

        if (popup.length !== _ctLastCount) {
            _ctLastCount = popup.length;

            ctAddToVGPSLink(popup);
        }
    }
}

function ctMapBindToDOMChanges() {
    let codes = $(".code");

    if (codes.length !== _ctLastCount) {
        _ctLastCount = codes.length;

        codes.each(function() {
            ctAddToCoordInfoLink($(this));
        });
    }
}

function ctAddToCoordInfoLink(code) {
    if (!code.hasClass("cachetur-add")) {
        let gcCode = code.html();

        let img = '<img src="https://cachetur.no/api/img/cachetur-15.png" title="'+i18next.t('send')+'" class="cachetur-add-code" style="cursor: pointer;" data-code="' + gcCode + '" /> ';

        if (_ctPage === "gc_geocache") {
            code = $("#ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode");
            ctGetPublicLists(gcCode);
            $(".CacheDetailNavigation").append('<ul id="cachetur-controls-container"><li><a href class="cachetur-add-code" style="cursor: pointer;" data-code="' + gcCode + '">'+i18next.t('send')+'</a></li></ul>');
        } else if (_ctPage === "gc_map") {
            let img = '<a href class="cachetur-add-code" style="cursor: pointer;" data-code="' + gcCode + '"><img src="https://cachetur.no/api/img/cachetur-15.png" /> '+i18next.t('send')+'</a>';
            code.parent().append('<div class="links Clear cachetur-controls-container">'+img+'</div>');
        } else {
            code.prepend(img);
        }

        code.addClass("cachetur-add");

        ctUpdateAddImage();
    }

    $(".cachetur-add-code").click(function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code

        }, function (data) {
            if (data === "Ok") {
                _ctCodesAdded.push(code);
                ctUpdateAddImage(true);
                $('#cachetur-tur-antall').html(_ctCodesAdded.length);
            }
            else {
                if(_ctPage === "gc_geocache") {
                    img.addClass("cachetur-add-code-error");
                } else if(_ctPage === "gc_map") {
                    img.html('<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' + i18next.t('send'));
                } else {
                    img.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
                }
            }
        });

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctAddToVGPSLink(vgps) {
    if (!vgps.hasClass("cachetur-add")) {
        let cacheLink = vgps.parent().find("a")[0];
        if(!cacheLink) return;
        let gcCode = vgps.parent().find("a")[0].href.split(".info/")[1];

        vgps.parent().prepend('<img src="https://cachetur.no/api/img/cachetur-15.png" title="'+i18next.t('send')+'" class="cachetur-add-code" style="cursor: pointer; left:20px;" data-code="' + gcCode + '" /> ');
        if(window.location.pathname.indexOf("/Tools/LiveMap") === -1) {
            vgps.parent().find("a")[1].remove();
        }
        vgps.addClass("cachetur-add");

        ctUpdateAddImage();
    }

    $(".cachetur-add-code").click(function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code

        }, function (data) {
            if (data === "Ok") {
                _ctCodesAdded.push(code);
                ctUpdateAddImage(true);
                $('#cachetur-tur-antall').html(_ctCodesAdded.length);
            }
            else {
                img.attr("src", "https://cachetur.no/api/img/cachetur-15-error.png");
            }
        });

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctAddSendPgcVgpsButton() {
    let container = $("#vgps_newList").parent();
    container.append('<button  type="button" class="btn btn-default btn-xs cachetur-send-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="'+i18next.t('send')+'" style="cursor: pointer;" /> ' +i18next.t('vgps.sendmarked')+'</button> ');
    container.append('<button  type="button" class="btn btn-default btn-xs cachetur-select-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="'+i18next.t('vgps.markfromtrip')+'" style="cursor: pointer;" /> ' +i18next.t('vgps.markfromtrip')+'</button> ');

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
    selected.forEach(function (item) {
        codes.push(item.text);
    });

    ctApiCall("planlagt_add_codes", {
        tur: tur,
        code: codes
    }, function (data) {
        if (data === "Ok") {
            ctGetAddedCodes(tur);
            ctGetTripRoute(tur);
            alert(i18next.t('vgps.sent'));
        }
        else {
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

    inCachetur.forEach(function (item) {
        $('#jqg_vgpsTable_' + item.id).prop('checked', true).trigger('click');
    });
}

function ctPGCMarkFound() {
    if(_ctPage !== "pgc_map") return;

    let map = ctGetUnsafeLeafletObject();
    if(map === null) return;

    map.eachLayer(function(layer){
        ctPGCCheckAndMarkLayer(layer);
    });
}

function ctPGCCheckAndMarkLayer(layer) {
    let realLayer = layer.layer ? layer.layer : layer;

    if (realLayer instanceof L.Marker && realLayer.label){
        let cacheCode = realLayer.label._content.split(" - ")[0];
        if(ctCodeAlreadyAdded(cacheCode)) {
            realLayer._icon.classList.add("cachetur-marker-added");
        } else {
            realLayer._icon.classList.remove("cachetur-marker-added");
        }
    }
}

function ctPGCCheckVgps() {
    if(_ctPage !== "pgc_vgps") return;

    $(".cachetur-pgc-added").remove();

    $("#vgpsTable").find(".jqgrow.ui-row-ltr.ui-widget-content").each(function() {
        let code = $(this).find("[aria-describedby*='vgpsTable_gccode']").find("a").html();
        if(ctCodeAlreadyAdded(code)) {
            $(this).find("[aria-describedby*='vgpsTable_name']").prepend('<img class="cachetur-pgc-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="'+i18next.t('sent')+'"> ');
        }
    });
}

function ctAddSendListButton() {
    waitForKeyElements(".multi-select-action-bar", function() {
        console.log("Injecting send to cachetur button");
        $(".multi-select-action-bar-count-section").after('<button type="button" class="cachetur-send-bmlist gc-button multi-select-action-bar-button gc-button-has-type gc-button-primary" style="margin-left: 5px;"><img src="https://cachetur.no/api/img/cachetur-15.png" title="'+i18next.t('send')+'" style="cursor: pointer;" /> ' +i18next.t('vgps.sendmarked')+'</button> ');

        $(".cachetur-send-bmlist").click(function(evt) {
            evt.stopImmediatePropagation();
            evt.preventDefault();

            ctListSendSelected();
        });
    });
}

function ctListSendSelected() {
    let selected = $(".gc-checkbox.checked").closest("tr").find(".geocache-code");

    if (selected.length > 0) {
        let tur = $("#cachetur-tur-valg").val();
        let codes = [];

        selected.each(function (index) {
            codes.push($(this).text().split('|')[1].trim());
        });

        ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: codes
        }, function (data) {
            if (data === "Ok") {
                ctGetAddedCodes(tur);
                ctGetTripRoute(tur);
                alert(i18next.t('vgps.sent'));
            }
            else {
                alert(i18next.t('vgps.error'));
            }
        });

        GM_setValue("cachetur_last_action", Date.now());
    }
}

function ctCheckList() {
    if(_ctPage !== "gc_bmlist") return;

    waitForKeyElements(".geocache-table", function() {
        $(".cachetur-bmlist-added").remove();

        $("table.geocache-table").find("tr").each(function() {
            let codeInfo = $(this).find(".geocache-code").text().split('|');
            if(codeInfo.length > 1) {
                let code = codeInfo[1].trim();
                if(ctCodeAlreadyAdded(code)) {
                    $(this).find(".geocache-code").prepend('<img class="cachetur-bmlist-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="'+i18next.t('sent')+'"> ');
                }
            }
        });
    });
}

function ctUpdateAddImage(codeAddedTo) {
    ctPGCMarkFound();

    let imgs = $(".cachetur-add-code");
    if (imgs.length <= 0) return;

    imgs.each(function() {
        let img = $(this);
        let code = img.data("code");

        let codeIsAdded = codeAddedTo === code || ctCodeAlreadyAdded(code);

        ctSetIconForCode(code);

        if (codeIsAdded) {
            if(_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-error");
                img.addClass("cachetur-add-code-success");
                img.html(i18next.t('sent'));
            } else if(_ctPage === "gc_map") {
                img.html('<img src="https://cachetur.no/api/img/cachetur-15-success.png" /> ' + i18next.t('sent'));
            } else {
                img.attr("src", "https://cachetur.no/api/img/cachetur-15-success.png");
                img.attr("title", i18next.t('sent'));
            }
            if(img.parent().parent().find(".cachetur-add-comment").length > 0) return;

            let style = "padding-right: 5px;";
            if(_ctPage === "pgc_map") {
                style = "left: 60px;";
            }

            let commentControl;
            if(_ctPage === "gc_geocache") {
                let li = $('<li></li>');
                commentControl = $('<a href class="cachetur-add-comment" data-code="' + code + '">' + i18next.t('comments.add') + '</a>');
                li.append(commentControl);
                $("#cachetur-controls-container").append(li);
            } else if(_ctPage === "gc_map") {
                commentControl = $('<a href class="cachetur-add-comment" data-code="' + code + '"><img src="https://cachetur.no/api/img/cachetur-comment.png" /> ' + i18next.t('comments.add') + ' </a>');
                img.parent().append(commentControl);
            } else {
                commentControl = $(' <img src="https://cachetur.no/api/img/cachetur-comment.png" data-code="' + code + '" title="'+i18next.t('comments.add')+'" class="cachetur-add-comment" style="cursor: pointer; ' + style + '" /> ');
                img.parent().prepend(commentControl);
            }

            commentControl.click(function(evt) {
                evt.stopImmediatePropagation();
                evt.preventDefault();

                let tur = $("#cachetur-tur-valg").val();
                let commentImg = $(this);
                let commentCode = commentImg.data("code");
                let comment = prompt(i18next.t('comments.description'));

                ctApiCall("planlagt_add_code_comment", {
                    tur: tur,
                    code: commentCode,
                    comment: comment

                }, function (data) {

                    if (data === "Ok") {
                        if(_ctPage === "gc_geocache") {
                            commentImg.addClass("cachetur-add-comment-success");
                            commentImg.html(i18next.t('comments.saved'));
                        } else if(_ctPage === "gc_map") {
                            commentImg.html('<img src="https://cachetur.no/api/img/cachetur-comment-success.png" /> ' + i18next.t('comments.saved'));
                        } else {
                            commentImg.attr("src", "https://cachetur.no/api/img/cachetur-comment-success.png");
                            commentImg.attr("title", i18next.t('comments.saved'));
                        }
                    }
                    else {
                        if(_ctPage === "gc_geocache") {
                            commentImg.addClass("cachetur-add-comment-error");
                            commentImg.html(i18next.t('comments.error'));
                        } else if(_ctPage === "gc_map") {
                            commentImg.html('<img src="https://cachetur.no/api/img/cachetur-comment-error.png" /> ' + i18next.t('comments.error'));
                        } else {
                            commentImg.attr("src", "https://cachetur.no/api/img/cachetur-comment-error.png");
                            commentImg.attr("title", i18next.t('comments.error'));
                        }
                    }
                });

                GM_setValue("cachetur_last_action", Date.now());
            });

            if(!$("#cachetur-tur-valg").val().endsWith('T')) {
                ctCreatePriorityControl(img, code, 1);
                ctCreatePriorityControl(img, code, 2);
                ctCreatePriorityControl(img, code, 3);
            }
        }
        else {
            if(_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-success").removeClass("cachetur-add-code-error").html(i18next.t('send'));
                img.parent().parent().find(".cachetur-add-comment").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-1").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-2").parent().remove();
                img.parent().parent().find(".cachetur-set-pri-3").parent().remove();
                $("#cachetur-found-by-container").remove();
            } else if (_ctPage === "gc_map") {
                img.html('<img src="https://cachetur.no/api/cachetur-15.png" /> ' + i18next.t('send'));
                img.parent().find(".cachetur-add-comment").remove();
                img.parent().find(".cachetur-set-pri-1").remove();
                img.parent().find(".cachetur-set-pri-2").remove();
                img.parent().find(".cachetur-set-pri-3").remove();
                img.parent().find(".cachetur-found-by").remove();
            } else {
                img.attr("src", "https://cachetur.no/api/img/cachetur-15.png");
                img.attr("title", i18next.t('send'));
                img.parent().find(".cachetur-add-comment").remove();
                img.parent().find(".cachetur-set-pri-1").remove();
                img.parent().find(".cachetur-set-pri-2").remove();
                img.parent().find(".cachetur-set-pri-3").remove();
                img.parent().find(".cachetur-found-by").remove();
            }
        }
    });
}

function ctCreatePriorityControl(img, code, priority) {
    let control;
    let style = "padding-right: 5px;";

    if (_ctPage === "pgc_map") {
        let left = 60 + priority * 20;
        style = "left: " + left + "px";
    }

    if(_ctPage === "gc_geocache") {
        let li = $('<li></li>');
        control = $('<a href class="cachetur-set-pri-' + priority + '" data-code="' + code + '">' + i18next.t('priority.set' + priority) + '</a>');
        li.append(control);
        $("#cachetur-controls-container").append(li);
    } else if(_ctPage === "gc_map") {
        control = $('<a href class="cachetur-set-pri-' + priority + '" data-code="' + code + '"><img src="https://cachetur.no/api/img/p' + priority + '.png" /> ' + i18next.t('priority.set' + priority) + '</a>');
        img.parent().append(control);
    } else {
        control = $(' <img src="https://cachetur.no/api/img/p' + priority + '.png" data-code="' + code + '" title="' + i18next.t('priority.set' + priority) + '" class="cachetur-set-pri-' + priority + '" style="cursor: pointer; ' + style + '" /> ');
        img.parent().prepend(control);
    }

    control.click(function(evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let priorityImg = $(this);
        let priorityCode = priorityImg.data('code');

        ctApiCall("planlagt_set_code_priority", {
            tur: tur,
            code: priorityCode,
            priority: priority

        }, function (data) {

            if (data === "Ok") {
                if(_ctPage === "gc_geocache") {
                    priorityImg.addClass("cachetur-set-pri-" + priority + "-success");
                    priorityImg.html(i18next.t('priority.saved'));
                } else if(_ctPage === "gc_map") {
                    priorityImg.html('<img src="https://cachetur.no/api/img/p' + priority + '_success.png" /> ' + i18next.t('priority.saved'));
                } else {
                    priorityImg.attr("src", "https://cachetur.no/api/img/p" + priority + "_success.png");
                    priorityImg.attr("title", i18next.t('priority.saved'));
                }
            }
            else {
                if(_ctPage === "gc_geocache") {
                    priorityImg.addClass("cachetur-set-pri-" + priority + "-error");
                    priorityImg.html(i18next.t('priority.error'));
                } else if(_ctPage === "gc_map") {
                    priorityImg.html('<img src="https://cachetur.no/api/img/p' + priority + '_error.png" /> ' + i18next.t('priority.error'));
                } else {
                    priorityImg.attr("src", "https://cachetur.no/api/img/p" + priority + "_error.png");
                    priorityImg.attr("title", i18next.t('priority.error'));
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
    let id = $("#cachetur-tur-valg").val();

    ctApiCall("planlagt_check_find", {
            "tur": id,
            "code": code
        },
        function (foundBy) {

            if (foundBy === "") return "";

            let img = $(".cachetur-add-code[data-code='" + code + "']");
            if (img.length <= 0) return;

            if($(".cachetur-found-by[data-code='" + code + "']").length === 0) {
                let style = "";
                if(_ctPage === "pgc_map") {
                    style = "left: 40px;";
                }
                if(_ctPage === "gc_geocache") {
                    $("#cachetur-found-by-container").remove();
                    $("#cachetur-controls-container").parent().append('<ul id="cachetur-found-by-container"><li><b><img src="https://cachetur.no/api/img/attfind.png" /> '+i18next.t('foundby')+'</b></li><li>' + foundBy + "</li></ul>");
                } else if(_ctPage === "gc_map") {
                    img.closest(".map-item").find(".cachetur-found-by-container").remove();
                    img.closest(".map-item").append('<div class="links Clear cachetur-found-by-container"><b><img src="https://cachetur.no/api/img/attfind.png" /> '+i18next.t('foundby')+'</b> ' + foundBy + "</div>");
                } else {
                    img.parent().prepend(' <img class="cachetur-found-by" data-code="' + code + '" src="https://cachetur.no/api/img/attfind.png" title="'+i18next.t('foundby')+' ' + foundBy + '" style="' + style + '" /> ');
                }
            }
        }
    );
}

function ctFixNewGcMapIssues() {
    if (window.location.href.indexOf("bm=") > -1) return;

    unsafeWindow.cacheturGCMap.on('zoomend', function() {
        $("#clear-map-control").trigger("click");
    });

    unsafeWindow.cacheturGCMap.on("moveend", function () {
        $("#clear-map-control").trigger("click");
    });
}

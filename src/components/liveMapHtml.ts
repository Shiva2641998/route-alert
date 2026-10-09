/** Street map shell. Uses Google Maps when a key is available, otherwise OpenStreetMap tiles. */
export function buildLiveMapHtml(apiKey: string): string {
  const key = apiKey.trim();
  if (key.length > 10) return googleMapHtml(key);
  return leafletMapHtml();
}

const MAP_CHROME_CSS = `
    html, body { margin: 0; height: 100%; width: 100%; overflow: hidden; background: #e8eaed; }
    #map { position: absolute; inset: 0; z-index: 1; height: 100%; width: 100%; background: #e8eaed; }
    .gm-err-container, .gm-err-autocomplete { display: none !important; }
    .leaflet-control-attribution { font-size: 10px; }
    .leaflet-div-icon.nav-car, .leaflet-div-icon.nav-stop {
      background: transparent !important;
      border: none !important;
    }
    .nav-car { pointer-events: none !important; }
    .nav-arrow { width: 48px; height: 48px; transform-origin: center center; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #recenter {
      position: absolute; right: 12px; bottom: 112px; z-index: 5;
      width: 48px; height: 48px; border: 0; border-radius: 24px;
      background: #1a73e8; color: #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,.28);
      display: flex; align-items: center; justify-content: center;
      padding: 0; cursor: pointer;
    }
    #recenter.needs-recenter {
      background: #fff; color: #1a73e8;
      box-shadow: 0 0 0 3px rgba(26,115,232,.35), 0 2px 6px rgba(0,0,0,.28);
    }
    #recenter svg { display: block; }
`;

const RECENTER_BUTTON = `
  <button id="recenter" class="following" type="button" title="Following you" aria-label="Recenter">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 L19.5 21 L12 16.5 L4.5 21 Z"/></svg>
  </button>`;

/** Shared OpenStreetMap navigation camera: zoom on the user, heading-up arrow, recenter. */
const LEAFLET_BOOT = `
function bootLeafletNavigation(map, initial, bindMessages) {
  var NAV_ZOOM = 16;
  var follow = true;
  var ignoreDepth = 0;
  var lockedZoom = false;
  var lastLL = null;
  var lastHeading = 0;
  var car = null;
  var casing = null;
  var line = null;
  var stationLayer = L.layerGroup().addTo(map);
  var drawnRouteId = '';
  var drawnStations = '';
  var FOLLOW_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L19.5 21 L12 16.5 L4.5 21 Z"/></svg>';
  var RECENTER_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"></path></svg>';

  function beginIgnore() {
    ignoreDepth += 1;
    setTimeout(function () { ignoreDepth = Math.max(0, ignoreDepth - 1); }, 80);
  }
  function headingOf(loc) {
    var h = loc && loc.heading;
    return typeof h === 'number' && isFinite(h) ? ((h % 360) + 360) % 360 : 0;
  }
  function canHeading() {
    return typeof map.setHeading === 'function';
  }
  function updateRecenterBtn() {
    var btn = document.getElementById('recenter');
    if (!btn) return;
    btn.className = follow ? 'following' : 'needs-recenter';
    btn.title = follow ? 'Following you' : 'Recenter';
    btn.setAttribute('aria-label', follow ? 'Following you' : 'Recenter');
    btn.innerHTML = follow ? FOLLOW_SVG : RECENTER_SVG;
  }
  function iconForType(type) {
    if (type === 'PETROL') return '⛽';
    if (type === 'EV') return '⚡';
    if (type === 'RESTAURANT') return '🍽️';
    if (type === 'CAFE') return '☕';
    if (type === 'HOTEL') return '🏨';
    if (type === 'HOSPITAL') return '🏥';
    if (type === 'ATM') return '🏧';
    if (type === 'CUSTOM') return '📍';
    return '⛽';
  }
  function carIcon() {
    return L.divIcon({
      className: 'nav-car',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      html: '<div class="nav-arrow"><svg width="48" height="48" viewBox="0 0 48 48"><polygon points="24,4 42,42 24,33 6,42" fill="#1a73e8" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/></svg></div>'
    });
  }
  function stationIcon(active, type) {
    var icon = iconForType(type);
    return L.divIcon({
      className: 'nav-stop',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      html: '<div style="width:32px;height:32px;border-radius:16px;background:' + (active ? '#e6f4ea' : '#fff') +
        ';border:2px solid ' + (active ? '#188038' : '#f9ab00') +
        ';display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.25)">' + icon + '</div>'
    });
  }
  function orientCar(screenDeg) {
    if (!car) return;
    car.options.rotation = screenDeg;
    car.options.rotateWithView = false;
    if (canHeading() && typeof car.update === 'function') {
      car.update();
      return;
    }
    var el = (car.getElement && car.getElement()) || car._icon;
    var arrow = el && el.querySelector('.nav-arrow');
    if (!arrow) return;
    arrow.style.transformOrigin = 'center center';
    arrow.style.transform = 'rotate(' + screenDeg + 'deg)';
  }
  function pointArrow() {
    if (follow && canHeading()) orientCar(0);
    else orientCar(lastHeading);
  }
  function focusUser(ll, heading, snapZoom) {
    beginIgnore();
    if (canHeading()) map.setHeading(heading, { ease: 0.45, deadzone: 1 });
    else if (typeof map.setBearing === 'function') map.setBearing(0);
    if (snapZoom || !lockedZoom) {
      map.setView(ll, NAV_ZOOM, { animate: false });
      lockedZoom = true;
    } else {
      map.panTo(ll, { animate: false });
    }
    pointArrow();
  }
  function releaseFollow() {
    if (ignoreDepth > 0 || !follow) return;
    follow = false;
    orientCar(lastHeading);
    updateRecenterBtn();
  }
  function settleNorthUp() {
    if (follow) return;
    beginIgnore();
    if (typeof map.stopHeadingUp === 'function') map.stopHeadingUp();
    if (typeof map.setBearing === 'function') map.setBearing(0);
    orientCar(lastHeading);
  }
  function ensureCar(ll) {
    if (!car) {
      car = L.marker(ll, {
        icon: carIcon(),
        zIndexOffset: 3000,
        rotation: 0,
        rotateWithView: false,
        interactive: false,
        keyboard: false
      }).addTo(map);
    } else {
      car.setLatLng(ll);
      if (typeof car.setZIndexOffset === 'function') car.setZIndexOffset(3000);
    }
  }
  function apply(msg) {
    if (!msg || msg.source !== 'route-alert') return;
    if (msg.route && msg.route.length > 1 && msg.routeId !== drawnRouteId) {
      drawnRouteId = msg.routeId || 'route';
      var latlngs = msg.route.map(function (p) { return [p.latitude, p.longitude]; });
      if (casing) map.removeLayer(casing);
      if (line) map.removeLayer(line);
      casing = L.polyline(latlngs, { color: '#185abc', weight: 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      line = L.polyline(latlngs, { color: '#1a73e8', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      if (car && typeof car.bringToFront === 'function') car.bringToFront();
    }
    var sKey = (msg.stations || []).map(function (s) { return s.id; }).join(',') + '|' + (msg.activeId || '');
    if (sKey !== drawnStations) {
      drawnStations = sKey;
      stationLayer.clearLayers();
      (msg.stations || []).forEach(function (station) {
        var marker = L.marker([station.coordinates.latitude, station.coordinates.longitude], {
          icon: stationIcon(station.id === msg.activeId, station.type),
          zIndexOffset: station.id === msg.activeId ? 500 : 0
        });
        var rating = station.rating ? station.rating + ' ★' : '';
        marker.bindPopup('<b>' + station.name + '</b><br>' + (station.vicinity || '') + '<br>' + rating);
        if (station.id === msg.activeId) marker.openPopup();
        marker.addTo(stationLayer);
      });
    }
    if (msg.location) {
      lastLL = [msg.location.latitude, msg.location.longitude];
      lastHeading = headingOf(msg.location);
      ensureCar(lastLL);
      if (follow) focusUser(lastLL, lastHeading, false);
      else pointArrow();
    }
  }

  var btn = document.getElementById('recenter');
  if (btn) {
    btn.onclick = function (event) {
      if (event) { event.preventDefault(); event.stopPropagation(); }
      follow = true;
      lockedZoom = false;
      updateRecenterBtn();
      if (lastLL) focusUser(lastLL, lastHeading, true);
    };
  }
  map.on('dragstart', releaseFollow);
  map.on('zoomstart', releaseFollow);
  map.on('dragend', settleNorthUp);
  map.on('zoomend', settleNorthUp);
  updateRecenterBtn();

  window.__onHost = function (m) {
    if (!m) return;
    if (typeof m === 'string') {
      try { m = JSON.parse(m); } catch (e) { return; }
    }
    apply(m);
  };
  if (bindMessages) {
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
      }
      window.__onHost(data);
    });
  }
  if (initial) window.__onHost(initial);
}
`;

const LEAFLET_ROTATE_SRC =
  'https://unpkg.com/@tomickigrzegorz/leaflet-rotate@0.3.0/dist/leaflet-rotate.umd.min.js';

function leafletMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>${MAP_CHROME_CSS}</style>
</head>
<body>
  <div id="map"></div>
  ${RECENTER_BUTTON}
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="${LEAFLET_ROTATE_SRC}"></script>
  <script>
    ${LEAFLET_BOOT}
    var map = L.map('map', {
      zoomControl: false,
      rotate: true,
      touchRotate: false,
      dragRotate: false,
      shiftKeyRotate: false,
      rotateControl: false
    }).setView([27.8, 76.5], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    bootLeafletNavigation(map, null, true);
    var readyMsg = { source: 'route-alert-map', type: 'ready' };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(readyMsg));
    else parent.postMessage(readyMsg, '*');
  </script>
</body>
</html>`;
}

function googleMapHtml(apiKey: string): string {
  const keyLiteral = JSON.stringify(apiKey);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>${MAP_CHROME_CSS}</style>
</head>
<body>
  <div id="map"></div>
  ${RECENTER_BUTTON}
  <script>
    const mapsKey = ${keyLiteral};
    let map = null;
    let line = null;
    let car = null;
    let stationMarkers = [];
    let follow = true;
    let ignoreDepth = 0;
    let lockedZoom = false;
    let lastPos = null;
    let lastHeading = 0;
    let drawnRouteId = '';
    let drawnStations = '';
    let pending = null;
    let readySent = false;
    let usingLeaflet = false;
    const NAV_ZOOM = 16;
    const FOLLOW_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L19.5 21 L12 16.5 L4.5 21 Z"/></svg>';
    const RECENTER_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"></path></svg>';

    ${LEAFLET_BOOT}

    function beginIgnore() {
      ignoreDepth += 1;
      setTimeout(function () { ignoreDepth = Math.max(0, ignoreDepth - 1); }, 80);
    }

    function headingOf(loc) {
      var h = loc && loc.heading;
      return typeof h === 'number' && isFinite(h) ? ((h % 360) + 360) % 360 : 0;
    }

    function updateRecenterBtn() {
      var btn = document.getElementById('recenter');
      if (!btn) return;
      btn.className = follow ? 'following' : 'needs-recenter';
      btn.title = follow ? 'Following you' : 'Recenter';
      btn.setAttribute('aria-label', follow ? 'Following you' : 'Recenter');
      btn.innerHTML = follow ? FOLLOW_SVG : RECENTER_SVG;
    }

    function getIconForType(type) {
      if (type === 'PETROL') return '⛽';
      if (type === 'EV') return '⚡';
      if (type === 'RESTAURANT') return '🍽️';
      if (type === 'CAFE') return '☕';
      if (type === 'HOTEL') return '🏨';
      if (type === 'HOSPITAL') return '🏥';
      if (type === 'ATM') return '🏧';
      if (type === 'CUSTOM') return '📍';
      return '⛽';
    }

    function carSymbol(heading) {
      return {
        path: 'M 0,-20 L 9,16 L 0,9 L -9,16 Z',
        fillColor: '#1a73e8',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1.2,
        rotation: heading,
        anchor: new google.maps.Point(0, 0)
      };
    }

    function focusUser(pos, heading, snapZoom) {
      if (!map) return;
      beginIgnore();
      var cam = { center: pos, heading: heading, tilt: 0 };
      if (snapZoom || !lockedZoom) {
        cam.zoom = NAV_ZOOM;
        lockedZoom = true;
      }
      try {
        if (map.moveCamera) map.moveCamera(cam);
        else {
          map.panTo(pos);
          if (cam.zoom) map.setZoom(cam.zoom);
        }
      } catch (e) {
        map.panTo(pos);
        if (cam.zoom) map.setZoom(cam.zoom);
      }
    }

    function releaseFollow() {
      if (usingLeaflet || ignoreDepth > 0 || !follow || !map) return;
      follow = false;
      updateRecenterBtn();
    }

    function settleNorthUp() {
      if (usingLeaflet || follow || !map) return;
      beginIgnore();
      try {
        if (map.moveCamera) map.moveCamera({ heading: 0, tilt: 0 });
      } catch (e) {}
      if (car && lastPos) car.setIcon(carSymbol(lastHeading));
    }

    function signalReady() {
      if (readySent) return;
      readySent = true;
      var msg = { source: 'route-alert-map', type: 'ready' };
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      else parent.postMessage(msg, '*');
    }

    function apply(msg) {
      if (!msg || msg.source !== 'route-alert') return;
      pending = msg;
      if (usingLeaflet || !map || !window.google) return;
      if (msg.route && msg.route.length > 1 && msg.routeId !== drawnRouteId) {
        drawnRouteId = msg.routeId || 'route';
        const path = msg.route.map(function (p) { return { lat: p.latitude, lng: p.longitude }; });
        if (line) line.setMap(null);
        line = new google.maps.Polyline({
          path: path,
          strokeColor: '#1a73e8',
          strokeWeight: 6,
          zIndex: 1,
          map: map
        });
      }
      const stationKey = (msg.stations || []).map(function (s) { return s.id; }).join(',') + '|' + (msg.activeId || '');
      if (stationKey !== drawnStations) {
        drawnStations = stationKey;
        stationMarkers.forEach(function (marker) { marker.setMap(null); });
        stationMarkers = (msg.stations || []).map(function (station) {
          const marker = new google.maps.Marker({
            position: { lat: station.coordinates.latitude, lng: station.coordinates.longitude },
            map: map,
            title: station.name,
            label: getIconForType(station.type),
            zIndex: 2
          });
          const info = new google.maps.InfoWindow({
            content: '<b>' + station.name + '</b><br>' + (station.vicinity || '')
          });
          marker.addListener('click', function () { info.open({ map: map, anchor: marker }); });
          if (station.id === msg.activeId) info.open({ map: map, anchor: marker });
          return marker;
        });
      }
      if (msg.location) {
        lastPos = { lat: msg.location.latitude, lng: msg.location.longitude };
        lastHeading = headingOf(msg.location);
        var icon = carSymbol(lastHeading);
        if (!car) {
          car = new google.maps.Marker({
            position: lastPos,
            map: map,
            icon: icon,
            zIndex: 9999,
            clickable: false,
            optimized: false
          });
        } else {
          car.setPosition(lastPos);
          car.setIcon(icon);
        }
        if (follow) focusUser(lastPos, lastHeading, false);
      }
    }

    window.__onHost = function (msg) {
      pending = msg;
      apply(msg);
    };
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }
      if (window.__onHost) window.__onHost(data);
    });

    var recenterBtn = document.getElementById('recenter');
    if (recenterBtn) {
      recenterBtn.onclick = function (event) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        if (usingLeaflet) return;
        follow = true;
        lockedZoom = false;
        updateRecenterBtn();
        if (lastPos) focusUser(lastPos, lastHeading, true);
      };
    }

    window.initMap = function () {
      clearTimeout(scriptLoadTimer);
      if (usingLeaflet) return;
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 27.8, lng: 76.5 },
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
        tilt: 0,
        heading: 0
      });
      map.addListener('dragstart', releaseFollow);
      map.addListener('dragend', settleNorthUp);
      updateRecenterBtn();
      if (pending) apply(pending);
      signalReady();
    };

    window.gm_authFailure = function () {
      console.warn('Google Maps auth failure, loading Leaflet fallback');
      loadLeafletFallback();
    };

    function loadLeafletFallback() {
      if (usingLeaflet) return;
      usingLeaflet = true;
      map = null;
      var mapEl = document.getElementById('map');
      if (!mapEl) return;
      mapEl.innerHTML = '';
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      function startLeaflet() {
        var lMap = L.map('map', {
          zoomControl: false,
          rotate: true,
          touchRotate: false,
          dragRotate: false,
          shiftKeyRotate: false,
          rotateControl: false
        }).setView([27.8, 76.5], 6);
        L.control.zoom({ position: 'bottomright' }).addTo(lMap);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 20,
          subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(lMap);
        bootLeafletNavigation(lMap, pending, false);
        signalReady();
      }

      var lScript = document.createElement('script');
      lScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      lScript.onload = function () {
        var rot = document.createElement('script');
        rot.src = '${LEAFLET_ROTATE_SRC}';
        rot.onload = startLeaflet;
        rot.onerror = startLeaflet;
        document.head.appendChild(rot);
      };
      lScript.onerror = function () { console.warn('Leaflet failed to load'); };
      document.head.appendChild(lScript);
    }

    var scriptLoadTimer = setTimeout(function () {
      if (!map && !window.google && !usingLeaflet) {
        console.warn('Google Maps script timeout, falling back to Leaflet');
        loadLeafletFallback();
      }
    }, 4500);

    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(mapsKey) + '&callback=initMap';
    script.async = true;
    script.onerror = function () {
      clearTimeout(scriptLoadTimer);
      loadLeafletFallback();
    };
    document.head.appendChild(script);
  </script>
</body>
</html>`;
}

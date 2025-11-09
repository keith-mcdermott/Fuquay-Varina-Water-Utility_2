window.onload = init;

let currentPopup = null;

function init() {
  const map = new maplibregl.Map({
    container: "map",
    style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=4dnCO2qbvoerHfTPd8Ay',
    center: [-78.788611, 35.591944],
    zoom: 14,
    pitch: 45
  });

  map.getCanvas().style.cursor = 'default';

  // --- Geocoder Control ---
  // const geocoderApi = {
  //   forwardGeocode: async (config) => {
  //     const features = [];
  //     try {
  //       const request =
  //         `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
  //       const response = await fetch(request);
  //       const geojson = await response.json();
  //       for (const feature of geojson.features) {
  //         const center = [
  //           feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
  //           feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
  //         ];
  //         features.push({
  //           type: 'Feature',
  //           geometry: { type: 'Point', coordinates: center },
  //           place_name: feature.properties.display_name,
  //           properties: feature.properties,
  //           text: feature.properties.display_name,
  //           place_type: ['place'],
  //           center
  //         });
  //       }
  //     } catch (e) {
  //       console.error(`Failed geocode: ${e}`);
  //     }
  //     return { features };
  //   }
  // };
  // map.addControl(new MaplibreGeocoder(geocoderApi, { maplibregl }));

  // --- Navigation & Scale Controls ---
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'imperial' }));

  // --- Home Button Control ---
  class HomeControl {
    constructor(defaultView) { this.defaultView = defaultView; }
    onAdd(map) {
      this.map = map;
      this.container = document.createElement('div');
      this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      const button = document.createElement('button');
      button.type = 'button';
      button.title = 'Reset View';
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3l9 9h-3v9h-12v-9h-3l9-9z"/></svg>';
      button.style.cursor = 'pointer';
      button.onclick = () => {
        map.flyTo(this.defaultView);
      };
      this.container.appendChild(button);
      return this.container;
    }
    onRemove() { this.container.remove(); this.map = undefined; }
  }
  map.addControl(new HomeControl({ center: [-78.788611, 35.591944], zoom: 14, pitch: 45, bearing: 0 }), 'top-right');

  // --- Load GeoJSON Layers ---
  map.on('load', () => {
    setupSearch();
    function loadGeojson(url, sourceId, layerId, layerType, visible = true) {
      map.addSource(sourceId, { type: 'geojson', data: url, generateId: true });
      map.addLayer({ id: layerId, type: layerType, source: sourceId, layout: { visibility: visible ? 'visible' : 'none' }, paint: setStyle(layerId) });
    }

    function setStyle(layerId) {
      if (layerId === 'valves-layer') {
        return {
          'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 4],
          'circle-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#fbff00ff',
            ['case', ['==', ['get', 'valve_type'], 'Main'], '#013957ff',
              ['==', ['get', 'valve_type'], 'Hydrant'], '#771403ff', 'blue']],
          'circle-stroke-width': 2,
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#030303ff', '#fff']
        };
      } else if (layerId === 'service-connections-layer') {
        return {
          'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 4],
          'circle-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#fbff00ff', '#00ffffff'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000000ff'
        };
      } else if (layerId === 'water-lines-layer') {
        return {
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 4, 2],
          'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#fbff00ff', '#0083fdff']
        };
      }
    }

    loadGeojson('./data/Lines.json', 'water_lines', 'water-lines-layer', 'line');
    loadGeojson('./data/Valves.json', 'valves', 'valves-layer', 'circle');
    loadGeojson('./data/ServiceConnections.json', 'service_connections', 'service-connections-layer', 'circle', false);


    const interactiveLayers = [
      'valves-layer',
      'service-connections-layer',
      'water-lines-layer'
    ];

    map.on('mousemove', e => {
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      map.getCanvas().style.cursor = features.length ? 'pointer' : 'default';
    });

    // --- Hover Effects ---
    function addHoverEffect(layerId, sourceId) {
      let hoveredStateId = null;
      map.on('mousemove', layerId, e => {
        if (!e.features.length) return;
        const id = e.features[0].id;
        if (hoveredStateId && hoveredStateId !== id) map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: false });
        hoveredStateId = id;
        map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: true });
      });
      map.on('mouseleave', layerId, () => {
        if (hoveredStateId !== null) map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: false });
        hoveredStateId = null;
      });
    }
    addHoverEffect('valves-layer', 'valves');
    addHoverEffect('service-connections-layer', 'service_connections');
    addHoverEffect('water-lines-layer', 'water_lines');

    // --- Legend Control ---
    class LegendControl {
      constructor(layers) { this.layers = layers; }
      onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl legend-control';
        this.container.style.background = 'white';
        this.container.style.padding = '8px';
        this.container.style.fontSize = '13px';
        this.container.style.borderRadius = '6px';
        this.container.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
        for (const [layerId, labelObj] of Object.entries(this.layers)) {
          const div = document.createElement('div');
          div.style.marginBottom = '4px';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = labelObj.visible;
          checkbox.id = layerId;
          checkbox.addEventListener('change', e => map.setLayoutProperty(layerId, 'visibility', e.target.checked ? 'visible' : 'none'));
          const lbl = document.createElement('label');
          lbl.setAttribute('for', layerId);
          lbl.innerText = " " + labelObj.label;
          div.appendChild(checkbox); div.appendChild(lbl);
          this.container.appendChild(div);
        }
        return this.container;
      }
      onRemove() { this.container.remove(); this.map = undefined; }
    }
    map.addControl(new LegendControl({
      'valves-layer': { label: 'Valves', visible: true },
      'service-connections-layer': { label: 'Service Connections', visible: false },
      'water-lines-layer': { label: 'Water Lines', visible: true }
    }), 'top-left');
  });

  // --- Popup Date Helper ---
  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return 'Unknown';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // --- Unified Popup Function ---
  async function showPopup(e, layerType) {
    const feature = e.features[0];
    const props = feature.properties;

    let coords = '';
    if (feature.geometry.type === "Point") {
      coords = feature.geometry.coordinates;
    } else if (feature.geometry.type === "LineString") {
      const midIndex = Math.floor(feature.geometry.coordinates.length / 2);
      coords = feature.geometry.coordinates[midIndex];
    }

    // Remove existing popup and cleanup
    if (currentPopup) {
      currentPopup.remove();
      cleanupRoute();
    }

    // --- HTML for each layer type ---
    let html = '';
    if (layerType === 'valve') {
      html = `
      <strong><u>Valve</u></strong><br>
      <strong>Valve ID:</strong> ${props.valve_id || 'Unknown'}<br>
      <strong>Type:</strong> ${props.valve_type || 'Unknown'}<br>
      <strong>Status:</strong> ${props.open_stat || 'Unknown'}<br>
      <strong>Installation Date:</strong> ${formatDate(props.install_date)}<br>
      <strong>Operable:</strong> ${props.operable || 'Unknown'}<br><br>
      <button id="routeButton" class="btn btn-primary">Get Directions</button>
      <div id="directions" style="margin-top:10px;max-height:150px;overflow:auto;font-size:13px;"></div>
    `;
    } else if (layerType === 'service') {
      html = `
      <strong><u>Service Connection</u></strong><br>
      <strong>Service ID:</strong> ${props.serve_id || 'Unknown'}<br>
      <strong>Customer ID:</strong> ${props.cust_id || 'Unknown'}<br>
      <strong>Meter ID:</strong> ${props.meter_id || 'Unknown'}<br>
      <strong>Status:</strong> ${props.status || 'Unknown'}<br>
      <strong>Installation Date:</strong> ${formatDate(props.install_date)}<br>
      <strong>Average Annual Usage:</strong> ${props.avg_use || 'Unknown'}<br><br>
      <button id="routeButton" class="btn btn-primary">Get Directions</button>
      <div id="directions" style="margin-top:10px;max-height:150px;overflow:auto;font-size:13px;"></div>
    `;
    } else if (layerType === 'line') {
      html = `
      <strong><u>Water Main</u></strong><br>
      <strong>Pipe ID:</strong> ${props.pipe_id || 'Unknown'}<br>
      <strong>Material:</strong> ${props.material || 'Unknown'}<br>
      <strong>Diameter (in):</strong> ${props.diameter_in || 'Unknown'}<br>
      <strong>Installation Date:</strong> ${formatDate(props.install_date)}<br>
      <strong>Condition:</strong> ${props.condition || 'Unknown'}<br>
      <strong>Leak Count:</strong> ${props.leak_count || 'Unknown'}<br>
    `;
    }
    console.log(html)
    // --- Create and add popup ---
    const popup = new maplibregl.Popup({ offset: 25 })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);

    currentPopup = popup;

    // --- Route calculation logic ---
    async function calculateRoute() {
      const btn = document.getElementById('routeButton');
      const directionsDiv = document.getElementById('directions');

      if (!navigator.geolocation) {
        directionsDiv.innerHTML = `<strong>Geolocation not supported.</strong>`;
        return;
      }

      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const userCoords = [pos.coords.longitude, pos.coords.latitude];
          cleanupRoute();
          directionsDiv.innerHTML = `<em>Calculating route...</em>`;

          map.addSource('user-location', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: userCoords } }
          });
          map.addLayer({
            id: 'user-location',
            type: 'circle',
            source: 'user-location',
            paint: { 'circle-radius': 8, 'circle-color': '#007bff', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
          });

          const url = `https://router.project-osrm.org/route/v1/driving/${userCoords[0]},${userCoords[1]};${coords[0]},${coords[1]}?overview=full&geometries=geojson&steps=true`;
          const res = await fetch(url);
          const json = await res.json();

          if (!json.routes?.length) {
            directionsDiv.innerHTML = `<strong>No route found.</strong>`;
            return;
          }

          const route = json.routes[0].geometry;
          const distanceMiles = (json.routes[0].distance * 0.000621371).toFixed(2);
          const durationMin = (json.routes[0].duration / 60).toFixed(1);

          map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
          map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ff3333', 'line-width': 5 } });

          const bounds = new maplibregl.LngLatBounds();
          route.coordinates.forEach(c => bounds.extend(c));
          map.fitBounds(bounds, { padding: 50 });

          directionsDiv.innerHTML = `
          <strong>Distance:</strong> ${distanceMiles} miles<br>
          <strong>Duration:</strong> ${durationMin} min<br><br>
        `;

          document.getElementById('routeButton').addEventListener('click', calculateRoute);
        } catch (err) {
          console.error(err);
          directionsDiv.innerHTML = `<strong>Error calculating route.</strong>`;
        }
      }, err => {
        console.error(err);
        directionsDiv.innerHTML = `<strong>Error getting your location.</strong>`;
      });
    }

    // Attach route button listener if exists
    const btn = document.getElementById('routeButton');
    if (btn) btn.addEventListener('click', calculateRoute);

    // --- Close popup cleanup ---
    popup.on('close', () => {
      cleanupRoute();
      currentPopup = null;
    });
  }

  // --- Helper to clean up route & user layers ---
  function cleanupRoute() {
    ['route', 'user-location'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  // --- Event bindings for layers ---
  map.on('click', 'valves-layer', e => showPopup(e, 'valve'));
  map.on('click', 'service-connections-layer', e => showPopup(e, 'service'));
  map.on('click', 'water-lines-layer', e => showPopup(e, 'line'));

  // --- Close popup when clicking off ---
  map.on('click', e => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ['valves-layer', 'service-connections-layer', 'water-lines-layer']
    });
    if (!features.length && currentPopup) {
      currentPopup.remove();
      cleanupRoute();
      currentPopup = null;
    }
  });

  map.on('click', 'valves-layer', e => showPopup(e, 'valve'));
  map.on('click', 'service-connections-layer', e => showPopup(e, 'service'));
  map.on('click', 'water-lines-layer', e => showPopup(e, 'line'));

  function setupSearch() {
    const searchInput = document.getElementById('valveSearch');
    const suggestionsList = document.getElementById('valveSuggestions');
    const clearBtn = document.getElementById('clearSearch'); // ✅ Safe here


    if (!searchInput || !suggestionsList) {
      console.warn("Search box elements not found.");
      return;
    }

    // --- Show/hide clear button ---
    searchInput.addEventListener('input', () => {
      clearBtn.style.display = searchInput.value ? 'inline-block' : 'none';
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      suggestionsList.innerHTML = '';
      clearBtn.style.display = 'none';
      searchInput.focus();
    });

    // --- Listen for typing ---
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      suggestionsList.innerHTML = '';

      if (query.length < 1) return;

      // Only consider features visible on map
      const visibleLayers = ['valves-layer', 'service-connections-layer'];
      const visibleFeatures = map.queryRenderedFeatures({ layers: visibleLayers });

      // Filter visible features based on valve_id or serve_id
      const matches = visibleFeatures.filter(f => {
        const props = f.properties || {};
        const valveID = (props.valve_id || '').toString().toLowerCase();
        const serviceID = (props.serve_id || '').toString().toLowerCase();
        return valveID.includes(query) || serviceID.includes(query);
      }).slice(0, 15);

      if (matches.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No matches in current view';
        li.style.color = '#888';
        suggestionsList.appendChild(li);
        return;
      }

      matches.forEach(f => {
        const li = document.createElement('li');
        const type = f.layer.id.includes('valves') ? 'Valve' : 'Service';
        const idText = f.properties.valve_id || f.properties.serve_id || 'Unknown';
        li.innerHTML = `<strong>${idText}</strong> <small style="color:#555;">(${type})</small>`;
        li.addEventListener('click', () => {
          selectFeature(f);
          suggestionsList.innerHTML = '';
          searchInput.value = idText;
        });
        suggestionsList.appendChild(li);
      });
    });

    // Clear when clicking outside
    document.addEventListener('click', e => {
      if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
        suggestionsList.innerHTML = '';
      }
    });

    // Optional: refresh suggestions on map move (so "visible only" updates)
    map.on('moveend', () => {
      if (searchInput.value.trim().length > 0) {
        const event = new Event('input');
        searchInput.dispatchEvent(event);
      }
    });
  }

  // --- Helper: zoom to feature and open popup ---
  function selectFeature(feature) {
    const coords = feature.geometry.coordinates;
    map.flyTo({ center: coords, zoom: 18, speed: 0.8 });

    const type = feature.layer.id.includes('valves') ? 'valve' : 'service';
    const e = { features: [feature] };
    showPopup(e, type);
  }

}

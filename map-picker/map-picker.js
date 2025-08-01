let Leaflet; // Will be imported dynamically in connectedCallback()

/* 🏠 Local version */
const BASE_URL = import.meta.resolve('./vendor-leaflet/');
const LEAFLET_SCRIPT = 'leaflet-src.esm.min.js';
const LEAFLET_STYLESHEET = 'leaflet.min.css';

/* 🔗 CDN version */
// const BASE_URL = 'https://unpkg.com/leaflet@1.9.4/dist/';
// const LEAFLET_SCRIPT = 'leaflet-src.esm.js';
// const LEAFLET_STYLESHEET = 'leaflet.css';

export default class MapPicker extends HTMLElement {
    static get observedAttributes() { return ['marker-coordinates']; }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return; // No change, no action
        if (name === 'marker-coordinates' && newValue) {
            const coords = csvToArray(newValue).map(Number);
            this.setMarker(coords[0], coords[1]);
        }
    }

    static {
        // Preload appropriate marker icon based on device pixel ratio
        new Image().src = window.devicePixelRatio >= 2 
            ? `${BASE_URL}images/marker-icon-2x.png`
            : `${BASE_URL}images/marker-icon.png`;
    }

    constructor() {
        super();
        this.host = this.#determineHost();
        this.mapWrapper = this.closest('[popover]') ?? this.parentElement;
        this.confirmLocation = this.host.querySelectorAll(this.getAttribute('confirm'));
        this.resetLocation = this.host.querySelectorAll(this.getAttribute('reset'));
        this.initialCoords = this.hasAttribute('initial-coordinates')
            ? csvToArray(this.getAttribute('initial-coordinates')).map(Number)
            : [39.8283, -98.5795]; // Default to USA center
        this.initialZoom = parseInt(this.getAttribute('initial-zoom')) || 4; // Default zoom level
        this.map = null;
        this.marker = null;
        this.address = null; // Store the address of the marker
    }

    #determineHost() {
        const shadowRootHost = this.getAttribute('shadow-root-host');
        const host = this.getAttribute('host');
        if (shadowRootHost) return document.querySelector(shadowRootHost)?.shadowRoot;
        if (host) return document.querySelector(host);
        return this.getRootNode();
    }

    connectedCallback() {
        this.ariaBusy = true; // Initially busy while loading

        // Load Leaflet first, then initialize
        import(`${BASE_URL}${LEAFLET_SCRIPT}`).then(module => {
            Leaflet = module;
            this.#init();
        }).catch(error => console.error('Failed to load Leaflet:', error));

        // Add the Leaflet CSS stylesheet
        this.addStylesheet(`${BASE_URL}${LEAFLET_STYLESHEET}`);
    }

    addStylesheet(path) {
        return new Promise((resolve) => {
            const element = document.createElement('link');
            element.rel = 'stylesheet';
            element.href = `${path}`;
            element.onload = () => resolve();
            element.onerror = (error) => {
                console.warn(`map-picker.js failed to load stylesheet: ${path}`, error);
                resolve(); // Still resolve to not block other resources
            };
            this.prepend(element);
        });
    }

    #init() {
        this.#setupMap();
        this.#setupIntersectionObserver();
        this.#setupEventListeners();
    }

    #setupMap() {
        // Set the default icon path for Leaflet
        Leaflet.Icon.Default.prototype.options.imagePath = `${BASE_URL}images/`;

        // Create map without default zoom control
        this.map = new Leaflet.Map(this, {
            zoomControl: false
        }).setView(this.initialCoords, this.initialZoom);
        // Add zoom control to the right side
        new Leaflet.Control.Zoom({ position: 'topright' }).addTo(this.map);

        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const attribution = MapPicker.#mapAttribution();
        const tileLayer = new Leaflet.TileLayer(tileUrl, {maxZoom: 19, attribution: attribution});
        this.#setAriaBusyWhenLoading(tileLayer);

        this.map.addLayer(tileLayer);

        this.#inheritMarkerCoordinates();
    }

    #inheritMarkerCoordinates() {
        // move attribute 'marker-coordinates' from mapWrapper to this component
        if (!this.mapWrapper.hasAttribute('marker-coordinates')) return;
        const coords = this.mapWrapper.getAttribute('marker-coordinates');
        this.mapWrapper.removeAttribute('marker-coordinates'); // Clean up attribute
        this.setAttribute('marker-coordinates', coords);
    }

    #setupIntersectionObserver() {
        // Intersection Observer to recalculate map size when it becomes visible
        observeIntersection(this.mapWrapper, () => {
            this.map.invalidateSize();
            this.#refreshMarker();
            if (this.hasAttribute('map-autofocus')) this.map.getContainer().focus();
        }, false); // the false flag means it will not unobserve after the first intersection
    }

    #refreshMarker() {
        if (!this.hasAttribute('marker-coordinates')) return;
        const coords = csvToArray(this.getAttribute('marker-coordinates')).map(Number);
        this.setMarker(coords[0], coords[1]);
        this.map.setView(coords, 12);
    }

    #setupEventListeners() {
        this.map.on('click', (e) => {
            this.setMarker(e.latlng.lat, e.latlng.lng);
            this.#dispatchEventWithMarkerData('map-picker-marker-set');
        });

        setupKeyboardControls(this.map.getContainer(), this.map, {
            setMarker: (lat, lng) => this.setMarker(lat, lng),
            resetMap: () => this.resetMap(),
            confirmLocation: () => this.confirmLocation[0]?.click(),
            markerSetEvent: () => this.#dispatchEventWithMarkerData('map-picker-marker-set')
        });

        this.confirmLocation?.forEach(el => {
            el.addEventListener('click', (e) => this.handleConfirm(e));
        });
    
        this.resetLocation?.forEach(el => {
            el.addEventListener('click', (e) => {
                // 📡 Dispatch a 'map-picker-reset' event
                this.host.dispatchEvent(new Event('map-picker-reset'));
            });
        });

        // 📡 Listen for the map-picker-reset event
        this.host.addEventListener('map-picker-reset', () => { this.resetMap() });
    }

    handleConfirm(e) {
        if (!this.marker) return alert('Please select a location on the map first.');

        const { lat, lng } = this.marker.getLatLng();
        this.setAttribute('marker-coordinates', `${lat},${lng}`);
        this.map.setView([lat, lng], 12);

        // 📡 Dispatch a custom event to notify that the location has been confirmed
        this.#dispatchEventWithMarkerData('map-picker-confirm');
        // this.confirmLocation?.forEach(el => el.ariaBusy = true);
    }

    async setMarker(lat, lng, showPopup = true) {
        if (!Leaflet) return; // ! Leaflet is not loaded

        // Set marker at given coordinates and fetch address
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = new Leaflet.Marker([lat, lng]).addTo(this.map);

        // Show popup with loading state
        const popup = this.marker.bindPopup(MapPicker.#createPopup({ loading: true }));
        if (showPopup) popup.openPopup();

        // Get address and update popup
        const address = await getAddressFromCoordinates(lat, lng);
        this.address = address || null;
        this.marker.setPopupContent(MapPicker.#createPopup({ address, coordinates: { lat, lng } }));
    }

    resetMap() {
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = null; // Clear marker reference
        this.address = null; // Clear the address
        this.removeAttribute('marker-coordinates'); // Clean up attribute
        this.map.setView(this.initialCoords, this.initialZoom);
        // this.map.getContainer().focus();
    }

    #setAriaBusyWhenLoading(tileLayer) {
        let loadingTiles = 0; // Track loading tiles count
        tileLayer.on('loading', () => {
            loadingTiles++;
            this.ariaBusy = true;
        });
        tileLayer.on('load', () => {
            loadingTiles--;
            if (!loadingTiles) this.ariaBusy = null;
        });
    }

    // Dispatch a custom event with marker data
    #dispatchEventWithMarkerData(evName) {
        if (!this.marker) return;
        const lat = this.marker.getLatLng().lat.toFixed(6);
        const lng = this.marker.getLatLng().lng.toFixed(6);
        this.host.dispatchEvent(new MarkerDataEvent(
            evName, lat, lng, this.address || null 
        ));
    }

    // Unified popup template method
    static #createPopup({ loading = false, address = null, coordinates = null }) {
        const content = loading 
            ? MapPicker.#loadingTemplate()
            : address 
                ? MapPicker.#addressTemplate(address)
                : MapPicker.#coordinatesTemplate(coordinates.lat, coordinates.lng);
    
        return `<div class="popup-address" aria-live="polite">${content}</div>`;
    }

    static #loadingTemplate() {
        return `
            <strong>Address:</strong>
            <div aria-busy="true" class="muted">loading...</div>
        `;
    }

    static #addressTemplate(address) {
        return `
            <strong>Address:</strong>
            <div>${address}</div>
        `;
    }

    static #coordinatesTemplate(lat, lng) {
        return `
            <div class="space-between">
                <strong>Latitude:</strong> <div>${lat.toFixed(6)}</div>
            </div>
            <div class="space-between">
                <strong>Longitude:</strong> <div>${lng.toFixed(6)}</div>
            </div>
        `;
    }

    static #mapAttribution() {
        return `&copy;
            <a target="_blank" title="Open Street Maps"
                href="https://www.openstreetmap.org/copyright"
            >OSM</a> contributors |
            Geocoding by <a target="_blank" href="https://nominatim.org">Nominatim</a> |
            <a target="_blank" href="https://leafletjs.com" target="_blank"
                title="A JavaScript library for interactive maps"
            >Leaflet</a>`
    }

    // Statically define the element unless ?define=false is set as an URL param
    static tag = "map-picker";
    static define(tag = this.tag) {
        this.tag = tag;
        const name = customElements.getName(this);
        if (name) return console.warn(`${this.name} already defined as <${name}>!`);
        const ce = customElements.get(tag);
        if (Boolean(ce) && ce !== this) return console.warn(`<${tag}> already defined as ${ce.name}!`);
        customElements.define(tag, this);
    }
    static {
        const tag = new URL(import.meta.url).searchParams.get("define") || this.tag;
        if (tag !== "false") this.define(tag);
    }
}


// Custom event to encapsulate marker data
class MarkerDataEvent extends Event {
  constructor(eventName, lat, lng, address) {
    super(eventName, { bubbles: true, composed: true });
    this.lat = lat;
    this.lng = lng;
    this.address = address;
  }
}
// Usage example:
// el.dispatchEvent(new MarkerDataEvent('map-picker-confirm', lat, lng, address));




// Utils.


/**
 * Observes an element for intersection with the viewport
 * @param {HTMLElement} element - The element to observe
 * @param {Function} callback - The function to call when the element is intersecting
 * @param {boolean} [once=true] - If true, the observer will unobserve the element after the first intersection
 * @return {IntersectionObserver} The IntersectionObserver instance
 * @example
 * observeIntersection(document.querySelector('#myElement'), () => {
 *     console.log('Element is in view!');
 * });
*/
export function observeIntersection(element, callback) {
    Object.assign(new IntersectionObserver(([{isIntersecting}]) => 
        isIntersecting && callback()
    )).observe(element);
}

/**
 * Utility to convert a CSV string into an array of trimmed, non-empty strings
 * @param {string} csvString - The CSV string to convert
 * @param {string} [delimiter=','] - The delimiter to split on (defaults to comma)
 * @returns {Array<string>} A new array with trimmed, non-empty strings from the CSV
 * @example
 * csvToArray('apple, banana, cherry'); // Returns ['apple', 'banana', 'cherry']
 * csvToArray('apple; banana; cherry', ';'); // Returns ['apple', 'banana', 'cherry']
 * csvToArray('  hello  ,  world  , , foo '); // Returns ['hello', 'world', 'foo']
 */
export function csvToArray(csvString, delimiter = ',') {
    if (typeof csvString !== 'string') return [];
    if (csvString.trim() === '') return [];
    
    return csvString
        .split(delimiter)
        .map(item => item.trim())
        .filter(item => item); // Filter out empty strings
}

/**
 * ReverseGeocoder provides reverse geocoding functionality with caching and debounced requests.
 * 
 * It converts latitude and longitude coordinates into human-readable addresses by querying
 * the Nominatim OpenStreetMap API. To optimize performance and reduce network traffic, it:
 * 
 * - Caches results for previously requested coordinates.
 * - Debounces rapid requests using a leading call strategy to respond immediately on the first call.
 * - Deduplicates concurrent requests for the same coordinates.
 * 
 * @class
 */
class ReverseGeocoder {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.DEBOUNCE_DELAY = 1000;

    this.debounceTimer = null;
    this.hasExecutedImmediately = false;
    this.pendingResolvers = [];
    this.lastArgs = null; // To hold latest lat,lng for trailing call
  }

  /**
   * Get address from coordinates with leading debounce and caching
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<string|null>} Address or null on error
   */
  async getAddressFromCoordinates(lat, lng) {
    const cacheKey = `${lat},${lng}`;

    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Return existing promise if request is pending
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // If leading call not executed recently, execute immediately
    if (!this.hasExecutedImmediately) {
      this.hasExecutedImmediately = true;

      const immediatePromise = this.#fetchAddress(lat, lng)
        .then(result => {
          this.cache.set(cacheKey, result);
          this.pendingRequests.delete(cacheKey);

          // Resolve any queued resolvers with this result
          this.pendingResolvers.forEach(resolve => resolve(result));
          this.pendingResolvers = [];

          return result;
        })
        .finally(() => {
          // Reset flag after debounce delay
          setTimeout(() => {
            this.hasExecutedImmediately = false;
            // If there are queued calls, trigger trailing execution
            if (this.pendingResolvers.length > 0 && this.lastArgs) {
              this.#executeTrailing();
            }
          }, this.DEBOUNCE_DELAY);
        });

      this.pendingRequests.set(cacheKey, immediatePromise);
      return immediatePromise;
    }

    // For calls during debounce window, queue resolvers and update lastArgs
    this.lastArgs = { lat, lng };

    const trailingPromise = new Promise(resolve => {
      this.pendingResolvers.push(resolve);
    });

    // Clear and reset debounce timer for trailing call
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.#executeTrailing();
    }, this.DEBOUNCE_DELAY);

    return trailingPromise;
  }

  // Internal method to execute trailing call with latest args
  async #executeTrailing() {
    if (!this.lastArgs) return;

    const { lat, lng } = this.lastArgs;
    const cacheKey = `${lat},${lng}`;

    try {
      const result = await this.#fetchAddress(lat, lng);
      this.cache.set(cacheKey, result);
      this.pendingResolvers.forEach(resolve => resolve(result));
    } catch {
      this.pendingResolvers.forEach(resolve => resolve(null));
    } finally {
      this.pendingResolvers = [];
      this.pendingRequests.delete(cacheKey);
      this.lastArgs = null;
    }
  }

  /**
   * Fetch address from coordinates (uncached)
   * @private
   */
  async #fetchAddress(lat, lng) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const params = new URLSearchParams({
        format: 'json',
        lat,
        lon: lng,
        zoom: 18,
        addressdetails: 0
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        headers: { 'User-Agent': 'map-picker/1.0' },
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      return data.display_name || null;
    } catch (error) {
      console.error('Geocoding failed:', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
// Export a singleton instance of ReverseGeocoder
const geocoder = new ReverseGeocoder();
export const getAddressFromCoordinates = geocoder.getAddressFromCoordinates.bind(geocoder);


/**
 * Sets up keyboard controls for a Leaflet map
 * @param {HTMLElement} mapElement - The map container element
 * @param {Object} mapInstance - The Leaflet map instance
 * @param {Object} callbacks - Object containing callback functions
 * @param {Function} callbacks.setMarker - Function to set marker at coordinates
 * @param {Function} callbacks.resetMap - Function to reset the map
 * @param {Function} callbacks.confirmLocation - Function to confirm location
 * @param {Function} callbacks.markerSetEvent - Function to dispatch marker set event
 */
export function setupKeyboardControls(mapElement, mapInstance, callbacks) {
    const { setMarker, resetMap, confirmLocation, markerSetEvent } = callbacks;
    
    const keyHandlers = {
        'Space': (e) => {
            if (e.target.matches('[role=button]')) {
                e.target.click();
                return;
            }
            e.preventDefault();
            const center = mapInstance.getCenter();
            setMarker(center.lat, center.lng);
            markerSetEvent();
        },
        'Enter': (e) => {
            if (e.target.matches('[role=button]')) return;  // Ignore if focused on a button
            if (e.target.matches('a')) return; // Ignore if focused on a link
            e.preventDefault();
            confirmLocation();
        },
        'Minus': (e) => {
            e.preventDefault();
            mapInstance.zoomOut();
        },
        'Equal': (e) => {
            e.preventDefault();
            mapInstance.zoomIn();
        },
        'ArrowUp': (e) => {
            e.preventDefault();
            mapInstance.panBy([0, -50]);
        },
        'ArrowDown': (e) => {
            e.preventDefault();
            mapInstance.panBy([0, 50]);
        },
        'ArrowLeft': (e) => {
            e.preventDefault();
            mapInstance.panBy([-50, 0]);
        },
        'ArrowRight': (e) => {
            e.preventDefault();
            mapInstance.panBy([50, 0]);
        },
        'End': (e) => {
            e.preventDefault();
            mapInstance.setZoom(4);
        },
        'KeyR': (e) => {
            e.preventDefault();
            resetMap();
        },
        'KeyH': (e) => {
            e.preventDefault();
            alert('Map Keyboard Shortcuts:\n\n' +
                'Space: Place marker at map center\n' +
                'Enter: Confirm location\n' +
                'Plus/Minus: Zoom in/out\n' +
                'Arrow keys: Pan map\n' +
                'R: Reset map\n' +
                'Escape: Close popover'
            );
        }
    };

    mapElement.addEventListener('keydown', (e) => {
        if (e.metaKey) return;
        if (e.ctrlKey) return;
        const handler = keyHandlers[e.code];
        if (handler) handler(e);
    });
}


let Leaflet; // Will be imported dynamically in connectedCallback()

/* 🏠 Local version */
const BASE_URL = new URL('./vendor-leaflet', import.meta.url).pathname;
const LEAFLET_SCRIPT = 'leaflet-src.esm.min.js';
const LEAFLET_STYLESHEET = 'leaflet.min.css';

/* 🔗 CDN version */
// const BASE_URL = 'https://unpkg.com/leaflet@1.9.4/dist';
// const LEAFLET_SCRIPT = 'leaflet-src.esm.js';
// const LEAFLET_STYLESHEET = 'leaflet.css';

export default class MapPicker extends HTMLElement {
    static {
        // Preload appropriate marker icon based on device pixel ratio
        new Image().src = window.devicePixelRatio >= 2 
            ? `${BASE_URL}/images/marker-icon-2x.png`
            : `${BASE_URL}/images/marker-icon.png`;
    }

    constructor() {
        super();
        this.host = this.#determineHost();
        this.mapWrapper = this.closest('[popover]') ?? this.parentElement;
        this.confirmLocation = this.host.querySelectorAll(this.getAttribute('confirm'));
        this.resetLocation = this.host.querySelectorAll(this.getAttribute('reset'));
        this.initialCoords = this.getAttribute('initial-coordinates')?.split(',').map(Number)
            ?? [39.8283, -98.5795]; // Default to USA center
        this.initialZoom = parseInt(this.getAttribute('initial-zoom')) || 4; // Default zoom level
        this.map = null;
        this.marker = null;
        this.address = null; // Store the address of the marker
    }

    connectedCallback() {
        this.setAttribute('aria-busy', 'true'); // Initially busy while loading

        // Load Leaflet first, then initialize
        import(`${BASE_URL}/${LEAFLET_SCRIPT}`).then(module => {
            Leaflet = module;
            this.#init();
        }).catch(error => console.error('Failed to load Leaflet:', error));
        
        // Add the Leaflet CSS stylesheet
        this.addStylesheet(LEAFLET_STYLESHEET);
    }

    #determineHost() {
        const shadowRootHost = this.getAttribute('shadow-root-host');
        const host = this.getAttribute('host');
        if (shadowRootHost) return document.querySelector(shadowRootHost)?.shadowRoot;
        if (host) return document.querySelector(host);
        return this.getRootNode();
    }

    addStylesheet(path) {
        return new Promise((resolve) => {
            const element = document.createElement('link');
            element.rel = 'stylesheet';
            element.href = `${BASE_URL}/${path}`;
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
        this.#setupEventListeners();
    }

    resetMap() {
        if (this.map) this.map.remove();
        this.marker = null; // Reset marker reference
        this.#setupMap();
				this.map.getContainer().focus();
    }

    #setupMap() {
        // Set the default icon path for Leaflet
        Leaflet.Icon.Default.prototype.options.imagePath = `${BASE_URL}/images/`;
    
        this.map = new Leaflet.Map(this).setView(this.initialCoords, this.initialZoom);
    
        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const attribution = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | 
                            <a href="https://nominatim.org" title="Geocoding by Nominatim">Nominatim</a>`;
        const tileLayer = new Leaflet.TileLayer(tileUrl, {maxZoom: 19, attribution: attribution});
        this.#setAriaBusyWhenLoading(tileLayer);
        this.map.addLayer(tileLayer);
        
        this.#setupMapEventsListeners();
    }

    #setupMapEventsListeners() {
        this.map.on('click', (e) => {
            this.setMarker(e.latlng.lat, e.latlng.lng);
        });
    }

    #setupEventListeners() {
        // Intersection Observer to recalculate map size when it becomes visible
        if (this.mapWrapper) observeIntersection(this.mapWrapper, () => {
            this.map.invalidateSize();
            if (this.hasAttribute('map-autofocus')) this.map.getContainer().focus();
        });

        this.#setupKeyboardControls(this.map.getContainer());

        this.confirmLocation?.forEach(el=>{
            el.addEventListener('click', e => this.handleConfirm(e));
        });
    
        this.resetLocation?.forEach(el=>{
            if (el.dataset.eventAdded) return; // Avoid duplicate listeners
            el.addEventListener('click', e => {
                // 📡 Dispatch a 'map-picker-reset' custom event
                this.host.dispatchEvent(new CustomEvent('map-picker-reset'));
            });
        });

        // 📡 Listen for the map-picker-reset event
        this.host.addEventListener('map-picker-reset', () => { this.resetMap() });
    }

    handleConfirm(e) {
        if (!this.marker) return alert('Please select a location on the map first.');

        // 📡 Dispatch a custom event to notify that the location has been confirmed
        this.#dispatchEventWithMarkerData('map-picker-confirm');

        // this.confirmLocation?.forEach(el=>el.setAttribute('aria-busy', 'true'));
    }

    #setupKeyboardControls(mapElement) {
        const keyHandlers = {
            'Space': (e) => {
                if (e.target.matches('[role=button]')) { // press Space on a button
                    e.target.click();
                    return;
                }
                e.preventDefault();
                const center = this.map.getCenter();
                this.setMarker(center.lat, center.lng);
            },
            'Enter': (e) => {
                if (e.target.matches('[role=button]')) return; // Ignore if focused on a button
                e.preventDefault();
                this.handleConfirm(e);
								this.closest('[popover]')?.hidePopover();
            },
            // 'Escape': (e) => {
            //     e.preventDefault();
            //     this.closest('[popover]')?.hidePopover();
            // }
            'Minus': (e) => {
                e.preventDefault();
                this.map.zoomOut();
            },
            'Equal': (e) => {
                e.preventDefault();
                this.map.zoomIn();
            },
            'ArrowUp': (e) => {
                e.preventDefault();
                this.map.panBy([0, -50]); // Move up
            },
            'ArrowDown': (e) => {
                e.preventDefault();
                this.map.panBy([0, 50]); // Move down
            },
            'ArrowLeft': (e) => {
                e.preventDefault();
                this.map.panBy([-50, 0]); // Move left
            },
            'ArrowRight': (e) => {
                e.preventDefault();
                this.map.panBy([50, 0]); // Move right
            },
            'End': (e) => {
                e.preventDefault();
                this.map.setZoom(4); // Reset zoom level
            },
            'KeyR': (e) => {
                e.preventDefault();
                this.resetMap(); // Reset the map
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
            const handler = keyHandlers[e.code];
            if (handler) handler(e);
        });
    }

    #setAriaBusyWhenLoading(tileLayer) {
        let loadingTiles = 0; // Track loading tiles count
        tileLayer.on('loading', () => {
            loadingTiles++;
            this.setAttribute('aria-busy', 'true');
        });
        tileLayer.on('load', () => {
            loadingTiles--;
            if (!loadingTiles) this.removeAttribute('aria-busy');
        });
    }

    async setMarker(lat, lng) {
        // Set marker at given coordinates and fetch address
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = new Leaflet.Marker([lat, lng]).addTo(this.map);
        
        // Show popup with loading state
        this.marker.bindPopup(MapPicker.#createPopup({ loading: true })).openPopup();
        
        // Get address and update popup
        const address = await getAddressFromCoordinates(lat, lng);
        this.address = address || null;
        this.marker.setPopupContent(MapPicker.#createPopup({ address, coordinates: { lat, lng } }));

        // 📡 Dispatch a custom event to notify that the location has been confirmed
        this.#dispatchEventWithMarkerData('map-picker-marker-set');
    }
    
    // async #getAddressFromCoordinates(lat, lng) { // not debounced
    //     // Get address from coordinates using reverse geocoding
    //     const geocodingParams = `format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
    //     const url = `https://nominatim.openstreetmap.org/reverse?${geocodingParams}`;
    //     // 'app-name/version author'
    //     const headers = { 'User-Agent': 'map-picker/1.0' };
    //     try {
    //         const response = await fetch(url, { headers });
    //         const data = await response.json();
    //         return data.display_name || null;
    //     } catch (error) {
    //         console.error('Failed to get address:', error);
    //         return null;
    //     }
    // }

    // Dispatch a custom event with marker data
    #dispatchEventWithMarkerData(eventName) {
        if (!this.marker) return;
        this.host.dispatchEvent(new CustomEvent(eventName, {
            detail: {
                latitude: this.marker.getLatLng().lat.toFixed(6),
                longitude: this.marker.getLatLng().lng.toFixed(6),
                address: this.address || null
            }
        }));
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

}

customElements.define('map-picker', MapPicker);

// Utils.

function observeIntersection(element, callback) {
    Object.assign(new IntersectionObserver(([{isIntersecting}]) => 
        isIntersecting && callback()
    )).observe(element);
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
 * Usage example:
 * ```
 * const geocoder = new ReverseGeocoder();
 * const address = await geocoder.getAddressFromCoordinates(40.7128, -74.0060);
 * console.log(address);
 * ```
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
// Usage:
const geocoder = new ReverseGeocoder();
export const getAddressFromCoordinates = geocoder.getAddressFromCoordinates.bind(geocoder);

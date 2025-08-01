# map-picker
The web component takes a CSS selector for a “Confirm Location” button via the `confirm` attribute, e.g:
```js
<map-picker confirm="#confirm-location"></map-picker>
```

When clicked this button dispatches a `map-picker-confirm` event on the document (or on the `RootNode`) with the following data inside the event object: `{latitude, longitude, address}`

Additionally, when the map is clicked (or the <knd>Space</knd> button is pressed) a marker (pin) is placed on the map and a `map-picker-marker-set` event is dispatched on the document (or on the `RootNode`) with the following data inside the event object: `{latitude, longitude, address}`

Works inside the Light DOM or inside another web component’s Shadow DOM. 

## Demos from CodePen
* [Map for location picker](https://codepen.io/nonsalant/pen/ZYGoJab)
* [Map inside a modal (popover)](https://codepen.io/nonsalant/pen/LEVmjQz)

## Importing the component files

### Importing the component from a CDN
```html
<link rel="stylesheet" href="https://unpkg.com/map-picker-component/map-picker.css">
<script type="module" src="https://unpkg.com/map-picker-component/map-picker.js"></script>
```

### Importing the component from local files
```html
<link rel="stylesheet" href="./map-picker/map-picker.css">
<script type="module" src="./map-picker/map-picker.js"></script>
```

Note: by default the [Leaflet](https://github.com/Leaflet/Leaflet) script and style will be dynamically included from local minified files in the `vendor-leaflet` folder.

If you'd like to load the Leaflet files from a CDN (and not minified) you should edit the map-picker.js file by commenting out 3 lines and uncommenting the other 3 at the top of the file:

```js
let Leaflet; // Will be imported dynamically in connectedCallback()

/* 🏠 Local version */
// const BASE_URL = import.meta.resolve('./vendor-leaflet/');
// const LEAFLET_SCRIPT = 'leaflet-src.esm.min.js';
// const LEAFLET_STYLESHEET = 'leaflet.min.css';

/* 🔗 CDN version */
const BASE_URL = 'https://unpkg.com/leaflet@1.9.4/dist/';
const LEAFLET_SCRIPT = 'leaflet-src.esm.js';
const LEAFLET_STYLESHEET = 'leaflet.css';
```
If you do this, you can also remove the `vendor-leaflet` folder from your project, as you will only need the `map-picker.js` and `map-picker.css` files (as in the CodePen examples linked above).

## Usage

### Add the map-picker element to your HTML:
```html
<map-picker 
	confirm=".confirm-location" 
	initial-coordinates="39.8283,-98.5795"
	initial-zoom="4"
></map-picker>
```

### Add the confirm button to your HTML:
Note: don't put this inside the `<map-picker>` element. 
```html
<button class="confirm-location" type="button">
    <span aria-hidden="true">✅</span> <span>Confirm Location</span>
</button>
```

### Handle the `map-picker-confirm` event in your JavaScript
This can be done in a JavaScript file:
```js
document.addEventListener('map-picker-confirm', (event) => {
    const { latitude, longitude, address } = event.detail;
    console.log(`Location confirmed: ${latitude}, ${longitude} - ${address}`);
});
```
...or inline in your HTML:
```html
<script type="module">
document.addEventListener('map-picker-confirm', (event) => {
    const { latitude, longitude, address } = event.detail;
    console.log(`Location confirmed: ${latitude}, ${longitude} - ${address}`);
});
</script>

<map-picker confirm=".confirm-location"></map-picker>
```

## Attributes for the `<map-picker>` element

| Attribute              | Default Value        | Description                                                             |
|------------------------|----------------------|-------------------------------------------------------------------------|
| `confirm`              | `""`                 | CSS selector for the “Confirm Location” button(s).                      |
| `reset`                | `""`                 | CSS selector for the “Reset Map” button(s).                             |
| `initial-coordinates`  | `"39.8283,-98.5795"` | Initial coordinates to center the map view in the format `latitude,longitude` (no spaces). Defaults to USA. |
| `initial-zoom`         | `"4"`                | Initial zoom level for the map.                                         |
| `marker-coordinates`   | `undefined`          | Coordinates for an initial marker in the format `latitude,longitude` (no spaces). If not set, no marker will be initially shown. |
| `map-autofocus`        | `undefined`          | Doesn't need a value. If this attribute is present the map will be focused when the it becomes visible. Useful when opening the map in a modal. |
| `shadow-root-host`     | `undefined`          | If this attribute is present, the script will look for the "Confirm Location" and "Reset Map" buttons inside the Shadow DOM of the element with this selector and the events will be dispatched directly on the shadowRoot of that element. |
| `host`                 | `undefined`          | If this attribute is present, the script will look for the "Confirm Location" and "Reset Map" buttons inside the Light DOM of the element with this selector and the events will be dispatched directly on that element. If not set the button(s) are assumed to be anywhere in the body. Is ignored if `shadow-root-host` is also set. |


## Events

### `map-picker-confirm`
This event is dispatched when the user clicks the “Confirm Location” button(s) (defined by a CSS selector in the `confirm` attribute).

The event object looks like this:
```json
{
  "lat": "39.842286",
  "lng": "-98.613281",
  "address": "120 Road, Smith County, Kansas, 66952, United States"
}
```
Example implementation:
```js
document.addEventListener('map-picker-confirm', (event) => {
    const { lat, lng, address } = event;
    console.log(`Location confirmed: ${lat}, ${lng} - ${address}`);
});
```

### `map-picker-reset`
This event is dispatched when the user clicks the “Reset Map” button(s) (defined by a CSS selector in the optional `reset` attribute). 

Example implementation:
```js
document.addEventListener('map-picker-reset', (event) => {
    console.log('Location reset');
});
```

## `map-picker-marker-set`
This event is dispatched when the user sets a marker on the map by clicking on it. The event object looks like this:
```json
{
  "lat": "39.842286",
  "lng": "-98.613281",
  "address": "120 Road, Smith County, Kansas, 66952, United States"
}
```
Example implementation:
```js
document.addEventListener('map-picker-marker-set', (event) => {
    const { lat, lng, address } = event.detail;
    console.log(`Marker set: ${lat}, ${lng} - ${address}`);
});
```

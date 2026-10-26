import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
export const buildingColor: ExpressionSpecification = ['match', ['%', ['floor', ['/', ['to-number', ['get', 'render_height'], ['get', 'height'], 11], 7]], 5], 0, '#f6c9ce', 1, '#f8dbad', 2, '#c4dce9', 3, '#cfe0b9', '#d8cae9'];
export function cartoonStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { town: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors · Roads: OSRM' } },
    layers: [
      { id: 'base', type: 'background', paint: { 'background-color': '#fff6e4' } },
      { id: 'green-spaces', type: 'fill', source: 'town', 'source-layer': 'landcover', paint: { 'fill-color': '#cee6b5', 'fill-opacity': .75 } },
      { id: 'parks', type: 'fill', source: 'town', 'source-layer': 'park', paint: { 'fill-color': '#c3e2ac', 'fill-outline-color': '#b0ce99' } },
      { id: 'landuse', type: 'fill', source: 'town', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['residential', 'industrial', 'commercial', 'hospital']]], paint: { 'fill-color': ['match', ['get', 'class'], 'hospital', '#fae1dd', 'industrial', '#eee1ed', '#f9ecd8'], 'fill-opacity': .55 } },
      { id: 'water', type: 'fill', source: 'town', 'source-layer': 'water', paint: { 'fill-color': '#bce5ed' } },
      { id: 'waterways', type: 'line', source: 'town', 'source-layer': 'waterway', paint: { 'line-color': '#a4d9e5', 'line-width': 3 } },
      { id: 'building-shadow', type: 'fill', source: 'town', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#8e9c8450', 'fill-translate': [2, 3] } },
      { id: 'building-flat', type: 'fill', source: 'town', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': buildingColor, 'fill-outline-color': '#fffdf5' } },
      { id: 'road-outline', type: 'line', source: 'town', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ead7b9', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 15, 7, 18, 23] } },
      { id: 'road-fill', type: 'line', source: 'town', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'class'], 'motorway', '#ffe0a3', 'trunk', '#ffe5b9', 'path', '#f5e6cb', '#fffdf4'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.3, 15, 4.5, 18, 18] } },
      { id: 'railways', type: 'line', source: 'town', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#bcb1bb', 'line-width': 1.2, 'line-dasharray': [3, 3] } },
      { id: 'street-names', type: 'symbol', source: 'town', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-max-angle': 25 }, paint: { 'text-color': '#8a806c', 'text-halo-color': '#fffaf0', 'text-halo-width': 2 } },
      { id: 'buildings-3d', type: 'fill-extrusion', source: 'town', 'source-layer': 'building', minzoom: 13, layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': buildingColor, 'fill-extrusion-height': ['min', 70, ['max', 9, ['*', .55, ['to-number', ['get', 'render_height'], ['get', 'height'], 18]]]], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } },
    ],
    light: { anchor: 'viewport', color: '#fff5de', intensity: .42, position: [1.3, 205, 38] },
  };
}

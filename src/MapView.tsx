import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import { BusFront, LocateFixed, Maximize2, Minus, Plus } from 'lucide-react';
import type { BusEstimate, Route } from './types';

interface Props { route: Route; buses: BusEstimate[]; selected: number; onSelect: (seq: number) => void; traffic: boolean; tilted: boolean; reset: number }
export default function MapView({ route, buses, selected, onSelect, traffic, tilted, reset }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const stopMarkers = useRef<maplibregl.Marker[]>([]);
  const busMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [fatal, setFatal] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  function fit() {
    if (!map.current || !route.stops.length) return;
    const bounds = new maplibregl.LngLatBounds();
    route.stops.forEach(s => bounds.extend([s.lng, s.lat]));
    map.current.fitBounds(bounds, { padding: { top: 110, bottom: 100, left: 85, right: 85 }, maxZoom: 15, duration: 650 });
  }
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({ container: container.current,
        center: [114.207, 22.317], zoom: 14.4, maxZoom: 19, minZoom: 10,
        attributionControl: { compact: true },
        style: { version: 8, sources: {
          osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' },
        }, layers: [{ id: 'base', type: 'background', paint: { 'background-color': '#dfebe8' } },
          { id: 'streets', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.6, 'raster-contrast': -.12, 'raster-opacity': .88 } }] },
      });
      map.current = instance;
      instance.on('load', () => setReady(true));
      instance.on('error', e => { if (e.error?.message) setTileFailed(true); });
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(container.current);
      return () => { observer.disconnect(); instance.remove(); map.current = null; };
    } catch { setFatal(true); }
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const data: Feature<LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.stops.map(s => [s.lng, s.lat]) } };
    if (instance.getSource('route')) (instance.getSource('route') as GeoJSONSource).setData(data);
    else {
      instance.addSource('route', { type: 'geojson', data });
      instance.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': .9 } });
      instance.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#24766b', 'line-width': 4, 'line-dasharray': [2, 1] } });
    }
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = route.stops.map(stop => {
      const element = document.createElement('button');
      element.className = 'map-stop';
      element.textContent = String(stop.seq).padStart(2, '0');
      element.title = stop.name;
      element.setAttribute('aria-label', `Select stop ${stop.seq}: ${stop.name}`);
      element.onclick = () => selectRef.current(stop.seq);
      return new maplibregl.Marker({ element }).setLngLat([stop.lng, stop.lat]).addTo(instance);
    });
    fit();
  }, [ready, route, reset]);
  useEffect(() => {
    stopMarkers.current.forEach((m, i) => m.getElement().classList.toggle('selected', route.stops[i]?.seq === selected));
  }, [selected, ready, route]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const ids = new Set(buses.map(bus => bus.id));
    busMarkers.current.forEach((marker, id) => { if (!ids.has(id)) { marker.remove(); busMarkers.current.delete(id); } });
    buses.forEach(bus => {
      const existing = busMarkers.current.get(bus.id);
      if (existing) { existing.setLngLat([bus.lng, bus.lat]); return; }
      const element = document.createElement('button');
      element.className = 'map-bus';
      element.innerHTML = '<svg width="22" height="26" viewBox="0 0 24 28" fill="none" aria-hidden="true"><rect x="4" y="2" width="16" height="22" rx="4" fill="currentColor"/><rect x="7" y="6" width="10" height="8" rx="1" fill="#164c46"/><path d="M6 23v3m12-3v3" stroke="currentColor" stroke-width="3"/><circle cx="8" cy="19" r="1.5" fill="#164c46"/><circle cx="16" cy="19" r="1.5" fill="#164c46"/></svg>';
      element.setAttribute('aria-label', `Estimated bus approaching ${bus.nextStop.name}`);
      element.onclick = () => selectRef.current(bus.nextStop.seq);
      const description = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = 'Estimated location · not GPS';
      const body = document.createElement('p');
      body.textContent = `Towards ${bus.nextStop.name}. ${bus.confidence === 'medium' ? 'Moderate' : 'Low'} confidence; inferred from arrival predictions. No vehicle identity available.`;
      description.append(title, body);
      const marker = new maplibregl.Marker({ element }).setLngLat([bus.lng, bus.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setDOMContent(description)).addTo(instance);
      busMarkers.current.set(bus.id, marker);
    });
  }, [buses, ready]);
  useEffect(() => { map.current?.easeTo({ pitch: tilted ? 48 : 0, bearing: tilted ? -12 : 0, duration: 700 }); }, [tilted]);
  useEffect(() => {
    const instance = map.current;
    const key = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!instance || !ready || !key) return;
    if (traffic && !instance.getSource('traffic')) {
      instance.addSource('traffic', { type: 'raster', tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`], tileSize: 256, attribution: 'Traffic © TomTom' });
      instance.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .75 } }, 'route-casing');
    }
    if (instance.getLayer('traffic')) instance.setLayoutProperty('traffic', 'visibility', traffic ? 'visible' : 'none');
  }, [traffic, ready]);
  return <div className="map-shell">
    <div ref={container} className="map-canvas" aria-label="Interactive Kai Tak route map" />
    {fatal && <div className="map-fallback"><BusFront size={36}/><h3>Map rendering is unavailable</h3><p>This browser needs WebGL to display the map. The stop list and arrival times still work.</p></div>}
    <div className="map-heading"><span className="eyebrow">KOWLOON, HONG KONG</span><h2>Around Kai Tak<span>啟德</span></h2></div>
    <div className="map-controls"><button onClick={() => map.current?.zoomIn()} aria-label="Zoom in"><Plus size={19}/></button><button onClick={() => map.current?.zoomOut()} aria-label="Zoom out"><Minus size={19}/></button><span/><button onClick={fit} aria-label="Fit route on map"><Maximize2 size={18}/></button><button onClick={fit} aria-label="Return to Kai Tak"><LocateFixed size={19}/></button></div>
    <div className="map-legend"><span><i className="legend-route"/>Approximate route</span><span><i className="legend-stop"/>Bus stop</span><span><i className="legend-bus"/>Estimated bus</span></div>
    {tileFailed && <div className="tile-warning">Some map layers could not load. Check your connection.</div>}
    <div className="map-caption">Dotted lines connect stops; exact road geometry is not available.</div>
  </div>;
}

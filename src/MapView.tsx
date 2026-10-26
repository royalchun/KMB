import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import { BusFront, LocateFixed, Maximize2, Minus, Plus, RotateCw } from 'lucide-react';
import { traversed } from './geometry';
import { cartoonStyle } from './cartoonStyle';
import { toyBuses } from './toyBuses';
import { useTraffic } from './useTraffic';
import type { MapRoute } from './types';

interface Props { routes: MapRoute[]; activeKey: string; selected: number; onSelect: (key: string, seq: number) => void; tilted: boolean; traffic: boolean; reset: number }
export default function MapView({ routes, activeKey, selected, onSelect, tilted, traffic, reset }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const stopMarkers = useRef<{ key: string; seq: number; marker: maplibregl.Marker }[]>([]);
  const busMarkers = useRef(new Map<string, maplibregl.Marker>());
  const [ready, setReady] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [fatal, setFatal] = useState(false);
  const [focusId, setFocusId] = useState('');
  const trafficFeed = useTraffic(traffic);
  const flatCamera = useRef<{ center: maplibregl.LngLat; zoom: number } | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const routesRef = useRef(routes); routesRef.current = routes;
  const identity = routes.map(r => `${r.key}:${r.route.direction}:${r.route.stops.map(s => s.id).join(',')}:${!!r.route.geometry}`).join('|');
  const focus = routes.flatMap(r => r.buses.map(bus => ({ r, bus, id: `${r.key}:${r.route.direction}:${bus.id}` }))).find(b => b.id === focusId)
    || routes.find(r => r.key === activeKey)?.buses.slice(0, 1).map(bus => ({ r: routes.find(r => r.key === activeKey)!, bus, id: `${activeKey}:${routes.find(r => r.key === activeKey)!.route.direction}:${bus.id}` }))[0];
  function fit() {
    const stops = routesRef.current.flatMap(r => r.route.stops);
    if (!map.current || !stops.length) return;
    const bounds = new maplibregl.LngLatBounds();
    stops.forEach(s => bounds.extend([s.lng, s.lat]));
    map.current.fitBounds(bounds, { padding: { top: 110, bottom: 100, left: 65, right: 65 }, maxZoom: 15, duration: 650 });
  }
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, center: [114.207, 22.317], zoom: 14.4, maxZoom: 19, minZoom: 10,
        attributionControl: { compact: true },
        style: cartoonStyle() });
      map.current = instance;
      // Stops and routes must not wait for every external raster tile to load.
      instance.on('style.load', () => {
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
        const ctx = canvas.getContext('2d')!;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(10, 5); ctx.lineTo(20, 12); ctx.lineTo(10, 19); ctx.stroke();
        const waves = document.createElement('canvas'); waves.width = 96; waves.height = 96;
        const wave = waves.getContext('2d')!; wave.fillStyle = '#bce5ed'; wave.fillRect(0,0,96,96); wave.strokeStyle = '#e7f8fa'; wave.lineWidth = 2;
        for(const [x,y] of [[10,20],[50,65]]) { wave.beginPath(); wave.moveTo(x,y); wave.quadraticCurveTo(x+8,y+5,x+16,y); wave.quadraticCurveTo(x+24,y-5,x+32,y); wave.stroke(); }
        instance.addImage('water-doodle', wave.getImageData(0,0,96,96)); instance.setPaintProperty('water','fill-pattern','water-doodle');
        instance.addImage('direction-arrow', ctx.getImageData(0, 0, 32, 24), { sdf: true });
        instance.addSource('roads', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'road-casing', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } });
        instance.addLayer({ id: 'road-line', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-offset': ['get', 'offset'] } });
        instance.addLayer({ id: 'direction-arrows', type: 'symbol', source: 'roads', layout: { 'symbol-placement': 'line', 'symbol-spacing': 100, 'icon-image': 'direction-arrow', 'icon-size': .55, 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' }, paint: { 'icon-color': '#fff', 'icon-halo-color': ['get', 'color'], 'icon-halo-width': 2 } });
        instance.addSource('trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'trail-clear', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': .9 } });
        instance.addLayer({ id: 'trail-ring', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-dasharray': [.1, 1.4] } });
        instance.addLayer({ id: 'trail-hole', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 3, 'line-dasharray': [.1, 2.9] } });
        instance.addSource('toy-buses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'toy-bus-models', type: 'fill-extrusion', source: 'toy-buses', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['get','color'], 'fill-extrusion-height': ['get','height'], 'fill-extrusion-base': ['get','base'], 'fill-extrusion-opacity': 1 } });
        instance.on('click','toy-bus-models', e => { const props=e.features?.[0]?.properties; if(props) { setFocusId(props.busId); selectRef.current(props.routeKey, Number(props.seq)); } });
        instance.addSource('traffic', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'traffic-outline', type: 'line', source: 'traffic', layout: { 'line-cap':'round', 'line-join':'round' }, paint: { 'line-color':'#ffffff', 'line-width':7, 'line-offset':7 } }, 'road-casing');
        instance.addLayer({ id: 'traffic-speeds', type: 'line', source: 'traffic', layout: { 'line-cap':'round', 'line-join':'round' }, paint: { 'line-color':['get','color'], 'line-width':4.5, 'line-offset':7, 'line-opacity': .95 } }, 'road-casing');
        for(const landmark of [ { coordinates:[114.1936,22.3243], icon:'🏟️', name:'Kai Tak Stadium' }, { coordinates:[114.213,22.3055], icon:'⛴️', name:'Cruise Terminal' }, { coordinates:[114.207,22.322], icon:'🌳', name:'Our neighbourhood' } ]) {
          const element = document.createElement('div'); element.className='town-landmark'; element.setAttribute('aria-hidden','true');
          const icon=document.createElement('span'); icon.textContent=landmark.icon; const label=document.createElement('small'); label.textContent=landmark.name; element.append(icon,label);
          new maplibregl.Marker({element, anchor:'bottom'}).setLngLat(landmark.coordinates as [number,number]).addTo(instance);
        }
        instance.on('click','traffic-speeds', e => {
          const properties=e.features?.[0]?.properties; if(!properties)return;
          const content=document.createElement('div');const title=document.createElement('strong');title.textContent=properties.name || 'Monitored road';
          const body=document.createElement('p');body.textContent=`Reported speed: ${properties.speed} km/h · HK Transport Department`;content.append(title,body);
          new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(content).addTo(instance);
        });
        instance.on('mouseenter','traffic-speeds',()=>{instance.getCanvas().style.cursor='pointer';});
        instance.on('mouseleave','traffic-speeds',()=>{instance.getCanvas().style.cursor='';});
        setReady(true);
      });
      instance.on('error', e => { if (e.error?.message) setTileFailed(true); });
      instance.on('rotate', () => busMarkers.current.forEach(marker => {
        const arrow = marker.getElement().querySelector<HTMLElement>('.bus-direction');
        if (arrow) arrow.style.transform = `rotate(${Number(arrow.dataset.bearing || 0) - instance.getBearing()}deg)`;
      }));
      const observer = new ResizeObserver(() => instance.resize()); observer.observe(container.current);
      return () => { observer.disconnect(); instance.remove(); map.current = null; };
    } catch { setFatal(true); }
  }, []);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready) return;
    stopMarkers.current.forEach(({ marker }) => marker.remove());
    stopMarkers.current = routes.flatMap((r, index) => r.route.stops.map(stop => {
      const element = document.createElement('button'); element.className = 'map-stop'; element.dataset.route = r.route.route;
      element.style.borderColor = r.color; element.style.setProperty('--route-color', r.color);
      element.textContent = String(stop.seq).padStart(2, '0'); element.title = `${r.route.route}: ${stop.name}`;
      element.setAttribute('aria-label', `Select ${r.route.route} stop ${stop.seq}: ${stop.name}`);
      element.onclick = () => selectRef.current(r.key, stop.seq);
      const marker = new maplibregl.Marker({ element, offset: routes.length > 1 ? [index * 5 - 5, 0] : [0, 0] }).setLngLat([stop.lng, stop.lat]).addTo(instance);
      return { key: r.key, seq: stop.seq, marker };
    }));
    if (!tilted) fit();
  }, [ready, identity, reset]);
  useEffect(() => { stopMarkers.current.forEach(({ key, seq, marker }) => marker.getElement().classList.toggle('selected', key === activeKey && seq === selected)); }, [activeKey, selected, identity, ready]);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready) return;
    const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features: routes.filter(r => r.route.geometry).map((r, i) => ({ type: 'Feature', properties: { color: r.color, offset: routes.length > 1 ? (i - 1) * 3 : 0 }, geometry: { type: 'LineString', coordinates: r.route.geometry!.segments.flat() } })) };
    (instance.getSource('roads') as GeoJSONSource).setData(data);
    (instance.getSource('toy-buses') as GeoJSONSource).setData(toyBuses(routes));
    const trail = focus?.r.route.geometry ? traversed(focus.r.route.geometry.segments, focus.bus.segment, focus.bus.progress) : [];
    (instance.getSource('trail') as GeoJSONSource).setData({ type: 'FeatureCollection', features: trail.length > 1 ? [{ type: 'Feature', properties: { color: focus!.r.color }, geometry: { type: 'LineString', coordinates: trail } }] : [] });
    const visible = routes.flatMap(r => r.route.geometry ? r.buses.map(bus => ({ r, bus, id: `${r.key}:${r.route.direction}:${bus.id}` })) : []);
    const ids = new Set(visible.map(b => b.id));
    busMarkers.current.forEach((m, id) => { if (!ids.has(id)) { m.remove(); busMarkers.current.delete(id); } });
    visible.forEach(({ r, bus, id }) => {
      let marker = busMarkers.current.get(id);
      if (!marker) {
        const element = document.createElement('button'); element.className = 'map-bus hk-bus'; element.dataset.route = r.route.route;
        element.style.setProperty('--route-color', r.color);
        const pointer = document.createElement('span'); pointer.className = 'bus-direction'; pointer.setAttribute('aria-hidden', 'true');
        const image = document.createElement('img'); image.src = '/hk-bus.svg'; image.alt = ''; image.width = 46; image.height = 58;
        const badge = document.createElement('span'); badge.className = 'bus-route-badge'; badge.textContent = r.route.route;
        element.append(pointer, image, badge);
        element.setAttribute('aria-label', `${r.route.route} estimated bus towards ${bus.nextStop.name}`);
        element.onclick = () => { setFocusId(id); selectRef.current(r.key, bus.nextStop.seq); };
        const description = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `${r.route.route} · estimated location`;
        const text = document.createElement('p'); text.textContent = `Towards ${bus.nextStop.name}. ${bus.confidence} confidence. Road position and dotted progress are inferred from ETAs, not GPS history.`; description.append(title, text);
        marker = new maplibregl.Marker({ element }).setPopup(new maplibregl.Popup({ offset: 28 }).setDOMContent(description)).setLngLat([bus.lng, bus.lat]).addTo(instance);
        busMarkers.current.set(id, marker);
      }
      marker.setLngLat([bus.lng, bus.lat]);
      const arrow = marker.getElement().querySelector<HTMLElement>('.bus-direction')!;
      arrow.dataset.bearing = String(bus.bearing || 0); arrow.style.transform = `rotate(${(bus.bearing || 0) - instance.getBearing()}deg)`;
      marker.getElement().classList.toggle('focused-bus', focus?.id === id);
    });
  }, [routes, focus?.id, ready]);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready) return;
    instance.setLayoutProperty('buildings-3d', 'visibility', tilted ? 'visible' : 'none');
    instance.setLayoutProperty('toy-bus-models', 'visibility', tilted ? 'visible' : 'none');
    instance.setLayoutProperty('building-flat', 'visibility', tilted ? 'none' : 'visible');
    instance.setLayoutProperty('building-shadow', 'visibility', tilted ? 'none' : 'visible');
    if (tilted) {
      flatCamera.current = { center: instance.getCenter(), zoom: instance.getZoom() };
      const active = routesRef.current.find(r => r.key === activeKey) || routesRef.current[0];
      const bus = active?.buses[0];
      const stop = active?.route.stops.find(s => s.seq === selected) || active?.route.stops[0];
      instance.easeTo({ center: bus ? [bus.lng,bus.lat] : stop ? [stop.lng,stop.lat] : instance.getCenter(), zoom: Math.max(16.7, instance.getZoom()), pitch: 58, bearing: -25, duration: 900 });
    } else instance.easeTo({ center: flatCamera.current?.center || instance.getCenter(), zoom: flatCamera.current?.zoom || instance.getZoom(), pitch: 0, bearing: 0, duration: 700 });
  }, [tilted, ready]);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready) return;
    (instance.getSource('traffic') as GeoJSONSource).setData(traffic && trafficFeed.data ? trafficFeed.data : { type: 'FeatureCollection', features: [] });
  }, [trafficFeed.data, traffic, ready]);
  const unrouted = routes.filter(r => !r.route.geometry);
  return <div className={`map-shell cartoon-map ${tilted ? 'map-in-3d' : ''}`} data-map-mode={tilted ? '3d' : '2d'} data-model-parts={tilted ? toyBuses(routes).features.length : 0} data-traffic-segments={traffic ? trafficFeed.data?.features.length || 0 : 0} data-road-routes={routes.filter(r => r.route.geometry).length}>
    <div ref={container} className="map-canvas" aria-label="Interactive Kai Tak route map"/>
    {fatal && <div className="map-fallback"><BusFront size={36}/><h3>Map rendering is unavailable</h3><p>This browser needs WebGL. The arrival board still works.</p></div>}
    <div className="map-heading"><span className="eyebrow">KOWLOON, HONG KONG</span><h2>{tilted ? 'Kai Tak toy town' : 'Hello, Kai Tak!'}<span>啟德</span></h2></div>
    <div className="map-controls"><button onClick={() => map.current?.zoomIn()} aria-label="Zoom in"><Plus size={19}/></button><button onClick={() => map.current?.zoomOut()} aria-label="Zoom out"><Minus size={19}/></button><span/>{tilted && <button onClick={() => map.current?.easeTo({bearing:map.current.getBearing()+45,duration:500})} aria-label="Rotate toy town"><RotateCw size={18}/></button>}<button onClick={fit} aria-label="Fit route on map"><Maximize2 size={18}/></button><button onClick={fit} aria-label="Return to Kai Tak"><LocateFixed size={19}/></button></div>
    <div className="map-legend">{routes.map(r => <span key={r.key}><i className="legend-route" style={{ borderColor: r.color }}/>{r.route.route} →</span>)}<span><i className="legend-stop"/>Stop</span></div>
    {traffic && <div className="traffic-card" role="status"><strong>🚦 Reported road speeds</strong><div className="speed-key"><span><i style={{background:'#eb6c77'}}/>&lt;20</span><span><i style={{background:'#f5bb51'}}/>20–40</span><span><i style={{background:'#58b68b'}}/>&gt;40 km/h</span></div><p>{trafficFeed.loading ? 'Checking Transport Department…' : trafficFeed.error || (trafficFeed.data?.features.length ? `${trafficFeed.data.features.length} monitored segments · ${trafficFeed.sourceLabel}` : 'No current readings in this area.')}</p><small>Uncoloured roads have no current data. Source: HK Transport Department.</small></div>}
    {tilted && <div className="toy-notice">3D prototype · toy scale & illustrative heights</div>}
    {tileFailed && <div className="tile-warning">Some map layers could not load. Check your connection.</div>}
    <div className="map-caption">{unrouted.length ? `Road paths pending for ${unrouted.map(r => r.route.route).join(', ')}; stops shown without straight connecting lines.` : focus ? `Hollow dotted trail: ${focus.r.route.route} selected bus’s estimated progress · not GPS history` : 'Arrows show travel direction · road paths are estimates'}</div>
  </div>;
}

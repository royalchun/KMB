import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BusFront, Check, ChevronDown, CircleHelp, ExternalLink, Layers, MapPin, Radio, RefreshCw, Route as RouteIcon, Share2, Signal, TriangleAlert, X } from 'lucide-react';
import MapView from './MapView';
import snapshots from './route-snapshot.json';
import { estimateBuses, fresh } from './estimate';
import { useRoutes, keyOf, presets, routeColor } from './useRoutes';
import type { Direction, Feed, Operator, Route, Selection } from './types';

const fallback = (direction: Direction) => snapshots.find(s => s.direction === direction) as Route;
const initial: Selection = { operator: 'ctb', route: '22D', direction: 'outbound', serviceType: '1' };
function fromLink(): Selection {
  const params = new URLSearchParams(window.location.search);
  const operator = params.get('operator'), route = params.get('route'), direction = params.get('direction'), serviceType = params.get('serviceType');
  return { operator: operator === 'kmb' ? 'kmb' : 'ctb', route: route && /^[A-Z0-9]{1,8}$/.test(route) ? route : '22D', direction: direction === 'inbound' ? 'inbound' : 'outbound', serviceType: serviceType && /^[1-9][0-9]?$/.test(serviceType) ? serviceType : '1' };
}
const timeLabel = (time: number) => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function selectionsFromLink(): Selection[] {
  const value = new URLSearchParams(window.location.search).get('routes');
  if (!value) return [fromLink()];
  const found: Selection[] = [];
  for (const entry of value.split(',').slice(0, 3)) {
    const [operator, route, direction, serviceType] = entry.split(':');
    if ((operator === 'ctb' || operator === 'kmb') && /^[A-Z0-9]{1,8}$/.test(route || '') && ['outbound', 'inbound'].includes(direction) && /^[1-9][0-9]?$/.test(serviceType || '')) {
      const item = { operator, route, direction, serviceType } as Selection;
      if (!found.some(s => keyOf(s) === keyOf(item))) found.push(item);
    }
  }
  return found.length ? found : [initial];
}
export default function App() {
  const [selections, setSelections] = useState<Selection[]>(selectionsFromLink);
  const [activeKey, setActiveKey] = useState(() => {
    const requested = keyOf(fromLink());
    return selections.some(s => keyOf(s) === requested) ? requested : keyOf(selections[0]);
  });
  const selection = selections.find(s => keyOf(s) === activeKey) || selections[0];
  function setSelection(update: Selection | ((s: Selection) => Selection)) {
    const next = typeof update === 'function' ? update(selection) : update;
    setSelections(list => list.some(s => keyOf(s) === keyOf(next) && keyOf(s) !== keyOf(selection)) ? list : list.map(s => keyOf(s) === keyOf(selection) ? next : s));
    setActiveKey(keyOf(next));
  }
  const [mode, setMode] = useState<'live' | 'demo'>(() => new URLSearchParams(window.location.search).get('demo') === '1' ? 'demo' : 'live');
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [tilted, setTilted] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [info, setInfo] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftRoute, setDraftRoute] = useState('22D');
  const [draftOperator, setDraftOperator] = useState<Operator>('ctb');
  const [draftService, setDraftService] = useState('1');
  const [toast, setToast] = useState('');
  const dataRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const states = useRoutes(selections, mode, refresh);
  const current = states[keyOf(selection)];
  const route = current?.route || fallback(selection.direction);
  const feed = current?.feed || null;
  const loading = current?.loading ?? true;
  const error = current?.error || '';
  const routeMatches = !!current?.route && current.route.direction === selection.direction;
  const mapRoutes = selections.flatMap((s, index) => {
    const state = states[keyOf(s)];
    return state?.route ? [{ key: keyOf(s), route: state.route, buses: estimateBuses(state.route, state.feed, now), color: routeColor(s, index) }] : [];
  });
  const allBuses = mapRoutes.flatMap(r => r.buses);
  function toggleRoute(preset: Selection) {
    const exists = selections.find(s => keyOf(s) === keyOf(preset));
    if (exists) {
      if (selections.length === 1) return;
      const remaining = selections.filter(s => keyOf(s) !== keyOf(preset));
      setSelections(remaining);
      if (keyOf(selection) === keyOf(preset)) setActiveKey(keyOf(remaining[0]));
    } else if (selections.length < 3) { setSelections(list => [...list, preset]); }
    else setToast('You can show up to 3 routes. Uncheck a route to add another.');
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setSelected(1); }, [activeKey, selection.direction]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (info || editing) { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setInfo(false); setEditing(false); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); } }, [info, editing]);
  useEffect(() => {
    if (!info && !editing) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select') || []);
    (dialog?.querySelector<HTMLElement>('input') || controls[0])?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !controls.length) return;
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [info, editing]);

  const selectedStop = route.stops.find(s => s.seq === selected) || route.stops[0];
  const selectedFeed = feed?.stops.find(s => s.stopId === selectedStop.id && s.seq === selectedStop.seq);
  const validFeed = feed?.stops.filter(s => fresh(s, now)).length || 0;
  const status = mode === 'demo' ? 'DEMO DATA' : error ? 'CONNECTION ISSUE' : loading && !feed ? 'CONNECTING' : validFeed ? 'LIVE ARRIVALS' : 'AWAITING FRESH DATA';
  function selectStop(seq: number) { setSelected(seq); dataRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  function setDemo() { setSelections([initial]); setActiveKey(keyOf(initial)); setMode('demo'); }
  async function share() {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ ...selection, routes: selections.map(s => `${s.operator}:${s.route}:${s.direction}:${s.serviceType}`).join(','), ...(mode === 'demo' ? { demo: '1' } : {}) }).toString();
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setToast('Copy this page’s address from your browser to share the monitor.'); }
  }
  function applyRoute(e: React.FormEvent) {
    e.preventDefault(); setMode('live');
    setSelection({ operator: draftOperator, route: draftRoute.trim().toUpperCase(), direction: 'outbound', serviceType: draftService });
    setEditing(false);
  }
  return <div className="app">
    <header className="topbar"><a className="brand" href="/" aria-label="Kai Tak bus monitor home"><span className="brand-icon"><BusFront size={23}/></span><span>Kai Tak<span className="brand-dot">.</span><small>THE BUS MONITOR</small></span></a><nav aria-label="Main navigation"><button className="nav-current" onClick={() => setInfo(false)}><Radio size={15}/> Live map</button><button onClick={() => setInfo(true)}>How it works <ArrowUpRight size={14}/></button></nav><div className="header-end"><span className="hk-clock">HONG KONG <strong>{timeLabel(now)}</strong></span><button className="share-button" onClick={share}>{copied ? <Check size={16}/> : <Share2 size={16}/>}<span>{copied ? 'Copied' : 'Share monitor'}</span></button></div></header>
    <main>
      <div className="page-heading"><div><div className="eyebrow"><span className="tiny-line"/>YOUR NEIGHBOURHOOD, IN MOTION</div><h1>Hello, Kai Tak!</h1><p>Little buses. A colourful neighbourhood. Your next adventure.</p></div><div className={`status-chip ${mode === 'demo' ? 'demo' : error ? 'warning' : ''}`} role="status"><span/>{status}</div></div>
      <div className="workspace">
        <aside className="sidebar">
          <div className="route-picker"><div className="route-picker-heading"><span className="eyebrow">SHOW ON MAP · {selections.length}/3</span><button onClick={() => { setSelections(presets); setActiveKey(keyOf(presets[0])); }}>Show all 3</button></div><div className="route-choices">{[...presets, ...selections.filter(s => !presets.some(p => keyOf(p) === keyOf(s)))].map((s, i) => <div className={`route-choice ${keyOf(selection) === keyOf(s) ? 'focused' : ''}`} key={keyOf(s)} style={{ '--route-color': routeColor(s, i) } as React.CSSProperties}><input type="checkbox" aria-label={`Show route ${s.route}`} checked={selections.some(item => keyOf(item) === keyOf(s))} onChange={() => toggleRoute(s)}/><button onClick={() => { if (!selections.some(item => keyOf(item) === keyOf(s))) { if (selections.length >= 3) { setToast('Uncheck a route first.'); return; } setSelections(list => [...list, s]); } setActiveKey(keyOf(s)); }} aria-label={`View route ${s.route} arrivals`}>{s.route}</button></div>)}</div><p>Tick to compare · tap a number for arrivals</p>{selections.filter(s => states[keyOf(s)]?.error).map(s => <p className="route-error" key={keyOf(s)}>{s.route}: arrivals unavailable · other routes keep updating</p>)}</div><div className="route-card"><div className="route-card-top"><span className="eyebrow">YOUR ROUTE</span><button className="text-button" onClick={() => { setDraftRoute(selection.route); setDraftOperator(selection.operator); setDraftService(selection.serviceType); setEditing(true); }}>Change <ChevronDown size={13}/></button></div><div className="route-title"><span className="route-number">{selection.route}</span><div><span className="operator-label">{selection.operator === 'ctb' ? 'CITYBUS 城巴' : 'KMB 九巴'}</span><span className="route-type">{selection.direction === 'outbound' ? 'Outbound' : 'Inbound'} service</span></div></div><div className="endpoints"><div><i/>{routeMatches ? route.origin : 'Loading route…'}</div><span className="endpoint-line"/><div><i/>{routeMatches ? route.destination : 'Awaiting route details'}</div></div><button className="direction-button" onClick={() => setSelection(s => ({ ...s, direction: s.direction === 'outbound' ? 'inbound' : 'outbound' }))}><ArrowDown size={13}/> Switch direction</button><div className="route-facts"><span><MapPin size={13}/>{routeMatches ? route.stops.length : '—'} stops</span><span><RefreshCw size={12}/>Every {mode === 'demo' ? '10' : '30'} sec</span><span>2D map</span></div></div>
          <div className="stops-heading"><h2>Along the route <span>{routeMatches ? String(route.stops.length).padStart(2, '0') : '—'}</span></h2><span>ARRIVAL</span></div>
          <div className="stop-list" aria-label="Route stops">{routeMatches ? route.stops.map((stop, index) => {
            const stopFeed = feed?.stops.find(s => s.stopId === stop.id && s.seq === stop.seq);
            const next = fresh(stopFeed, now) ? stopFeed!.arrivals.find(a => Date.parse(a.eta) > now - 10_000) : undefined;
            const mins = next ? Math.max(0, Math.ceil((Date.parse(next.eta) - now) / 60_000)) : null;
            return <button key={`${stop.id}-${stop.seq}`} ref={selected === stop.seq ? activeRef : undefined} className={`stop-row ${selected === stop.seq ? 'active' : ''}`} onClick={() => selectStop(stop.seq)} aria-pressed={selected === stop.seq}><span className="stop-track"><span>{String(index + 1).padStart(2, '0')}</span></span><span className="stop-name">{stop.name.split(',')[0]}<small>{stop.nameTc.split(',')[0]}</small></span><span className="stop-eta">{mins === null ? '—' : mins === 0 ? 'Due' : <>{mins}<small>min</small></>}</span></button>;
          }) : <p className="empty-stops">No stop list loaded for this route. Check the route number or switch direction.</p>}</div>
          <div className="sidebar-foot"><CircleHelp size={15}/><span>Bus positions are estimates, not GPS.</span><button aria-label="Learn about bus position estimates" onClick={() => setInfo(true)}><ArrowUpRight size={15}/></button></div>
        </aside>
        <section className="map-panel" aria-label="Route monitor"><div className="map-toolbar"><div className="view-tabs"><button className={!tilted ? 'active' : ''} onClick={() => setTilted(false)}>2D cartoon</button><button className={tilted ? 'active' : ''} onClick={() => setTilted(true)}>3D toy town <span>NEW</span></button></div><button className={`traffic-toggle ${traffic ? 'active' : ''}`} aria-label="Show live traffic" aria-pressed={traffic} onClick={() => setTraffic(t => !t)}><Layers size={15}/><span>Traffic</span><i/></button></div>
          <MapView routes={mapRoutes} activeKey={keyOf(selection)} selected={selected} onSelect={(key, seq) => { setActiveKey(key); selectStop(seq); }} tilted={tilted} traffic={traffic} reset={refresh}/>
          <div className="map-summary"><div><span className={`summary-dot ${mode === 'demo' ? 'sample' : ''}`}/><strong>{mode === 'demo' ? 'Demo mode' : validFeed ? 'Arrivals connected' : 'Waiting for live data'}</strong><span className="summary-secondary">{allBuses.length} location {allBuses.length === 1 ? 'estimate' : 'estimates'}</span></div><button onClick={() => setRefresh(n => n + 1)} aria-label="Refresh arrivals" disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/><span>{loading ? 'Updating…' : feed ? `Updated ${timeLabel(Date.parse(feed.fetchedAt))}` : 'Retry connection'}</span></button></div>
        </section>
      </div>
      <div className={`data-notice ${error ? 'has-error' : ''}`} role="status">{mode === 'demo' ? <><span className="notice-icon"><BusFront size={18}/></span><p><strong>You’re exploring a demo.</strong> All arrival times and buses are simulated. Stop locations come from a saved route snapshot.</p><button onClick={() => { setMode('live'); setSelection(initial); }}>Connect live data <ArrowRight size={14}/></button></> : error ? <><TriangleAlert size={19}/><p><strong>Live data is unavailable.</strong> {error} {route.snapshot ? 'No live stop list was loaded for this route.' : 'Any retained arrivals are labelled by freshness.'}</p><button onClick={setDemo}>Explore demo <ArrowRight size={14}/></button></> : <><Signal size={18}/><p><strong>{feed?.partial ? 'Some stops could not update.' : 'Arrival times from the operator.'}</strong> {loading ? 'Connecting to the government open data service…' : 'Positions are inferred from ETAs. Stops with old data are excluded from estimates.'}</p><button onClick={() => setInfo(true)}>About the data <ArrowUpRight size={14}/></button></>}</div>
      <div className="lower-grid"><section className="arrival-card" ref={dataRef}><div className="section-label"><MapPin size={15}/><span>AT YOUR STOP</span><span className="pill">STOP {String(selectedStop.seq).padStart(2, '0')}</span></div><div className="arrival-content"><div><h2>{selectedStop.name.split(',')[0]}</h2><p>{selectedStop.nameTc}</p><span className="muted">{routeMatches ? `Route ${selection.route} · ${selection.direction}` : `${route.route} · previously loaded route`}</span></div><div className="arrival-times">{fresh(selectedFeed, now) && routeMatches ? selectedFeed!.arrivals.filter(a => Date.parse(a.eta) > now - 10_000).slice(0, 3).map((a, i) => <div key={`${a.eta}-${i}`} className={i === 0 ? 'next-arrival' : ''}><strong>{Math.max(0, Math.ceil((Date.parse(a.eta) - now) / 60_000)) || 'Due'}</strong><span>{Date.parse(a.eta) - now > 0 ? 'min' : 'now'}</span><small>{mode === 'demo' ? 'DEMO' : a.remark || 'ESTIMATED'}</small></div>) : null}{(!routeMatches || !fresh(selectedFeed, now) || !selectedFeed?.arrivals.some(a => Date.parse(a.eta) > now - 10_000)) && <div className="no-arrivals"><strong>—</strong><span>{selectedFeed?.error ? 'Temporarily unavailable' : selectedFeed && !fresh(selectedFeed, now) ? 'Data is stale' : 'No current arrivals'}</span><small>{feed ? 'No estimate available; this does not confirm the end of service.' : 'Waiting for the operator feed'}</small></div>}</div></div></section><section className="insight-card"><div className="section-label"><RouteIcon size={15}/><span>A NOTE FOR YOUR JOURNEY</span></div><h2>A prediction, with perspective.</h2><p>Traffic, dwell time, and changing predictions affect where a bus might be. Use the arrival board to plan, and treat the little buses as a guide.</p><a href="https://www.hkemobility.gov.hk/en/traffic-information/live/smp" target="_blank" rel="noreferrer">Check Hong Kong traffic <ExternalLink size={13}/></a></section></div>
      <footer><span><span className="footer-logo">Kai Tak.</span> A small window into your daily journey.</span><div><a href="https://data.gov.hk/en/" target="_blank" rel="noreferrer">HK Open Data <ArrowUpRight size={12}/></a><button onClick={() => setInfo(true)}>Sources & limitations</button><span>Times in HKT · UTC+8</span></div></footer>
    </main>
    {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
    {info && <div className="modal-backdrop" onClick={() => setInfo(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setInfo(false)} aria-label="Close information"><X size={20}/></button><span className="eyebrow">BEHIND THE LITTLE BUSES</span><h2 id="info-title">Useful estimates. Honest limits.</h2><p><strong>Arrivals are live; positions are inferred.</strong> Citybus and KMB publish predicted arrival times, not vehicle coordinates or vehicle IDs. Markers represent possible activity between neighbouring stops. They cannot tell you which physical bus is moving, or how many buses are on the road.</p><p>We use fresh predictions at adjacent stops and an assumed travel speed. When predictions suggest a bus has left one stop and is close to the next, we interpolate its position. Old or missing predictions produce no marker. Refreshes can move or remove estimates.</p><p><strong>Routes follow estimated road paths.</strong> They use OpenStreetMap road routing, which may differ from the operator’s exact path. Arrows show travel direction. The hollow dotted trail is the selected bus’s inferred progress along this route, not recorded GPS history. The 3D prototype shows real building footprints with illustrative heights and original toy bus models. Building heights and vehicle sizes are stylised, not measured replicas.</p><p>22D is a <strong>Citybus</strong> route. Current route metadata determines its destinations; it should not be assumed to serve the cruise terminal. Select KMB when checking a KMB route.</p><p><strong>Sources:</strong> <a href="https://data.gov.hk/en/" target="_blank" rel="noreferrer">Hong Kong Open Data</a>, Citybus / KMB ETA APIs; OpenStreetMap contributors. Bundled 22D, 22S and 22X stops were retrieved from the Citybus API on 26 October 2026. Road estimates use OSRM / OpenStreetMap. Demo arrivals are synthetic. Traffic colours come from the Hong Kong Transport Department’s road-segment speed feed, joined to its official road network. The source timestamp is shown; stale or missing readings are not coloured. Speed bands are our guide, not Google congestion classifications. The cartoon basemap uses OpenFreeMap / OpenStreetMap.</p><button className="primary-button" onClick={() => setInfo(false)}>Got it <Check size={16}/></button></section></div>}
    {editing && <div className="modal-backdrop" onClick={() => setEditing(false)}><form className="modal route-modal" role="dialog" aria-modal="true" aria-labelledby="route-title" onSubmit={applyRoute} onClick={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setEditing(false)} aria-label="Close route selection"><X size={20}/></button><span className="eyebrow">FIND YOUR BUS</span><h2 id="route-title">A different route?</h2><label>Operator<select value={draftOperator} onChange={e => setDraftOperator(e.target.value as Operator)}><option value="ctb">Citybus 城巴</option><option value="kmb">KMB 九巴</option></select></label><label>Route number<input autoFocus required maxLength={8} pattern="[A-Za-z0-9]{1,8}" value={draftRoute} onChange={e => setDraftRoute(e.target.value)} placeholder="e.g. 22D"/></label>{draftOperator === 'kmb' && <label>Service type<input required type="number" min="1" max="99" value={draftService} onChange={e => setDraftService(e.target.value)}/><small>Usually 1 for the regular service.</small></label>}<p>Live routes are loaded from the operator. Demos are available for Citybus 22D, 22S and 22X.</p><button type="submit" className="primary-button">Show route <ArrowRight size={16}/></button></form></div>}
  </div>;
}

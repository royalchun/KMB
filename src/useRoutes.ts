import { useEffect, useState } from 'react';
import snapshots from './route-snapshot.json';
import { demoFeed } from './demo';
import type { Feed, RoadGeometry, Route, RouteState, Selection } from './types';
export const keyOf = (s: Selection) => `${s.operator}:${s.route}:${s.serviceType}`;
export const presets: Selection[] = ['22D', '22S', '22X', '20A', '20X', '5R'].map(route => ({
  operator: route === '5R' ? 'kmb' : 'ctb', route, direction: 'outbound', serviceType: '1',
}));
const colors = ['#24766b', '#b56320', '#7957b2', '#266ba5', '#b33e67', '#617924'];
export const routeColor = (s: Selection, index: number) => {
  const preset = presets.findIndex(p => keyOf(p) === keyOf(s));
  return colors[preset < 0 ? index % colors.length : preset];
};
export async function api<T>(endpoint: string, selection: Selection, signal: AbortSignal): Promise<T> {
  const r = await fetch(`/api/${endpoint}?${new URLSearchParams({ ...selection })}`, { signal });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Live service unavailable.');
  return data;
}
export function useRoutes(selections: Selection[], mode: 'live' | 'demo', refresh: number) {
  const [states, setStates] = useState<Record<string, RouteState>>({});
  const identity = JSON.stringify(selections);
  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    const busy = new Set<string>();
    const current: Record<string, RouteState> = {};
    function update(key: string, change: Partial<RouteState>) {
      if (controller.signal.aborted) return;
      current[key] = { ...current[key], ...change };
      setStates({ ...current });
    }
    for (const selection of selections) current[keyOf(selection)] = { selection, route: null, feed: null, error: '', loading: true, geometryError: false };
    setStates({ ...current });
    async function load(selection: Selection) {
      const key = keyOf(selection);
      if (busy.has(key)) return;
      busy.add(key); update(key, { loading: true });
      try {
        let route: Route;
        if (mode === 'demo') {
          const saved = snapshots.find(s => s.operator === selection.operator && s.route === selection.route && s.direction === selection.direction && s.serviceType === selection.serviceType);
          if (!saved) throw new Error('Demo not available for this route. Choose one of the six Kai Tak presets.');
          route = saved as Route;
        } else route = current[key].route || await api<Route>('route', selection, controller.signal);
        update(key, { route });
        const geometry = route.geometry ? Promise.resolve() : api<RoadGeometry>('geometry', selection, controller.signal)
          .then(geometry => { route = { ...route, geometry }; update(key, { route, geometryError: false }); })
          .catch(() => update(key, { geometryError: true }));
        const feed = mode === 'demo' ? demoFeed(route, started, Date.now()) : await api<Feed>('etas', selection, controller.signal);
        update(key, { feed, error: '', loading: false });
        await geometry;
      } catch (e) { update(key, { error: e instanceof Error ? e.message : 'Live service unavailable.', loading: false }); }
      finally { busy.delete(key); }
    }
    selections.forEach(s => void load(s));
    const timer = setInterval(() => selections.forEach(s => void load(s)), mode === 'demo' ? 10000 : 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [identity, mode, refresh]);
  return states;
}

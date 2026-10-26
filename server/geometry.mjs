import { readFileSync } from 'node:fs';
import { upstreamFetch } from './provider.mjs';

const saved = JSON.parse(readFileSync(new URL('./road-snapshots.json', import.meta.url), 'utf8'));
export const geometryKey = route => `${route.operator}:${route.route}:${route.direction}:${route.serviceType}`;
export const stopSignature = route => route.stops.map(s => `${s.id}:${s.lng.toFixed(5)},${s.lat.toFixed(5)}`).join(';');
export function createGeometryProvider(provider, fetcher = upstreamFetch, { useSnapshots = true } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async selection => {
    const route = await provider.route(selection);
    const key = geometryKey(route), signature = stopSignature(route);
    if (useSnapshots && saved[key]?.signature === signature) return saved[key].geometry;
    const entry = cache.get(key);
    if (entry?.signature === signature && entry.until > Date.now()) return entry.geometry;
    const requestKey = `${key}:${signature}`;
    if (pending.has(requestKey)) return pending.get(requestKey);
    const request = (async () => {
      const coordinates = route.stops.map(s => `${s.lng},${s.lat}`).join(';');
      const response = await fetcher(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=true&geometries=geojson&continue_straight=false`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'KaiTakBusMonitor/0.2 (github.com/royalchun/KMB)' } });
      if (!response.ok) throw new Error('Road routing service unavailable.');
      const data = await response.json();
      if (data.code !== 'Ok' || data.routes?.[0]?.legs?.length !== route.stops.length - 1 || data.waypoints?.some(w => w.distance > 180)) throw new Error('No suitable road path was found.');
      const segments = data.routes[0].legs.map(leg => leg.steps.flatMap(step => step.geometry?.coordinates || []));
      if (segments.some(line => line.length < 2 || line.some(p => p.length !== 2 || !p.every(Number.isFinite) || p[0] < 113 || p[0] > 115 || p[1] < 22 || p[1] > 23))) throw new Error('Invalid road geometry.');
      const geometry = { segments, source: 'OSRM / OpenStreetMap · estimated road path' };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { geometry, signature, until: Date.now() + 24 * 60 * 60 * 1000 });
      return geometry;
    })().finally(() => pending.delete(requestKey));
    pending.set(requestKey, request);
    return request;
  };
}

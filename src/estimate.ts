import type { BusEstimate, Feed, Route, Stop, StopEtas } from './types';
import { along } from './geometry';

export const FRESH_MS = 90_000;
export function fresh(stop: StopEtas | undefined, now: number) {
  const time = Date.parse(stop?.generatedAt || '');
  return !!stop && !stop.error && Number.isFinite(time) && now - time <= FRESH_MS && time - now < 30_000;
}
export function distance(a: Stop, b: Stop) {
  const rad = Math.PI / 180;
  const x = (a.lng - b.lng) * rad * Math.cos((a.lat + b.lat) * rad / 2);
  const y = (a.lat - b.lat) * rad;
  return 6_371_000 * Math.hypot(x, y);
}
export function segmentSeconds(a: Stop, b: Stop) {
  // An explicit heuristic, not a measured speed: 20 km/h plus a short dwell.
  return Math.min(300, Math.max(50, distance(a, b) / 5.5 + 25));
}

/** ETA feeds have no vehicle IDs. These are independent segment hypotheses,
 * never a count of a fleet, and never persistent identities across refreshes. */
export function estimateBuses(route: Route, feed: Feed | null, now: number): BusEstimate[] {
  if (!feed) return [];
  const estimates: BusEstimate[] = [];
  for (let i = 1; i < route.stops.length; i++) {
    const previous = route.stops[i - 1], next = route.stops[i];
    const before = feed.stops.find(s => s.stopId === previous.id && s.seq === previous.seq);
    const after = feed.stops.find(s => s.stopId === next.id && s.seq === next.seq);
    if (!fresh(before, now) || !fresh(after, now)) continue;
    const duration = segmentSeconds(previous, next);
    const eta = after!.arrivals.map(a => Date.parse(a.eta)).find(t => t >= now && t - now <= duration * 1000);
    if (eta === undefined) continue;
    // A matching future ETA upstream is evidence the bus has not passed that
    // stop yet. Do not place it downstream, and do not match by ETA rank.
    if (before!.arrivals.some(a => {
      const t = Date.parse(a.eta);
      return t >= now && t <= eta && eta - t <= duration * 1800;
    })) continue;
    const departed = before!.arrivals.map(a => Date.parse(a.eta))
      .filter(t => t <= now && t > now - duration * 1800 && eta - t <= duration * 2000).at(-1);
    const seconds = (eta - now) / 1000;
    const progress = departed === undefined ? 1 - seconds / duration : (now - departed) / (eta - departed);
    const t = Math.max(0.05, Math.min(0.95, progress));
    // Suppress another hypothesis immediately beside an existing one.
    if (estimates.some(bus => distance({ ...next, lat: bus.lat, lng: bus.lng }, next) < 80)) continue;
    const road = route.geometry?.segments[i - 1];
    const position = road ? along(road, t) : null;
    estimates.push({ id: `${next.id}-${eta}`, lat: position?.point[1] ?? previous.lat + (next.lat - previous.lat) * t,
      lng: position?.point[0] ?? previous.lng + (next.lng - previous.lng) * t, bearing: position?.bearing, nextStop: next,
      seconds, progress: t, segment: i, confidence: departed === undefined ? 'low' : 'medium' });
  }
  return estimates;
}

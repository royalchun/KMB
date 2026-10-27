import type { BusEstimate, Coordinate, Feed, Route, Stop, StopEtas } from './types';
import { along, metres } from './geometry';

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
export function segmentSeconds(a: Stop, b: Stop, road?: Coordinate[]) {
  const length = road?.length ? road.slice(1).reduce((sum, point, i) => sum + metres(road[i], point), 0) : distance(a, b);
  // Assumption: ~20 km/h along the actual road plus a short stop allowance.
  // Long non-stop legs (22X) must not be truncated to the old five-minute cap.
  return Math.min(1800, Math.max(50, length / 5.5 + 25));
}

export function nextEstimatedStart(route: Route, feed: Feed | null, now: number): string | null {
  if (!feed) return null;
  const cumulative = [0];
  for (let i=1;i<route.stops.length;i++) cumulative.push(cumulative[i-1]+segmentSeconds(route.stops[i-1],route.stops[i],route.geometry?.segments[i-1]));
  for(let i=route.stops.length-1;i>=1;i--){
    const stop=route.stops[i],source=feed.stops.find(s=>s.stopId===stop.id&&s.seq===stop.seq);
    if(!fresh(source,now))continue;
    const starts=source!.arrivals.map(a=>Date.parse(a.eta)-cumulative[i]*1000).filter(t=>Number.isFinite(t)&&t>now).sort((a,b)=>a-b);
    if(starts.length)return new Date(starts[0]).toISOString();
  }
  return null;
}

/** Independent virtual trips inferred from downstream ETAs, without vehicle IDs.
 * Origin/upstream predictions can describe another bus and must not cancel an
 * otherwise plausible backcast. An estimated future start is never in motion. */
export function estimateBuses(route: Route, feed: Feed | null, now: number): BusEstimate[] {
  if (!feed || route.stops.length < 2) return [];
  const cumulative = [0];
  for (let i = 1; i < route.stops.length; i++) cumulative.push(cumulative[i - 1] + segmentSeconds(route.stops[i - 1], route.stops[i], route.geometry?.segments[i - 1]));
  const origin = route.stops[0];
  const originFeed = feed.stops.find(s => s.stopId === origin.id && s.seq === origin.seq);
  // One anchor for the whole displayed leg avoids inventing the same bus at
  // every stop. Prefer the furthest fresh stop that can imply a started trip.
  for (let anchorIndex = route.stops.length - 1; anchorIndex >= 1; anchorIndex--) {
    const anchor = route.stops[anchorIndex];
    const source = feed.stops.find(s => s.stopId === anchor.id && s.seq === anchor.seq);
    if (!fresh(source, now)) continue;
    const duration = cumulative[anchorIndex];
    const arrivals = [...new Set(source!.arrivals.map(a => Date.parse(a.eta)).filter(Number.isFinite))].sort((a, b) => a - b);
    const estimates: BusEstimate[] = [];
    for (const arrival of arrivals) {
      if (arrival <= now) continue;
      let departure = arrival - duration * 1000;
      if (departure > now) continue;
      let confidence: BusEstimate['confidence'] = 'low';
      // A recent predicted origin time can tighten the bracket, but missing,
      // stale or future origin predictions do not block endpoint-only inference.
      const bracket = fresh(originFeed, now) ? originFeed!.arrivals.map(a => Date.parse(a.eta))
        .filter(t => Number.isFinite(t) && t <= now && arrival - t >= duration * 450 && arrival - t <= duration * 1800)
        .sort((a, b) => Math.abs(a - departure) - Math.abs(b - departure))[0] : undefined;
      if (bracket !== undefined) { departure = bracket; confidence = 'medium'; }
      if (estimates.some(bus => Math.abs(Date.parse(bus.estimatedDeparture!) - departure) < 30000)) continue;
      const elapsed = (now - departure) / (arrival - departure) * duration;
      let segment = 1;
      while (segment < anchorIndex && cumulative[segment] <= elapsed) segment++;
      const progress = Math.max(0, Math.min(1, (elapsed - cumulative[segment - 1]) / (cumulative[segment] - cumulative[segment - 1])));
      const previous = route.stops[segment - 1], next = route.stops[segment];
      const road = route.geometry?.segments[segment - 1];
      const position = road ? along(road, progress) : null;
      const predictedNext = departure + cumulative[segment] / duration * (arrival - departure);
      estimates.push({ id: `trip-${anchor.id}-${arrival}`, lat: position?.point[1] ?? previous.lat + (next.lat - previous.lat) * progress,
        lng: position?.point[0] ?? previous.lng + (next.lng - previous.lng) * progress, bearing: position?.bearing,
        nextStop: next, seconds: Math.max(0, (predictedNext - now) / 1000), progress, segment, confidence,
        estimatedDeparture: new Date(departure).toISOString(), anchorStop: anchor, anchorEta: new Date(arrival).toISOString(), travelSeconds: (arrival - departure) / 1000 });
      if (estimates.length >= 3) break;
    }
    if (estimates.length) return estimates;
  }
  return [];
}

import type { Feed, Route } from './types';
import { segmentSeconds } from './estimate';
export function demoFeed(route: Route, startedAt: number, now: number): Feed {
  const elapsed = (now - startedAt) / 1000;
  const cumulative = [0];
  for (let i = 1; i < route.stops.length; i++) cumulative.push(cumulative[i - 1] + segmentSeconds(route.stops[i - 1], route.stops[i]));
  const total = cumulative.at(-1)!;
  const phase = elapsed % (total + 900);
  const trips = [-total * .24, total * .24, total * .64, total + 300, total + 900];
  return { fetchedAt: new Date(now).toISOString(), partial: false,
    stops: route.stops.map((stop, i) => ({ stopId: stop.id, seq: stop.seq, generatedAt: new Date(now).toISOString(),
      arrivals: trips.map(start => now + (cumulative[i] + start - phase) * 1000)
        .filter(t => t > now - 300_000).map(t => ({ eta: new Date(t).toISOString(), remark: 'Simulated arrival' })) })) };
}

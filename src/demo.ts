import type { Feed, Route } from './types';
import { segmentSeconds } from './estimate';
export function demoFeed(route: Route, startedAt: number, now: number): Feed {
  const elapsed = (now - startedAt) / 1000;
  const cumulative = [0];
  for (let i = 1; i < route.stops.length; i++) cumulative.push(cumulative[i - 1] + segmentSeconds(route.stops[i - 1], route.stops[i], route.geometry?.segments[i - 1]));
  const total = cumulative.at(-1)!;
  // Keep trips far enough apart that a short two-stop demo (22X) does not
  // ambiguously match the next bus's upstream ETA to this bus's arrival.
  const longestSegment = Math.max(...cumulative.slice(1).map((t, i) => t - cumulative[i]));
  const spacing = Math.max(total * .5, longestSegment * 2.2);
  const phase = elapsed % (total + spacing);
  const trips = Array.from({ length: 5 }, (_, i) => -total * .24 + spacing * i);
  return { fetchedAt: new Date(now).toISOString(), partial: false,
    stops: route.stops.map((stop, i) => ({ stopId: stop.id, seq: stop.seq, generatedAt: new Date(now).toISOString(),
      arrivals: trips.map(start => now + (cumulative[i] + start - phase) * 1000)
        .filter(t => t > now - 300_000).map(t => ({ eta: new Date(t).toISOString(), remark: 'Simulated arrival' })) })) };
}

import { describe, expect, it } from 'vitest';
import { estimateBuses, fresh, segmentSeconds } from '../src/estimate';
import type { Feed, Route } from '../src/types';
const now = Date.parse('2026-10-26T12:00:00+08:00');
const route: Route = { operator: 'ctb', route: '22D', direction: 'outbound', serviceType: '1', origin: 'A', destination: 'B', stops: [
  { id: 'a', seq: 1, name: 'A', nameTc: 'A', lat: 22.32, lng: 114.20 },
  { id: 'b', seq: 2, name: 'B', nameTc: 'B', lat: 22.321, lng: 114.20 },
] };
function feed(before: number[], after: number[]): Feed {
  return { fetchedAt: new Date(now).toISOString(), partial: false, stops: route.stops.map((stop, i) => ({ stopId: stop.id, seq: stop.seq, generatedAt: new Date(now).toISOString(), arrivals: (i ? after : before).map(sec => ({ eta: new Date(now + sec * 1000).toISOString(), remark: '' })) })) };
}
describe('ETA position hypotheses', () => {
  it('places a bus between fresh, bracketing past and future arrivals', () => {
    const [bus] = estimateBuses(route, feed([-30], [30]), now);
    expect(bus.confidence).toBe('medium');
    expect(bus.lat).toBeCloseTo(22.3205, 5);
    expect(bus.lng).toBe(114.20);
  });
  it('does not put an upstream bus between these stops', () => {
    expect(estimateBuses(route, feed([10], [40]), now)).toEqual([]);
  });
  it('labels an inference without a matched departure as low confidence', () => {
    expect(estimateBuses(route, feed([900], [20]), now)[0].confidence).toBe('low');
  });
  it('does not show stale, missing, failed, or far-future predictions as buses', () => {
    const stale = feed([-30], [30]); stale.stops[1].generatedAt = new Date(now - 91_000).toISOString();
    expect(estimateBuses(route, stale, now)).toEqual([]);
    expect(estimateBuses(route, { ...stale, stops: [stale.stops[0]] }, now)).toEqual([]);
    const failed = feed([-30], [30]); failed.stops[0].error = 'Unavailable';
    expect(estimateBuses(route, failed, now)).toEqual([]);
    expect(estimateBuses(route, feed([], [900]), now)).toEqual([]);
    expect(estimateBuses(route, null, now)).toEqual([]);
  });
  it('rejects invalid timestamps and timestamps too far in the future', () => {
    const stop = feed([], [30]).stops[1];
    expect(fresh({ ...stop, generatedAt: 'bad' }, now)).toBe(false);
    expect(fresh({ ...stop, generatedAt: new Date(now + 120_000).toISOString() }, now)).toBe(false);
  });
  it('bounds assumed segment durations rather than implying measured speed', () => {
    expect(segmentSeconds(route.stops[0], route.stops[0])).toBe(50);
    expect(segmentSeconds(route.stops[0], { ...route.stops[1], lat: 22.9 })).toBe(300);
  });
});

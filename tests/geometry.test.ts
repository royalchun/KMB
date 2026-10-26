import { describe, expect, it } from 'vitest';
import { along, traversed } from '../src/geometry';
import { estimateBuses } from '../src/estimate';
import type { Route, Feed, Coordinate } from '../src/types';
const bend: Coordinate[] = [[114.20, 22.32], [114.201, 22.32], [114.201, 22.321]];
describe('positions on road geometry', () => {
  it('walks the road bend rather than interpolating diagonally between stops', () => {
    const p = along(bend, .4);
    expect(p.point[1]).toBe(22.32);
    expect(p.point[0]).toBeGreaterThan(114.20);
    expect(p.point[0]).toBeLessThan(114.201);
    expect(p.bearing).toBeCloseTo(90);
    expect(along(bend, .9).bearing).toBeCloseTo(0);
  });
  it('cuts a trail exactly at the inferred position, without including the future turn', () => {
    const path = traversed([bend], 1, .4);
    expect(path[0]).toEqual(bend[0]);
    expect(path.at(-1)).toEqual(along(bend, .4).point);
    expect(path).not.toContainEqual(bend[2]);
  });
  it('clamps endpoints and handles repeated road vertices', () => {
    expect(along([bend[0], bend[0], ...bend], 0).point).toEqual(bend[0]);
    expect(along(bend, 2).point).toEqual(bend[2]);
    expect(traversed([], 1, .5)).toEqual([]);
  });
  it('places an ETA hypothesis on the road and gives its local travel bearing', () => {
    const now = Date.now();
    const route: Route = { operator: 'ctb', route: '22D', direction: 'outbound', serviceType: '1', origin: 'a', destination: 'b', geometry: { source: 'test', segments: [bend] }, stops: [
      { id: 'a', seq: 1, name: 'a', nameTc: 'a', lat: bend[0][1], lng: bend[0][0] },
      { id: 'b', seq: 2, name: 'b', nameTc: 'b', lat: bend[2][1], lng: bend[2][0] },
    ] };
    const feed: Feed = { fetchedAt: new Date(now).toISOString(), partial: false, stops: route.stops.map((s, i) => ({ stopId: s.id, seq: s.seq, generatedAt: new Date(now).toISOString(), arrivals: [{ eta: new Date(now + (i ? 30 : -20) * 1000).toISOString(), remark: '' }] })) };
    const bus = estimateBuses(route, feed, now)[0];
    expect([bus.lng, bus.lat]).toEqual(along(bend, .4).point);
    expect(bus.bearing).toBeCloseTo(90);
  });
});

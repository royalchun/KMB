import { expect, test } from 'vitest';
import { demoFeed } from '../src/demo';
import { estimateBuses } from '../src/estimate';
import snapshots from '../src/route-snapshot.json';
import type { Route } from '../src/types';
for (const route of snapshots as Route[]) {
  test(`${route.route} ${route.direction} demo supplies distinguishable trips for ETA inference`, () => {
    const now = Date.now();
    const buses = estimateBuses(route, demoFeed(route, now, now), now);
    expect(buses.length).toBeGreaterThan(0);
    expect(buses.every(bus => Number.isFinite(bus.bearing))).toBe(true);
  });
}

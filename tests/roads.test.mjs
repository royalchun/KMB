import { describe, expect, it, vi } from 'vitest';
import { createGeometryProvider } from '../server/geometry.mjs';
const info = { operator: 'ctb', route: 'TEST', direction: 'outbound', serviceType: '1', stops: [{ id: 'a', lng: 114.2, lat: 22.32 }, { id: 'b', lng: 114.201, lat: 22.321 }] };
const line = [[114.2, 22.32], [114.201, 22.32], [114.201, 22.321]];
function response(overrides = {}) { return { ok: true, json: async () => ({ code: 'Ok', waypoints: [{ distance: 10 }, { distance: 10 }], routes: [{ legs: [{ steps: [{ geometry: { coordinates: line } }] }] }], ...overrides }) }; }
describe('road routing adapter', () => {
  it('retains bends and shares cached requests', async () => {
    const fetcher = vi.fn(async () => response());
    const get = createGeometryProvider({ route: async () => info }, fetcher);
    const [a, b] = await Promise.all([get(info), get(info)]);
    expect(a.segments[0]).toEqual(line); expect(b).toEqual(a);
    await get(info); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('continue_straight=false');
  });
  it('rejects off-road snaps, invalid geometry, and unavailable services instead of inventing lines', async () => {
    for (const res of [response({ waypoints: [{ distance: 500 }] }), response({ code: 'NoRoute' }), response({ routes: [{ legs: [] }] }), { ok: false }]) {
      await expect(createGeometryProvider({ route: async () => info }, async () => res)(info)).rejects.toThrow();
    }
  });
});

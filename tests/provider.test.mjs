import { describe, expect, it, vi } from 'vitest';
import { createProvider, selectionFrom } from '../server/provider.mjs';
const selection = { operator: 'ctb', route: '22', direction: 'outbound', serviceType: '1' };
const stamp = '2026-10-26T12:00:00+08:00';
function fixture(url) {
  if (url.includes('/route-stop/')) return { data: [{ seq: 2, stop: 'b' }, { seq: 1, stop: 'a' }] };
  if (url.includes('/route/')) return { data: [{ orig_en: 'Station', dest_en: 'Runway' }] };
  if (url.includes('/stop/')) return { data: [{ name_en: 'Stop', name_tc: '站', lat: '22.32', long: '114.20' }] };
  const seq = url.includes('/a/') ? 1 : 2;
  return { generated_timestamp: stamp, data: [
    { seq, dir: 'O', eta: stamp, rmk_en: 'Scheduled', service_type: 1 },
    { seq, dir: 'I', eta: stamp, service_type: 1 },
    { seq: seq + 5, dir: 'O', eta: stamp, service_type: 1 },
    { seq, dir: 'O', eta: null, service_type: 1 },
    { seq, dir: 'O', eta: stamp, service_type: 2 },
  ] };
}
function mockFetch(map = fixture) { return vi.fn(async url => ({ ok: true, json: async () => map(url) })); }
describe('Government data adapters', () => {
  it('validates route selectors before making upstream requests', () => {
    for (const bad of [{ route: '../secrets' }, { operator: 'other' }, { direction: 'east' }, { serviceType: '0' }, { route: ['22D'] }])
      expect(() => selectionFrom(bad)).toThrow();
    expect(selectionFrom({})).toEqual({ ...selection, route: '22D' });
  });
  it('sorts stop sequences and filters direction, sequence, and missing ETAs', async () => {
    const fetcher = mockFetch();
    const p = createProvider(fetcher);
    const route = await p.route(selection);
    expect(route.stops.map(s => s.id)).toEqual(['a', 'b']);
    const result = await p.etas(selection);
    expect(result.partial).toBe(false);
    expect(result.stops[0].arrivals).toHaveLength(2); // Citybus has no KMB service-type filter.
    expect(result.stops[0].generatedAt).toBe(stamp);
    expect(fetcher.mock.calls[0][0]).toContain('/route/CTB/22');
  });
  it('uses KMB endpoints, service types and object-shaped metadata', async () => {
    const fetcher = mockFetch(url => {
      const data = fixture(url);
      return url.includes('/route/') || url.includes('/stop/') ? { data: data.data[0] } : data;
    });
    const result = await createProvider(fetcher).etas({ ...selection, operator: 'kmb', route: '5R' });
    expect(result.stops[0].arrivals).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => url.includes('/kmb/eta/a/5R/1'))).toBe(true);
  });
  it('shares in-flight requests and expires its 30 second ETA cache', async () => {
    let now = 1_000;
    const fetcher = mockFetch();
    const p = createProvider(fetcher, () => now);
    await Promise.all([p.etas(selection), p.etas(selection)]);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/eta/'))).toHaveLength(2);
    await p.etas(selection);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/eta/'))).toHaveLength(2);
    now += 31_000;
    await p.etas(selection);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/eta/'))).toHaveLength(4);
  });
  it('retains successful stops on partial failure but rejects a total outage', async () => {
    const fetcher = mockFetch();
    const p = createProvider(async (url, opts) => {
      if (url.includes('/eta/CTB/a/')) throw new Error('Offline');
      return fetcher(url, opts);
    });
    expect((await p.etas(selection)).partial).toBe(true);
    const broken = createProvider(async (url, opts) => {
      if (url.includes('/eta/')) throw new Error('Offline');
      return fetcher(url, opts);
    });
    await expect(broken.etas(selection)).rejects.toThrow('unavailable');
  });
  it('rejects invalid coordinates instead of plotting a false route', async () => {
    const p = createProvider(mockFetch(url => url.includes('/stop/') ? { data: { lat: 'NaN', long: '114.2' } } : fixture(url)));
    await expect(p.route(selection)).rejects.toThrow('coordinates');
  });
  it('maps the 22D loop direction and continuous ETA sequence in both published legs', async () => {
    const fetcher = mockFetch(url => {
      if (url.includes('/route-stop/')) return { data: url.endsWith('outbound') ? [{ stop: 'a', seq: 1 }, { stop: 'd', seq: 2 }] : [{ stop: 'd', seq: 1 }, { stop: 'e', seq: 2 }] };
      if (url.includes('/eta/')) {
        const id = url.split('/').at(-2);
        return { generated_timestamp: stamp, data: [{ dir: id === 'a' ? 'O' : 'I', seq: { a: 1, d: 2, e: 3 }[id], eta: stamp }] };
      }
      return fixture(url);
    });
    const p = createProvider(fetcher);
    const out = await p.etas({ ...selection, route: '22D' });
    const back = await p.etas({ ...selection, route: '22D', direction: 'inbound' });
    expect(out.stops.map(s => s.arrivals.length)).toEqual([1, 1]);
    expect(back.stops.map(s => s.arrivals.length)).toEqual([1, 1]);
    expect(back.stops.map(s => s.seq)).toEqual([1, 2]);
  });
  it('uses prediction timestamps rather than making stale data fresh with a new response envelope', async () => {
    const old = '2026-10-26T11:00:00+08:00';
    const p = createProvider(mockFetch(url => {
      const data = fixture(url);
      if (url.includes('/eta/')) data.data.forEach(row => { row.data_timestamp = old; });
      return data;
    }));
    const result = await p.etas(selection);
    expect(Date.parse(result.stops[0].generatedAt)).toBe(Date.parse(old));
  });
});

describe('Citybus shared-leg loop mappings',()=>{
 for(const route of ['22X','22S'])it(`${route} keeps the repeated origin separate from its return occurrence`,async()=>{
  const outward=route==='22X'?['a','b']:['a','b','c','d'];
  const returning=route==='22X'?['b','a']:['c','d','e','a'];
  const sequence=route==='22X'?{a:3,b:2}:{a:6,b:2,c:3,d:4,e:5};
  const get=mockFetch(url=>{
   if(url.includes('/route-stop/'))return{data:(url.endsWith('outbound')?outward:returning).map((stop,i)=>({stop,seq:i+1}))};
   if(url.includes('/eta/')){
    const id=url.split('/').at(-2);const origin={dir:'O',seq:1,eta:'2026-10-26T12:01:00+08:00'};
    const end={dir:'I',seq:sequence[id],eta:'2026-10-26T12:03:00+08:00'};
    const rows=id==='a'?[origin,end]:[{...end,dir:route==='22S'&&id==='b'?'O':'I'}];
    return{generated_timestamp:stamp,data:rows};
   }
   return fixture(url);
  });
  const p=createProvider(get);
  const out=await p.etas({...selection,route}),back=await p.etas({...selection,route,direction:'inbound'});
  expect(out.stops[0].arrivals[0].eta).toContain('12:01:00');
  expect(out.stops.at(-1).arrivals).toHaveLength(1);
  expect(back.stops.map(s=>s.arrivals.length)).toEqual(returning.map(()=>1));
  expect(back.stops.at(-1).arrivals[0].eta).toContain('12:03:00');
 });
});

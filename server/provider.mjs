import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici';

// Honour the platform's existing proxy and NO_PROXY settings. Never disable TLS.
const dispatcher = new EnvHttpProxyAgent();
export const upstreamFetch = (url, options) => proxyFetch(url, { ...options, dispatcher });

const ROOTS = {
  ctb: 'https://rt.data.gov.hk/v2/transport/citybus',
  kmb: 'https://data.etabus.gov.hk/v1/transport/kmb',
};

export function selectionFrom(query) {
  const { operator = 'ctb', route = '22D', direction = 'outbound', serviceType = '1' } = query;
  if (!['ctb', 'kmb'].includes(operator) || typeof route !== 'string' || !/^[A-Z0-9]{1,8}$/.test(route)
    || !['outbound', 'inbound'].includes(direction) || typeof serviceType !== 'string' || !/^[1-9][0-9]?$/.test(serviceType)) {
    throw new Error('Choose a valid operator, route, direction and service type.');
  }
  return { operator, route, direction, serviceType };
}

async function mapLimited(items, action) {
  let next = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      result[i] = await action(items[i], i);
    }
  }));
  return result;
}

export function createProvider(fetcher = upstreamFetch, clock = Date.now) {
  const cache = new Map();
  const pending = new Map();
  async function cached(key, ttl, load) {
    if (cache.get(key)?.until > clock()) return cache.get(key).value;
    if (pending.has(key)) return pending.get(key);
    const request = load().then(value => {
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(key, { until: clock() + ttl, value });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  async function get(url) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Government data service returned HTTP ${response.status}.`);
    return response.json();
  }
  async function route(s) {
    return cached(`route:${JSON.stringify(s)}`, 6 * 60 * 60 * 1000, async () => {
      const base = ROOTS[s.operator];
      const suffix = s.operator === 'ctb' ? `/CTB/${s.route}/${s.direction}` : `/${s.route}/${s.direction}/${s.serviceType}`;
      const metadataPath = s.operator === 'ctb' ? `/route/CTB/${s.route}` : `/route${suffix}`;
      const [rawMeta, rawStops] = await Promise.all([get(base + metadataPath), get(base + '/route-stop' + suffix)]);
      const metadata = Array.isArray(rawMeta.data) ? rawMeta.data[0] : rawMeta.data;
      if (!metadata || !Array.isArray(rawStops.data) || !rawStops.data.length || rawStops.data.length > 80) {
        throw new Error('This route or direction has no published stop list. Try the opposite direction.');
      }
      const refs = rawStops.data.toSorted((a, b) => Number(a.seq) - Number(b.seq));
      // These Citybus services publish two overlapping legs but continuous
      // ETA numbering. Retain repeated origin/terminal occurrences (22X A-B-A)
      // and map each leg's occurrence, rather than deduplicating stop IDs.
      let returnStart;
      if (s.operator === 'ctb' && ['22D','22S','22X'].includes(s.route)) {
        const other = await get(`${base}/route-stop/CTB/${s.route}/${s.direction === 'outbound' ? 'inbound' : 'outbound'}`);
        if (!Array.isArray(other.data) || !other.data.length) throw new Error('The loop stop mapping is unavailable.');
        const outward = s.direction === 'outbound' ? refs : other.data.toSorted((a,b)=>Number(a.seq)-Number(b.seq));
        const returning = s.direction === 'inbound' ? refs : other.data.toSorted((a,b)=>Number(a.seq)-Number(b.seq));
        for(let overlap=Math.min(outward.length,returning.length);overlap>0;overlap--){
          if(outward.slice(-overlap).every((stop,index)=>stop.stop===returning[index].stop)){
            returnStart=outward.length-overlap;break;
          }
        }
      }
      const stops = await mapLimited(refs, async (ref, index) => {
        const raw = await cached(`stop:${s.operator}:${ref.stop}`, 24 * 60 * 60 * 1000, () => get(`${base}/stop/${ref.stop}`));
        const stop = Array.isArray(raw.data) ? raw.data[0] : raw.data;
        const lat = Number(stop?.lat), lng = Number(stop?.long);
        if (!stop || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 22 || lat > 23 || lng < 113 || lng > 115) {
          throw new Error('The data service returned invalid stop coordinates.');
        }
        return { id: ref.stop, seq: Number(ref.seq), name: stop.name_en, nameTc: stop.name_tc, lat, lng,
          ...(returnStart !== undefined ? { etaSeq: (s.direction === 'outbound' ? index : index + returnStart) + 1, etaDirection: s.direction === 'inbound' || index >= returnStart ? 'I' : 'O' } : {}) };
      });
      const reverse = s.operator === 'ctb' && s.direction === 'inbound';
      return { ...s, origin: reverse ? metadata.dest_en : metadata.orig_en,
        destination: reverse ? metadata.orig_en : metadata.dest_en, stops, snapshot: false };
    });
  }
  async function etas(s) {
    return cached(`eta:${JSON.stringify(s)}`, 30_000, async () => {
      const info = await route(s);
      const stops = await mapLimited(info.stops, async stop => {
        try {
          const suffix = s.operator === 'ctb' ? `/CTB/${stop.id}/${s.route}` : `/${stop.id}/${s.route}/${s.serviceType}`;
          const payload = await get(ROOTS[s.operator] + '/eta' + suffix);
          if (!Array.isArray(payload.data)) throw new Error('Invalid ETA response');
          const dir = stop.etaDirection || (s.direction === 'outbound' ? 'O' : 'I');
          const rows = payload.data.filter(row => row.dir === dir && Number(row.seq) === (stop.etaSeq || stop.seq)
            && (s.operator !== 'kmb' || Number(row.service_type) === Number(s.serviceType)));
          const sourceTimes = rows.map(row => Date.parse(row.data_timestamp)).filter(Number.isFinite);
          return { stopId: stop.id, seq: stop.seq,
            generatedAt: sourceTimes.length ? new Date(Math.min(...sourceTimes)).toISOString() : payload.generated_timestamp || '',
            arrivals: rows.filter(row => row.eta && Number.isFinite(Date.parse(row.eta)))
              .map(row => ({ eta: row.eta, remark: row.rmk_en || '' })).toSorted((a, b) => Date.parse(a.eta) - Date.parse(b.eta)) };
        } catch {
          return { stopId: stop.id, seq: stop.seq, generatedAt: '', arrivals: [], error: 'Arrivals temporarily unavailable' };
        }
      });
      if (stops.every(stop => stop.error)) throw new Error('The government ETA service is unavailable. Try again shortly.');
      return { stops, fetchedAt: new Date(clock()).toISOString(), partial: stops.some(stop => stop.error) };
    });
  }
  return { route, etas };
}

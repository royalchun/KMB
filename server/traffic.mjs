import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { upstreamFetch } from './provider.mjs';
import { createCorridorClipper, CORRIDOR_METRES } from './corridor.mjs';
export const SPEED_URL = 'https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml';
export const MAX_TRAFFIC_AGE = 10 * 60 * 1000;
const network = JSON.parse(readFileSync(new URL('./traffic-roads.json', import.meta.url), 'utf8'));
export function normalizeTraffic(xml, roads, now = Date.now()) {
  if (xml.includes('<!DOCTYPE') || XMLValidator.validate(xml) !== true) throw new Error('Invalid traffic XML.');
  const root = new XMLParser({ processEntities: false, parseTagValue: false }).parse(xml).segment_speed_list;
  if (!root?.date || !root.time) throw new Error('Missing source timestamp.');
  const time = Date.parse(`${root.date}T${root.time}+08:00`);
  if (!Number.isFinite(time)) throw new Error('Invalid source timestamp.');
  const stale = now - time > MAX_TRAFFIC_AGE || time - now > 60000;
  const values = root.segments?.segment;
  if (!values) throw new Error('No traffic observations in feed.');
  const lookup = new Map((Array.isArray(values) ? values : [values]).filter(row => row.valid === 'Y' && row.speed !== '' && Number.isFinite(Number(row.speed)) && Number(row.speed) >= 0 && Number(row.speed) < 200).map(row => [String(row.segment_id), Number(row.speed)]));
  const features = stale ? [] : roads.features.flatMap(road => {
    const speed = lookup.get(String(road.properties.id));
    return speed === undefined ? [] : [{ ...road, properties: { ...road.properties, speed, color: speed < 20 ? '#eb6c77' : speed <= 40 ? '#f5bb51' : '#58b68b' } }];
  });
  return { type: 'FeatureCollection', features, sourceTime: new Date(time).toISOString(), fetchedAt: new Date(now).toISOString(), stale, monitored: lookup.size };
}
export function createTrafficProvider(fetcher = upstreamFetch, clock = Date.now) {
  let xml = '', until = 0, pending;
  const corridor = createCorridorClipper(network);
  return async (paths) => {
    if (clock() >= until) {
      if (!pending) pending = (async () => {
        const r = await fetcher(SPEED_URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/xml' } });
        if (!r.ok) throw new Error('Transport Department traffic feed unavailable.');
        const incoming = await r.text(); normalizeTraffic(incoming, network, clock());
        xml = incoming; until = clock() + 60000;
      })().finally(() => { pending = undefined; });
      await pending;
    }
    const result = normalizeTraffic(xml, paths ? corridor(paths) : network, clock());
    return { ...result, corridorMetres: paths ? CORRIDOR_METRES : null, coveredSegments: new Set(result.features.map(f=>f.properties.id)).size };
  };
}

// CSDI bus route lines published by HK Bus Crawling. Keep the shape revision
// explicit so refreshing a snapshot is reproducible.
import { upstreamFetch } from '../server/provider.mjs';
const revision = 'eb5b5d215f12f5e4f4ea62472d751223d213d0b4';
const files = {
  'ctb:20A:outbound:1': '1000406-O', 'ctb:20A:inbound:1': '1000406-I',
  'ctb:20X:outbound:1': '1000718-O', 'ctb:20X:inbound:1': '1000718-O',
  'kmb:5R:outbound:1': '8169-O',
};
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const unique = points => points.filter((p, i) => i === 0 || !same(p, points[i - 1]));

// Match stops to increasing positions on the shape. A nearest-point match
// alone can put a stop on the return leg of a circular route.
function stopSegments(stops, line) {
  let costs = [];
  const matches = stops.map(stop => {
    let best = Infinity, previous = -1;
    const nextCosts = [];
    const row = line.slice(0, -1).map((a, i) => {
      if (i && costs[i - 1] < best) { best = costs[i - 1]; previous = i - 1; }
      const b = line[i + 1];
      const dx = (b[0] - a[0]) * 102950, dy = (b[1] - a[1]) * 111320;
      const x = (stop.lng - a[0]) * 102950, y = (stop.lat - a[1]) * 111320;
      const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
      const distance = Math.hypot(x - t * dx, y - t * dy);
      nextCosts.push(distance ** 2 + (costs.length ? best : 0));
      return {previous, index: i, distance, point: a.map((v, k) => Number((v + t * (b[k] - v)).toFixed(6)))};
    });
    costs = nextCosts;
    return row;
  });
  let index = costs.indexOf(Math.min(...costs));
  const ordered = [];
  for (const row of matches.reverse()) {
    const match = row[index];
    if (!match || match.distance > 100) throw new Error('Stop list does not match the Transport Department shape.');
    ordered.unshift(match);
    index = match.previous;
  }
  return ordered.slice(1).map((b, i) => {
    const a = ordered[i];
    const segment = unique([a.point, ...line.slice(a.index + 1, b.index + 1), b.point]);
    if (segment.length < 2) throw new Error('Two stops map to the same point.');
    return segment;
  });
}

export async function tdGeometry(route, key) {
  const file = files[key];
  if (!file) return null;
  const url = `https://raw.githubusercontent.com/hkbus/route-waypoints/${revision}/${file}.json`;
  const response = await upstreamFetch(url, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Route shape ${file} returned HTTP ${response.status}.`);
  const [shape] = (await response.json()).features;
  const parts = shape.geometry.coordinates;
  if (shape.properties.ROUTE_NAMEE !== route.route || shape.properties.COMPANY_CODE !== route.operator.toUpperCase()
    || shape.geometry.type !== 'MultiLineString' || parts.some((p, i) => i && !same(p[0], parts[i - 1].at(-1)))) {
    throw new Error(`Unexpected geometry for ${key}.`);
  }
  return {source: 'Hong Kong Transport Department / HK Bus Crawling · route shape', segments: stopSegments(route.stops, unique(parts.flat()))};
}

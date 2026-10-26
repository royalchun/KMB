// Run deliberately when the official stop lists or road network change.
import { readFile, writeFile } from 'node:fs/promises';
import { createGeometryProvider, geometryKey, stopSignature } from '../server/geometry.mjs';
import { upstreamFetch } from '../server/provider.mjs';
const file = new URL('../src/route-snapshot.json', import.meta.url);
const routes = JSON.parse(await readFile(file, 'utf8'));
const roads = {};
for (const route of routes) {
  const geometry = await createGeometryProvider({ route: async () => route }, upstreamFetch, { useSnapshots: false })(route);
  route.geometry = geometry;
  roads[geometryKey(route)] = { signature: stopSignature(route), geometry };
  console.log(route.route, route.direction, geometry.segments.length, 'road segments;', geometry.segments.flat().length, 'road points');
}
await writeFile(new URL('../server/road-snapshots.json', import.meta.url), JSON.stringify(roads) + '\n');
await writeFile(file, JSON.stringify(routes, null, 2) + '\n');

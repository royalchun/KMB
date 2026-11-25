import { MercatorCoordinate, type GeoJSONSource, type Map as TownMap, type MapSourceDataEvent } from 'maplibre-gl';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { toyBusPoint, TOY_BUS_SCALE } from './toyBuses';
import type { MapRoute } from './types';

// Test the front, middle and rear of each deck, in the same local coordinates
// as the model. MapLibre sorts point hits on extrusions from nearest to furthest.
const probes = [2.8, 8.5].flatMap(height =>
  [-8, 0, 8].flatMap(forward => [-3, 3].map(right => ({right, forward, height}))));
const layers = ['buildings-3d', 'buildings-transparent', 'toy-bus-models'];

export function trackBuildingOcclusion(map: TownMap, routes: () => MapRoute[]) {
  const source = map.getSource('town-buildings') as GeoJSONSource;
  let previous = new Map<string, number>();
  let nextId = -1;
  let faded = new Set<number>();
  let tileTimer: ReturnType<typeof setTimeout> | undefined;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;

  // Vector tiles can omit feature IDs. Give those footprints local IDs so a
  // feature-state change never affects every building sharing a height/colour.
  function syncFootprints() {
    tileTimer = undefined;
    const keys = new Map<string, number>();
    const features: Feature<Polygon | MultiPolygon>[] = [];
    if (map.getZoom() >= 13) for (const feature of map.querySourceFeatures('town', {sourceLayer: 'building'})) {
      const geometry = feature.geometry;
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
      const key = JSON.stringify([feature.id, feature.properties.render_height, feature.properties.height, geometry.coordinates]);
      if (keys.has(key)) continue;
      const id = typeof feature.id === 'number' && feature.id > 0 ? feature.id : previous.get(key) ?? nextId--;
      keys.set(key, id);
      features.push({type: 'Feature', properties: {...feature.properties, buildingId: String(id)}, geometry});
    }
    if (keys.size !== previous.size || [...keys.keys()].some(key => !previous.has(key))) {
      source.setData({type: 'FeatureCollection', features});
      previous = keys;
    }
  }

  function update() {
    probeTimer = undefined;
    const blocked = new Set<number>();
    const {width, height} = map.transform;
    const matrix = map.transform.getProjectionDataForCustomLayer(false).mainMatrix;
    const bounds = map.getBounds();
    for (const route of routes()) for (const bus of route.buses) {
      if (!route.route.geometry || !bounds.contains([bus.lng, bus.lat])) continue;
      const busId = `${route.key}:${route.route.direction}:${bus.id}`;
      for (const probe of probes) {
        const point = toyBusPoint(bus, probe.right, probe.forward);
        const {x, y, z} = MercatorCoordinate.fromLngLat(point, probe.height * TOY_BUS_SCALE);
        const w = matrix[3]*x + matrix[7]*y + matrix[11]*z + matrix[15];
        if (w <= 0) continue;
        const px = width / 2 * (1 + (matrix[0]*x + matrix[4]*y + matrix[8]*z + matrix[12]) / w);
        const py = height / 2 * (1 - (matrix[1]*x + matrix[5]*y + matrix[9]*z + matrix[13]) / w);
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const hits = map.queryRenderedFeatures([px, py], {layers});
        const busIndex = hits.findIndex(hit => hit.layer.id === 'toy-bus-models' && hit.properties.busId === busId);
        for (let i = 0; i < busIndex; i++) {
          if (hits[i].source === 'town-buildings') blocked.add(Number(hits[i].id));
        }
      }
    }
    for (const id of faded) if (!blocked.has(id)) map.removeFeatureState({source: 'town-buildings', id: String(id)}, 'blocked');
    for (const id of blocked) if (!faded.has(id)) map.setFeatureState({source: 'town-buildings', id: String(id)}, {blocked: true});
    faded = blocked;
    map.getContainer().dataset.blockingBuildings = String(blocked.size);
  }
  function scheduleProbe() {
    if (probeTimer === undefined) probeTimer = setTimeout(update, 100);
  }
  function scheduleTiles() {
    if (tileTimer === undefined) tileTimer = setTimeout(syncFootprints, 100);
  }
  function loaded(event: MapSourceDataEvent) {
    if (event.sourceId === 'town') scheduleTiles();
    if (event.sourceId === 'toy-buses' || event.sourceId === 'town-buildings') scheduleProbe();
  }
  map.on('sourcedata', loaded);
  map.on('move', scheduleProbe);
  map.on('moveend', scheduleTiles);
  map.on('resize', scheduleProbe);
  syncFootprints();
  scheduleProbe();
  return () => {
    map.off('sourcedata', loaded);
    map.off('move', scheduleProbe);
    map.off('moveend', scheduleTiles);
    map.off('resize', scheduleProbe);
    clearTimeout(tileTimer);
    clearTimeout(probeTimer);
    if (map.getSource('town-buildings')) {
      map.removeFeatureState({source: 'town-buildings'});
      source.setData({type: 'FeatureCollection', features: []});
    }
    delete map.getContainer().dataset.blockingBuildings;
  };
}

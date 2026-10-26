import type { FeatureCollection, Polygon } from 'geojson';
import type { MapRoute, Coordinate } from './types';
// Original miniature double-deckers. Geometry is intentionally toy scale.
export function toyBuses(routes: MapRoute[]): FeatureCollection<Polygon> {
  const features: FeatureCollection<Polygon>['features'] = [];
  for (const r of routes) for (const bus of r.route.geometry ? r.buses : []) {
    const angle = (bus.bearing || 0) * Math.PI / 180;
    function box(x: number, y: number, width: number, length: number, base: number, height: number, color: string) {
      const corners = [[x-width/2,y-length/2],[x+width/2,y-length/2],[x+width/2,y+length/2],[x-width/2,y+length/2],[x-width/2,y-length/2]];
      const coordinates = corners.map(([right, forward]): Coordinate => {
        const east = right * Math.cos(angle) + forward * Math.sin(angle);
        const north = -right * Math.sin(angle) + forward * Math.cos(angle);
        return [bus.lng + east * 2.4 / (111320 * Math.cos(bus.lat * Math.PI / 180)), bus.lat + north * 2.4 / 111320];
      });
      features.push({ type: 'Feature', properties: { color, base: base * 2.4, height: height * 2.4, route: r.route.route, routeKey: r.key, busId: `${r.key}:${r.route.direction}:${bus.id}`, seq: bus.nextStop.seq }, geometry: { type: 'Polygon', coordinates: [coordinates] } });
    }
    box(0,0,8,20,1.4,6,'#ffcf77'); box(0,0,7.7,19.5,6,10.7,'#ffe5a0');
    box(0,0,8,19.5,10.7,11.5,r.color);
    box(0,10,6.3,.4,2.8,5.4,'#416b7c'); box(0,9.8,6.3,.4,7,9.5,'#547e8c');
    for(const side of [-1,1]) {
      box(side*4,0,.3,13,3,5.4,'#547e8c'); box(side*3.9,0,.3,13,7,9.5,'#547e8c');
      for(const front of [-1,1]) box(side*4,front*5.5,1.4,3,0,2.5,'#4a4c58');
      box(side*2.6,10.2,1.2,.5,1.8,2.6,'#fff9d8');
    }
  }
  return { type: 'FeatureCollection', features };
}

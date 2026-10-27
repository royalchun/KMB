import { describe, expect, it } from 'vitest';
import { clipToCorridor, trafficSelections, createCorridorClipper } from '../server/corridor.mjs';
const feature=(id,line)=>({type:'Feature',properties:{id},geometry:{type:'LineString',coordinates:line}});
const path={segments:[[[114.2,22.32],[114.21,22.32],[114.21,22.33]]]};
const roads={type:'FeatureCollection',features:[
 feature('near',[[114.201,22.3202],[114.205,22.3202]]),
 feature('far',[[114.23,22.34],[114.24,22.34]]),
 feature('crossing',[[114.205,22.31],[114.205,22.34]]),
]};
describe('selected-route traffic corridor',()=>{
 it('retains nearby roads and clips long crossing roads rather than returning far-away tails',()=>{
  const filtered=clipToCorridor(roads,[path]);
  expect(filtered.features.some(f=>f.properties.id==='near')).toBe(true);
  expect(filtered.features.some(f=>f.properties.id==='far')).toBe(false);
  const cross=filtered.features.find(f=>f.properties.id==='crossing');expect(cross).toBeDefined();
  expect(Math.min(...cross.geometry.coordinates.map(p=>p[1]))).toBeGreaterThan(22.318);
  expect(Math.max(...cross.geometry.coordinates.map(p=>p[1]))).toBeLessThan(22.322);
 });
 it('combines selected corridors, removes them when deselected, and caches the clipping work',()=>{
  const other={segments:[[[114.23,22.34],[114.24,22.34]]]};const filter=createCorridorClipper(roads);
  expect(filter([path,other]).features.some(f=>f.properties.id==='far')).toBe(true);
  expect(filter([path]).features.some(f=>f.properties.id==='far')).toBe(false);
  expect(filter([path])).toBe(filter([path]));expect(filter([]).features).toEqual([]);
 });
 it('validates up to three route/operator/direction selections before requesting paths',()=>{
  expect(trafficSelections({routes:'ctb:22X:outbound:1'})).toEqual([{operator:'ctb',route:'22X',direction:'outbound',serviceType:'1'}]);
  for(const invalid of ['', 'ctb:22X:nope:1', '../secret', ['ctb:22X:outbound:1'],Array(4).fill('ctb:22X:outbound:1').join(',')])expect(()=>trafficSelections({routes:invalid})).toThrow();
 });
});

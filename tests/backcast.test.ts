import { describe, expect, it } from 'vitest';
import { estimateBuses, segmentSeconds, nextEstimatedStart } from '../src/estimate';
import type { Feed, Route, Stop } from '../src/types';
const now=Date.parse('2026-10-27T08:00:00+08:00');
const stop=(id:string,seq:number,lng:number,lat=22.32):Stop=>({id,seq,lng,lat,name:id,nameTc:id});
const route:Route={operator:'ctb',route:'22X',direction:'outbound',serviceType:'1',origin:'A',destination:'B',stops:[stop('A',1,114.2),stop('B',2,114.215)],geometry:{source:'test',segments:[[[114.2,22.32],[114.21,22.32],[114.21,22.33],[114.215,22.33],[114.215,22.32]]]}};
const rows=(stop:Stop,seconds:number[])=>({stopId:stop.id,seq:stop.seq,generatedAt:new Date(now).toISOString(),arrivals:seconds.map(t=>({eta:new Date(now+t*1000).toISOString(),remark:''}))});
const feed=(seconds:number[]):Feed=>({stops:[rows(route.stops[1],seconds)],fetchedAt:new Date(now).toISOString(),partial:false});
describe('downstream ETA backcasting',()=>{
 it('uses road length and a long non-stop journey to infer a start without origin readings',()=>{
  const time=segmentSeconds(route.stops[0],route.stops[1],route.geometry!.segments[0]);
  expect(time).toBeGreaterThan(300);
  const [bus]=estimateBuses(route,feed([360]),now);
  expect(bus).toBeDefined();expect(bus.confidence).toBe('low');expect(bus.anchorStop?.id).toBe('B');
  expect(Date.parse(bus.estimatedDeparture!)).toBeCloseTo(now+(360-time)*1000,-1);
  expect(bus.progress).toBeGreaterThan(0);expect(bus.progress).toBeLessThan(1);expect(bus.bearing).toBeDefined();
 });
 it('continues along the road as time advances, without changing its inferred departure',()=>{
  const f=feed([360]);const before=estimateBuses(route,f,now)[0],after=estimateBuses(route,f,now+30000)[0];
  expect(after.progress).toBeGreaterThan(before.progress);expect(after.estimatedDeparture).toBe(before.estimatedDeparture);
 });
 it('draws up to three distinct trips from one terminal feed and avoids per-stop duplicates',()=>{
  const buses=estimateBuses(route,feed([120,240,360,480]),now);
  expect(buses).toHaveLength(3);expect(new Set(buses.map(b=>b.id)).size).toBe(3);
 });
 it('does not put a future inferred departure or stale terminal data in motion',()=>{
  expect(estimateBuses(route,feed([3600]),now)).toEqual([]);
  expect(estimateBuses(route,feed([360]),now+91000)).toEqual([]);
 });
 it('uses a fresh intermediate stop if the last stop has no predictions',()=>{
  const middle=stop('M',2,114.21),end=stop('C',3,114.22);
  const r={...route,stops:[route.stops[0],middle,end],geometry:undefined};
  const f={...feed([]),stops:[rows(middle,[60]),rows(end,[])]};
  const [bus]=estimateBuses(r,f,now);expect(bus.anchorStop?.id).toBe('M');expect(bus.nextStop.id).toBe('M');
 });
});

it('shows a future inferred start without inventing an en-route bus',()=>{
 const f=feed([3600]);const start=nextEstimatedStart(route,f,now);
 expect(Date.parse(start!)).toBeGreaterThan(now);expect(estimateBuses(route,f,now)).toEqual([]);
 expect(nextEstimatedStart(route,f,now+91000)).toBeNull();
});

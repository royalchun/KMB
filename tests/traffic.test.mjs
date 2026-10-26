import { describe, expect, it, vi } from 'vitest';
import { normalizeTraffic, createTrafficProvider, MAX_TRAFFIC_AGE } from '../server/traffic.mjs';
const now=Date.parse('2026-10-26T18:30:00+08:00');
const roads={type:'FeatureCollection',features:['1','2','3','4','5'].map(id=>({type:'Feature',properties:{id,name:'Road '+id},geometry:{type:'LineString',coordinates:[[114.20,22.32],[114.201,22.321]]}}))};
function xml(time='18:29:00') {return `<segment_speed_list><date>2026-10-26</date><time>${time}</time><segments><segment><segment_id>1</segment_id><speed>0</speed><valid>Y</valid></segment><segment><segment_id>2</segment_id><speed>30</speed><valid>Y</valid></segment><segment><segment_id>3</segment_id><speed>65</speed><valid>Y</valid></segment><segment><segment_id>4</segment_id><speed>50</speed><valid>N</valid></segment><segment><segment_id>5</segment_id><speed></speed><valid>Y</valid></segment></segments></segment_speed_list>`;}
describe('official traffic speeds',()=>{
 it('joins segment IDs to road geometry and colours observed speeds, including zero',()=>{
  const d=normalizeTraffic(xml(),roads,now);
  expect(d.features.map(f=>f.properties.color)).toEqual(['#eb6c77','#f5bb51','#58b68b']);
  expect(d.features.map(f=>f.properties.speed)).toEqual([0,30,65]);
  expect(d.sourceTime).toBe('2026-10-26T10:29:00.000Z');
 });
 it('does not turn invalid/missing/unknown segments into green roads',()=>{
  const d=normalizeTraffic(xml(),roads,now);
  expect(d.features.map(f=>f.properties.id)).toEqual(['1','2','3']);
  expect(normalizeTraffic(xml(),{features:[]},now).features).toEqual([]);
 });
 it('hides stale and future source timestamps regardless of retrieval time',()=>{
  expect(normalizeTraffic(xml(),roads,now+MAX_TRAFFIC_AGE).features).toEqual([]);
  expect(normalizeTraffic(xml('19:00:00'),roads,now).stale).toBe(true);
 });
 it('rejects malformed XML, missing timestamps and doctypes',()=>{
  for(const bad of ['<html>Offline</html>','<segment_speed_list><date>bad</date></segment_speed_list>','<!DOCTYPE x><x/>'])expect(()=>normalizeTraffic(bad,roads,now)).toThrow();
 });
 it('coalesces live requests for a minute and propagates upstream errors',async()=>{
  let clock=now;
  const get=vi.fn(async()=>({ok:true,text:async()=>xml()}));
  const provider=createTrafficProvider(get,()=>clock);
  await Promise.all([provider(),provider()]);await provider();expect(get).toHaveBeenCalledTimes(1);
  clock+=61000;await provider();expect(get).toHaveBeenCalledTimes(2);
  await expect(createTrafficProvider(async()=>({ok:false}),()=>now)()).rejects.toThrow('unavailable');
 });
});

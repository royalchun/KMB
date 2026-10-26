import { expect, it } from 'vitest';
import { toyBuses } from '../src/toyBuses';
import { cartoonStyle } from '../src/cartoonStyle';
import type { MapRoute } from '../src/types';
const make=(bearing:number): MapRoute=>({key:'ctb:22D:1',color:'#24766b',route:{operator:'ctb',route:'22D',direction:'outbound',serviceType:'1',origin:'A',destination:'B',stops:[],geometry:{segments:[],source:'test'}},buses:[{id:'bus',lng:114.2,lat:22.32,nextStop:{id:'a',seq:1,name:'A',nameTc:'A',lng:114.2,lat:22.32},bearing,segment:1,progress:.5,confidence:'low',seconds:20}]});
it('builds closed three-dimensional bus parts with windows, roof and wheels',()=>{
 const model=toyBuses([make(0)]);
 expect(model.features.length).toBeGreaterThan(10);
 for(const part of model.features){expect(part.geometry.coordinates[0][0]).toEqual(part.geometry.coordinates[0].at(-1));expect(part.properties!.height).toBeGreaterThan(part.properties!.base);}
 expect(new Set(model.features.map(f=>f.properties!.color)).size).toBeGreaterThan(3);
});
it('rotates bus geometry with the road heading without moving its centre',()=>{
 const north=toyBuses([make(0)]).features[0].geometry.coordinates[0];
 const east=toyBuses([make(90)]).features[0].geometry.coordinates[0];
 const span=(line:number[][],axis:number)=>Math.max(...line.map(p=>p[axis]))-Math.min(...line.map(p=>p[axis]));
 expect(span(north,1)).toBeGreaterThan(span(east,1));expect(span(east,0)).toBeGreaterThan(span(north,0));
});
it('provides a vector cartoon basemap with separate flat and extruded buildings',()=>{
 const style=cartoonStyle();
 expect(style.sources.town.type).toBe('vector');
 expect(style.layers.find(l=>l.id==='buildings-3d')?.type).toBe('fill-extrusion');
 expect(style.layers.find(l=>l.id==='building-flat')?.type).toBe('fill');
});

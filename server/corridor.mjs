import { selectionFrom } from './provider.mjs';
export const CORRIDOR_METRES = 200;
const SCALE = 111320, COS = Math.cos(22.32 * Math.PI / 180);
const xy = ([lng,lat]) => [lng*SCALE*COS,lat*SCALE];
export function trafficSelections(query) {
  if (query.routes === undefined) return [selectionFrom({})];
  if (typeof query.routes !== 'string' || query.routes.length > 240) throw new Error('Select up to three valid routes.');
  const entries = query.routes.split(',');
  if (!entries.length || entries.length > 3) throw new Error('Select up to three valid routes.');
  return entries.map(entry => {
    const parts = entry.split(':');
    if (parts.length !== 4 || parts.some(p => !p)) throw new Error('Invalid route selection.');
    return selectionFrom({operator:parts[0],route:parts[1],direction:parts[2],serviceType:parts[3]});
  });
}
function distanceSquared(p,a,b) {
  const x=b[0]-a[0],y=b[1]-a[1],d=x*x+y*y;
  const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/d)):0;
  return (p[0]-a[0]-t*x)**2+(p[1]-a[1]-t*y)**2;
}
/** Clip road geometry to a 200 m neighbourhood of the selected road paths.
 * Sampling is <=30 m, with binary-refined boundaries; no road links are
 * replaced by straight terminal-to-terminal connectors. */
export function clipToCorridor(roads, paths, radius = CORRIDOR_METRES) {
  const grid = new Map(), cell=radius;
  for(const path of paths)for(const line of path.segments)for(let i=1;i<line.length;i++) {
    const a=xy(line[i-1]),b=xy(line[i]);
    const minX=Math.floor((Math.min(a[0],b[0])-radius)/cell),maxX=Math.floor((Math.max(a[0],b[0])+radius)/cell);
    const minY=Math.floor((Math.min(a[1],b[1])-radius)/cell),maxY=Math.floor((Math.max(a[1],b[1])+radius)/cell);
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
      const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push([a,b]);
    }
  }
  const inside=p=>{
    const point=xy(p),segments=grid.get(`${Math.floor(point[0]/cell)},${Math.floor(point[1]/cell)}`);
    return !!segments?.some(([a,b])=>distanceSquared(point,a,b)<=radius*radius);
  };
  const boundary=(a,b)=>{
    let lo=a,hi=b;const state=inside(a);
    for(let i=0;i<12;i++){const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];if(inside(m)===state)lo=m;else hi=m;}
    return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
  };
  const features=[];
  for(const road of roads.features) {
    const original=road.geometry.coordinates;const points=[];
    for(let i=0;i<original.length;i++){
      if(i){const a=xy(original[i-1]),b=xy(original[i]);const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/30);
        for(let j=1;j<count;j++)points.push([original[i-1][0]+(original[i][0]-original[i-1][0])*j/count,original[i-1][1]+(original[i][1]-original[i-1][1])*j/count]);}
      points.push(original[i]);
    }
    let run=[];
    const finish=()=>{if(run.length>1)features.push({...road,geometry:{type:'LineString',coordinates:run}});run=[];};
    for(let i=0;i<points.length;i++){
      const current=inside(points[i]);
      if(i && current!==inside(points[i-1])){
        const edge=boundary(points[i-1],points[i]);
        if(current)run.push(edge);else {run.push(edge);finish();}
      }
      if(current)run.push(points[i]);
    }
    finish();
  }
  return {...roads,features};
}
export function createCorridorClipper(roads) {
  const cache=new Map();
  return paths=>{
    const key=JSON.stringify(paths.map(p=>p.segments));
    if(!cache.has(key)){
      if(cache.size>=32)cache.delete(cache.keys().next().value);
      cache.set(key,clipToCorridor(roads,paths));
    }
    return cache.get(key);
  };
}

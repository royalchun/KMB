"""Build the bounded traffic layer from official TD CENTERLINE.kmz.
Usage: python scripts/build-traffic-roads.py /path/to/CENTERLINE.kmz /path/to/speed_segments_info.csv
Download sources deliberately; do not run this on service startup.
"""
import csv, html, json, math, re, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
bbox = [114.17, 22.29, 114.24, 22.35]
ids = {r['irn_id'] for r in csv.DictReader(open(sys.argv[2], encoding='utf-8-sig'))}
ns = {'k':'http://www.opengis.net/kml/2.2'}
def simplify(points, tolerance=1.4):
    if len(points) <= 2: return points
    cos = math.cos(points[0][1] * math.pi / 180)
    def xy(p): return p[0]*111320*cos, p[1]*111320
    projected = list(map(xy,points)); keep={0,len(points)-1}; stack=[(0,len(points)-1)]
    while stack:
        first,last=stack.pop();a,b=projected[first],projected[last]; dx,dy=b[0]-a[0],b[1]-a[1]; denom=dx*dx+dy*dy
        best,index=0,first
        for i in range(first+1,last):
            px,py=projected[i];t=max(0,min(1,((px-a[0])*dx+(py-a[1])*dy)/denom)) if denom else 0
            d=math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)
            if d>best:best,index=d,i
        if best>tolerance:keep.add(index);stack.extend([(first,index),(index,last)])
    return [[round(v,6) for v in points[i]] for i in sorted(keep)]
features=[];count=0
with zipfile.ZipFile(sys.argv[1]) as z:
    with z.open(next(n for n in z.namelist() if n.endswith('.kml'))) as stream:
        for event,e in ET.iterparse(stream,events=['end']):
            if e.tag != '{'+ns['k']+'}Placemark':continue
            count+=1
            desc=e.findtext('k:description','',ns)
            match=re.search(r'<td>ROUTE_ID</td>\s*<td>(\d+)</td>',desc)
            if match and match[1] in ids:
                street=re.search(r'<td>STREET_ENAME</td>\s*<td>(.*?)</td>',desc,re.S)
                name=html.unescape(street[1]) if street else ''
                for coordinates in e.findall('.//k:LineString/k:coordinates',ns):
                    points=[[float(v) for v in p.split(',')[:2]] for p in coordinates.text.split()]
                    if any(bbox[0]<=p[0]<=bbox[2] and bbox[1]<=p[1]<=bbox[3] for p in points):
                        features.append({'type':'Feature','properties':{'id':match[1],'name':name},'geometry':{'type':'LineString','coordinates':simplify(points)}})
            e.clear()
payload={'type':'FeatureCollection','source':'HK Transport Department Road Network (2nd Generation), CENTERLINE.kmz; speed_segments_info.csv','retrieved':'2026-10-26','bbox':bbox,'features':features}
Path('server/traffic-roads.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
print('Read',count,'road records; bundled',len(features),'monitored road geometries around Kai Tak.')
print([(f['properties']['id'],f['properties']['name']) for f in features[:8]])

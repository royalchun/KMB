# Kai Tak bus monitor

A cartoon bus monitor for Kai Tak, with a pastel vector map, an interactive 3D toy-town prototype, live Hong Kong road-speed colours, and Citybus/KMB arrival-based bus estimates along road paths. The preset routes are **Citybus 22D (teal), 22S (orange), and 22X (purple)**. Select up to three routes with the checkboxes, use **Show all 3** to compare the presets, and tap a route number or a map stop/bus to open its arrival board. Changing direction affects that route only. Shared links preserve all selected routes and their directions.

## Development and deployment

Node.js 22+ is required; Node 24 was validated.

```sh
cd /workspace/KMB
npm ci
npm run dev
```

Vite serves port 5173 and proxies `/api` to port 3001. For production:

```sh
npm run build
npm start
```

The Node server serves the built UI and API on `PORT` (default 3001). `/api/health` checks server health, not upstream availability. The server respects existing HTTPS proxy and NO_PROXY configuration, preserves TLS verification, limits upstream concurrency, shares in-flight requests, and caches arrivals for 30 seconds. One failed route does not stop other routes updating. No database or required API key is needed.

`render.yaml` configures a Render Node web service with `npm ci && npm run build`, `npm start`, Node 24 and `/api/health`. Connect GitHub branch `main` in Render; pushes can trigger automatic deployment if enabled. Share the service's public HTTPS address. A free service may sleep between visits. The app is public to anyone with its address; it has no access controls. GitHub Pages cannot run its shared Node API.

## Sources and interpretation

- Live arrivals and stop metadata: Citybus at `rt.data.gov.hk/v2/transport/citybus`, KMB at `data.etabus.gov.hk/v1/transport/kmb`, via our same-origin API. Stop/direction/service selection is validated. Citybus 22D's unusual continuous loop ETA sequence is mapped from both official stop lists, including its mid-outbound direction change.
- Stops for both directions of 22D, 22S and 22X were saved from the official Citybus API on 26 October 2026. Live mode refreshes operator metadata; explicit demo mode (`?demo=1`) uses these snapshots and **synthetic** arrivals. It never silently replaces a failed live feed.
- 22D serves Kai Tak Station / Kai Tak Runway Area; 22S metadata says Kai Tak–AIRSIDE / Kai Tak Hospital–Cruise Terminal; 22X is One Victoria / Kai Tak Station. Refer to the operator's current stop list for actual service coverage and operating hours. Absence of ETAs is not proof no service exists.
- Vector basemap / building footprints: [OpenFreeMap](https://openfreemap.org/) and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The original cartoon style has pastel buildings, cream roads and hand-drawn water patterns. Keep provider / OpenStreetMap attribution and applicable ODbL notices. Vector tiles and fonts are loaded from `tiles.openfreemap.org`; no map key is required. The old standard raster basemap is no longer used.
- Road paths use [OSRM](https://project-osrm.org/) driving routes **through every stop**, preserving each leg's bends. They are estimates rather than official operator route shapes; bus-only turns, service variations, new roads and diversions can differ. Bus positions interpolate by distance along these same road paths, with arrows following their local heading. Saved paths for all six preset directions avoid a new routing request for each viewer; signatures prevent applying them to changed stop coordinates. Other routes use cached server-side road routing. If routing fails, stops and arrivals remain available while the line/vehicle markers are omitted; no diagonal line is substituted.
- ETA feeds contain **no GPS coordinates or vehicle IDs**. Markers are independent location hypotheses, not identified buses or a fleet count. The estimator uses adjacent-stop ETAs and a simple travel-time assumption. It rejects stale predictions older than 90 seconds, failed stops and ambiguous upstream arrivals. Predictions can move or remove markers on refresh.
- Click a bus to select its **hollow dotted trail**. That trail represents inferred progress through the displayed route; it is not recorded GPS history or confirmed stops visited by a physical vehicle. Solid lines and chevrons show the road ahead / travel direction. The legend matches route colours.
- Bus artwork is an original SVG Hong Kong double-decker in 2D and original polygon-based 3D double-deckers with decks, glass, wheels and lights. The same ETA hypotheses position both versions.

## Free live traffic colours

Traffic is enabled by default and can be toggled using **Traffic**. It overlays actual Transport Department readings on official road geometries around Kai Tak, in both 2D and 3D. It does not extract or copy Google Maps traffic colours and needs no Google/TomTom key.

The old speed-map feed was retired. The replacement is [Traffic Data of Strategic / Major Roads](https://data.gov.hk/en-data/dataset/hk-td-sm_4-traffic-data-strategic-major-roads):

- Processed feed: `https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml`.
- Segment membership: `https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/speed_segments_info.csv`.
- Official road centreline: [Road Network (2nd Generation)](https://data.gov.hk/en-data/dataset/hk-td-tis_15-road-network-v2), `https://static.data.gov.hk/td/road-network-v2/CENTERLINE.kmz`.

`server/traffic-roads.json` bundles 736 official monitored centreline geometries intersecting the area 114.17–114.24 E, 22.29–22.35 N. ROUTE_ID is joined to the feed's segment_id; geometries retain road bends and are simplified to about 1.4 m. They are not inferred from bus routes or drawn between endpoints. Attribution: Hong Kong Transport Department / DATA.GOV.HK. Dataset sources were retrieved 26 October 2026.

`/api/traffic` fetches the official XML, validates it and the Hong Kong source date/time, accepts only `valid=Y` numeric speed observations, and caches the upstream response for one minute across visitors. The UI polls once a minute. Both client and server remove colours for observations older than **10 minutes**, future/invalid timestamps, missing/invalid readings, or upstream failures. No reading is turned into a default green segment. Coverage is restricted to monitored roads; uncoloured roads mean no current data, not free-flowing traffic. The feed has publication delay, shown using **as of … HKT**, rather than pretending retrieval time is the observation time.

Our speed guide is **red <20 km/h, amber 20–40 km/h, green >40 km/h**. These are display bands for reported speeds, not Google congestion classes or speed-limit-relative categories. Click a coloured segment to see its reported speed and road name. Offsetting traffic lines slightly keeps route colours visible beside them. The HKeMobility link remains available in the journey card for official cameras/news.

To rebuild the bounded geometry, deliberately download the two static files above (CENTERLINE.kmz is about 126 MB) and run:

```sh
python scripts/build-traffic-roads.py /path/to/CENTERLINE.kmz /path/to/speed_segments_info.csv
```

The script streams the KML, filters monitored roads and the neighbourhood bounds, and writes only the small derived layer. It does not run during installation or service startup. No large road-network file is committed.

## Refreshing road snapshots

When the preset stop lists change, first refresh `src/route-snapshot.json` from the operator, then deliberately run:

```sh
node scripts/refresh-road-snapshots.mjs
npm run build
```

This requests six OSRM road routes, validates snaps and coordinates, and updates `server/road-snapshots.json` and the client snapshots. Installation does not automatically contact the public routing server. For a larger deployment use your own OSRM instance or a contracted routing provider rather than relying on the public demonstration server.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The browser suite launches a fresh production server on **3101**, separate from the development server. Chromium defaults to `/usr/bin/chromium`; override `CHROMIUM_PATH` for another installed Chromium. Browser tests use API fixtures and empty vector tiles. They exercise three-route visibility/focus/sharing, individual feed failures, stale predictions, zoom, directions, mobile layout, 2D/3D switching and rotation, and hiding failed/stale traffic colours. Unit tests cover routing/cache validation, road bends, directional interpolation, progress trimming, both operators and the 22D loop mapping. Screenshots are in ignored `test-results/`.

This upgrade passed 38 automated tests and 10 browser tests. Real traffic validation returned HTTP 200 with 727 fresh matching road-segment readings and all three speed bands. Separate 2D/3D visual checks used real vector tiles/fonts and the live traffic feed. The cloud Chromium trust store rejects the platform proxy certificate for external requests; these visual checks transfer real responses through the TLS-verified Node proxy client without disabling verification. Normal visitors’ browsers request tiles directly. The public service is https://kaitak-bus-monitor.onrender.com; confirm the new deployment after a push.

## 3D toy-town prototype

Choose **3D toy town** to see genuine extruded building footprints and original double-decker geometry; this is more than pitching a flat raster image. The camera moves closer and tilts, and the **Rotate toy town** control turns the view. Choose **2D cartoon** to return to the flat map. Stops, three-route comparison, ETA hypotheses and live traffic work in both modes.

Building colours/heights are illustrative: provider height values are compressed and bounded to 9–70 m, with a default where no height is known. Buses are deliberately enlarged toys, not scale replicas. Landmark stickers are approximate navigation aids. The prototype is not a survey, photorealistic reconstruction or vehicle GPS system. No plugin, paid map provider account, or 3D model subscription is needed for this implementation. WebGL support is required; the arrival board remains usable if map rendering is unavailable.

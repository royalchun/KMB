# Kai Tak bus monitor

A responsive bus monitor for Kai Tak, using live Citybus/KMB arrivals and estimated positions along road paths. The preset routes are **Citybus 22D (teal), 22S (orange), and 22X (purple)**. Select up to three routes with the checkboxes, use **Show all 3** to compare the presets, and tap a route number or a map stop/bus to open its arrival board. Changing direction affects that route only. Shared links preserve all selected routes and their directions.

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
- Map tiles and road data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under their applicable licences/attribution requirements. Respect the [standard tile usage policy](https://operations.osmfoundation.org/policies/tiles/); do not bulk-download or prefetch. Choose a tile provider for larger traffic.
- Road paths use [OSRM](https://project-osrm.org/) driving routes **through every stop**, preserving each leg's bends. They are estimates rather than official operator route shapes; bus-only turns, service variations, new roads and diversions can differ. Bus positions interpolate by distance along these same road paths, with arrows following their local heading. Saved paths for all six preset directions avoid a new routing request for each viewer; signatures prevent applying them to changed stop coordinates. Other routes use cached server-side road routing. If routing fails, stops and arrivals remain available while the line/vehicle markers are omitted; no diagonal line is substituted.
- ETA feeds contain **no GPS coordinates or vehicle IDs**. Markers are independent location hypotheses, not identified buses or a fleet count. The estimator uses adjacent-stop ETAs and a simple travel-time assumption. It rejects stale predictions older than 90 seconds, failed stops and ambiguous upstream arrivals. Predictions can move or remove markers on refresh.
- Click a bus to select its **hollow dotted trail**. That trail represents inferred progress through the displayed route; it is not recorded GPS history or confirmed stops visited by a physical vehicle. Solid lines and chevrons show the road ahead / travel direction. The legend matches route colours.
- Bus artwork is an original SVG Hong Kong double-decker illustration bundled with the app.

## HKeMobility traffic

The traffic control opens the official [HKeMobility live speed-map page](https://www.hkemobility.gov.hk/en/traffic-information/live/smp) in a separate tab. HKeMobility also provides traffic cameras and news there. No paid traffic key is required. HKeMobility sets `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'`, so its page cannot be embedded in this app. This is a direct connection to the official traffic service, **not an in-map congestion overlay**. Bus ETAs are not used to invent traffic conditions. The old unconfigured TomTom toggle has been removed; no TomTom key is consumed.

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

The browser suite launches a fresh production server on **3101**, separate from the development server. Chromium defaults to `/usr/bin/chromium`; override `CHROMIUM_PATH` for another installed Chromium. Browser tests use API fixtures and abort external map tile requests. They exercise three-route visibility/focus/sharing, individual feed failures, stale predictions, zoom, direction changes, mobile layout and the official traffic link. Unit tests cover routing/cache validation, road bends, directional interpolation, progress trimming, both operators and the 22D loop mapping. Screenshots are in ignored `test-results/`.

Real checks during this upgrade retrieved live stops/arrivals for all three routes, generated road geometry for all six preset directions, and received HTTP 200 from the official HKeMobility traffic page. The cloud Chromium trust store rejects the platform proxy certificate for external tiles; visual checks can transfer real tiles through the TLS-verified Node proxy client without disabling verification. Normal visitors' browsers request tiles directly. Verify the public Render URL after deployment.

## Future 3D

No additional ChatGPT plugin is required: MapLibre already supports camera pitch, vector maps, building extrusions and custom model layers. A future implementation can introduce vector tiles/building heights or a licensed 3D provider and bus models. A provider account/key may be needed for its data. Current **Tilt view** only changes camera perspective; this upgrade does not add 3D buildings. Rendering in 3D cannot turn ETA estimates into GPS tracking.

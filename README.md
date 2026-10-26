# Kai Tak bus monitor

A responsive 2D bus monitor centred on Kai Tak, with a zoomable OpenStreetMap map, bilingual stop markers, an arrival board, operator/route/direction selection, and deliberately labelled ETA-based position hypotheses. MapLibre supports a future move to vector maps and 3D buildings. The current tilt view only changes camera perspective.

**Route correction:** 22D is a **Citybus** route, not KMB. The bundled snapshot lists Kai Tak Station (Exit A) → Kai Tak Runway Area. Do not assume it serves Kai Tak Cruise Terminal. Live mode loads the operator’s current stop list rather than hard-coding these destinations. KMB routes are also supported through a separate adapter.

## Run locally

Node.js 22 or newer is required (24 was used for validation).

```sh
cd /workspace/KMB
npm ci
npm run dev
```

Vite serves the interface on port 5173 and proxies `/api` to the Node server on port 3001. For a production build:

```sh
npm run build
npm start
```

The production server serves the built app and API on `PORT` (default 3001). `/api/health` checks process readiness; it does **not** claim upstream feeds are available. The server uses fixed government URLs, validates route inputs, limits upstream concurrency to four, shares in-flight requests, caches stop metadata and arrivals, and reports partial outages. There is no database or required API key. Ten friends can use the same deployment and benefit from its shared 30-second ETA cache.

## Live data, demo, and limits

- Citybus: `https://rt.data.gov.hk/v2/transport/citybus` (route, route-stop, stop, ETA).
- KMB: `https://data.etabus.gov.hk/v1/transport/kmb` (route, route-stop, stop, ETA).
- The browser requests our same-origin `/api` endpoints, so deployment does not depend on government browser CORS policies.
- Live mode polls every 30 seconds. Demo mode polls synthetic arrivals every 10 seconds; it never silently replaces live data. A shared URL includes the current selection and labels demos using `?demo=1`.
- Stops/ETAs are matched by route direction **and stop sequence**. For Citybus 22D, the adapter combines both official stop lists to map its continuous loop ETA sequence and mid-route direction change back to the published legs. KMB service type is also checked; use the route form for special variants.
- Government predictions contain no vehicle IDs or GPS coordinates. Independent segment hypotheses are **not a fleet count** and cannot follow a specific physical bus. Markers can jump or disappear as predictions change.
- The estimator looks for an imminent downstream ETA and rejects matching future arrivals upstream. Where a recent upstream departure is available it brackets progress; otherwise it assumes 20 km/h plus dwell time. Confidence remains low or moderate. It excludes failed, missing, or older-than-90-second source timestamps. A refresh does not make stale source data fresh.
- Map lines connect published stop coordinates directly. They are **schematic**, not road-snapped, and may cross water/buildings. Exact operator/GTFS shapes are needed before claiming to follow the designated road path. Markers interpolate along these same schematic segments. An absent marker does not establish that no bus is operating.
- Stop snapshot source: [HK Bus Crawling](https://github.com/hkbus/hk-bus-crawling/tree/gh-pages), `routeFareList.min.json`, retrieved 2026-10-26. Only 22D stop names, coordinates and direction metadata are bundled. No upstream program code was copied. Live metadata supersedes this snapshot. Public data and map attribution should be retained; review source terms before broader commercial redistribution.
- Basemap: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Standard OSM tiles are suitable for a small interactive prototype under their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); do not bulk-download or prefetch them. For larger traffic, choose a supported tile provider.

## Optional live traffic

With no traffic provider configured, the traffic control explicitly says unavailable and links to HKeMobility. It does not invent congestion from bus ETAs.

For real traffic flow tiles, create a TomTom developer key and set `VITE_TOMTOM_API_KEY` **before building**. See `.env.example`. This key is embedded in the browser bundle by design: restrict it to your deployment hostname, set quota limits, and check provider pricing/terms. Rebuild after changes. The toggle overlays TomTom relative flow tiles on the base map. Traffic freshness/coverage is independent of bus predictions; no speed history or incidents are collected. This optional integration has not been checked with a real key.

## Share on the internet

`render.yaml` defines a single Node web service with a production build and health check. To publish:

1. Commit this project and push it to your GitHub repository.
2. Sign into Render, create a **Blueprint**, and connect `royalchun/KMB` using `render.yaml`. Alternatively create a Node Web Service with build `npm ci && npm run build`, start `npm start`, and health path `/api/health`.
3. Confirm the page loads and that a real stop shows fresh ETA data. Share the HTTPS address using **Share monitor**. A sleeping free service can take time to wake up; choose a paid always-on plan if this matters. Hosting availability and pricing can change.

No deployment account is connected in this workspace; no public site has been created. The repository is initially unborn, and onboarding's saved filesystem snapshot should be preserved until you commit/push the project. No Git push is performed by setup. A link is public to anyone who has it; access control is not implemented. Avoid GitHub Pages for this version: its static hosting cannot run the shared API server.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

The browser suite uses Chromium at `/usr/bin/chromium` (override `CHROMIUM_PATH` for another installed Chromium). It runs the production server. Build before running it. Tests deliberately abort external map tile requests instead of bulk-downloading them. Government API responses are fixtures for integration tests; passing them does not establish real feed access. E2E checks exercise failure/demo separation, map markers and zoom, direction changes, route and share selection, stale feeds, dialogs, and mobile layout. Screenshots go in ignored `test-results/`.

**Live validation (26 October 2026):** after adding the required egress domains and enabling proxy-aware server requests, real Citybus 22D metadata and fresh arrivals were retrieved for all 9 outbound and 10 inbound stops. KMB 5R returned 18 stops with arrivals. A live browser smoke check displayed 9 stop markers, a position hypothesis, and real map tiles with no client errors. The cloud Chromium profile rejects the platform proxy certificate for external requests, so that visual check transferred 24 real tiles through the TLS-verified Node proxy client; direct external tile loading in Chromium remains limited by its trust store. No certificate verification was disabled. Normal users’ browsers fetch OSM tiles directly. The cloud configuration draft retains those domain additions for publication. The server honours the existing HTTPS proxy and NO_PROXY settings without disabling TLS verification. No live GPS, exact road shape, full 3D model, public deployment, or verified traffic overlay is claimed.

## Future 3D upgrade

The renderer is MapLibre GL JS rather than a 2D-only renderer. Introduce a licensed vector basemap with building heights and a `fill-extrusion` layer; replace the schematic line with authoritative route geometry and project estimates along that geometry. Vehicle models can then use a custom 3D layer. Better estimates require timestamp history, calibrated segment travel times, and ideally an operator vehicle-position feed; 3D rendering alone cannot improve location accuracy.

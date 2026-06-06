# TBAS

TBAS (Trajectory-Based Awareness System) is a web-based airport surveillance and situational-awareness viewer for Korean airport operations. The application combines live aircraft positions, ADS-B health, weather radar, satellite basemaps, terminal waypoints, and calibrated airport chart overlays in a single operational map.

Production site: https://tbas.vercel.app

## Current scope

- Live aircraft monitoring with multi-source ADS-B fallback
- Weather radar overlay via a serverless RainViewer proxy
- Satellite basemap support through Mapbox tiles
- Airport chart overlays using calibrated PNG bounds and airport coordinate metadata
- Terminal waypoint and airspace visualization
- Aircraft detail panel with photo lookup, route lookup, and track history helpers
- Vercel serverless API layer for external aviation/weather services

## Local development

```bash
npm install
npm run dev
```

For local testing of serverless API routes, use Vercel dev:

```bash
vercel dev --listen 5175 -y
```

Then open:

```text
http://localhost:5175
```

## Build

```bash
npm run build
```

## Deployment

The project is linked to Vercel and currently deploys to:

```text
https://tbas.vercel.app
```

Production deployment command:

```bash
vercel deploy --prod -y
```

## Runtime services

- `/api/aircraft` aggregates aircraft data from ADS-B community feeds and OpenSky.
- `/api/weather` fetches RainViewer radar metadata.
- `/api/radar-tile` proxies weather radar tiles so browser CSP and third-party tile limitations do not block display.
- `/api/aircraft-photo` resolves aircraft photos by registration and ICAO hex.
- `/api/aircraft-details` provides aircraft metadata fallback through a server-side proxy.
- `/api/aircraft-track` provides aircraft track-history fallback through a server-side proxy.
- `/api/flight-route` resolves route and airport metadata.

See `docs/API.md` for endpoint details.

## Data assets

Airport and chart assets live under `public/` and are loaded at runtime. Calibrated chart overlays should include both the image asset and coordinate/bounds metadata. For Ulsan/RKPU, manually calibrated chart bounds are merged into the generated airport chart metadata so QGIS-aligned assets are preferred instead of approximate center-derived bounds.

## Operational notes

- ADS-B status is only shown as healthy when usable aircraft are actually returned.
- Service-worker API handling is network-first and avoids serving stale `/api/*` responses.
- Chart layer IDs are namespaced per airport to avoid stale overlay collisions when switching airports.
- Satellite basemap uses an explicit Mapbox satellite tile fallback.

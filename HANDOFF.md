# TBAS Handoff Notes

## Summary

TBAS is prepared as a deployable Vercel web application for airport surveillance visualization. The latest stabilization pass focused on live-data reliability, airport overlay correctness, and partner-facing repository organization.

## Recently stabilized areas

- ADS-B live aircraft feed now uses multiple upstream sources and only reports healthy status when aircraft are returned.
- Weather radar now loads through serverless metadata and tile proxy endpoints.
- Satellite view has an explicit Mapbox satellite fallback instead of relying on a style switch that may silently fail.
- Aircraft photos are resolved server-side with registration and ICAO hex fallbacks.
- Aircraft detail metadata and track-history calls are proxied server-side to reduce browser CORS failures.
- RKPU chart overlays use calibrated bounds metadata and merge with generated chart metadata.
- Airport chart overlays are namespaced per airport to prevent cross-airport layer/source collisions.
- Terminal waypoint visibility defaults to enabled.
- Service worker avoids stale cached API responses.
- Local QA screenshots/logs were moved out of the root project into `_archive/local-qa`.

## Partner review focus

1. Confirm each airport chart overlay against known runway geometry and published airport references.
2. Confirm RKPU QGIS-calibrated PNG overlays visually align with the intended basemap at operating zoom levels.
3. Confirm ADS-B behavior from the deployment environment during a busy traffic window.
4. Confirm weather radar tile availability from the production domain.
5. Confirm whether additional authenticated data providers are required for operational-grade aircraft details.

## Known constraints

- ADS-B community feeds can be rate-limited or temporarily unavailable; the app is designed to fail over rather than depend on a single source.
- Aircraft photo coverage depends on public photo providers and may be unavailable for some registrations.
- OpenSky track history availability varies by aircraft and time window.
- Some chart overlays still depend on metadata quality; any airport-specific QGIS calibration should be added as explicit bounds metadata.

## Deployment

Production URL:

```text
https://tbas.vercel.app
```

Recommended final check before external handoff:

```bash
npm run build
vercel deploy --prod -y
```

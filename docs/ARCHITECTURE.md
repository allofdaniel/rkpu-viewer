# Architecture

## Overview

TBAS is a Vite/React single page application deployed to Vercel. The browser application renders the operational map and UI, while Vercel serverless functions normalize external aviation, weather, NOTAM, image, and tracking providers.

## Frontend layers

- `src/App.jsx`: top-level composition of stores, hooks, map layers, and panels.
- `src/stores`: Zustand state stores for map, UI, aircraft, ATC, and layer visibility.
- `src/hooks`: data loading and map-layer side effects.
- `src/components`: user-facing panels and controls.
- `src/constants`: static application configuration and airport metadata.
- `src/utils`: geometry, weather parsing, flight state, logging, and sanitization helpers.

## Serverless API layer

The API layer keeps provider calls out of the browser where practical. This improves CORS behavior, lets the app degrade gracefully when providers rate-limit, and keeps browser CSP smaller.

Primary API routes:

- `api/aircraft.js`
- `api/aircraft-trace.js`
- `api/aircraft-photo.js`
- `api/aircraft-details.js`
- `api/aircraft-track.js`
- `api/weather.js`
- `api/radar-tile.js`
- `api/notam.js`
- `api/flight-route.js`

## Data flow

1. Static aviation and chart data load from `public/`.
2. Live aircraft data comes through `/api/aircraft`.
3. Selected-aircraft panels request detail, image, route, and track data through API proxies.
4. Weather panels and layers request `/api/weather` and `/api/radar-tile`.
5. Mapbox GL renders the base map, overlays, aircraft, routes, procedures, weather layers, and chart images.

## Deployment model

Vercel serves the frontend build output and serverless API functions from the same project. The service worker is configured to avoid stale API data and to take control after new deployments.

## Operational boundaries

TBAS depends on several external providers. Provider outages, rate limits, unavailable images, and empty historical track data should be treated as expected operating conditions rather than application failures.
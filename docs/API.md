# API Reference

## `/api/aircraft`

Returns live aircraft near a latitude/longitude/radius query.

Query parameters:

- `lat`: center latitude.
- `lon`: center longitude.
- `radius`: radius in nautical miles, from 1 to 500.

Behavior:

- Tries ADS-B aggregators with fallback.
- Merges OpenSky state vectors when available.
- Returns an `ac` array compatible with common ADS-B Exchange style fields.

## `/api/aircraft-trace`

Returns latest per-aircraft trace/hex data.

Query parameters:

- `hex`: six-character Mode-S hex.

Behavior:

- Tries `adsb.lol`, `airplanes.live`, and `adsb.fi`.
- Returns an empty `ac` array when no source has trace data.

## `/api/aircraft-photo`

Resolves aircraft image metadata.

Query parameters:

- `reg`: aircraft registration.
- `hex`: six-character Mode-S hex.

Behavior:

- Tries normalized registration variants.
- Uses public aircraft photo providers where available.
- Returns `{ source: null, image: null }` when no public image is available.

## `/api/aircraft-details`

Returns registry-style aircraft details for a Mode-S hex.

Query parameters:

- `hex`: six-character Mode-S hex.

Behavior:

- Proxies external aircraft detail lookup.
- Falls back to a minimal `{ ModeS }` object when upstream data is unavailable.

## `/api/aircraft-track`

Returns OpenSky track data for selected aircraft.

Query parameters:

- `hex`: six-character Mode-S hex.
- `time`: optional epoch time; `0` means latest available track.

Behavior:

- Returns an empty `path` array when OpenSky has no track or is unavailable.

## `/api/weather`

Returns weather or weather-layer metadata.

Query parameters:

- `type`: `metar`, `taf`, `radar`, `satellite`, `sigmet`, `lightning`, or `llws`.
- `station`: optional ICAO station, default `RKPU`.

Behavior:

- METAR/TAF use aviationweather.gov.
- Radar/satellite metadata uses RainViewer.
- Empty fallback objects are returned for unavailable optional weather products.

## `/api/radar-tile`

Proxies RainViewer radar tile images.

Query parameters:

- `path`: RainViewer tile path beginning with `/` and containing `/radar/`.

Behavior:

- Rejects path traversal and absolute external URLs.
- Returns PNG/image bytes with short cache headers.

## `/api/notam`

Returns NOTAM data with static fallback behavior.

Behavior:

- Uses configured storage when available.
- Falls back to bundled/static NOTAM data when external storage is unavailable.
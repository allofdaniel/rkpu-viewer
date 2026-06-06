import { useState, useEffect } from 'react';
import { generateColor, PROCEDURE_COLORS } from '../utils/colors';
import { logger } from '../utils/logger';

// ============================================
// 항공 데이터 타입 정의
// ============================================

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  type?: string;
}

export interface Obstacle {
  name?: string;
  lat: number;
  lon: number;
  elevation_ft: number;
  type?: string;
}

export interface ProcedurePoint {
  name: string;
  lat: number;
  lon: number;
  alt_restriction?: string;
  speed_restriction?: string;
}

export interface Procedure {
  name: string;
  runway?: string;
  type: 'SID' | 'STAR' | 'APPROACH';
  points: ProcedurePoint[];
}

export interface AviationData {
  procedures?: {
    SID?: Record<string, Procedure>;
    STAR?: Record<string, Procedure>;
    APPROACH?: Record<string, Procedure>;
  };
  waypoints?: Waypoint[];
  obstacles?: Obstacle[];
  airspace?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProcColors {
  SID: Record<string, string>;
  STAR: Record<string, string>;
  APPROACH: Record<string, string>;
}

// ============================================
// 한국 공역 데이터 타입 정의
// ============================================

export interface KoreaWaypoint {
  name: string;
  lat: number;
  lon: number;
  type: string;
}

export interface KoreaNavaid {
  ident: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  freq_mhz: string | null;
}

export interface RoutePoint {
  name: string;
  full_name?: string;
  lat: number;
  lon: number;
  mea_ft?: number;
}

export interface KoreaRoute {
  name: string;
  type: string;
  points: RoutePoint[];
}

export interface KoreaAirspace {
  name: string;
  type: string;
  category: string;
  boundary: [number, number][]; // [lon, lat][]
  lower_limit_ft?: number;
  upper_limit_ft?: number;
}

export interface KoreaAirspaceMetadata {
  source?: string;
  airac?: string;
  extracted?: string;
  url?: string;
  navigraph_cycle?: string;
  navigraph_db?: string;
  airports_count?: number;
  navaids_count?: number;
  waypoints_count?: number;
  routes_count?: number;
  airspaces_count?: number;
  gates_count?: number;
  sids_count?: number;
  stars_count?: number;
  iaps_count?: number;
  holdings_count?: number;
  msa_count?: number;
  markers_count?: number;
  terminal_waypoints_count?: number;
  frequencies_count?: number;
  enroute_comms_count?: number;
}

export interface KoreaRunway {
  id: string;
  lat: number;
  lon: number;
  length_m: number;
  width_m: number;
  heading_mag: number | null;
  heading_true: number | null;
  elevation_ft: number;
  surface: string;
  lights: boolean;
  ils_ident: string | null;
  ils_cat: string | null;
}

export interface KoreaILS {
  runway: string;
  ident: string;
  freq: string;
  category: string;
  course: number | null;
  gs_angle: number;
  gs_elev: number;
  llz_lat: number;
  llz_lon: number;
  gs_lat: number;
  gs_lon: number;
}

export interface KoreaComm {
  type: string;
  callsign: string;
  freq: string;
}

export interface KoreaAirport {
  icao: string;
  iata: string | null;
  name: string;
  city: string;
  lat: number;
  lon: number;
  elevation_ft: number;
  mag_var: number;
  transition_alt: number;
  transition_level: number;
  type: 'civil' | 'military' | 'joint';
  ifr: boolean;
  runways: KoreaRunway[];
  ils: KoreaILS[];
  comms: KoreaComm[];
  gates?: KoreaGate[];
  frequencies?: KoreaFrequency[];
}

export interface KoreaGate {
  id: string;
  name: string | null;
  lat: number;
  lon: number;
}

export interface KoreaFrequency {
  type: string;
  freq: number;
  callsign: string | null;
  sector: string | null;
}

export interface KoreaHolding {
  waypoint: string;
  name: string;
  lat: number;
  lon: number;
  inbound_course: number;
  turn: string;
  leg_time: number | null;
  leg_length: number | null;
  speed: number | null;
  min_alt: number | null;
  max_alt: number | null;
}

export interface KoreaEnrouteComm {
  type: string;
  callsign: string;
  freq: number;
  fir: string;
  lat: number;
  lon: number;
}

export interface KoreaProcedureLeg {
  seq: number;
  wpt: string | null;
  path: string | null;
  course: number | null;
  dist: number | null;
  alt_desc: string | null;
  alt1: number | null;
  alt2: number | null;
  spd_lim: number | null;
  turn: string | null;
}

export interface KoreaProcedures {
  sids: Record<string, Record<string, KoreaProcedureLeg[]>>;
  stars: Record<string, Record<string, KoreaProcedureLeg[]>>;
  iaps: Record<string, Record<string, KoreaProcedureLeg[]>>;
}

export interface KoreaMSASector {
  bearing: number;
  altitude: number;
}

export interface KoreaMSA {
  airport: string;
  center: string;
  radius: number;
  sectors: KoreaMSASector[];
}

export interface KoreaMarker {
  airport: string;
  runway: string;
  llz: string;
  type: string;
  id: string | null;
  lat: number;
  lon: number;
}

export interface KoreaTerminalWaypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  region: string;
}

export interface KoreaAirspaceData {
  waypoints?: KoreaWaypoint[];
  routes?: KoreaRoute[];
  navaids?: KoreaNavaid[];
  airspaces?: KoreaAirspace[];
  airports?: KoreaAirport[];
  holdings?: KoreaHolding[];
  enrouteComms?: KoreaEnrouteComm[];
  procedures?: KoreaProcedures;
  msa?: KoreaMSA[];
  markers?: KoreaMarker[];
  terminalWaypoints?: KoreaTerminalWaypoint[];
  metadata?: KoreaAirspaceMetadata;
}

type ChartPoint = [number, number];
type ChartBoundsTuple = [ChartPoint, ChartPoint, ChartPoint, ChartPoint];
type MutableChart = {
  file?: string;
  bounds?: unknown;
  type?: string;
  name?: string;
  method?: string;
  [key: string]: unknown;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isChartBounds = (bounds: unknown): bounds is ChartBoundsTuple => (
  Array.isArray(bounds) &&
  bounds.length === 4 &&
  bounds.every((point) => Array.isArray(point) && point.length === 2 && isFiniteNumber(point[0]) && isFiniteNumber(point[1]))
);

const chartCenter = (bounds: ChartBoundsTuple): { lon: number; lat: number } => {
  const total = bounds.reduce((acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }), { lon: 0, lat: 0 });
  return { lon: total.lon / bounds.length, lat: total.lat / bounds.length };
};

const shiftBounds = (bounds: ChartBoundsTuple, lonDelta: number, latDelta: number): ChartBoundsTuple => (
  bounds.map(([lon, lat]) => [lon + lonDelta, lat + latDelta]) as ChartBoundsTuple
);

const normalizeChartBounds = (
  rawAllBounds: Record<string, Record<string, unknown>>,
  koreaData: KoreaAirspaceData | null
): Record<string, Record<string, unknown>> => {
  const airportCenters = new Map<string, { lat: number; lon: number }>();
  koreaData?.airports?.forEach((airport) => {
    if (isFiniteNumber(airport.lat) && isFiniteNumber(airport.lon)) {
      airportCenters.set(airport.icao, { lat: airport.lat, lon: airport.lon });
    }
  });

  const normalized: Record<string, Record<string, unknown>> = {};
  Object.entries(rawAllBounds || {}).forEach(([airportIcao, charts]) => {
    const center = airportCenters.get(airportIcao);
    normalized[airportIcao] = {};

    Object.entries(charts || {}).forEach(([chartId, chart]) => {
      const mutable = { ...(chart as MutableChart) };
      if (center && mutable.method !== 'manual' && isChartBounds(mutable.bounds)) {
        const currentCenter = chartCenter(mutable.bounds);
        const lonDelta = center.lon - currentCenter.lon;
        const latDelta = center.lat - currentCenter.lat;
        const drift = Math.hypot(lonDelta, latDelta);
        if (drift > 0.05) {
          mutable.bounds = shiftBounds(mutable.bounds, lonDelta, latDelta);
          mutable.method = mutable.method ? `${mutable.method}+airport-center-normalized` : 'airport-center-normalized';
        }
      }
      normalized[airportIcao][chartId] = mutable;
    });
  });

  return normalized;
};
export interface UseDataLoadingReturn {
  data: AviationData | null;
  sidVisible: Record<string, boolean>;
  setSidVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  starVisible: Record<string, boolean>;
  setStarVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  apchVisible: Record<string, boolean>;
  setApchVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  procColors: ProcColors;
  chartBounds: Record<string, unknown>;
  allChartBounds: Record<string, Record<string, unknown>>;
  chartOpacities: Record<string, number>;
  setChartOpacities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  atcData: unknown;
  koreaAirspaceData: KoreaAirspaceData | null;
}

/**
 * useDataLoading - 정적 데이터 로딩 훅
 */
export default function useDataLoading(): UseDataLoadingReturn {
  const [data, setData] = useState<AviationData | null>(null);
  const [sidVisible, setSidVisible] = useState<Record<string, boolean>>({});
  const [starVisible, setStarVisible] = useState<Record<string, boolean>>({});
  const [apchVisible, setApchVisible] = useState<Record<string, boolean>>({});
  const [procColors, setProcColors] = useState<ProcColors>({ SID: {}, STAR: {}, APPROACH: {} });

  const [chartBounds, setChartBounds] = useState<Record<string, unknown>>({});
  const [allChartBounds, setAllChartBounds] = useState<Record<string, Record<string, unknown>>>({});
  const [chartOpacities, setChartOpacities] = useState<Record<string, number>>({});

  const [atcData, setAtcData] = useState<unknown>(null);
  const [koreaAirspaceData, setKoreaAirspaceData] = useState<KoreaAirspaceData | null>(null);

  // Load aviation data
  useEffect(() => {
    fetch('/aviation_data.json')
      .then((res) => res.json())
      .then((json: AviationData) => {
        setData(json);
        const sidKeys = Object.keys(json.procedures?.SID || {});
        const starKeys = Object.keys(json.procedures?.STAR || {});
        const apchKeys = Object.keys(json.procedures?.APPROACH || {});

        console.log('[DataLoading] Loaded aviation data:', {
          sidCount: sidKeys.length,
          starCount: starKeys.length,
          apchCount: apchKeys.length,
          sidKeys: sidKeys.slice(0, 3),
          firstSidSegments: json.procedures?.SID?.[sidKeys[0]]?.segments?.length
        });

        setSidVisible(Object.fromEntries(sidKeys.map((k) => [k, false])));
        setStarVisible(Object.fromEntries(starKeys.map((k) => [k, false])));
        setApchVisible(Object.fromEntries(apchKeys.map((k) => [k, false])));
        // Use Navigraph Charts colors for procedures
        setProcColors({
          SID: Object.fromEntries(sidKeys.map((k) => [k, PROCEDURE_COLORS.SID])),
          STAR: Object.fromEntries(starKeys.map((k) => [k, PROCEDURE_COLORS.STAR])),
          APPROACH: Object.fromEntries(apchKeys.map((k) => [k, PROCEDURE_COLORS.APPROACH])),
        });
      })
      .catch((err) => {
        console.error('[DataLoading] Failed to load aviation data:', err);
      });
  }, []);

  // Load all chart bounds (multi-airport) + merge RKPU manual charts
  useEffect(() => {
    Promise.all([
      fetch('/charts/all_chart_bounds.json').then(res => res.ok ? res.json() : {}),
      fetch('/charts/chart_bounds.json').then(res => res.ok ? res.json() : {}),
      fetch('/data/korea_airspace.json').then(res => res.ok ? res.json() : null)
    ]).then(([rawAllBounds, rkpuManualBounds, koreaData]: [Record<string, Record<string, unknown>>, Record<string, unknown>, KoreaAirspaceData | null]) => {
      const allBounds = normalizeChartBounds(rawAllBounds, koreaData);
      const rkpuCharts: Record<string, unknown> = {};

      Object.entries(rkpuManualBounds).forEach(([chartId, chart]) => {
        const manualChart = chart as MutableChart;
        if (!isChartBounds(manualChart.bounds)) return;

        rkpuCharts[chartId] = {
          ...manualChart,
          bounds: manualChart.bounds,
          file: typeof manualChart.file === 'string' ? manualChart.file : `/charts/${chartId}.png`,
          type: manualChart.type || (chartId.startsWith('sid') ? 'SID' :
                chartId.startsWith('star') ? 'STAR' :
                chartId.startsWith('apch') ? 'IAC' : 'OTHER'),
          name: manualChart.name || chartId.replace(/_/g, ' ').toUpperCase(),
          method: manualChart.method || 'manual'
        };
      });

      if (Object.keys(rkpuCharts).length > 0) {
        allBounds.RKPU = { ...(allBounds.RKPU || {}), ...rkpuCharts };
        logger.debug('DataLoading', `Merged ${Object.keys(rkpuCharts).length} manual RKPU charts without discarding folder charts`);
      }

      setAllChartBounds(allBounds);
      setChartBounds(rkpuManualBounds);

      const opacities: Record<string, number> = {};
      Object.values(allBounds).forEach(airport => {
        Object.keys(airport).forEach(chartId => {
          opacities[chartId] = 0.7;
        });
      });
      setChartOpacities(opacities);
      logger.debug('DataLoading', `Loaded chart bounds for ${Object.keys(allBounds).length} airports`);
    }).catch((err) => logger.warn('DataLoading', 'Failed to load chart bounds', { error: (err as Error).message }));
  }, []);

  // Load ATC sectors
  useEffect(() => {
    fetch('/atc_sectors.json')
      .then((res) => res.json())
      .then((data) => setAtcData(data))
      .catch((err) => logger.warn('DataLoading', 'Failed to load ATC sectors', { error: (err as Error).message }));
  }, []);

  // Load Korea airspace data
  useEffect(() => {
    fetch('/data/korea_airspace.json')
      .then((res) => res.json())
      .then((data: KoreaAirspaceData) => {
        setKoreaAirspaceData(data);
        const m = data.metadata;
        logger.info('DataLoading', `Loaded Korea airspace: ${data.airports?.length || 0} airports, ${data.waypoints?.length} waypoints, ${data.routes?.length} routes, ${data.navaids?.length} navaids, ${data.airspaces?.length} airspaces, ${data.holdings?.length || 0} holdings, ${m?.sids_count || 0} SID legs, ${m?.stars_count || 0} STAR legs, ${m?.iaps_count || 0} IAP legs, ${data.terminalWaypoints?.length || 0} terminal WPTs (AIRAC ${m?.airac}, Navigraph ${m?.navigraph_cycle || 'N/A'})`);
      })
      .catch((err) => logger.warn('DataLoading', 'Failed to load Korea airspace data', { error: (err as Error).message }));
  }, []);

  return {
    data,
    sidVisible,
    setSidVisible,
    starVisible,
    setStarVisible,
    apchVisible,
    setApchVisible,
    procColors,
    chartBounds,
    allChartBounds,
    chartOpacities,
    setChartOpacities,
    atcData,
    koreaAirspaceData,
  };
}

/**
 * Service Worker for TBAS PWA
 * DO-278A 요구사항 추적: SRS-PWA-001
 *
 * 캐싱 전략:
 * - App Shell: Cache First (기본 UI 파일)
 * - 정적 자산: Cache First with Network Fallback
 * - API 데이터: Network First with Cache Fallback
 * - 항공 데이터: AIRAC 주기 기반 버전 관리
 */

// AIRAC 기준일 (28일 주기)
const AIRAC_BASE_DATE = new Date('2024-01-25');
const AIRAC_CYCLE_DAYS = 28;

// 현재 AIRAC 사이클 계산
function getCurrentAiracCycle() {
  const now = new Date();
  const diffTime = Math.abs(now - AIRAC_BASE_DATE);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / AIRAC_CYCLE_DAYS);
}

const AIRAC_CYCLE = getCurrentAiracCycle();
const CACHE_VERSION = 'v7';

// 캐시 이름 정의
const CACHES = {
  appShell: `tbas-app-shell-${CACHE_VERSION}`,
  static: `tbas-static-${CACHE_VERSION}`,
  dynamic: `tbas-dynamic-${CACHE_VERSION}`,
  aviation: `tbas-aviation-${CACHE_VERSION}-airac-${AIRAC_CYCLE}`,
  api: `tbas-api-${CACHE_VERSION}`,
};

// App Shell - 핵심 UI 파일
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 정적 자산 - 아이콘 (3D 모델은 온디맨드 로딩)
// DO-278A 성능 최적화: 큰 GLB 파일(125MB)은 설치 시 캐시하지 않음
const STATIC_ASSETS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/radar_dome.glb', // 375KB - 작은 모델만 캐시
];

// 온디맨드 로딩 3D 모델 (요청 시 캐시)
const ON_DEMAND_3D_MODELS = [
  '/A380.glb',      // 51MB - 온디맨드
  '/b737.glb',      // 19MB - 온디맨드
  '/b777.glb',      // 53MB - 온디맨드
  '/helicopter.glb', // 2.3MB - 온디맨드
];

// 항공 데이터 파일 - AIRAC 주기별 캐싱
const AVIATION_DATA_FILES = [
  '/aviation_data.json',
  '/atc_sectors.json',
  '/data/korea_airspace.json',
];

// API 캐시 TTL (초)
const API_CACHE_TTL = {
  weather: 60,        // 기상 데이터: 1분
  notam: 600,         // NOTAM: 10분
  aircraft: 0,        // 실시간 항공기: 캐시 안함
  default: 300,       // 기타: 5분
};

/**
 * Install - 초기 캐시 설정
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');

  event.waitUntil(
    Promise.all([
      // App Shell 캐시
      caches.open(CACHES.appShell).then((cache) => {
        console.log('[SW] Caching App Shell');
        return cache.addAll(APP_SHELL_FILES);
      }),
      // 정적 자산 캐시 (실패해도 진행)
      caches.open(CACHES.static).then((cache) => {
        console.log('[SW] Caching Static Assets');
        return Promise.allSettled(
          STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => null))
        );
      }),
      // 항공 데이터 캐시
      caches.open(CACHES.aviation).then((cache) => {
        console.log('[SW] Caching Aviation Data (AIRAC:', AIRAC_CYCLE, ')');
        return Promise.allSettled(
          AVIATION_DATA_FILES.map((file) => cache.add(file).catch(() => null))
        );
      }),
    ]).then(() => self.skipWaiting())
  );
});

/**
 * Activate - 오래된 캐시 정리
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');

  const currentCaches = Object.values(CACHES);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !currentCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch - 요청 처리
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET 요청만 처리
  if (request.method !== 'GET') {
    return;
  }

  // 외부 요청, 확장 프로그램 무시
  if (url.origin !== location.origin || url.protocol === 'chrome-extension:') {
    return;
  }

  // API 요청 처리
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, url));
    return;
  }

  // 항공 데이터 파일
  if (AVIATION_DATA_FILES.some((f) => url.pathname.endsWith(f))) {
    event.respondWith(handleAviationData(request));
    return;
  }

  // 정적 자산 (3D 모델, 이미지)
  if (url.pathname.match(/\.(glb|gltf|png|jpg|jpeg|svg|ico)$/)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // 기본: App Shell (네트워크 우선, 캐시 폴백)
  event.respondWith(handleAppShell(request));
});

/**
 * API 요청 처리 - Network First with Cache Fallback
 */
async function handleApiRequest(request, url) {
  // 실시간 항공기 데이터는 항상 네트워크
  if (url.pathname.includes('/aircraft')) {
    try {
      return await fetch(request);
    } catch {
      return new Response(JSON.stringify({ error: 'Offline', data: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 기타 API: Stale-While-Revalidate
  const cache = await caches.open(CACHES.api);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // 캐시가 있으면 바로 반환하고 백그라운드에서 업데이트
  if (cached) {
    fetchPromise; // 백그라운드 업데이트
    return cached;
  }

  // 캐시 없으면 네트워크 대기
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // 오프라인 폴백
  return new Response(JSON.stringify({ error: 'Offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 항공 데이터 처리 - Cache First (AIRAC 주기별)
 */
async function handleAviationData(request) {
  const cache = await caches.open(CACHES.aviation);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(JSON.stringify({ error: 'Data unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 정적 자산 처리 - Cache First
 */
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHES.static);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 이미지의 경우 플레이스홀더 반환 가능
    return new Response('', { status: 404 });
  }
}

/**
 * App Shell 처리 - Network First with Cache Fallback
 */
async function handleAppShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHES.appShell);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html');
  }
}

/**
 * 메시지 처리 - 클라이언트와 통신
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_CACHE_SIZE') {
    getCacheSize().then((size) => {
      event.ports[0].postMessage({ size });
    });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

/**
 * 캐시 크기 계산
 */
async function getCacheSize() {
  if (!('storage' in navigator && 'estimate' in navigator.storage)) {
    return null;
  }
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage,
    quota: estimate.quota,
    percent: ((estimate.usage / estimate.quota) * 100).toFixed(2),
  };
}

/**
 * 모든 캐시 삭제
 */
async function clearAllCaches() {
  const keys = await caches.keys();
  return Promise.all(keys.map((key) => caches.delete(key)));
}

console.log('[SW] Service Worker loaded (AIRAC cycle:', AIRAC_CYCLE, ')');

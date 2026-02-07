/**
 * CORS 및 Rate Limiting 설정 유틸리티
 * DO-278A 요구사항 추적: SRS-SEC-002, SRS-SEC-003
 *
 * 환경변수 기반 CORS 화이트리스트 및 Rate Limiting 관리
 * Vercel KV 지원 (분산 rate limiting)
 */

// Rate Limiting 설정
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10); // 분당 최대 요청 수

// In-memory rate limit store (fallback when KV not available)
const rateLimitStore = new Map();

// Vercel KV 인스턴스 (지연 로딩)
let kvInstance = null;
let kvInitialized = false;

/**
 * Vercel KV 초기화 (KV_REST_API_URL 환경변수가 있을 때만)
 * DO-278A 요구사항 추적: SRS-SEC-003 (분산 Rate Limiting)
 */
async function getKvInstance() {
  if (kvInitialized) return kvInstance;
  kvInitialized = true;

  // Vercel KV 환경변수 확인
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      kvInstance = kv;
      console.log('[Rate Limit] Using Vercel KV for distributed rate limiting');
    } catch (e) {
      console.warn('[Rate Limit] Vercel KV not available, using in-memory fallback');
    }
  }
  return kvInstance;
}

/**
 * Rate Limit 정리 (오래된 항목 제거) - in-memory용
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate Limiting 검사 (Vercel KV 지원)
 * @param {object} req - 요청 객체
 * @param {object} res - 응답 객체
 * @returns {Promise<boolean>} - 요청이 차단되면 true
 */
export async function checkRateLimit(req, res) {
  // 클라이언트 식별자 (IP 또는 X-Forwarded-For)
  const clientId = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress ||
                   'unknown';

  const now = Date.now();
  const kv = await getKvInstance();

  let count = 0;
  let windowStart = now;

  if (kv) {
    // Vercel KV 사용 (분산)
    const key = `ratelimit:${clientId}`;
    try {
      const data = await kv.get(key);
      if (data && (now - data.windowStart < RATE_LIMIT_WINDOW_MS)) {
        count = data.count + 1;
        windowStart = data.windowStart;
      } else {
        count = 1;
        windowStart = now;
      }
      await kv.set(key, { count, windowStart }, { ex: 120 }); // 2분 TTL
    } catch (e) {
      console.error('[Rate Limit] KV error, falling back to in-memory', e.message);
      // KV 오류 시 in-memory fallback
      return checkRateLimitInMemory(clientId, now, res);
    }
  } else {
    // In-memory fallback
    return checkRateLimitInMemory(clientId, now, res);
  }

  // Rate limit 헤더 설정
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);
  const resetTime = Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  // 제한 초과 시 차단
  if (count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('Retry-After', resetTime);
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
      retryAfter: resetTime
    });
    return true;
  }

  return false;
}

/**
 * In-memory Rate Limiting (fallback)
 */
function checkRateLimitInMemory(clientId, now, res) {
  // 정기적 정리 (10% 확률로)
  if (Math.random() < 0.1) {
    cleanupRateLimitStore();
  }

  let clientData = rateLimitStore.get(clientId);

  if (!clientData || (now - clientData.windowStart > RATE_LIMIT_WINDOW_MS)) {
    clientData = { windowStart: now, count: 1 };
    rateLimitStore.set(clientId, clientData);
  } else {
    clientData.count++;
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - clientData.count);
  const resetTime = Math.ceil((clientData.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (clientData.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('Retry-After', resetTime);
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
      retryAfter: resetTime
    });
    return true;
  }

  return false;
}

/**
 * 허용된 오리진 목록
 * CORS_ALLOWED_ORIGINS 환경변수에서 로드
 */
const getAllowedOrigins = () => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;

  // 기본 허용 목록
  const defaultOrigins = [
    'https://rkpu-viewer.vercel.app',
    'https://tbas.vercel.app',
  ];

  // 개발 환경에서는 localhost 허용
  if (process.env.NODE_ENV !== 'production') {
    defaultOrigins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173'
    );
  }

  if (envOrigins) {
    return [...new Set([...defaultOrigins, ...envOrigins.split(',')])];
  }

  return defaultOrigins;
};

/**
 * 오리진 검증
 * @param {string} origin - 요청 오리진
 * @returns {boolean} - 허용 여부
 */
export function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowed = getAllowedOrigins();
  // DO-278A SRS-SEC-002: 와일드카드 체크 제거, 정확한 매칭만 허용
  return allowed.some(allowedOrigin => {
    return origin === allowedOrigin;
  });
}

/**
 * CORS 헤더 설정
 * @param {object} req - 요청 객체
 * @param {object} res - 응답 객체
 * @returns {boolean} - preflight 요청인 경우 true
 */
export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  // 허용된 오리진인 경우에만 해당 오리진 반환
  // DO-278A SRS-SEC-002: 와일드카드 금지, 명시적 화이트리스트만 허용
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // 개발 환경에서도 localhost만 허용 (와일드카드 사용 안함)

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

// Legacy function removed for security - DO-278A SRS-SEC-002
// All code should use setCorsHeaders() instead

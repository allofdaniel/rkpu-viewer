/**
 * CORS ë°?Rate Limiting ?¤ì • ? í‹¸ë¦¬í‹°
 * DO-278A ?”êµ¬?¬í•­ ì¶”ì : SRS-SEC-002, SRS-SEC-003
 *
 * ?˜ê²½ë³€??ê¸°ë°˜ CORS ?”ì´?¸ë¦¬?¤íŠ¸ ë°?Rate Limiting ê´€ë¦?
 * Upstash Redis ì§€??(ë¶„ì‚° rate limiting)
 */

// Rate Limiting ?¤ì •
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1ë¶?
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10); // ë¶„ë‹¹ ìµœë? ?”ì²­ ??

// In-memory rate limit store (fallback when Redis not available)
const rateLimitStore = new Map();

// Upstash Redis ?¸ìŠ¤?´ìŠ¤ (ì§€??ë¡œë”©)
let redisInstance = null;
let redisInitialized = false;

/**
 * Upstash Redis ì´ˆê¸°??(?˜ê²½ë³€?˜ê? ?ˆì„ ?Œë§Œ)
 * DO-278A ?”êµ¬?¬í•­ ì¶”ì : SRS-SEC-003 (ë¶„ì‚° Rate Limiting)
 *
 * ì§€?ë˜???˜ê²½ë³€??
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * - KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV ?¸í™˜)
 */
async function getRedisInstance() {
  if (redisInitialized) return redisInstance;
  redisInitialized = true;

  // Upstash Redis ?˜ê²½ë³€???•ì¸ (Vercel KV ë³€?˜ë„ ì§€??
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const { Redis } = await import('@upstash/redis');
      redisInstance = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      console.info('[Rate Limit] Using Upstash Redis for distributed rate limiting');
    } catch (e) {
      console.warn('[Rate Limit] Upstash Redis not available, using in-memory fallback:', e.message);
    }
  }
  return redisInstance;
}

/**
 * Rate Limit ?•ë¦¬ (?¤ë˜????ª© ?œê±°) - in-memory??
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
 * Rate Limiting ê²€??(Upstash Redis ì§€??
 * @param {object} req - ?”ì²­ ê°ì²´
 * @param {object} res - ?‘ë‹µ ê°ì²´
 * @returns {Promise<boolean>} - ?”ì²­??ì°¨ë‹¨?˜ë©´ true
 */
export async function checkRateLimit(req, res) {
  // ?´ë¼?´ì–¸???ë³„??(IP ?ëŠ” X-Forwarded-For)
  const clientId = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress ||
                   'unknown';

  const now = Date.now();
  const redis = await getRedisInstance();

  let count = 0;
  let windowStart = now;

  if (redis) {
    // Upstash Redis ?¬ìš© (ë¶„ì‚°)
    const key = `ratelimit:${clientId}`;
    try {
      const data = await redis.get(key);
      if (data && (now - data.windowStart < RATE_LIMIT_WINDOW_MS)) {
        count = data.count + 1;
        windowStart = data.windowStart;
      } else {
        count = 1;
        windowStart = now;
      }
      await redis.set(key, { count, windowStart }, { ex: 120 }); // 2ë¶?TTL
    } catch (e) {
      console.error('[Rate Limit] Redis error, falling back to in-memory:', e.message);
      // Redis ?¤ë¥˜ ??in-memory fallback
      return checkRateLimitInMemory(clientId, now, res);
    }
  } else {
    // In-memory fallback
    return checkRateLimitInMemory(clientId, now, res);
  }

  // Rate limit ?¤ë” ?¤ì •
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);
  const resetTime = Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  // ?œí•œ ì´ˆê³¼ ??ì°¨ë‹¨
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
  // ?•ê¸°???•ë¦¬ (10% ?•ë¥ ë¡?
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
 * ?ˆìš©???¤ë¦¬ì§?ëª©ë¡
 * CORS_ALLOWED_ORIGINS ?˜ê²½ë³€?˜ì—??ë¡œë“œ
 */
const getAllowedOrigins = () => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;

  // ê¸°ë³¸ ?ˆìš© ëª©ë¡
  const defaultOrigins = [
    'https://rkpu-viewer.vercel.app',
    'https://tbas.vercel.app',
  ];

  // ê°œë°œ ?˜ê²½?ì„œ??localhost ?ˆìš©
  if (process.env.NODE_ENV !== 'production') {
    defaultOrigins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173'
    );
  }

  if (envOrigins) {
    return [...new Set([...defaultOrigins, ...envOrigins.split(",").map((v) => v.trim()).filter(Boolean)])];
  }

  return defaultOrigins;
};

/**
 * ?¤ë¦¬ì§?ê²€ì¦?
 * @param {string} origin - ?”ì²­ ?¤ë¦¬ì§?
 * @returns {boolean} - ?ˆìš© ?¬ë?
 */
export function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowed = getAllowedOrigins();
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  const normalizedOrigin = `${parsedOrigin.protocol}//${parsedOrigin.host}`;
  const hostname = parsedOrigin.hostname.toLowerCase();

  if (allowed.includes(normalizedOrigin)) {
    return true;
  }

  if (/^([a-z0-9-]+\.)?(rkpu-viewer|tbas)\.vercel\.app$/i.test(hostname)) {
    return true;
  }

  return allowed.some((allowedOrigin) => {
    return normalizedOrigin === allowedOrigin;
  });
}

/**
 * CORS ?¤ë” ?¤ì •
 * @param {object} req - ?”ì²­ ê°ì²´
 * @param {object} res - ?‘ë‹µ ê°ì²´
 * @returns {boolean} - preflight ?”ì²­??ê²½ìš° true
 */
export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  // ?ˆìš©???¤ë¦¬ì§„ì¸ ê²½ìš°?ë§Œ ?´ë‹¹ ?¤ë¦¬ì§?ë°˜í™˜
  // DO-278A SRS-SEC-002: ?€?¼ë“œì¹´ë“œ ê¸ˆì?, ëª…ì‹œ???”ì´?¸ë¦¬?¤íŠ¸ë§??ˆìš©
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // ê°œë°œ ?˜ê²½?ì„œ??localhostë§??ˆìš© (?€?¼ë“œì¹´ë“œ ?¬ìš© ?ˆí•¨)

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Preflight ?”ì²­ ì²˜ë¦¬
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

// Legacy function removed for security - DO-278A SRS-SEC-002
// All code should use setCorsHeaders() instead

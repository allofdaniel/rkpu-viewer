// UBIKAIS NOTAM Monitoring Dashboard
const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

const PORT = Number(process.env.UBIKAIS_DASHBOARD_PORT || 3854);
const SESSION_TTL_MS = (() => {
  const parsed = Number(process.env.UBIKAIS_DASHBOARD_SESSION_TTL_MS || 8 * 60 * 60 * 1000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 8 * 60 * 60 * 1000;
})();
const PIN = process.env.UBIKAIS_DASHBOARD_PIN || '';
const SESSION_SECRET = process.env.UBIKAIS_DASHBOARD_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_ID_BYTES = 16;
const MAX_PIN_LENGTH = 32;
const MAX_LOGIN_BODY_BYTES = (() => {
  const parsed = Number(process.env.UBIKAIS_DASHBOARD_MAX_LOGIN_BODY_BYTES || 4096);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4096;
})();
const REQUEST_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.UBIKAIS_DASHBOARD_REQUEST_TIMEOUT_MS || 15000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 15000;
})();

const N8N_HOST = process.env.UBIKAIS_DASHBOARD_N8N_HOST || '';
const N8N_SCHEME = process.env.UBIKAIS_DASHBOARD_N8N_SCHEME || 'https';
const N8N_EMAIL = process.env.UBIKAIS_DASHBOARD_N8N_EMAIL || '';
const N8N_PASSWORD = process.env.UBIKAIS_DASHBOARD_N8N_PASSWORD || '';
const N8N_WORKFLOW_BASE = process.env.UBIKAIS_DASHBOARD_N8N_WORKFLOW_BASE
  || `${N8N_SCHEME}://${N8N_HOST}/workflow`;

const SUPABASE_URL = process.env.UBIKAIS_DASHBOARD_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_HOST = getHostFromUrl(SUPABASE_URL);
const SUPABASE_KEY = process.env.UBIKAIS_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GOOGLE_SHEET_ID = process.env.UBIKAIS_DASHBOARD_GOOGLE_SHEET_ID || '';
const GOOGLE_SHEET_URL = process.env.UBIKAIS_DASHBOARD_GOOGLE_SHEET_URL || `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
const SUPABASE_PROJECT_REF = process.env.UBIKAIS_DASHBOARD_SUPABASE_PROJECT_REF || (SUPABASE_HOST ? SUPABASE_HOST.split('.')[0] : '');
const SUPABASE_DASHBOARD_URL = process.env.UBIKAIS_DASHBOARD_SUPABASE_DASHBOARD_URL || (SUPABASE_PROJECT_REF ? `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}` : '');
const SUPABASE_REGION = process.env.UBIKAIS_DASHBOARD_SUPABASE_REGION || 'unknown';
const COOKIE_SECURE = process.env.UBIKAIS_DASHBOARD_COOKIE_SECURE === 'true';
const ALLOW_INSECURE_PIN = process.env.UBIKAIS_DASHBOARD_ALLOW_INSECURE_PIN === 'true';
const SESSION_TTL_SECONDS = asPositiveInt(SESSION_TTL_MS / 1000, 8 * 60 * 60);

const SUPABASE_SCHEME = getSchemeFromUrl(SUPABASE_URL) || 'https';
const SUPABASE_ORIGIN = SUPABASE_HOST ? `${SUPABASE_SCHEME}://${SUPABASE_HOST}` : '';

function getDashboardTitle() {
  return `UBIKAIS Monitor (N8N: ${N8N_HOST})`;
}

if (!ALLOW_INSECURE_PIN && !PIN) {
  console.error('UBIKAIS_DASHBOARD_PIN is required. Export PIN or enable UBIKAIS_DASHBOARD_ALLOW_INSECURE_PIN=true for non-production.');
  process.exit(1);
}
if (PIN.length > MAX_PIN_LENGTH) {
  console.error('UBIKAIS_DASHBOARD_PIN is too long.');
  process.exit(1);
}

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function safeTimingEquals(valueA, valueB) {
  if (typeof valueA !== 'string' || typeof valueB !== 'string') return false;
  if (valueA.length !== valueB.length) return false;
  const bufferA = Buffer.from(valueA, 'utf8');
  const bufferB = Buffer.from(valueB, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function isValidPin(pin) {
  if (typeof pin !== 'string') return false;
  if (!pin) return false;
  if (pin.length > MAX_PIN_LENGTH) return false;
  return safeTimingEquals(pin, PIN);
}

function getSessionCookieName() {
  return 'sid';
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return '';
  const key = `${name}=`;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed.startsWith(key)) continue;
    return trimmed.slice(key.length);
  }
  return '';
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
}

function getSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
  };
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    ...getSecurityHeaders(),
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(html);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...getSecurityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes = MAX_LOGIN_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    req.on('data', (chunk) => {
      const bytes = Buffer.byteLength(chunk);
      received += bytes;
      if (received > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}

function parseWorkflows() {
  const raw = process.env.UBIKAIS_DASHBOARD_WORKFLOWS;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (_e) {
    // ignore and fallback
  }

  return [
    { id: raw, name: 'UBIKAIS Workflow' },
  ];
}

const WORKFLOWS = parseWorkflows();

function getHostFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname;
  } catch (_err) {
    return '';
  }
}

function getSchemeFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol.replace(':', '');
  } catch (_err) {
    return '';
  }
}

// --- Session store ---
const sessions = new Map();

function makeSession() {
  const id = crypto.randomBytes(SESSION_ID_BYTES).toString('hex');
  sessions.set(id, { created: Date.now(), lastSeen: Date.now() });
  const signature = signSessionId(id);
  return `${id}.${signature}`;
}

function getSessionCookie(value, maxAgeSeconds) {
  const sid = getSessionCookieName();
  const parts = [
    `${sid}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (COOKIE_SECURE) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function getSessionFromCookie(cookieHeader) {
  const sid = getCookieValue(cookieHeader, getSessionCookieName());
  if (!sid) return '';
  const [sessionId, signature] = sid.split('.');
  if (!sessionId || !signature) return '';
  if (!safeTimingEquals(signature, signSessionId(sessionId))) return '';
  return sessionId;
}

function checkSession(cookieHeader) {
  const sessionId = getSessionFromCookie(cookieHeader);
  if (!sessionId) return false;
  const record = sessions.get(sessionId);
  if (!record) return false;

  if (Date.now() - record.created > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return false;
  }
  record.lastSeen = Date.now();
  return true;
}

function deleteSession(cookieHeader) {
  const sessionId = getSessionFromCookie(cookieHeader);
  if (!sessionId) return;
  sessions.delete(sessionId);
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.created > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

function respondUnauthorizedSessionExpired(res) {
  res.writeHead(302, {
    ...getSecurityHeaders(),
    'Set-Cookie': getSessionCookie('', 0),
    'Location': '/login',
  });
  res.end();
}

// --- HTTPS helper ---
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    const normalized = {
      ...options,
      protocol: options.protocol || 'https:',
      headers: {
        ...(options.headers || {}),
        'User-Agent': (options.headers && options.headers['User-Agent']) || 'ubikais-dashboard/1.0',
      },
    };
    const req = mod.request(normalized, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

// --- n8n login & cache ---
let n8nCookie = null;
let n8nCookieExpiry = 0;

async function n8nLogin() {
  if (!N8N_HOST || !N8N_EMAIL || !N8N_PASSWORD) {
    throw new Error('N8N credentials are not fully configured');
  }
  if (n8nCookie && Date.now() < n8nCookieExpiry) return n8nCookie;
  const loginBody = JSON.stringify({ emailOrLdapLoginId: N8N_EMAIL, password: N8N_PASSWORD });
  const res = await httpsRequest({
    hostname: N8N_HOST, path: '/rest/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);
  if (res.status !== 200) throw new Error('n8n login failed: ' + res.status);
  const cookies = res.headers['set-cookie'];
  n8nCookie = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : ''
  n8nCookieExpiry = Date.now() + 1800000; // 30 min
  return n8nCookie;
}

// --- API handlers ---
async function getN8nWorkflows() {
  const cookie = await n8nLogin();
  const results = [];
  for (const wf of WORKFLOWS) {
    try {
      const res = await httpsRequest({
        hostname: N8N_HOST, path: '/rest/workflows/' + wf.id, method: 'GET',
        headers: { 'Cookie': cookie }
      });
      if (res.status === 200) {
        const data = JSON.parse(res.body);
        const d = data.data;
        results.push({
          id: wf.id,
          name: d.name,
          active: d.active,
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
          nodeCount: d.nodes ? d.nodes.length : 0,
          nodes: (d.nodes || []).map(n => ({
            name: n.name, type: n.type,
            hasCreds: !!n.credentials
          })),
          settings: d.settings,
          versionId: d.versionId
        });
      } else {
        results.push({ id: wf.id, name: wf.name, error: 'HTTP ' + res.status });
      }
    } catch (e) {
      results.push({ id: wf.id, name: wf.name, error: e.message });
    }
  }
  return results;
}

async function getN8nExecutions() {
  const cookie = await n8nLogin();
  const results = [];
  for (const wf of WORKFLOWS) {
    try {
      const res = await httpsRequest({
        hostname: N8N_HOST,
        path: '/rest/executions?workflowId=' + wf.id + '&limit=5',
        method: 'GET',
        headers: { 'Cookie': cookie }
      });
      if (res.status === 200) {
        const data = JSON.parse(res.body);
        const executions = (data.data || []).map(e => ({
          id: e.id,
          status: e.status || (e.finished ? 'success' : 'running'),
          finished: e.finished,
          startedAt: e.startedAt,
          stoppedAt: e.stoppedAt,
          mode: e.mode
        }));
        results.push({ workflowId: wf.id, name: wf.name, executions });
      } else {
        results.push({ workflowId: wf.id, name: wf.name, error: 'HTTP ' + res.status });
      }
    } catch (e) {
      results.push({ workflowId: wf.id, name: wf.name, error: e.message });
    }
  }
  return results;
}

async function getSupabaseFiles() {
  if (!SUPABASE_HOST || !SUPABASE_KEY) {
    return { error: 'SUPABASE_URL or SUPABASE_KEY is not configured' };
  }
  try {
    const res = await httpsRequest({
      hostname: SUPABASE_HOST,
      path: '/storage/v1/object/list/notam-data',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({ prefix: '', limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }));
    if (res.status === 200) {
      const items = JSON.parse(res.body);
      // Recursively list folders
      const allFiles = [];
      for (const item of items) {
        if (item.id === null) {
          // It's a folder, list its contents
          const folderRes = await httpsRequest({
            hostname: SUPABASE_HOST,
            path: '/storage/v1/object/list/notam-data',
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
              'Content-Type': 'application/json'
            }
          }, JSON.stringify({ prefix: item.name + '/', limit: 50, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }));
          if (folderRes.status === 200) {
            const folderItems = JSON.parse(folderRes.body);
            allFiles.push({
              folder: item.name,
              files: folderItems.map(f => ({
                name: f.name,
                size: f.metadata?.size,
                mimetype: f.metadata?.mimetype,
                created: f.created_at,
                updated: f.updated_at
              }))
            });
          }
        } else {
          allFiles.push({
            folder: null,
            files: [{
              name: item.name,
              size: item.metadata?.size,
              mimetype: item.metadata?.mimetype,
              created: item.created_at,
              updated: item.updated_at
            }]
          });
        }
      }
      return { bucket: 'notam-data', items: allFiles, totalTopLevel: items.length };
    }
    return { error: 'HTTP ' + res.status, body: res.body };
  } catch (e) {
    return { error: e.message };
  }
}

async function getSupabaseBuckets() {
  if (!SUPABASE_HOST || !SUPABASE_KEY) {
    return { error: 'SUPABASE_URL or SUPABASE_KEY is not configured' };
  }
  try {
    const res = await httpsRequest({
      hostname: SUPABASE_HOST,
      path: '/storage/v1/bucket',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });
    if (res.status === 200) return JSON.parse(res.body);
    return { error: 'HTTP ' + res.status };
  } catch (e) {
    return { error: e.message };
  }
}

// --- HTML ---
function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UBIKAIS Monitor - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a; color: #e2e8f0; display: flex; justify-content: center;
      align-items: center; min-height: 100vh; }
    .login-box { background: #1e293b; padding: 40px; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.4); text-align: center; width: 340px; }
    .login-box h1 { font-size: 1.4rem; margin-bottom: 8px; color: #38bdf8; }
    .login-box p { font-size: .85rem; color: #94a3b8; margin-bottom: 24px; }
    .pin-input { display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }
    .pin-input input { width: 48px; height: 56px; text-align: center; font-size: 1.5rem;
      border: 2px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0;
      outline: none; transition: border-color .2s; }
    .pin-input input:focus { border-color: #38bdf8; }
    button { padding: 12px 32px; background: #0ea5e9; color: white; border: none;
      border-radius: 8px; font-size: 1rem; cursor: pointer; transition: background .2s; }
    button:hover { background: #0284c7; }
    .error { color: #f87171; font-size: .85rem; margin-top: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>UBIKAIS NOTAM Monitor</h1>
    <p>PIN</p>
    <form method="POST" action="/login" id="loginForm">
      <div class="pin-input">
        <input type="password" maxlength="1" data-idx="0" autofocus>
        <input type="password" maxlength="1" data-idx="1">
        <input type="password" maxlength="1" data-idx="2">
        <input type="password" maxlength="1" data-idx="3">
      </div>
      <input type="hidden" name="pin" id="pinValue">
      <button type="submit">Enter</button>
      <div class="error" id="err">Wrong PIN</div>
    </form>
  </div>
  <script>
    const inputs = document.querySelectorAll('.pin-input input');
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        if (inp.value && i < 3) inputs[i+1].focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i-1].focus();
      });
    });
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      const pin = Array.from(inputs).map(i => i.value).join('');
      document.getElementById('pinValue').value = pin;
    });
    if (location.search.includes('err=1')) document.getElementById('err').style.display = 'block';
  </script>
</body>
</html>`;
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UBIKAIS NOTAM Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a; color: #e2e8f0; }
    .header { background: #1e293b; border-bottom: 1px solid #334155; padding: 16px 24px;
      display: flex; align-items: center; justify-content: space-between; }
    .header h1 { font-size: 1.2rem; color: #38bdf8; }
    .header .meta { font-size: .8rem; color: #64748b; }
    .tabs { display: flex; gap: 2px; background: #1e293b; padding: 0 24px; border-bottom: 1px solid #334155; }
    .tab { padding: 12px 20px; cursor: pointer; color: #94a3b8; font-size: .9rem;
      border-bottom: 2px solid transparent; transition: all .2s; }
    .tab:hover { color: #e2e8f0; }
    .tab.active { color: #38bdf8; border-bottom-color: #38bdf8; }
    .content { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .panel { display: none; }
    .panel.active { display: block; }
    .card { background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 16px;
      border: 1px solid #334155; }
    .card h3 { font-size: 1rem; margin-bottom: 12px; color: #f1f5f9; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: .75rem;
      font-weight: 600; }
    .badge.active { background: #065f46; color: #6ee7b7; }
    .badge.inactive { background: #7f1d1d; color: #fca5a5; }
    .badge.success { background: #065f46; color: #6ee7b7; }
    .badge.error { background: #7f1d1d; color: #fca5a5; }
    .badge.running { background: #1e3a5f; color: #93c5fd; }
    .badge.waiting { background: #78350f; color: #fde68a; }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    th { text-align: left; padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #334155;
      font-weight: 500; }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
    .node-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .node-tag { padding: 4px 10px; background: #334155; border-radius: 6px; font-size: .75rem; }
    .node-tag.http { background: #1e3a5f; color: #93c5fd; }
    .node-tag.code { background: #3b0764; color: #d8b4fe; }
    .node-tag.gmail { background: #7f1d1d; color: #fca5a5; }
    .node-tag.sheets { background: #065f46; color: #6ee7b7; }
    .node-tag.trigger { background: #78350f; color: #fde68a; }
    .file-tree { font-size: .85rem; }
    .folder { margin-bottom: 12px; }
    .folder-name { font-weight: 600; color: #fde68a; margin-bottom: 4px; cursor: pointer; }
    .folder-files { margin-left: 16px; }
    .file-row { padding: 4px 0; display: flex; gap: 16px; align-items: center; }
    .file-name { color: #e2e8f0; flex: 1; }
    .file-size { color: #64748b; min-width: 80px; text-align: right; }
    .file-date { color: #64748b; min-width: 160px; }
    .config-grid { display: grid; grid-template-columns: 160px 1fr; gap: 8px; font-size: .85rem; }
    .config-key { color: #94a3b8; }
    .config-val { color: #e2e8f0; word-break: break-all; }
    .config-val a { color: #38bdf8; text-decoration: none; }
    .config-val a:hover { text-decoration: underline; }
    .loading { text-align: center; padding: 40px; color: #64748b; }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #334155;
      border-top-color: #38bdf8; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .refresh-btn { padding: 6px 14px; background: #334155; color: #e2e8f0; border: none;
      border-radius: 6px; cursor: pointer; font-size: .8rem; transition: background .2s; }
    .refresh-btn:hover { background: #475569; }
    .exec-status { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.green { background: #22c55e; }
    .dot.red { background: #ef4444; }
    .dot.yellow { background: #eab308; }
    .dot.blue { background: #3b82f6; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-bottom: 20px; }
    .summary-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px;
      padding: 16px; text-align: center; }
    .summary-card .val { font-size: 1.8rem; font-weight: 700; color: #38bdf8; }
    .summary-card .label { font-size: .8rem; color: #94a3b8; margin-top: 4px; }
    .logout-btn { padding: 6px 14px; background: #334155; color: #94a3b8; border: none;
      border-radius: 6px; cursor: pointer; font-size: .8rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>UBIKAIS NOTAM Monitor</h1>
    <div style="display:flex;align-items:center;gap:16px;">
      <span class="meta" id="lastUpdate">Loading...</span>
      <a href="/logout" class="logout-btn">Logout</a>
    </div>
  </div>
  <div class="tabs">
    <div class="tab active" data-panel="overview">Overview</div>
    <div class="tab" data-panel="n8n">n8n Workflows</div>
    <div class="tab" data-panel="storage">Supabase Storage</div>
    <div class="tab" data-panel="config">System Config</div>
  </div>
  <div class="content">
    <!-- Overview -->
    <div class="panel active" id="panel-overview">
      <div class="summary-cards" id="summaryCards">
        <div class="summary-card"><div class="val"><span class="spinner"></span></div><div class="label">Loading...</div></div>
      </div>
      <div class="card">
        <h3>Recent Executions</h3>
        <div id="recentExec"><div class="loading"><span class="spinner"></span> Loading...</div></div>
      </div>
    </div>

    <!-- n8n Workflows -->
    <div class="panel" id="panel-n8n">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="font-size:1.1rem;">n8n Workflows</h2>
        <button class="refresh-btn" onclick="loadN8n()">Refresh</button>
      </div>
      <div id="n8nContent"><div class="loading"><span class="spinner"></span> Loading workflows...</div></div>
      <div class="card" style="margin-top:16px;">
        <h3>Execution History</h3>
        <div id="execContent"><div class="loading"><span class="spinner"></span> Loading executions...</div></div>
      </div>
    </div>

    <!-- Supabase Storage -->
    <div class="panel" id="panel-storage">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="font-size:1.1rem;">Supabase Storage</h2>
        <button class="refresh-btn" onclick="loadStorage()">Refresh</button>
      </div>
      <div id="storageContent"><div class="loading"><span class="spinner"></span> Loading files...</div></div>
    </div>

    <!-- System Config -->
    <div class="panel" id="panel-config">
      <h2 style="font-size:1.1rem;margin-bottom:16px;">System Configuration</h2>
      <div class="card">
        <h3>n8n Cloud</h3>
        <div class="config-grid">
          <span class="config-key">Host</span>
          <span class="config-val"><a href="${escapeHtml(`${N8N_SCHEME}://${N8N_HOST}`)}" target="_blank">${escapeHtml(N8N_HOST)}</a></span>
          <span class="config-key">Account</span>
          <span class="config-val">${escapeHtml(N8N_EMAIL || 'Not configured')}</span>
          ${WORKFLOWS.map((wf) => `
            <span class="config-key">Workflow: ${escapeHtml(wf.name)}</span>
            <span class="config-val"><a href="${escapeHtml(DASHBOARD_CONFIG.n8nWorkflowBase)}/${escapeHtml(wf.id)}" target="_blank">${escapeHtml(wf.id)}</a></span>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Supabase</h3>
        <div class="config-grid">
          <span class="config-key">Project</span>
          <span class="config-val"><a href="${escapeHtml(SUPABASE_DASHBOARD_URL || '#')}" target="_blank">${escapeHtml(SUPABASE_PROJECT_REF || 'Not configured')}</a></span>
          <span class="config-key">Region</span>
          <span class="config-val">${escapeHtml(SUPABASE_REGION)}</span>
          <span class="config-key">Storage Bucket</span>
          <span class="config-val">notam-data (public)</span>
          <span class="config-key">API URL</span>
          <span class="config-val">${escapeHtml(SUPABASE_URL)}</span>
        </div>
      </div>
      <div class="card">
        <h3>Google Sheets Log</h3>
        <div class="config-grid">
          <span class="config-key">Sheet Name</span>
          <span class="config-val">UBIKAIS NOTAM Log</span>
          <span class="config-key">Link</span>
          <span class="config-val"><a href="${escapeHtml(GOOGLE_SHEET_URL)}" target="_blank">Open Google Sheet</a></span>
          <span class="config-key">Sheet ID</span>
          <span class="config-val" style="font-size:.75rem;">${escapeHtml(GOOGLE_SHEET_ID)}</span>
        </div>
      </div>
      <div class="card">
        <h3>UBIKAIS Source</h3>
        <div class="config-grid">
          <span class="config-key">URL</span>
          <span class="config-val"><a href="https://ubikais.fois.go.kr:8030" target="_blank">ubikais.fois.go.kr:8030</a></span>
          <span class="config-key">Description</span>
          <span class="config-val">Korean NOTAM data source</span>
          <span class="config-key">Crawl: Realtime</span>
          <span class="config-val">Every 15 min - latest NOTAM snapshot</span>
          <span class="config-key">Crawl: Full</span>
          <span class="config-val">Daily at 06:00 KST - all active NOTAMs</span>
        </div>
      </div>
      <div class="card">
        <h3>Data Pipeline</h3>
        <div style="font-size:.85rem;line-height:1.8;color:#94a3b8;">
          <div>1. ScheduleTrigger (n8n) fires on schedule</div>
          <div>2. HTTP Request: Login to UBIKAIS</div>
          <div>3. Code Node: Crawl NOTAM data</div>
          <div>4. Code Node: Prepare binary (JSON file)</div>
          <div>5. HTTP Request: Upload to Supabase Storage (x-upsert)</div>
          <div>6. Code Node: Build report</div>
          <div>7. Gmail: Send notification email</div>
          <div>8. Google Sheets: Log execution result</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const DASHBOARD_CONFIG = {
      n8nWorkflowBase: ${jsString(N8N_WORKFLOW_BASE)},
      supabasePublicBase: ${jsString(`${SUPABASE_URL}/storage/v1/object/public/notam-data`)},
    };

    // Tab switching with auto-load
    const loaders = { overview: loadOverview, n8n: loadN8n, storage: loadStorage };
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
        if (loaders[tab.dataset.panel]) loaders[tab.dataset.panel]();
      });
    });

    function formatDate(d) {
      if (!d) return '-';
      const dt = new Date(d);
      return dt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    }
    function formatSize(bytes) {
      if (!bytes) return '-';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
      return (bytes/1048576).toFixed(1) + ' MB';
    }
    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function encodePathSegment(value) {
      return encodeURIComponent(String(value ?? '')).replace(/%2F/g, '/');
    }
    function nodeTagClass(type) {
      if (type.includes('httpRequest')) return 'http';
      if (type.includes('code')) return 'code';
      if (type.includes('gmail')) return 'gmail';
      if (type.includes('googleSheets')) return 'sheets';
      if (type.includes('scheduleTrigger')) return 'trigger';
      return '';
    }
    function statusDot(status) {
      if (status === 'success') return '<span class="dot green"></span>';
      if (status === 'error') return '<span class="dot red"></span>';
      if (status === 'running' || status === 'waiting') return '<span class="dot blue"></span>';
      return '<span class="dot yellow"></span>';
    }

    // Load overview data
    async function loadOverview() {
      try {
        const [wfRes, execRes, storageRes] = await Promise.all([
          fetch('/api/n8n/workflows').then(r => r.json()),
          fetch('/api/n8n/executions').then(r => r.json()),
          fetch('/api/supabase/files').then(r => r.json())
        ]);

        // Summary cards
        const activeWf = wfRes.filter(w => w.active).length;
        const totalFiles = storageRes.items ? storageRes.items.reduce((sum, i) => sum + (i.files ? i.files.length : 0), 0) : 0;
        const lastExec = execRes.flatMap(w => w.executions || []).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
        const lastStatus = lastExec ? lastExec.status : 'unknown';

        document.getElementById('summaryCards').innerHTML =
          '<div class="summary-card"><div class="val">' + wfRes.length + '</div><div class="label">Workflows</div></div>' +
          '<div class="summary-card"><div class="val">' + activeWf + '/' + wfRes.length + '</div><div class="label">Active</div></div>' +
          '<div class="summary-card"><div class="val">' + totalFiles + '</div><div class="label">Storage Files</div></div>' +
          '<div class="summary-card"><div class="val"><span class="exec-status">' + statusDot(lastStatus) + ' ' + lastStatus + '</span></div><div class="label">Last Execution</div></div>';

        // Recent executions
        const allExecs = execRes.flatMap(w =>
          (w.executions || []).map(e => ({ ...e, workflowName: w.name }))
        ).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 10);

        if (allExecs.length) {
          document.getElementById('recentExec').innerHTML = '<table><tr><th>Workflow</th><th>Status</th><th>Started</th><th>Finished</th><th>Mode</th></tr>' +
            allExecs.map(e => '<tr><td>' + e.workflowName + '</td><td><span class="exec-status">' + statusDot(e.status) + ' ' + e.status + '</span></td><td>' + formatDate(e.startedAt) + '</td><td>' + formatDate(e.stoppedAt) + '</td><td>' + (e.mode||'-') + '</td></tr>').join('') +
            '</table>';
        } else {
          document.getElementById('recentExec').innerHTML = '<p style="color:#64748b">No recent executions found</p>';
        }

        document.getElementById('lastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString('ko-KR');
      } catch (e) {
        console.error('Overview load error:', e);
      }
    }

    async function loadN8n() {
      document.getElementById('n8nContent').innerHTML = '<div class="loading"><span class="spinner"></span> Loading...</div>';
      try {
        const data = await fetch('/api/n8n/workflows').then(r => r.json());
        let html = '';
        for (const wf of data) {
          html += '<div class="card"><h3>' + wf.name + ' <span class="badge ' + (wf.active ? 'active' : 'inactive') + '">' + (wf.active ? 'Active' : 'Inactive') + '</span></h3>';
          html += '<div class="config-grid">';
          html += '<span class="config-key">ID</span><span class="config-val"><a href="' + N8N_WORKFLOW_BASE + '/' + wf.id + '" target="_blank">' + wf.id + '</a></span>';
          html += '<span class="config-key">Nodes</span><span class="config-val">' + wf.nodeCount + '</span>';
          html += '<span class="config-key">Updated</span><span class="config-val">' + formatDate(wf.updatedAt) + '</span>';
          html += '<span class="config-key">Version</span><span class="config-val" style="font-size:.75rem">' + (wf.versionId||'-') + '</span>';
          html += '</div>';
          if (wf.nodes && wf.nodes.length) {
            html += '<div class="node-list">';
            wf.nodes.forEach(n => {
              const cls = nodeTagClass(n.type);
              html += '<span class="node-tag ' + cls + '">' + n.name + (n.hasCreds ? ' *' : '') + '</span>';
            });
            html += '</div>';
          }
          if (wf.error) html += '<p style="color:#f87171;margin-top:8px">Error: ' + wf.error + '</p>';
          html += '</div>';
        }
        document.getElementById('n8nContent').innerHTML = html;

        // Executions
        const execData = await fetch('/api/n8n/executions').then(r => r.json());
        let execHtml = '';
        for (const wf of execData) {
          execHtml += '<h4 style="margin:12px 0 8px;font-size:.9rem;color:#94a3b8">' + wf.name + '</h4>';
          if (wf.executions && wf.executions.length) {
            execHtml += '<table><tr><th>ID</th><th>Status</th><th>Started</th><th>Finished</th><th>Mode</th></tr>';
            wf.executions.forEach(e => {
              execHtml += '<tr><td>' + e.id + '</td><td><span class="exec-status">' + statusDot(e.status) + ' ' + e.status + '</span></td><td>' + formatDate(e.startedAt) + '</td><td>' + formatDate(e.stoppedAt) + '</td><td>' + (e.mode||'-') + '</td></tr>';
            });
            execHtml += '</table>';
          } else {
            execHtml += '<p style="color:#64748b">No executions</p>';
          }
        }
        document.getElementById('execContent').innerHTML = execHtml;
      } catch (e) {
        document.getElementById('n8nContent').innerHTML = '<p style="color:#f87171">Error: ' + e.message + '</p>';
      }
    }

    async function loadStorage() {
      document.getElementById('storageContent').innerHTML = '<div class="loading"><span class="spinner"></span> Loading...</div>';
      try {
        const [buckets, files] = await Promise.all([
          fetch('/api/supabase/buckets').then(r => r.json()),
          fetch('/api/supabase/files').then(r => r.json())
        ]);

        let html = '<div class="card"><h3>Buckets</h3><table><tr><th>Name</th><th>Public</th><th>Created</th></tr>';
        if (Array.isArray(buckets)) {
          buckets.forEach(b => {
            html += '<tr><td>' + b.name + '</td><td>' + (b.public ? 'Yes' : 'No') + '</td><td>' + formatDate(b.created_at) + '</td></tr>';
          });
        }
        html += '</table></div>';

        html += '<div class="card"><h3>Files in notam-data</h3>';
        if (files.items && files.items.length) {
          html += '<div class="file-tree">';
          files.items.forEach(item => {
            if (item.folder) {
              const folderName = escapeHtml(item.folder);
              html += '<div class="folder"><div class="folder-name">' + folderName + '/ (' + item.files.length + ' files)</div><div class="folder-files">';
              item.files.forEach(f => {
                const fileName = escapeHtml(f.name);
                const publicUrl = DASHBOARD_CONFIG.supabasePublicBase + '/' + encodePathSegment(item.folder) + '/' + encodePathSegment(f.name);
                html += '<div class="file-row"><a class="file-name" href="' + publicUrl + '" target="_blank">' + fileName + '</a><span class="file-size">' + formatSize(f.size) + '</span><span class="file-date">' + formatDate(f.updated || f.created) + '</span></div>';
              });
              html += '</div></div>';
            } else {
              item.files.forEach(f => {
                const fileName = escapeHtml(f.name);
                const publicUrl = DASHBOARD_CONFIG.supabasePublicBase + '/' + encodePathSegment(f.name);
                html += '<div class="file-row"><a class="file-name" href="' + publicUrl + '" target="_blank">' + fileName + '</a><span class="file-size">' + formatSize(f.size) + '</span><span class="file-date">' + formatDate(f.updated || f.created) + '</span></div>';
              });
            }
          });
          html += '</div>';
        } else {
          html += '<p style="color:#64748b">No files found (bucket may be empty)</p>';
        }
        html += '</div>';

        document.getElementById('storageContent').innerHTML = html;
      } catch (e) {
        document.getElementById('storageContent').innerHTML = '<p style="color:#f87171">Error: ' + e.message + '</p>';
      }
    }

    // Initial load
    loadOverview();
  </script>
</body>
</html>`;
}

// --- Server ---
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  clearExpiredSessions();

  // Static routes
  if (pathname === '/login' && req.method === 'GET') {
    sendHtml(res, 200, getLoginHTML());
    return;
  }

  if (pathname === '/login' && req.method === 'POST') {
    try {
      const requestContentLength = Number(req.headers['content-length']);
      if (Number.isFinite(requestContentLength) && requestContentLength > MAX_LOGIN_BODY_BYTES) {
        res.writeHead(413, getSecurityHeaders());
        res.end('Request body too large');
        return;
      }

      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const pin = params.get('pin');
      if (isValidPin(pin)) {
        clearExpiredSessions();
        const sid = makeSession();
        res.writeHead(302, {
          ...getSecurityHeaders(),
          'Set-Cookie': getSessionCookie(sid, SESSION_TTL_SECONDS),
          'Location': '/',
        });
        res.end();
      } else {
        res.writeHead(302, {
          ...getSecurityHeaders(),
          'Location': '/login?err=1',
        });
        res.end();
      }
    } catch (err) {
      res.writeHead(400, {
        ...getSecurityHeaders(),
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Bad request');
    }
    return;
  }

  if (pathname === '/logout') {
    deleteSession(req.headers.cookie);
    res.writeHead(302, {
      ...getSecurityHeaders(),
      'Set-Cookie': getSessionCookie('', 0),
      'Location': '/login',
    });
    res.end();
    return;
  }

  // Auth check for all other routes
  if (!checkSession(req.headers.cookie)) {
    respondUnauthorizedSessionExpired(res);
    return;
  }

  // Dashboard
  if (pathname === '/') {
    sendHtml(res, 200, getDashboardHTML());
    return;
  }

  // API endpoints
  if (pathname === '/api/n8n/workflows') {
    if (req.method !== 'GET') {
      res.writeHead(405, getSecurityHeaders());
      res.end('Method Not Allowed');
      return;
    }
    try {
      const data = await getN8nWorkflows();
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/n8n/executions') {
    if (req.method !== 'GET') {
      res.writeHead(405, getSecurityHeaders());
      res.end('Method Not Allowed');
      return;
    }
    try {
      const data = await getN8nExecutions();
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/supabase/files') {
    if (req.method !== 'GET') {
      res.writeHead(405, getSecurityHeaders());
      res.end('Method Not Allowed');
      return;
    }
    try {
      const data = await getSupabaseFiles();
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/supabase/buckets') {
    if (req.method !== 'GET') {
      res.writeHead(405, getSecurityHeaders());
      res.end('Method Not Allowed');
      return;
    }
    try {
      const data = await getSupabaseBuckets();
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  res.writeHead(404, getSecurityHeaders());
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`UBIKAIS NOTAM Monitor running at http://localhost:${PORT}`);
  console.log('PIN configured:', PIN ? 'yes' : 'no');
});





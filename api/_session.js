'use strict';
// Persistent browser session. Normal API authorization remains explicit Bearer:
// the cookie is accepted ONLY by the protected resume/logout operations below.
// No new database tables, scheduled jobs, refresh-token service or paid feature.
const lib = require('./_lib');
const COOKIE = '__Host-sohail-session';
const MAX_SECONDS = 24 * 60 * 60;
function readCookie(req) {
  const raw = req.headers?.cookie;
  if (typeof raw !== 'string' || raw.length > 32768) return '';
  const values = raw.split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (values.length !== 1) return '';
  return values[0].slice(COOKIE.length + 1);
}
function appendCookie(res, value) {
  const previous = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : null;
  res.setHeader('Set-Cookie', previous ? [].concat(previous, value) : value);
}
function clearCookie(res) {
  appendCookie(res, `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
}
function writeCookie(req, res, token) {
  const p = lib.verifyToken(token);
  if (!p || !p.pk || !Number.isSafeInteger(p.sv) || !lib.ligaIdOK(p.src)) return;
  // Do not install a browser session for cross-origin login requests.
  if (req.headers?.['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return;
  if (req.headers?.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return; } catch (_) { return; }
  }
  const seconds = Math.max(0, Math.min(MAX_SECONDS, Math.ceil((p.exp - Date.now()) / 1000)));
  appendCookie(res, `${COOKIE}=${token}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Strict`);
}
function protectRequest(req) {
  const h = req.headers || {};
  // Forms cannot set this header; cross-origin JS requires a preflight, and
  // this API never grants CORS. SameSite is defense in depth, not the only check.
  if (req.method !== 'POST' || h['x-sohail-session'] !== '1' ||
      !/^application\/json(?:;|$)/i.test(h['content-type'] || '')) return false;
  if (h['sec-fetch-site'] && !['same-origin', 'none'].includes(h['sec-fetch-site'])) return false;
  if (h.origin) {
    try {
      const o = new URL(h.origin);
      if (!['http:', 'https:'].includes(o.protocol) || o.host !== h.host) return false;
      if (o.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(o.hostname)) return false;
    } catch (_) { return false; }
  }
  return true;
}
async function handler(req, res) {
  if (!protectRequest(req)) return res.status(403).json({code:'SESSION_ORIGIN',error:'Solicitud de sesión no permitida.'});
  if (req.body.accion === 'session-logout') {
    clearCookie(res);
    return res.status(200).json({ok:true});
  }
  const token = readCookie(req);
  if (!token) return res.status(200).json({authenticated:false});
  // Use the same account epoch, identity, inactivity and role validation as all
  // other endpoints. A browser cookie never grants its stored role directly.
  const session = await lib.auth({...req,headers:{...req.headers,authorization:'Bearer '+token}},true);
  if (!session) {
    clearCookie(res);
    return res.status(401).json({code:'SESSION_EXPIRED',error:'La sesión venció o fue revocada.'});
  }
  const state = await lib.readState(session.src);
  if (!state || lib.blockedUser(state,session)) {
    clearCookie(res);
    return res.status(401).json({code:'SESSION_EXPIRED',error:'La cuenta ya no está disponible.'});
  }
  const index = await lib.readLigaIndex();
  const entry = index.find(l => l.id === session.src);
  // No silent fallback to another league or account when a source disappears.
  if (!entry) return res.status(409).json({code:'SESSION_LEAGUE_MISSING',error:'La liga de la sesión ya no está disponible. Volvé a ingresar.'});
  // Resume retains the original expiry; simply reloading cannot extend it.
  const current = state.users[session.u];
  session.r = current.role || 'player';
  return res.status(200).json({authenticated:true,token:lib.signToken(session),
    name:session.u,role:session.r,isAdmin:lib.sesionEsAdmin(session,state.users),
    exp:session.exp,mustChangePw:!!session.m,ligaId:session.src,ligaNombre:entry.nombre,
    state:lib.filterForSession(state,session)});
}
// Used only around handlers that issue/renew actual account tokens. It does
// not serialize tokens into localStorage, alter payloads or catch failed auth.
function withCookie(handler) {
  return async function(req,res) {
    const json = res.json;
    res.json = function(payload) {
      if (res.statusCode === 200 && payload && typeof payload.token === 'string') writeCookie(req,res,payload.token);
      return json.call(this,payload);
    };
    try { return await handler(req,res); } finally { res.json = json; }
  };
}
module.exports = {COOKIE,MAX_SECONDS,readCookie,writeCookie,clearCookie,protectRequest,handler,withCookie};

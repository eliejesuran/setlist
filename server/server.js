/**
 * SSBBB — Serveur de sessions collaboratives
 * Stack : Node 20+ · bibliothèque ws
 * Lancer : node server.js
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// ─── Configuration ────────────────────────────────────────────────────────────

export const SESSION_TTL_MS     = 15 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS       = 100;
export const MAX_PEERS          = 20;
export const ALLOWED_ORIGINS    = [
  'https://eliejesuran.github.io',
  'https://jesuran.be',
  'https://www.jesuran.be',
  'https://eliejesuran.be',
  'https://www.eliejesuran.be',
  'http://localhost',
  'http://127.0.0.1',
  'file://',
];
export const ALLOW_NULL_ORIGIN    = true;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX       = 10;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createApp(opts = {}) {
  const {
    sessionTtl        = SESSION_TTL_MS,
    maxSessions       = MAX_SESSIONS,
    maxPeers          = MAX_PEERS,
    allowedOrigins    = ALLOWED_ORIGINS,
    allowNullOrigin   = ALLOW_NULL_ORIGIN,
    rateLimitWindowMs = RATE_LIMIT_WINDOW_MS,
    rateLimitMax      = RATE_LIMIT_MAX,
  } = opts;

  const sessions  = new Map();   // sessionId → Session
  const connRates = new Map();   // ip → { count, resetAt }

  // ─── Rate limiter ───────────────────────────────────────────────────────────

  function checkRateLimit(ip, _now = Date.now()) {
    let entry = connRates.get(ip);

    if (!entry || _now > entry.resetAt) {
      entry = { count: 0, resetAt: _now + rateLimitWindowMs };
      connRates.set(ip, entry);
    }

    entry.count++;

    if (connRates.size > 5000) {
      for (const [k, v] of connRates) {
        if (_now > v.resetAt) connRates.delete(k);
      }
    }

    return entry.count <= rateLimitMax;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function broadcast(session, obj, exclude = null) {
    for (const client of session.clients) {
      if (client !== exclude) send(client, obj);
    }
  }

  function touch(session) {
    clearTimeout(session.timer);
    session.expireAt = Date.now() + sessionTtl;
    session.timer = setTimeout(() => expireSession(session.id), sessionTtl);
    session.timer.unref?.();
  }

  function expireSession(id) {
    const session = sessions.get(id);
    if (!session) return;
    for (const client of session.clients) {
      send(client, { type: 'session_expired', sessionId: id });
      client.close(1001, 'Session expirée');
    }
    sessions.delete(id);
    console.log(`[session] ${id} expirée — ${sessions.size} session(s) actives`);
  }

  function getOrCreateSession(id) {
    if (sessions.has(id)) return sessions.get(id);

    if (sessions.size >= maxSessions) {
      const oldest = [...sessions.values()].sort((a, b) => a.expireAt - b.expireAt)[0];
      expireSession(oldest.id);
    }

    const session = { id, state: null, clients: new Set(), expireAt: 0, timer: null };
    sessions.set(id, session);
    console.log(`[session] ${id} créée — ${sessions.size} session(s) actives`);
    return session;
  }

  // ─── Serveur HTTP ─────────────────────────────────────────────────────────────

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200); res.end('ok');
    } else {
      res.writeHead(404); res.end();
    }
  });

  // ─── Serveur WebSocket ────────────────────────────────────────────────────────

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ origin, req }, cb) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress;

      const originOk = !origin
        || (allowNullOrigin && origin === 'null')
        || allowedOrigins.some(o => origin.startsWith(o));
      if (!originOk) {
        console.warn(`[blocked] origin="${origin}" ip=${ip}`);
        return cb(false, 403, 'Forbidden');
      }

      if (!checkRateLimit(ip)) {
        console.warn(`[rate-limit] ip=${ip}`);
        return cb(false, 429, 'Too Many Requests');
      }

      cb(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const match = req.url?.match(/^\/session\/([a-z0-9]{4,16})$/);
    if (!match) {
      ws.close(1008, 'URL invalide — utilise /session/{id}');
      return;
    }

    const sessionId = match[1];
    const session   = getOrCreateSession(sessionId);

    if (session.clients.size >= maxPeers) {
      send(ws, { type: 'error', code: 'SESSION_FULL', message: `Session pleine (max ${maxPeers})` });
      ws.close(1008, 'Session pleine');
      return;
    }

    session.clients.add(ws);
    touch(session);

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
             || req.socket.remoteAddress;
    console.log(`[connect] session=${sessionId} peers=${session.clients.size} ip=${ip}`);

    if (session.state) {
      send(ws, { type: 'init', sessionId, state: session.state, peers: session.clients.size });
    } else {
      send(ws, { type: 'joined', sessionId, peers: session.clients.size });
    }

    broadcast(session, { type: 'peer_joined', peers: session.clients.size }, ws);

    ws.on('message', (raw) => {
      if (raw.length > 131072) {
        send(ws, { type: 'error', code: 'MSG_TOO_LARGE', message: 'Message trop grand (max 128 Ko)' });
        return;
      }

      let msg;
      try { msg = JSON.parse(raw); } catch {
        send(ws, { type: 'error', code: 'BAD_JSON' });
        return;
      }

      touch(session);

      switch (msg.type) {
        case 'patch': {
          if (!msg.state || typeof msg.state !== 'object') break;
          session.state = msg.state;
          broadcast(session, {
            type: 'patch', sessionId,
            state: session.state,
            peers: session.clients.size,
            timestamp: Date.now(),
          }, ws);
          break;
        }
        case 'ping': {
          send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        }
        default:
          send(ws, { type: 'error', code: 'UNKNOWN_TYPE' });
      }
    });

    ws.on('close', () => {
      session.clients.delete(ws);
      console.log(`[disconnect] session=${sessionId} peers=${session.clients.size}`);
      if (session.clients.size > 0) {
        broadcast(session, { type: 'peer_left', peers: session.clients.size });
      }
    });

    ws.on('error', (err) => {
      console.error(`[ws error] session=${sessionId}`, err.message);
    });
  });

  wss.on('error', (err) => {
    console.error('[server error]', err);
  });

  // ─── Teardown ─────────────────────────────────────────────────────────────────

  function close() {
    return new Promise((resolve) => {
      for (const session of sessions.values()) {
        clearTimeout(session.timer);
        for (const client of session.clients) client.terminate();
      }
      sessions.clear();
      wss.close(() => httpServer.close(resolve));
    });
  }

  return { httpServer, wss, sessions, connRates, checkRateLimit, getOrCreateSession, expireSession, close };
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

const isMain = process.argv[1] === new URL(import.meta.url).pathname;
if (isMain) {
  const PORT = process.env.PORT || 3001;
  const app  = createApp();
  app.httpServer.listen(PORT, () => {
    console.log(`SSBBB server — ws://localhost:${PORT}`);
    console.log(`Origins autorisées : ${ALLOWED_ORIGINS.join(', ')}${ALLOW_NULL_ORIGIN ? ', null (file://)' : ''}`);
    console.log(`Rate limit : ${RATE_LIMIT_MAX} connexions/min/IP`);
    console.log(`Sessions max : ${MAX_SESSIONS} · TTL : ${SESSION_TTL_MS / 3600000}h · Peers/session : ${MAX_PEERS}`);
  });
}

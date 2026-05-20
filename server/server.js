/**
 * SSBBB — Serveur de sessions collaboratives
 * Stack : Node 20+ · bibliothèque ws
 * Lancer : node server.js
 */

import { WebSocketServer, WebSocket } from 'ws';

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT           = process.env.PORT || 3001;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;  // 8 heures d'inactivité → expiration
const MAX_SESSIONS   = 100;
const MAX_PEERS      = 20;

// Anti-bot
const ALLOWED_ORIGINS = [
  'https://eliejesuran.github.io',
  'http://localhost',        // dev local
  'http://127.0.0.1',       // dev local
  'file://',                 // fichier ouvert localement (file://)
];
// origin="null" est envoyé par les navigateurs quand le fichier est ouvert
// en file:// ou depuis un contexte opaque — on l'autorise explicitement
const ALLOW_NULL_ORIGIN = true;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // fenêtre de 1 minute
const RATE_LIMIT_MAX       = 10;          // max 10 connexions par IP par minute

// ─── État en mémoire ──────────────────────────────────────────────────────────

const sessions  = new Map();   // sessionId → Session
const connRates = new Map();   // ip → { count, resetAt }

// ─── Rate limiter ─────────────────────────────────────────────────────────────

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = connRates.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    connRates.set(ip, entry);
  }

  entry.count++;

  // Nettoyage périodique pour éviter la fuite mémoire
  if (connRates.size > 5000) {
    for (const [k, v] of connRates) {
      if (now > v.resetAt) connRates.delete(k);
    }
  }

  return entry.count <= RATE_LIMIT_MAX;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  session.expireAt = Date.now() + SESSION_TTL_MS;
  session.timer = setTimeout(() => expireSession(session.id), SESSION_TTL_MS);
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

  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.expireAt - b.expireAt)[0];
    expireSession(oldest.id);
  }

  const session = { id, state: null, clients: new Set(), expireAt: 0, timer: null };
  sessions.set(id, session);
  console.log(`[session] ${id} créée — ${sessions.size} session(s) actives`);
  return session;
}

// ─── Serveur WebSocket ────────────────────────────────────────────────────────

const wss = new WebSocketServer({
  server: httpServer,
  // Vérification de l'Origin à la négociation WebSocket
  verifyClient: ({ origin, req }, cb) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
             || req.socket.remoteAddress;

    // 1. Origin check
    // origin peut être : absent (undefined), "null" (string, file:// ou contexte opaque),
    // ou une URL complète. On autorise les origines listées + null si ALLOW_NULL_ORIGIN.
    const originOk = !origin
      || (ALLOW_NULL_ORIGIN && origin === 'null')
      || ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!originOk) {
      console.warn(`[blocked] origin="${origin}" ip=${ip}`);
      return cb(false, 403, 'Forbidden');
    }

    // 2. Rate limit
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

  if (session.clients.size >= MAX_PEERS) {
    send(ws, { type: 'error', code: 'SESSION_FULL', message: `Session pleine (max ${MAX_PEERS})` });
    ws.close(1008, 'Session pleine');
    return;
  }

  session.clients.add(ws);
  touch(session);

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
           || req.socket.remoteAddress;
  console.log(`[connect] session=${sessionId} peers=${session.clients.size} ip=${ip}`);

  // Envoyer l'état courant au nouveau venu
  if (session.state) {
    send(ws, { type: 'init', sessionId, state: session.state, peers: session.clients.size });
  } else {
    send(ws, { type: 'joined', sessionId, peers: session.clients.size });
  }

  broadcast(session, { type: 'peer_joined', peers: session.clients.size }, ws);

  // ── Messages entrants ──────────────────────────────────────────────────────

  ws.on('message', (raw) => {
    // Limiter la taille des messages (max 128 Ko) pour éviter les abus
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

  // ── Déconnexion ────────────────────────────────────────────────────────────

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

import { createServer } from 'http';

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200); res.end('ok');
  } else {
    res.writeHead(404); res.end();
  }
});
httpServer.listen(PORT);

wss.on('listening', () => {
  console.log(`SSBBB server — ws://localhost:${PORT}`);
  console.log(`Origins autorisées : ${ALLOWED_ORIGINS.join(', ')}${ALLOW_NULL_ORIGIN ? ', null (file://)' : ''}`);
  console.log(`Rate limit : ${RATE_LIMIT_MAX} connexions/min/IP`);
  console.log(`Sessions max : ${MAX_SESSIONS} · TTL : ${SESSION_TTL_MS / 3600000}h · Peers/session : ${MAX_PEERS}`);
});

wss.on('error', (err) => {
  console.error('[server error]', err);
  process.exit(1);
});

/**
 * SSBBB — Serveur de sessions collaboratives
 * Stack : Node 20+ · bibliothèque ws
 * Lancer : node server.js
 */

import { WebSocketServer, WebSocket } from 'ws';

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT           = process.env.PORT || 3001;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;  // 8 heures d'inactivité → expiration
const MAX_SESSIONS   = 100;                   // garde-fou mémoire
const MAX_PEERS      = 20;                    // par session

// ─── État en mémoire ──────────────────────────────────────────────────────────
//
// sessions : Map<sessionId, Session>
//
// Session {
//   id        : string
//   state     : object | null   ← dernier état complet de la setlist
//   clients   : Set<WebSocket>
//   expireAt  : number          ← timestamp (repoussé à chaque message)
//   timer     : ReturnType<setTimeout>
// }

const sessions = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomId(len = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // pas de 0/O/l/1
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

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
  // Prévenir les clients encore connectés
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
    // Purge la session la plus ancienne
    const oldest = [...sessions.values()].sort((a, b) => a.expireAt - b.expireAt)[0];
    expireSession(oldest.id);
  }

  const session = {
    id,
    state:   null,
    clients: new Set(),
    expireAt: 0,
    timer:   null,
  };
  sessions.set(id, session);
  console.log(`[session] ${id} créée — ${sessions.size} session(s) actives`);
  return session;
}

// ─── Serveur WebSocket ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {

  // L'URL attendue : ws://host/session/abc12345
  const match = req.url?.match(/^\/session\/([a-z0-9]{4,16})$/);
  if (!match) {
    ws.close(1008, 'URL invalide — utilise /session/{id}');
    return;
  }

  const sessionId = match[1];
  const session   = getOrCreateSession(sessionId);

  if (session.clients.size >= MAX_PEERS) {
    send(ws, { type: 'error', code: 'SESSION_FULL', message: 'Session pleine (max ' + MAX_PEERS + ' participants)' });
    ws.close(1008, 'Session pleine');
    return;
  }

  session.clients.add(ws);
  touch(session);

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[connect] session=${sessionId} peers=${session.clients.size} ip=${ip}`);

  // Envoyer l'état courant au nouveau venu (s'il y en a un)
  if (session.state) {
    send(ws, { type: 'init', sessionId, state: session.state, peers: session.clients.size });
  } else {
    send(ws, { type: 'joined', sessionId, peers: session.clients.size });
  }

  // Informer les autres d'un nouvel arrivant
  broadcast(session, { type: 'peer_joined', peers: session.clients.size }, ws);

  // ── Messages entrants ──────────────────────────────────────────────────────

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      send(ws, { type: 'error', code: 'BAD_JSON', message: 'Message non-JSON ignoré' });
      return;
    }

    touch(session);

    switch (msg.type) {

      // Le client envoie l'état complet après chaque modification
      case 'patch': {
        if (!msg.state || typeof msg.state !== 'object') break;
        session.state = msg.state;
        // Rebroadcast à tous les autres
        broadcast(session, {
          type:      'patch',
          sessionId,
          state:     session.state,
          peers:     session.clients.size,
          timestamp: Date.now(),
        }, ws);
        break;
      }

      // Ping keepalive (optionnel, évite la déconnexion sur certains proxies)
      case 'ping': {
        send(ws, { type: 'pong', timestamp: Date.now() });
        break;
      }

      default:
        send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Type inconnu : ${msg.type}` });
    }
  });

  // ── Déconnexion ────────────────────────────────────────────────────────────

  ws.on('close', () => {
    session.clients.delete(ws);
    console.log(`[disconnect] session=${sessionId} peers=${session.clients.size}`);

    if (session.clients.size > 0) {
      broadcast(session, { type: 'peer_left', peers: session.clients.size });
    }
    // La session reste en vie même vide (état conservé pour le prochain qui rejoint)
  });

  ws.on('error', (err) => {
    console.error(`[ws error] session=${sessionId}`, err.message);
  });
});

wss.on('listening', () => {
  console.log(`SSBBB server — ws://localhost:${PORT}`);
  console.log(`Sessions max : ${MAX_SESSIONS} · TTL : ${SESSION_TTL_MS / 3600000}h · Peers/session : ${MAX_PEERS}`);
});

wss.on('error', (err) => {
  console.error('[server error]', err);
  process.exit(1);
});

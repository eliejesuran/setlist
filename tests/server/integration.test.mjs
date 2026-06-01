/**
 * Tests d'intégration WebSocket.
 * Chaque describe bloc démarre son propre serveur sur un port aléatoire.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApp } from '../../server/server.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * File de messages bufferisée. Le listener est attaché dès la création du WS,
 * avant que le Promise open soit résolu, ce qui évite toute perte de message.
 */
function msgQueue(ws) {
  const buf = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else buf.push(msg);
  });
  return function next(ms = 2000) {
    if (buf.length) return Promise.resolve(buf.shift());
    return new Promise((resolve, reject) => {
      const entry = (msg) => { clearTimeout(t); resolve(msg); };
      const t = setTimeout(() => {
        const i = waiters.indexOf(entry);
        if (i !== -1) waiters.splice(i, 1);
        reject(new Error('message timeout'));
      }, ms);
      waiters.push(entry);
    });
  };
}

/**
 * Ouvre une connexion WS et retourne { ws, next }.
 * next() consomme les messages dans l'ordre, avec buffering anti-race.
 */
function connectWs(port, sessionId, wsOpts = {}) {
  const ws   = new WebSocket(`ws://localhost:${port}/session/${sessionId}`, wsOpts);
  const next = msgQueue(ws); // attaché AVANT d'attendre open
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { ws.terminate(); reject(new Error('connect timeout')); }, 3000);
    ws.once('open',  () => { clearTimeout(t); resolve({ ws, next }); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function waitClose(ws, ms = 2000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve(null);
    const t = setTimeout(() => reject(new Error('close timeout')), ms);
    ws.once('close', code => { clearTimeout(t); resolve(code); });
  });
}

function startApp(opts = {}) {
  const app = createApp(opts);
  return new Promise(resolve => {
    app.httpServer.listen(0, () => {
      resolve({ app, port: app.httpServer.address().port });
    });
  });
}

let _counter = 0;
const sid = () => 'test' + String(++_counter).padStart(4, '0');

// ── Endpoints HTTP ────────────────────────────────────────────────────────────

describe('Endpoints HTTP', () => {
  let app, port;
  before(async () => ({ app, port } = await startApp()));
  after(()  => app.close());

  it('GET /healthz → 200 "ok"', async () => {
    const res = await fetch(`http://localhost:${port}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('GET /autre-chemin → 404', async () => {
    const res = await fetch(`http://localhost:${port}/autre-chemin`);
    assert.equal(res.status, 404);
  });
});

// ── Connexion WebSocket ───────────────────────────────────────────────────────

describe('Connexion WebSocket', () => {
  let app, port;
  before(async () => ({ app, port } = await startApp()));
  after(()  => app.close());

  it('ferme avec code 1008 pour un chemin URL invalide', async () => {
    const { ws } = await connectWs(port, 'abcd'); // connexion valide
    ws.terminate(); // nettoyage
    // Test avec un WS séparé sans helper (URL invalide)
    const bad = new WebSocket(`ws://localhost:${port}/chemin-invalide`);
    const code = await waitClose(bad);
    assert.equal(code, 1008);
  });

  it('ferme avec code 1008 pour un ID de session trop court (< 4 chars)', async () => {
    const bad = new WebSocket(`ws://localhost:${port}/session/ab`);
    const code = await waitClose(bad);
    assert.equal(code, 1008);
  });

  it('ferme avec code 1008 pour un ID de session trop long (> 16 chars)', async () => {
    const bad = new WebSocket(`ws://localhost:${port}/session/abcdefghijklmnopq`);
    const code = await waitClose(bad);
    assert.equal(code, 1008);
  });

  it('reçoit "joined" à la première connexion sur une session vide', async () => {
    const { ws, next } = await connectWs(port, sid());
    const msg = await next();
    assert.equal(msg.type, 'joined');
    assert.equal(msg.peers, 1);
    assert.ok(msg.sessionId);
    ws.close();
  });

  it('reçoit "init" avec l\'état existant sur la deuxième connexion', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    await next1(); // joined

    const state = { items: [{ type: 'song', title: 'Hello' }], bandName: 'Groupe' };
    ws1.send(JSON.stringify({ type: 'patch', state }));

    const { ws: ws2, next: next2 } = await connectWs(port, id);
    const msg = await next2(); // init
    assert.equal(msg.type, 'init');
    assert.deepEqual(msg.state, state);
    assert.equal(msg.peers, 2);

    ws1.close(); ws2.close();
  });

  it('rejette une connexion avec une Origin bloquée (403)', async () => {
    const { app: app2, port: port2 } = await startApp({
      allowedOrigins: ['https://allowed.com'],
      allowNullOrigin: false,
    });
    try {
      await assert.rejects(
        () => connectWs(port2, sid(), { headers: { Origin: 'https://malicious.com' } }),
        /403|Unexpected server response/,
      );
    } finally {
      await app2.close();
    }
  });
});

// ── Messages WebSocket ────────────────────────────────────────────────────────

describe('Messages WebSocket', () => {
  let app, port;
  before(async () => ({ app, port } = await startApp()));
  after(()  => app.close());

  it('patch — diffuse l\'état aux autres pairs', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    await next1(); // joined

    const { ws: ws2, next: next2 } = await connectWs(port, id);
    await next2();  // ws2 reçoit joined (pas d'état)
    await next1();  // ws1 reçoit peer_joined (bufferisé, pas de race)

    const state = { items: [{ type: 'song', title: 'Test' }] };
    ws1.send(JSON.stringify({ type: 'patch', state }));

    const patch = await next2();
    assert.equal(patch.type, 'patch');
    assert.deepEqual(patch.state, state);
    assert.ok(typeof patch.timestamp === 'number');

    ws1.close(); ws2.close();
  });

  it('patch — n\'est pas renvoyé à l\'expéditeur', async () => {
    const { ws, next } = await connectWs(port, sid());
    await next(); // joined

    ws.send(JSON.stringify({ type: 'patch', state: { items: [] } }));

    await assert.rejects(
      () => next(400),
      { message: 'message timeout' },
      'Le patch ne doit pas être renvoyé à l\'émetteur',
    );

    ws.close();
  });

  it('ping → pong avec timestamp', async () => {
    const { ws, next } = await connectWs(port, sid());
    await next(); // joined

    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await next();
    assert.equal(pong.type, 'pong');
    assert.ok(typeof pong.timestamp === 'number');

    ws.close();
  });

  it('message trop grand → erreur MSG_TOO_LARGE', async () => {
    const { ws, next } = await connectWs(port, sid());
    await next(); // joined

    ws.send('x'.repeat(131_073));
    const err = await next();
    assert.equal(err.type, 'error');
    assert.equal(err.code, 'MSG_TOO_LARGE');

    ws.close();
  });

  it('JSON invalide → erreur BAD_JSON', async () => {
    const { ws, next } = await connectWs(port, sid());
    await next(); // joined

    ws.send('{pas du json}');
    const err = await next();
    assert.equal(err.type, 'error');
    assert.equal(err.code, 'BAD_JSON');

    ws.close();
  });

  it('type de message inconnu → erreur UNKNOWN_TYPE', async () => {
    const { ws, next } = await connectWs(port, sid());
    await next(); // joined

    ws.send(JSON.stringify({ type: 'commande_inconnue' }));
    const err = await next();
    assert.equal(err.type, 'error');
    assert.equal(err.code, 'UNKNOWN_TYPE');

    ws.close();
  });

  it('patch avec state invalide (non-objet) est ignoré silencieusement', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    await next1(); // joined

    const { ws: ws2, next: next2 } = await connectWs(port, id);
    await next2();  // ws2 joined
    await next1();  // ws1 peer_joined (bufferisé)

    ws1.send(JSON.stringify({ type: 'patch', state: 'pas un objet' }));

    await assert.rejects(
      () => next2(400),
      { message: 'message timeout' },
    );

    ws1.close(); ws2.close();
  });
});

// ── Événements pair ───────────────────────────────────────────────────────────

describe('Événements pair', () => {
  let app, port;
  before(async () => ({ app, port } = await startApp()));
  after(()  => app.close());

  it('peer_joined envoyé aux pairs existants quand un nouveau se connecte', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    await next1(); // joined

    const { ws: ws2 } = await connectWs(port, id);
    const pj = await next1(); // peer_joined bufferisé
    assert.equal(pj.type, 'peer_joined');
    assert.equal(pj.peers, 2);

    ws1.close(); ws2.close();
  });

  it('peer_left envoyé quand un pair se déconnecte', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    await next1(); // joined

    const { ws: ws2, next: next2 } = await connectWs(port, id);
    await next2();  // ws2 joined
    await next1();  // ws1 peer_joined

    ws2.close();
    await waitClose(ws2);

    const pl = await next1();
    assert.equal(pl.type, 'peer_left');
    assert.equal(pl.peers, 1);

    ws1.close();
  });

  it('les compteurs de pairs dans les messages sont cohérents', async () => {
    const id = sid();
    const { ws: ws1, next: next1 } = await connectWs(port, id);
    const m1 = await next1();
    assert.equal(m1.peers, 1);

    const { ws: ws2, next: next2 } = await connectWs(port, id);
    const m2 = await next2();
    assert.equal(m2.peers, 2);

    ws1.close(); ws2.close();
  });
});

// ── Limite de capacité de session ─────────────────────────────────────────────

describe('Limite de capacité de session', () => {
  it('rejette le (maxPeers+1)ème pair avec SESSION_FULL', async () => {
    const MAX = 3;
    const { app: app2, port: port2 } = await startApp({ maxPeers: MAX });
    const clients = [];
    const id = sid();

    try {
      // Remplir la session jusqu'à la limite — chaque client consomme son message d'accueil
      for (let i = 0; i < MAX; i++) {
        const { ws, next } = await connectWs(port2, id);
        await next(); // joined / init
        clients.push({ ws, next });
      }

      // La connexion suivante doit être refusée
      const { ws: extra, next: extraNext } = await connectWs(port2, id);
      const err = await extraNext();
      assert.equal(err.type, 'error');
      assert.equal(err.code, 'SESSION_FULL');

      const code = await waitClose(extra);
      assert.equal(code, 1008);
    } finally {
      for (const { ws } of clients) ws.terminate();
      await app2.close();
    }
  });
});

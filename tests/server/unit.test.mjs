/**
 * Tests unitaires pour les fonctions pures du serveur.
 * Utilise createApp() pour obtenir des instances isolées.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, RATE_LIMIT_MAX, MAX_SESSIONS } from '../../server/server.js';

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('autorise la première connexion', () => {
    const { checkRateLimit } = createApp();
    assert.equal(checkRateLimit('1.2.3.4'), true);
  });

  it(`autorise les ${RATE_LIMIT_MAX} premières connexions`, () => {
    const { checkRateLimit } = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      assert.equal(checkRateLimit('1.2.3.4'), true, `échec à la connexion n°${i + 1}`);
    }
  });

  it(`bloque la ${RATE_LIMIT_MAX + 1}ème connexion`, () => {
    const { checkRateLimit } = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('1.2.3.4');
    assert.equal(checkRateLimit('1.2.3.4'), false);
  });

  it('piste les IPs indépendamment', () => {
    const { checkRateLimit } = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('1.2.3.4');
    // La première IP est bloquée, mais une autre IP est libre
    assert.equal(checkRateLimit('5.6.7.8'), true);
  });

  it('réinitialise le compteur après expiration de la fenêtre', () => {
    const { checkRateLimit } = createApp();
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('1.2.3.4', now);
    assert.equal(checkRateLimit('1.2.3.4', now), false, 'doit être bloquée');
    // 61 secondes plus tard — la fenêtre a expiré
    assert.equal(checkRateLimit('1.2.3.4', now + 61_000), true, 'doit être autorisée');
  });

  it('compte séparément par IP dans la même fenêtre temporelle', () => {
    const { checkRateLimit } = createApp();
    const now = Date.now();
    // Épuiser l'IP A
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('10.0.0.1', now);
    assert.equal(checkRateLimit('10.0.0.1', now), false);
    // L'IP B n'est pas affectée
    assert.equal(checkRateLimit('10.0.0.2', now), true);
  });
});

// ── getOrCreateSession ────────────────────────────────────────────────────────

describe('getOrCreateSession', () => {
  it('crée une nouvelle session', () => {
    const { getOrCreateSession, sessions } = createApp();
    const session = getOrCreateSession('abc123');
    assert.equal(session.id, 'abc123');
    assert.equal(session.state, null);
    assert.ok(session.clients instanceof Set);
    assert.equal(session.clients.size, 0);
    assert.equal(sessions.size, 1);
  });

  it('retourne la session existante au deuxième appel', () => {
    const { getOrCreateSession, sessions } = createApp();
    const s1 = getOrCreateSession('xyz789');
    const s2 = getOrCreateSession('xyz789');
    assert.equal(s1, s2);
    assert.equal(sessions.size, 1);
  });

  it('crée des sessions distinctes pour des IDs différents', () => {
    const { getOrCreateSession, sessions } = createApp();
    getOrCreateSession('aaa1');
    getOrCreateSession('bbb2');
    assert.equal(sessions.size, 2);
  });

  it('évince la session la plus ancienne quand la limite est atteinte', () => {
    const { getOrCreateSession, sessions } = createApp({ maxSessions: 3 });
    const s1 = getOrCreateSession('sess1');
    const s2 = getOrCreateSession('sess2');
    const s3 = getOrCreateSession('sess3');
    // Assigner des expireAt distincts pour un tri déterministe
    s1.expireAt = 1000; // la plus ancienne
    s2.expireAt = 2000;
    s3.expireAt = 3000;

    getOrCreateSession('sess4'); // doit évincer sess1

    assert.equal(sessions.size, 3);
    assert.equal(sessions.has('sess1'), false, 'sess1 doit être évincée');
    assert.equal(sessions.has('sess4'), true,  'sess4 doit exister');
  });

  it('conserve les sessions les plus récentes lors de l\'éviction', () => {
    const { getOrCreateSession, sessions } = createApp({ maxSessions: 2 });
    const s1 = getOrCreateSession('old1');
    const s2 = getOrCreateSession('new1');
    s1.expireAt = 1000;
    s2.expireAt = 9999;

    getOrCreateSession('new2');

    assert.equal(sessions.has('old1'), false);
    assert.equal(sessions.has('new1'), true);
    assert.equal(sessions.has('new2'), true);
  });
});

// ── expireSession ─────────────────────────────────────────────────────────────

describe('expireSession', () => {
  it('supprime la session de la map', () => {
    const { getOrCreateSession, expireSession, sessions } = createApp();
    getOrCreateSession('expire1');
    assert.equal(sessions.size, 1);
    expireSession('expire1');
    assert.equal(sessions.size, 0);
  });

  it('ne plante pas pour une session inexistante', () => {
    const { expireSession } = createApp();
    assert.doesNotThrow(() => expireSession('ghost'));
  });

  it('envoie session_expired aux clients connectés', async () => {
    const { getOrCreateSession, expireSession, sessions } = createApp();
    const session = getOrCreateSession('exp2');

    // Simuler un client WebSocket minimal
    const messages = [];
    const fakeWs = {
      readyState: 1, // WebSocket.OPEN
      send: (data) => messages.push(JSON.parse(data)),
      close: () => {},
    };
    session.clients.add(fakeWs);

    expireSession('exp2');

    assert.equal(sessions.has('exp2'), false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'session_expired');
    assert.equal(messages[0].sessionId, 'exp2');
  });
});

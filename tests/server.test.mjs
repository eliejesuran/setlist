/**
 * Tests du serveur de sessions collaboratives.
 * Lancement : npm test  (ou `node --test tests/`)
 * Chaque test démarre un serveur isolé sur un port libre, avec ses propres limites.
 */
import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopAll, connect, next, nextOf, closed, send } from './helpers.mjs';

after(stopAll);

describe('Contrôle d\'Origin', () => {
  test('accepte une origine listée, un file:// (null) et localhost sur n\'importe quel port', async () => {
    const { port } = await startServer();
    for (const origin of ['https://jesuran.be', 'https://www.jesuran.be',
                          'https://eliejesuran.github.io', 'null',
                          'http://localhost:5500', 'http://127.0.0.1:8080']) {
      const ws = await connect(port, 'orig' + Math.random().toString(36).slice(2, 8), { origin });
      assert.equal(ws.readyState, ws.OPEN, `origine refusée : ${origin}`);
      ws.close();
    }
  });

  test('accepte une requête sans en-tête Origin (client non navigateur)', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'noorigin', { origin: undefined });
    assert.equal(ws.readyState, ws.OPEN);
    ws.close();
  });

  test('refuse un sous-domaine usurpé (régression startsWith)', async () => {
    const { port } = await startServer();
    for (const origin of ['https://jesuran.be.attaquant.com',
                          'http://localhost.attaquant.com',
                          'https://evil.com']) {
      await assert.rejects(() => connect(port, 'evil', { origin }),
        /403/, `origine acceptée à tort : ${origin}`);
    }
  });
});

describe('Cycle de vie d\'une session', () => {
  test('première connexion → joined ; suivante → init avec l\'état', async () => {
    const { port } = await startServer();
    const a = await connect(port, 'cycle1');
    const joined = await nextOf(a, 'joined');
    assert.equal(joined.peers, 1);
    assert.deepEqual(joined.names, ['Anonyme']);
    assert.equal(joined.state, undefined, 'aucun état ne doit être envoyé sur une session vide');

    send(a, { type: 'patch', state: { items: [{ type: 'song', id: 's1', title: 'Fever' }],
                                      bandName: 'Les Tests', lastModified: 1 } });
    await new Promise(r => setTimeout(r, 120));

    const b = await connect(port, 'cycle1');
    const init = await nextOf(b, 'init');
    assert.equal(init.state.bandName, 'Les Tests');
    assert.equal(init.state.items[0].title, 'Fever');
    assert.equal(init.peers, 2);
  });

  test('patch diffusé aux autres pairs, jamais à l\'émetteur', async () => {
    const { port } = await startServer();
    const a = await connect(port, 'diff1');
    const b = await connect(port, 'diff1');
    await new Promise(r => setTimeout(r, 150));
    a.queue.length = 0; b.queue.length = 0;

    send(a, { type: 'patch', state: { items: [], bandName: 'Écho', lastModified: 42 } });
    const recu = await nextOf(b, 'patch');
    assert.equal(recu.state.bandName, 'Écho');
    assert.equal(recu.state.lastModified, 42, 'lastModified doit être préservé pour l\'arbitrage client');
    assert.ok(recu.timestamp, 'le serveur horodate le broadcast');
    await new Promise(r => setTimeout(r, 200));
    assert.ok(!a.queue.some(m => m.type === 'patch'), 'l\'émetteur ne doit pas recevoir son propre patch');
  });

  test('sessionName transmis au nouvel arrivant', async () => {
    const { port } = await startServer();
    const a = await connect(port, 'nom1');
    await nextOf(a, 'joined');
    send(a, { type: 'patch', state: { items: [], sessionName: 'Répét vendredi', lastModified: 1 } });
    await new Promise(r => setTimeout(r, 120));
    const b = await connect(port, 'nom1');
    assert.equal((await nextOf(b, 'init')).sessionName, 'Répét vendredi');
  });

  test('identify diffuse les noms à tout le monde, y compris à soi-même', async () => {
    const { port } = await startServer();
    const a = await connect(port, 'ident1');
    const b = await connect(port, 'ident1');
    await nextOf(a, 'joined'); a.queue.length = 0; b.queue.length = 0;

    send(a, { type: 'identify', name: 'Guitare' });
    assert.deepEqual((await nextOf(a, 'peers_update')).names.sort(), ['Anonyme', 'Guitare']);
    assert.deepEqual((await nextOf(b, 'peers_update')).names.sort(), ['Anonyme', 'Guitare']);
    // régression : l'émetteur recevait peers_update en double (broadcast sans exclusion + send)
    await new Promise(r => setTimeout(r, 150));
    assert.equal(a.queue.filter(m => m.type === 'peers_update').length, 0,
      'l\'émetteur ne doit recevoir qu\'un seul peers_update');

    send(b, { type: 'identify', name: '  Batterie très très longue au-delà de 24 caractères  ' });
    const noms = (await nextOf(a, 'peers_update')).names;
    const batterie = noms.find(n => n.startsWith('Batterie'));
    assert.ok(batterie, 'le nom du pair doit apparaître dans la liste');
    assert.equal(batterie.length, 24, 'le nom doit être tronqué à 24 caractères');
  });

  test('départ d\'un pair → peer_left avec la liste à jour', async () => {
    const { port } = await startServer();
    const a = await connect(port, 'left1');
    const b = await connect(port, 'left1');
    await nextOf(a, 'joined');
    send(b, { type: 'identify', name: 'Basse' });
    await nextOf(a, 'peers_update');
    a.queue.length = 0;
    b.close();
    const left = await nextOf(a, 'peer_left');
    assert.equal(left.peers, 1);
    assert.deepEqual(left.names, ['Anonyme']);
  });
});

describe('Protocole et robustesse', () => {
  test('ping → pong', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'ping1');
    await nextOf(ws, 'joined');
    send(ws, { type: 'ping' });
    assert.ok((await nextOf(ws, 'pong')).timestamp);
  });

  test('JSON invalide → BAD_JSON, type inconnu → UNKNOWN_TYPE', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'bad1');
    await nextOf(ws, 'joined');
    ws.send('{ceci nest pas du json');
    assert.equal((await nextOf(ws, 'error')).code, 'BAD_JSON');
    send(ws, { type: 'nimportequoi' });
    assert.equal((await nextOf(ws, 'error')).code, 'UNKNOWN_TYPE');
  });

  test('message > 128 Ko refusé sans casser la session', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'big1');
    await nextOf(ws, 'joined');
    send(ws, { type: 'patch', state: { items: [], note: 'x'.repeat(140000), lastModified: 1 } });
    assert.equal((await nextOf(ws, 'error')).code, 'MSG_TOO_LARGE');
    send(ws, { type: 'ping' });
    assert.ok(await nextOf(ws, 'pong'), 'la session doit survivre à un message trop gros');
  });

  test('patch sans state ignoré silencieusement', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'nostate');
    await nextOf(ws, 'joined');
    send(ws, { type: 'patch' });
    send(ws, { type: 'ping' });
    assert.equal((await next(ws)).type, 'pong', 'aucune erreur ne doit être émise');
  });

  test('URL de session invalide → fermeture 1008', async () => {
    const { port } = await startServer();
    const ws = await connect(port, 'xx');           // 2 caractères : hors format
    assert.equal((await closed(ws)).code, 1008);
  });

  test('session pleine → error SESSION_FULL puis fermeture 1008', async () => {
    const { port } = await startServer({ MAX_PEERS: '2' });
    const a = await connect(port, 'full1');
    const b = await connect(port, 'full1');
    await nextOf(a, 'joined');
    const c = await connect(port, 'full1');
    const err = await nextOf(c, 'error');
    assert.equal(err.code, 'SESSION_FULL');
    assert.match(err.message, /max 2/);
    assert.equal((await closed(c)).code, 1008);
    assert.equal(a.readyState, a.OPEN, 'les pairs déjà connectés ne doivent pas être affectés');
    b.close();
  });

  test('rate limit : au-delà du quota, handshake refusé en 429', async () => {
    const { port } = await startServer({ RATE_LIMIT_MAX: '3' });
    for (let i = 0; i < 3; i++) (await connect(port, 'rate1')).close();
    await assert.rejects(() => connect(port, 'rate1'), /429/);
  });

  test('éviction de la session la plus ancienne quand MAX_SESSIONS est atteint', async () => {
    const { port } = await startServer({ MAX_SESSIONS: '2' });
    const a = await connect(port, 'evict1');
    await nextOf(a, 'joined');
    send(a, { type: 'patch', state: { items: [], bandName: 'Première', lastModified: 1 } });
    await new Promise(r => setTimeout(r, 60));
    const b = await connect(port, 'evict2'); await nextOf(b, 'joined');
    const c = await connect(port, 'evict3'); await nextOf(c, 'joined');   // dépasse la limite
    assert.equal((await nextOf(a, 'session_expired')).sessionId, 'evict1');
    // la session évincée est repartie de zéro
    const d = await connect(port, 'evict1');
    assert.equal((await next(d)).type, 'joined', 'la session évincée doit avoir perdu son état');
  });
});

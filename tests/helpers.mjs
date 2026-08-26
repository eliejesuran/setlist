/**
 * Helpers de test — démarrage du serveur WS en sous-processus + client de test.
 * Aucune dépendance externe : `ws` est résolu depuis server/node_modules.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(new URL('../server/', import.meta.url));
export const { WebSocket } = require('ws');
const SERVER = new URL('../server/server.js', import.meta.url);

const running = [];

function freePort() {
  return new Promise(res => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

/** Démarre un serveur isolé. `env` surcharge les limites (MAX_PEERS, RATE_LIMIT_MAX…). */
export async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER.pathname], {
    env: { ...process.env, PORT: String(port), RATE_LIMIT_MAX: '1000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', d => logs.push(String(d)));
  child.stderr.on('data', d => logs.push(String(d)));
  running.push(child);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('serveur mort au démarrage :\n' + logs.join(''));
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return { port, child, logs }; }
    catch { /* pas encore prêt */ }
    await sleep(60);
  }
  throw new Error('serveur non démarré :\n' + logs.join(''));
}

export function stopAll() { running.forEach(c => c.kill()); running.length = 0; }

/** Ouvre une connexion et bufferise les messages reçus. Rejette si le handshake est refusé. */
export function connect(port, id = 'test42', opts = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/session/${id}`,
      { origin: 'https://jesuran.be', ...opts });
    ws.queue = []; ws.waiters = []; ws.closeInfo = null;
    ws.on('message', d => {
      let m; try { m = JSON.parse(d); } catch { m = { type: '__raw', data: String(d) }; }
      const w = ws.waiters.shift();
      if (w) w(m); else ws.queue.push(m);
    });
    ws.on('close', (code, reason) => { ws.closeInfo = { code, reason: String(reason) }; });
    ws.on('open', () => resolve(ws));
    ws.on('error', err => reject(err));
  });
}

/** Prochain message reçu (ou en attente dans le buffer). */
export function next(ws, timeout = 3000) {
  if (ws.queue.length) return Promise.resolve(ws.queue.shift());
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout : aucun message reçu')), timeout);
    ws.waiters.push(m => { clearTimeout(t); res(m); });
  });
}

/** Prochain message d'un type donné (ignore les autres). */
export async function nextOf(ws, type, max = 10) {
  const vus = [];
  for (let i = 0; i < max; i++) {
    const m = await next(ws);
    if (m.type === type) return m;
    vus.push(m.type);
  }
  throw new Error(`message "${type}" non reçu — vus : ${vus.join(', ')}`);
}

/** Attend la fermeture et renvoie {code, reason}. */
export function closed(ws, timeout = 3000) {
  if (ws.closeInfo) return Promise.resolve(ws.closeInfo);
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout : socket non fermée')), timeout);
    ws.on('close', (code, reason) => { clearTimeout(t); res({ code, reason: String(reason) }); });
  });
}

export const send = (ws, obj) => ws.send(JSON.stringify(obj));

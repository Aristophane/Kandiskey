// Sync server: WebSocket relay + high-precision NTP time service
// Usage: node server.js [port]

import { WebSocketServer } from 'ws';
import { performance }     from 'perf_hooks';

const PORT = parseInt(process.argv[2] ?? '3001', 10);
const wss  = new WebSocketServer({ port: PORT });

// Calibrate performance.now() to wall-clock once at startup.
// performance.now() has ~100μs resolution vs Date.now()'s ~1ms.
const T0 = Date.now() - performance.now();
function now() { return T0 + performance.now(); }  // sub-ms wall clock (ms)

const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  console.log(`[+] client connected  (total: ${clients.size})`);
  relay(ws, JSON.stringify({ type: 'PEER_JOINED' }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'PING') {
      const t2 = now();
      ws.send(JSON.stringify({ type: 'PONG', t1: msg.t1, t2, t3: now() }));
      return;
    }

    relay(ws, raw);
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] client disconnected (total: ${clients.size})`);
    relay(ws, JSON.stringify({ type: 'PEER_LEFT' }));
  });

  ws.on('error', err => { console.error('ws error:', err.message); clients.delete(ws); });
});

function relay(sender, raw) {
  for (const c of clients) {
    if (c !== sender && c.readyState === 1) c.send(raw);
  }
}

console.log(`Sync server listening on ws://0.0.0.0:${PORT}`);
console.log(`Clients connect with: ?sync=ws://<your-ip>:${PORT}`);

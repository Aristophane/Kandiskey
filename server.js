// Sync server: WebSocket relay + NTP time service
// Usage: node server.js [port]
// Clients connect with ?sync=ws://<host>:<port>

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[2] ?? '3001', 10);
const wss  = new WebSocketServer({ port: PORT });

const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  console.log(`[+] client connected  (total: ${clients.size})`);

  // Tell existing clients a new peer arrived so they can send their state
  relay(ws, JSON.stringify({ type: 'PEER_JOINED' }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // NTP: answer immediately with server timestamps, don't relay
    if (msg.type === 'PING') {
      const t2 = Date.now();
      ws.send(JSON.stringify({ type: 'PONG', t1: msg.t1, t2, t3: Date.now() }));
      return;
    }

    // Everything else: relay to all other connected clients
    relay(ws, raw);
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] client disconnected (total: ${clients.size})`);
    relay(ws, JSON.stringify({ type: 'PEER_LEFT' }));
  });

  ws.on('error', err => {
    console.error('ws error:', err.message);
    clients.delete(ws);
  });
});

function relay(sender, raw) {
  for (const c of clients) {
    if (c !== sender && c.readyState === 1 /* OPEN */) {
      c.send(raw);
    }
  }
}

console.log(`Sync server listening on ws://0.0.0.0:${PORT}`);
console.log(`Clients connect with: ?sync=ws://<your-ip>:${PORT}`);

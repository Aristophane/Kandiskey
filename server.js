// ═══════════════════════════════════════════════════════════════════
// Sync server — WebSocket relay + NTP time service
// Production features: rooms, heartbeat, rate-limiting, health check
// Usage: node server.js   (PORT env var, default 3001)
// ═══════════════════════════════════════════════════════════════════

import { WebSocketServer, WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { createServer } from 'http';

const PORT         = parseInt(process.env.PORT ?? '3001', 10);
const MAX_PER_ROOM = parseInt(process.env.MAX_PER_ROOM ?? '8', 10);
const MAX_MSG_BYTES= 65_536;   // 64 KB — drop larger payloads
const HB_INTERVAL  = 30_000;  // heartbeat every 30 s
const HB_TIMEOUT   = 10_000;  // close if no pong within 10 s
const ROOM_TTL     = 30_000;  // destroy empty room after 30 s
const RATE_WINDOW  = 1_000;   // ms window for rate-limiting connections
const RATE_MAX     = 5;       // max new connections per IP in that window

// ── Sub-ms wall clock ───────────────────────────────────────────────

let T0 = Date.now() - performance.now();
setInterval(() => { T0 = Date.now() - performance.now(); }, 60_000);
function now() { return T0 + performance.now(); }

// ── Rooms ───────────────────────────────────────────────────────────
// rooms: Map<roomId, { peers: Set<ws>, timer: Timeout|null }>

const rooms = new Map();

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { peers: new Set(), timer: null });
  const room = rooms.get(id);
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  return room;
}

function leaveRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(ws);
  relay(room, ws, JSON.stringify({ type: 'PEER_LEFT' }));
  if (room.peers.size === 0) {
    room.timer = setTimeout(() => rooms.delete(roomId), ROOM_TTL);
  }
}

function relay(room, sender, raw) {
  for (const c of room.peers) {
    if (c !== sender && c.readyState === WebSocket.OPEN) c.send(raw);
  }
}

// ── Rate limiting ───────────────────────────────────────────────────
// Simple token bucket per IP: track connection timestamps

const ipWindows = new Map(); // ip → timestamp[]

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (ipWindows.get(ip) ?? []).filter(t => now - t < RATE_WINDOW);
  hits.push(now);
  ipWindows.set(ip, hits);
  return hits.length > RATE_MAX;
}

// Clean up old IP records every minute
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, hits] of ipWindows) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) ipWindows.delete(ip); else ipWindows.set(ip, fresh);
  }
}, 60_000);

// ── HTTP server (health check + WS upgrade) ─────────────────────────

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    const info = { status: 'ok', rooms: rooms.size, uptime: process.uptime() };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

// ── WebSocket connections ───────────────────────────────────────────

wss.on('connection', (ws, req) => {
  // Extract room ID from URL query string: ws://host/?room=ABCD12
  const url    = new URL(req.url, 'http://localhost');
  const roomId = (url.searchParams.get('room') ?? '').toUpperCase().slice(0, 12);
  const ip     = req.headers['x-forwarded-for']?.split(',')[0].trim()
              ?? req.socket.remoteAddress ?? 'unknown';

  if (!roomId) { ws.close(4000, 'No room ID'); return; }

  if (isRateLimited(ip)) {
    ws.close(4029, 'Rate limited');
    console.warn(`[rate] blocked ${ip}`);
    return;
  }

  const room = getOrCreateRoom(roomId);

  if (room.peers.size >= MAX_PER_ROOM) {
    ws.close(4008, 'Room full');
    return;
  }

  room.peers.add(ws);
  ws._roomId = roomId;
  ws._alive  = true;

  console.log(`[+] ${ip} joined room ${roomId} (${room.peers.size}/${MAX_PER_ROOM})`);
  relay(room, ws, JSON.stringify({ type: 'PEER_JOINED', peers: room.peers.size }));

  // ── Heartbeat ────────────────────────────────────────────────────
  ws._hbTimer = setInterval(() => {
    if (!ws._alive) { ws.terminate(); return; }
    ws._alive = false;
    ws.ping();
  }, HB_INTERVAL);

  ws.on('pong', () => { ws._alive = true; });

  // ── Messages ─────────────────────────────────────────────────────
  ws.on('message', (raw, isBinary) => {
    if (isBinary || raw.length > MAX_MSG_BYTES) return;

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg.type !== 'string') return;

    if (msg.type === 'PING') {
      const t2 = now();
      ws.send(JSON.stringify({ type: 'PONG', t1: msg.t1, t2, t3: now() }));
      return;
    }

    relay(room, ws, raw);
  });

  // ── Disconnect ───────────────────────────────────────────────────
  ws.on('close', () => {
    clearInterval(ws._hbTimer);
    leaveRoom(ws, ws._roomId);
    console.log(`[-] left room ${roomId} (${room.peers.size} remaining)`);
  });

  ws.on('error', err => {
    console.error(`[ws error] room ${roomId}:`, err.message);
    ws.terminate();
  });
});

// ── Graceful shutdown ───────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down…`);
  wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Start ───────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Sync server listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Connect: wss://<your-domain>/?room=<ROOM_ID>`);
});

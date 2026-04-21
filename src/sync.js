// ═══════════════════════════════════════════════════════════════════
// WORLD CLOCK SYNC — NTP over WebSocket + WebRTC DataChannel
// ═══════════════════════════════════════════════════════════════════
//
// Two-tier clock sync:
//
//  Tier 1 (always): WebSocket NTP to the relay server.
//    Both peers independently sync their performance.now() to server
//    wall-clock. Works across any network, accuracy ≈ RTT/2.
//
//  Tier 2 (when DataChannel opens): P2P NTP through the WebRTC
//    DataChannel (unreliable/UDP-like — no TCP retransmission inflation).
//    The "host" (whoever got PEER_JOINED first) acts as the NTP server;
//    the "guest" re-calibrates against it. Because the P2P RTT is almost
//    always lower than the server RTT (especially on mobile), the guest
//    ends up more tightly locked to the host's already-calibrated clock.
//
//  Music messages (PLAY, STOP, GRID_SET …) also flow through the
//  DataChannel when open, falling back to WebSocket relay otherwise.
//
// NTP offset strategy: minimum-RTT cluster median
// ─────────────────────────────────────────────────
//   offset = ((t2-t1) + (t3-t4)) / 2
//   Keep the 64 most recent samples. Re-derive the minimum RTT from
//   live history (so expired best samples don't ghost the threshold).
//   Cluster = samples within BEST_CLUSTER fraction of that minimum.
//   Use the median offset of the cluster (robust to asymmetric outliers).
// ═══════════════════════════════════════════════════════════════════

const BOOT_PINGS     = 32;      // pings fired on connect / DC open
const BOOT_GAP_MS    = 20;      // ms between boot pings (~640 ms total)
const MAINT_INTERVAL = 1_000;   // ms between maintenance bursts (1 s)
const MAINT_PINGS    = 4;       // pings per maintenance burst
const MAINT_GAP_MS   = 60;      // ms between maintenance pings
const HISTORY_SIZE   = 64;      // ring-buffer size
const BEST_CLUSTER   = 0.10;    // cluster = samples within 10 % of min RTT

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ── State ──────────────────────────────────────────────────────────

let _ws          = null;
let _url         = null;
let _onMessage   = null;
let _onConnect   = null;
let _onDisconnect= null;
let _onOffset    = null;

let _pc          = null;   // RTCPeerConnection
let _dc          = null;   // RTCDataChannel
let _dcReady     = false;
let _isHost      = false;  // true = we created the offer (got PEER_JOINED)

let _connected   = false;
let _history     = [];     // { rtt, offset }[]
let _maintTimer  = null;
let _offset      = 0;

// ── Public API ─────────────────────────────────────────────────────

/** Shared wall-clock time in ms, synchronised to the server/peer. */
export function sharedNow()   { return performance.now() + _offset; }
export function clockOffset() { return _offset; }
export function isConnected() { return _connected; }

/**
 * @param {string}   url            WebSocket relay server URL
 * @param {Function} onMessage      called for non-NTP, non-signalling messages
 * @param {Function} [onConnect]
 * @param {Function} [onDisconnect]
 * @param {Function} [onOffsetChange] called with new offset (ms) after each burst
 */
export function connect(url, onMessage, onConnect, onDisconnect, onOffsetChange) {
  _url          = url;
  _onMessage    = onMessage;
  _onConnect    = onConnect;
  _onDisconnect = onDisconnect;
  _onOffset     = onOffsetChange;
  _open();
}

/** Send a music-state message. Prefers DataChannel (lower latency). */
export function send(msg) {
  const raw = JSON.stringify(msg);
  if (_dcReady && _dc?.readyState === 'open') {
    _dc.send(raw);
  } else if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(raw);
  }
}

// ── WebSocket connection ────────────────────────────────────────────

function _open() {
  if (_ws) { try { _ws.close(); } catch {} }
  _ws = new WebSocket(_url);

  _ws.addEventListener('open', () => {
    _connected = true;
    _history   = [];
    _offset    = 0;
    console.log('[sync] WebSocket connected to', _url);
    _runBurst(BOOT_PINGS, BOOT_GAP_MS);
    _maintTimer = setInterval(() => _runBurst(MAINT_PINGS, MAINT_GAP_MS), MAINT_INTERVAL);
    _onConnect?.();
  });

  _ws.addEventListener('message', e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    _handleWsMsg(msg);
  });

  _ws.addEventListener('close', () => {
    _connected = false;
    _dcReady   = false;
    clearInterval(_maintTimer);
    _cleanupRTC();
    console.log('[sync] disconnected — retrying in 2 s');
    _onDisconnect?.();
    setTimeout(_open, 2000);
  });

  _ws.addEventListener('error', () => _ws.close());
}

function _handleWsMsg(msg) {
  switch (msg.type) {
    case 'PONG':         _handlePong(msg);          return;
    case 'RTCOffer':     _handleOffer(msg.sdp);     return;
    case 'RTCAnswer':    _handleAnswer(msg.sdp);    return;
    case 'ICECandidate': _handleIce(msg.candidate); return;
    case 'PEER_JOINED':
      _onMessage?.(msg);
      _initiateRTC();    // we are the host — create offer
      return;
    case 'PEER_LEFT':
      _cleanupRTC();
      _onMessage?.(msg);
      return;
  }
  _onMessage?.(msg);
}

// ── WebRTC signalling ───────────────────────────────────────────────

function _initiateRTC() {
  _cleanupRTC();
  _isHost = true;
  _pc = new RTCPeerConnection(STUN);
  _pc.onicecandidate = ({ candidate }) => {
    if (candidate) _ws.send(JSON.stringify({ type: 'ICECandidate', candidate }));
  };
  // Unreliable, unordered = UDP semantics → no head-of-line blocking
  _dc = _pc.createDataChannel('sync', { ordered: false, maxRetransmits: 0 });
  _setupDC(_dc);
  _pc.createOffer()
    .then(o => _pc.setLocalDescription(o))
    .then(() => _ws.send(JSON.stringify({ type: 'RTCOffer', sdp: _pc.localDescription })))
    .catch(err => console.warn('[sync] RTC offer error:', err));
}

async function _handleOffer(sdp) {
  _cleanupRTC();
  _isHost = false;
  _pc = new RTCPeerConnection(STUN);
  _pc.onicecandidate = ({ candidate }) => {
    if (candidate) _ws.send(JSON.stringify({ type: 'ICECandidate', candidate }));
  };
  _pc.ondatachannel = e => { _dc = e.channel; _setupDC(_dc); };
  try {
    await _pc.setRemoteDescription(sdp);
    const answer = await _pc.createAnswer();
    await _pc.setLocalDescription(answer);
    _ws.send(JSON.stringify({ type: 'RTCAnswer', sdp: _pc.localDescription }));
  } catch (err) { console.warn('[sync] RTC answer error:', err); }
}

async function _handleAnswer(sdp) {
  try { await _pc?.setRemoteDescription(sdp); }
  catch (err) { console.warn('[sync] RTC setRemote error:', err); }
}

async function _handleIce(candidate) {
  try { await _pc?.addIceCandidate(candidate); }
  catch {}
}

function _cleanupRTC() {
  if (_dc) { try { _dc.close(); } catch {} _dc = null; }
  if (_pc) { try { _pc.close(); } catch {} _pc = null; }
  _dcReady = false;
  _isHost  = false;
}

// ── DataChannel setup ───────────────────────────────────────────────

function _setupDC(dc) {
  dc.onopen = () => {
    _dcReady = true;
    console.log('[sync] DataChannel open (P2P)');
    if (!_isHost) {
      // Guest: re-calibrate NTP against the host (P2P RTT << server RTT on mobile)
      _history = [];
      _offset  = 0;
      _runBurst(BOOT_PINGS, BOOT_GAP_MS);
    }
  };

  dc.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case 'PING': {
        // Host acts as NTP server: respond with our calibrated sharedNow()
        const t2 = sharedNow();
        dc.send(JSON.stringify({ type: 'PONG', t1: msg.t1, t2, t3: sharedNow() }));
        return;
      }
      case 'PONG':
        _handlePong(msg);
        return;
    }
    _onMessage?.(msg);
  };

  dc.onclose = () => {
    _dcReady = false;
    _dc      = null;
    console.log('[sync] DataChannel closed');
    if (!_isHost) {
      // Guest lost P2P channel — fall back to server NTP and re-calibrate
      _history = [];
      _offset  = 0;
      _runBurst(BOOT_PINGS, BOOT_GAP_MS);
    }
  };
}

// ── NTP ────────────────────────────────────────────────────────────

function _runBurst(count, gapMs) {
  let i = 0;
  const iv = setInterval(() => {
    _ping();
    if (++i >= count) clearInterval(iv);
  }, gapMs);
}

function _ping() {
  if (!_connected) return;
  const data = JSON.stringify({ type: 'PING', t1: performance.now() });
  // Guest: ping through DataChannel (UDP-like, lower variance)
  // Host / no peer: ping through WebSocket to server
  if (!_isHost && _dcReady && _dc?.readyState === 'open') {
    _dc.send(data);
  } else {
    _ws.send(data);
  }
}

function _handlePong({ t1, t2, t3 }) {
  const t4  = performance.now();
  const rtt = (t4 - t1) - (t3 - t2);
  if (rtt < 0) return;

  const offset = ((t2 - t1) + (t3 - t4)) / 2;

  _history.push({ rtt, offset });
  if (_history.length > HISTORY_SIZE) _history.shift();

  const bestRtt   = Math.min(..._history.map(s => s.rtt));
  const threshold = bestRtt * (1 + BEST_CLUSTER);
  const cluster   = _history.filter(s => s.rtt <= threshold);
  if (cluster.length === 0) return;

  cluster.sort((a, b) => a.offset - b.offset);
  const mid = Math.floor(cluster.length / 2);
  const newOffset = cluster.length % 2
    ? cluster[mid].offset
    : (cluster[mid - 1].offset + cluster[mid].offset) / 2;

  _offset = newOffset;
  _onOffset?.(newOffset);

  const via = (!_isHost && _dcReady) ? 'P2P' : 'WS';
  console.log(`[sync][${via}] rtt=${rtt.toFixed(2)}ms  offset=${_offset.toFixed(3)}ms`);
}

// ===================================================================
// WORLD CLOCK SYNC - NTP over WebSocket + WebRTC DataChannel
// ===================================================================
//
// Two-tier clock sync:
//
//  Tier 1 (always): WebSocket NTP to the relay server.
//    Both peers independently sync their performance.now() to server
//    wall-clock. Works across any network, accuracy ~= RTT/2.
//
//  Tier 2 (when DataChannel opens): P2P NTP through the WebRTC
//    DataChannel (unreliable/UDP-like - no TCP retransmission inflation).
//    The "host" (whoever got PEER_JOINED first) acts as the NTP server;
//    the "guest" re-calibrates against it. Because the P2P RTT is almost
//    always lower than the server RTT (especially on mobile), the guest
//    ends up more tightly locked to the host's already-calibrated clock.
//
//  Music messages (PLAY, STOP, GRID_SET ...) also flow through the
//  DataChannel when open, falling back to WebSocket relay otherwise.
//
// NTP offset strategy: minimum-RTT cluster median
// -------------------------------------------------
//   offset = ((t2-t1) + (t3-t4)) / 2
//   Keep the 64 most recent samples. Re-derive the minimum RTT from
//   live history (so expired best samples don't ghost the threshold).
//   Cluster = samples within BEST_CLUSTER fraction of that minimum.
//   Use the median offset of the cluster (robust to asymmetric outliers).
//
// Beyond a plain offset, we also fit an affine shared clock:
//   sharedMs ~= a * perfMs + b
// This lets the transport translate future shared anchors into local
// audio time while absorbing slow device drift.

const BOOT_PINGS          = 32;     // pings fired on connect / DC open
const BOOT_GAP_MS         = 20;     // ms between boot pings (~640 ms total)
const MAINT_INTERVAL      = 1_000;  // ms between maintenance bursts (1 s)
const MAINT_PINGS         = 4;      // pings per maintenance burst
const MAINT_GAP_MS        = 60;     // ms between maintenance pings
const HISTORY_SIZE        = 64;     // ring-buffer size
const BEST_CLUSTER        = 0.10;   // cluster = samples within 10 % of min RTT
const FIT_POINT_LIMIT     = 24;     // recent best samples for affine clock fit
const AUDIO_SAMPLE_GAP_MS = 25;     // perf/audio fit sampling interval
const AUDIO_HISTORY_SIZE  = 48;     // local perf->audio fit history

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// -- State ------------------------------------------------------------

let _ws           = null;
let _url          = null;
let _onMessage    = null;
let _onConnect    = null;
let _onDisconnect = null;
let _onOffset     = null;

let _pc       = null;   // RTCPeerConnection
let _dc       = null;   // RTCDataChannel
let _dcReady  = false;
let _isHost   = false;  // true = we created the offer (got PEER_JOINED)

let _connected  = false;
let _history    = [];   // { rtt, offset, perf, shared }[]
let _maintTimer = null;
let _offset     = 0;
let _sharedFit  = { a: 1, b: 0, rmse: Infinity, maxErr: Infinity, ready: false };
let _confidenceMs = Infinity;

const _audioFits = new WeakMap();

// -- Public API -------------------------------------------------------

/** Shared wall-clock time in ms, synchronised to the server/peer. */
export function sharedNow() {
  return _predictSharedMs(performance.now());
}

export function clockOffset() {
  return sharedNow() - performance.now();
}

export function syncConfidenceMs() {
  return _confidenceMs;
}

export function isConnected() {
  return _connected;
}

export function sharedTimeToAudioTime(audioCtx, sharedMs) {
  return audioCtx.currentTime + (sharedMs - sharedNow()) / 1000;
}

export function sharedTimeToAudioDelay(audioCtx, sharedMs) {
  return sharedTimeToAudioTime(audioCtx, sharedMs) - audioCtx.currentTime;
}

/**
 * @param {string}   url            WebSocket relay server base URL (no room)
 * @param {string}   roomId         Room code to join/create
 * @param {Function} onMessage
 * @param {Function} [onConnect]
 * @param {Function} [onDisconnect]
 * @param {Function} [onOffsetChange]
 */
export function connect(url, roomId, onMessage, onConnect, onDisconnect, onOffsetChange) {
  const base = url.replace(/\/+$/, '');
  _url          = `${base}/?room=${encodeURIComponent(roomId)}`;
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

// -- WebSocket connection --------------------------------------------

function _open() {
  if (_ws) {
    try { _ws.close(); } catch {}
  }
  _ws = new WebSocket(_url);

  _ws.addEventListener('open', () => {
    _connected = true;
    _history = [];
    _offset = 0;
    _sharedFit = { a: 1, b: 0, rmse: Infinity, maxErr: Infinity, ready: false };
    _confidenceMs = Infinity;
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
    _dcReady = false;
    clearInterval(_maintTimer);
    _cleanupRTC();
    console.log('[sync] disconnected - retrying in 2 s');
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
      _initiateRTC(); // we are the host - create offer
      return;
    case 'PEER_LEFT':
      _cleanupRTC();
      _onMessage?.(msg);
      return;
  }
  _onMessage?.(msg);
}

// -- WebRTC signalling ------------------------------------------------

function _initiateRTC() {
  _cleanupRTC();
  _isHost = true;
  _pc = new RTCPeerConnection(STUN);
  _pc.onicecandidate = ({ candidate }) => {
    if (candidate) _ws.send(JSON.stringify({ type: 'ICECandidate', candidate }));
  };
  // Unreliable, unordered = UDP semantics -> no head-of-line blocking
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
  } catch (err) {
    console.warn('[sync] RTC answer error:', err);
  }
}

async function _handleAnswer(sdp) {
  try {
    await _pc?.setRemoteDescription(sdp);
  } catch (err) {
    console.warn('[sync] RTC setRemote error:', err);
  }
}

async function _handleIce(candidate) {
  try { await _pc?.addIceCandidate(candidate); } catch {}
}

function _cleanupRTC() {
  if (_dc) { try { _dc.close(); } catch {} _dc = null; }
  if (_pc) { try { _pc.close(); } catch {} _pc = null; }
  _dcReady = false;
  _isHost = false;
}

// -- DataChannel setup ------------------------------------------------

function _setupDC(dc) {
  dc.onopen = () => {
    _dcReady = true;
    console.log('[sync] DataChannel open (P2P)');
    if (!_isHost) {
      // Guest: re-calibrate NTP against the host (P2P RTT << server RTT on mobile)
      _history = [];
      _offset = 0;
      _sharedFit = { a: 1, b: 0, rmse: Infinity, maxErr: Infinity, ready: false };
      _confidenceMs = Infinity;
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
    _dc = null;
    console.log('[sync] DataChannel closed');
    if (!_isHost) {
      // Guest lost P2P channel - fall back to server NTP and re-calibrate
      _history = [];
      _offset = 0;
      _sharedFit = { a: 1, b: 0, rmse: Infinity, maxErr: Infinity, ready: false };
      _confidenceMs = Infinity;
      _runBurst(BOOT_PINGS, BOOT_GAP_MS);
    }
  };
}

// -- NTP --------------------------------------------------------------

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
  if (!_isHost && _dcReady && _dc?.readyState === 'open') {
    _dc.send(data);
  } else {
    _ws.send(data);
  }
}

function _handlePong({ t1, t2, t3 }) {
  const t4 = performance.now();
  const rtt = (t4 - t1) - (t3 - t2);
  if (rtt < 0) return;

  const offset = ((t2 - t1) + (t3 - t4)) / 2;
  const sharedAtPerf = t4 + offset;

  _history.push({ rtt, offset, perf: t4, shared: sharedAtPerf });
  if (_history.length > HISTORY_SIZE) _history.shift();

  const bestRtt = Math.min(..._history.map(s => s.rtt));
  const threshold = bestRtt * (1 + BEST_CLUSTER);
  const cluster = _history.filter(s => s.rtt <= threshold);
  if (cluster.length === 0) return;

  cluster.sort((a, b) => a.offset - b.offset);
  const mid = Math.floor(cluster.length / 2);
  const newOffset = cluster.length % 2
    ? cluster[mid].offset
    : (cluster[mid - 1].offset + cluster[mid].offset) / 2;

  _offset = newOffset;
  _updateSharedFit(cluster, bestRtt, newOffset);
  _onOffset?.(newOffset);

  const via = (!_isHost && _dcReady) ? 'P2P' : 'WS';
  console.log(
    `[sync][${via}] rtt=${rtt.toFixed(2)}ms offset=${_offset.toFixed(3)}ms fit=${_sharedFit.a.toFixed(8)} conf=${_confidenceMs.toFixed(2)}ms`
  );
}

// -- Clock fitting ----------------------------------------------------

function _predictSharedMs(perfMs) {
  return _sharedFit.ready ? (_sharedFit.a * perfMs + _sharedFit.b) : (perfMs + _offset);
}

function _sharedMsToPerfMs(sharedMs) {
  const a = _sharedFit.ready ? _sharedFit.a : 1;
  const b = _sharedFit.ready ? _sharedFit.b : _offset;
  if (!Number.isFinite(a) || Math.abs(a) < 1e-9) return sharedMs - b;
  return (sharedMs - b) / a;
}

function _updateSharedFit(cluster, bestRtt, fallbackOffset) {
  const points = cluster
    .slice(-FIT_POINT_LIMIT)
    .map(s => ({ x: s.perf, y: s.shared }));

  const fit = _fitAffine(points);
  if (!fit || !Number.isFinite(fit.a) || Math.abs(fit.a - 1) > 0.01) {
    _sharedFit = { a: 1, b: fallbackOffset, rmse: Infinity, maxErr: Infinity, ready: false };
    _confidenceMs = Math.max(bestRtt / 2, 0.5);
    return;
  }

  _sharedFit = {
    a: fit.a,
    b: fit.b,
    rmse: fit.rmse,
    maxErr: fit.maxErr,
    ready: points.length >= 2,
  };
  _confidenceMs = Math.max(bestRtt / 2, fit.maxErr, fit.rmse * 2);
}

function _touchAudioFit(audioCtx) {
  let fit = _audioFits.get(audioCtx);
  if (!fit) {
    fit = {
      a: 1,
      b: 0,
      rmse: Infinity,
      ready: false,
      samples: [],
      lastPerf: -Infinity,
    };
    _audioFits.set(audioCtx, fit);
  }

  const perfMs = performance.now();
  if (perfMs - fit.lastPerf < AUDIO_SAMPLE_GAP_MS) return fit;

  fit.lastPerf = perfMs;
  fit.samples.push({ x: perfMs, y: audioCtx.currentTime * 1000 });
  if (fit.samples.length > AUDIO_HISTORY_SIZE) fit.samples.shift();

  const affine = _fitAffine(fit.samples);
  if (!affine || !Number.isFinite(affine.a) || Math.abs(affine.a) < 1e-9) {
    fit.a = 1;
    fit.b = audioCtx.currentTime * 1000 - perfMs;
    fit.rmse = Infinity;
    fit.ready = false;
    return fit;
  }

  fit.a = affine.a;
  fit.b = affine.b;
  fit.rmse = affine.rmse;
  fit.ready = fit.samples.length >= 2;
  return fit;
}

function _fitAffine(points) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) {
    return {
      a: 1,
      b: points[0].y - points[0].x,
      rmse: 0,
      maxErr: 0,
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    num += dx * (p.y - meanY);
    den += dx * dx;
  }

  const a = den > 1e-9 ? num / den : 1;
  const b = meanY - a * meanX;

  let errSq = 0;
  let maxErr = 0;
  for (const p of points) {
    const err = p.y - (a * p.x + b);
    errSq += err * err;
    maxErr = Math.max(maxErr, Math.abs(err));
  }

  return {
    a,
    b,
    rmse: Math.sqrt(errSq / points.length),
    maxErr,
  };
}

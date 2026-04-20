// ═══════════════════════════════════════════════════════════════════
// WORLD CLOCK SYNC
// ═══════════════════════════════════════════════════════════════════
//
// Problem: each browser tab has its own AudioContext clock that drifts
// independently and can't be shared. We need a single authoritative
// "what time is it right now" that both instances agree on.
//
// Solution: use the server's Date.now() as the shared reference.
//   sharedNow() ≈ serverTime = Date.now() + smoothedOffset
//
// The offset (local clock vs server clock) is measured with NTP-style
// round-trip pings and updated every PING_INTERVAL ms. Each new sample
// is blended into a running EWMA so transient spikes (GC pause, OS
// scheduling burst) don't yank the clock.
//
// epochMs is the server-time millisecond at which "beat 0" occurred.
// Any instance, at any time, can independently compute:
//   worldElapsed = (sharedNow() - epochMs) / 1000   [seconds]
//   displayStep  = floor((worldElapsed % loopDur) / stepDur) % loopLen
//
// This self-corrects on every tick — no accumulated drift.
// ═══════════════════════════════════════════════════════════════════

const PING_INTERVAL  = 10_000;  // ms between periodic NTP probes
const PINGS_AT_BOOT  = 8;       // burst on connect for fast initial calibration
const PING_BOOT_GAP  = 150;     // ms between boot pings
const EWMA_ALPHA     = 0.15;    // weight of newest sample (lower = smoother)
const HISTORY_SIZE   = 20;      // rolling window for median-of-best selection

// ── State ──────────────────────────────────────────────────────────

let _ws            = null;
let _url           = null;
let _onMessage     = null;      // (msg) => void — called for non-NTP messages
let _onConnect     = null;      // () => void
let _onDisconnect  = null;      // () => void

let smoothedOffset = 0;         // ms: sharedNow() = Date.now() + smoothedOffset
let _history       = [];        // { rtt, offset }[]
let _connected     = false;
let _pingTimer     = null;

// ── Public API ─────────────────────────────────────────────────────

/** Server-synchronised wall clock (ms). Use instead of Date.now() for beat math. */
export function sharedNow() {
  return Date.now() + smoothedOffset;
}

/** Current estimated clock offset (local → server, ms). Exposed for debugging. */
export function clockOffset() {
  return smoothedOffset;
}

export function isConnected() {
  return _connected;
}

/**
 * Open a connection to the sync server.
 * @param {string}   url          ws:// or wss:// address
 * @param {Function} onMessage    called for every non-NTP message received
 * @param {Function} [onConnect]
 * @param {Function} [onDisconnect]
 */
export function connect(url, onMessage, onConnect, onDisconnect) {
  _url           = url;
  _onMessage     = onMessage;
  _onConnect     = onConnect;
  _onDisconnect  = onDisconnect;
  _open();
}

/** Send a message to all other peers (no-op if not connected). */
export function send(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

// ── Connection ─────────────────────────────────────────────────────

function _open() {
  if (_ws) { try { _ws.close(); } catch {} }

  _ws = new WebSocket(_url);

  _ws.addEventListener('open', () => {
    _connected = true;
    console.log('[sync] connected to', _url);

    // Burst pings for fast initial calibration
    let count = 0;
    const boot = setInterval(() => {
      _ping();
      if (++count >= PINGS_AT_BOOT) clearInterval(boot);
    }, PING_BOOT_GAP);

    // Periodic maintenance pings
    _pingTimer = setInterval(_ping, PING_INTERVAL);

    _onConnect?.();
  });

  _ws.addEventListener('message', e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === 'PONG') { _handlePong(msg); return; }
    _onMessage?.(msg);
  });

  _ws.addEventListener('close', () => {
    _connected = false;
    clearInterval(_pingTimer);
    console.log('[sync] disconnected — retrying in 2s');
    _onDisconnect?.();
    setTimeout(_open, 2000);
  });

  _ws.addEventListener('error', () => _ws.close());
}

// ── NTP ────────────────────────────────────────────────────────────

function _ping() {
  if (!_connected) return;
  _ws.send(JSON.stringify({ type: 'PING', t1: Date.now() }));
}

function _handlePong({ t1, t2, t3 }) {
  const t4  = Date.now();
  const rtt    = (t4 - t1) - (t3 - t2);   // pure network round-trip (ms)
  const offset = ((t2 - t1) + (t3 - t4)) / 2;  // classic NTP offset formula

  _history.push({ rtt, offset });
  if (_history.length > HISTORY_SIZE) _history.shift();

  // Use median offset from the half of samples with lowest RTT.
  // High-RTT samples carry more asymmetric delay noise, so we discard them.
  const sorted = [..._history].sort((a, b) => a.rtt - b.rtt);
  const best   = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const medianOffset = best.reduce((s, x) => s + x.offset, 0) / best.length;

  // Blend into EWMA — converges fast at boot (few samples), then becomes stable
  smoothedOffset = _history.length < 3
    ? medianOffset
    : EWMA_ALPHA * medianOffset + (1 - EWMA_ALPHA) * smoothedOffset;

  if (_history.length <= PINGS_AT_BOOT) {
    console.log(`[sync] NTP offset=${smoothedOffset.toFixed(1)}ms  rtt=${rtt}ms`);
  }
}

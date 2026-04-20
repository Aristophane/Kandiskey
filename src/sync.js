// ═══════════════════════════════════════════════════════════════════
// WORLD CLOCK SYNC — high-precision NTP client
// ═══════════════════════════════════════════════════════════════════
//
// Clock offset strategy: minimum-RTT filtering
// ─────────────────────────────────────────────
// The NTP offset formula gives: offset = ((t2-t1) + (t3-t4)) / 2
// This is only unbiased when the network delay is perfectly symmetric.
// Asymmetric delay (queuing on one direction) biases the estimate by
// half the asymmetry — so we can't fully eliminate it in software.
//
// The minimum-RTT sample has the smallest total asymmetry bias,
// because both legs saw the least queuing delay simultaneously.
// Strategy: collect many samples, keep a cluster around the minimum
// RTT, and use the median offset of that cluster.
//
// Boot: 32 pings at 25ms → done in ~800ms, gives a tight initial estimate.
// Maintenance: every 5s, 4 pings; update only when new RTT is competitive.
// ═══════════════════════════════════════════════════════════════════

const BOOT_PINGS      = 32;    // pings on connect
const BOOT_GAP_MS     = 25;    // ms between boot pings  (~800ms total)
const MAINT_INTERVAL  = 5_000; // ms between maintenance bursts
const MAINT_PINGS     = 4;     // pings per maintenance burst
const MAINT_GAP_MS    = 80;    // ms between maintenance pings
const HISTORY_SIZE    = 64;    // max samples kept
const BEST_CLUSTER    = 0.15;  // include samples within 15% of min RTT

// ── State ──────────────────────────────────────────────────────────

let _ws           = null;
let _url          = null;
let _onMessage    = null;
let _onConnect    = null;
let _onDisconnect = null;
let _onOffset     = null;    // called whenever the offset estimate changes

let _connected    = false;
let _history      = [];      // { rtt, offset }[]
let _bestRtt      = Infinity;
let _maintTimer   = null;

// The offset (ms) to add to Date.now() to approximate server time.
// Public: read via sharedNow(). Updated after every burst.
let _offset       = 0;

// ── Public API ─────────────────────────────────────────────────────

/** Server-synchronised wall clock (ms, float). */
export function sharedNow() {
  return performance.now() + _offset;
  // performance.now() is monotonic and has sub-ms resolution.
  // _offset calibrates it to server wall-clock time.
}

export function clockOffset()  { return _offset; }
export function isConnected()  { return _connected; }

/**
 * @param {string}   url
 * @param {Function} onMessage       — called for non-NTP messages
 * @param {Function} [onConnect]
 * @param {Function} [onDisconnect]
 * @param {Function} [onOffsetChange] — called with new offset (ms) after each burst
 */
export function connect(url, onMessage, onConnect, onDisconnect, onOffsetChange) {
  _url          = url;
  _onMessage    = onMessage;
  _onConnect    = onConnect;
  _onDisconnect = onDisconnect;
  _onOffset     = onOffsetChange;
  _open();
}

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
    _history   = [];
    _bestRtt   = Infinity;
    console.log('[sync] connected to', _url);

    _runBurst(BOOT_PINGS, BOOT_GAP_MS);
    _maintTimer = setInterval(() => _runBurst(MAINT_PINGS, MAINT_GAP_MS), MAINT_INTERVAL);
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
    clearInterval(_maintTimer);
    console.log('[sync] disconnected — retrying in 2s');
    _onDisconnect?.();
    setTimeout(_open, 2000);
  });

  _ws.addEventListener('error', () => _ws.close());
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
  // Use performance.now() for the send timestamp — same clock as sharedNow()
  _ws.send(JSON.stringify({ type: 'PING', t1: performance.now() }));
}

function _handlePong({ t1, t2, t3 }) {
  const t4  = performance.now();

  // RTT = total round-trip minus server processing time
  const rtt    = (t4 - t1) - (t3 - t2);
  // Classic NTP offset: (server_receive - client_send + server_send - client_receive) / 2
  // t2, t3 are server wall-clock (ms), t1, t4 are client performance.now() (ms).
  // _offset converts performance.now() → server wall-clock, so:
  //   offset = ((t2 - t1) + (t3 - t4)) / 2   [in ms]
  const offset = ((t2 - t1) + (t3 - t4)) / 2;

  if (rtt < 0) return;  // clock anomaly, discard

  _history.push({ rtt, offset });
  if (_history.length > HISTORY_SIZE) _history.shift();

  // Update best RTT
  if (rtt < _bestRtt) _bestRtt = rtt;

  // Cluster: all samples with RTT within BEST_CLUSTER fraction of the minimum
  const threshold = _bestRtt * (1 + BEST_CLUSTER);
  const cluster   = _history.filter(s => s.rtt <= threshold);

  // Use median offset of the best cluster (robust against outliers)
  cluster.sort((a, b) => a.offset - b.offset);
  const mid = Math.floor(cluster.length / 2);
  const newOffset = cluster.length % 2
    ? cluster[mid].offset
    : (cluster[mid - 1].offset + cluster[mid].offset) / 2;

  _offset = newOffset;
  _onOffset?.(newOffset);

  const settled = _history.length >= 8;
  console.log(
    `[sync] rtt=${rtt.toFixed(2)}ms  offset=${_offset.toFixed(3)}ms` +
    (settled ? '' : `  (calibrating, ${_history.length}/${BOOT_PINGS})`),
  );
}

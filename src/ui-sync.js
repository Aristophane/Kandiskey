import * as Sync from './sync.js';
import {
  SEQ, setMasterBpm, setPeerEpochMs, setSyncTempoRatio,
  setDrumLoopLen, epochMs, masterBpm, syncTempoRatio, drumLoopLen, seqSteps,
} from './state.js';
import { seqEngine, scheduleDrawSequencer } from './sequencer.js';
import { DRUM_GRID, scheduleDrmDraw } from './drum.js';
import { applyNoteLen } from './ui-synth.js';
import { _syncGrooveUi, syncVizBpmUi, seqUndoPush } from './ui-sequencer.js';

// ── applyPeerBpm ──────────────────────────────────────────────────────

export function applyPeerBpm(bpm) {
  setMasterBpm(bpm);
  SEQ.bpm = Math.max(20, Math.round(bpm * syncTempoRatio));
  const sl = document.getElementById('seq-bpm');
  const vl = document.getElementById('seq-bpm-val');
  if (sl) sl.value = SEQ.bpm;
  if (vl) vl.textContent = SEQ.bpm;
  if (seqEngine.playing) seqEngine.rebase(true);
}

// ── Sync state helpers ────────────────────────────────────────────────

export function syncGetFullState() {
  return {
    bpm: SEQ.bpm,
    rhythmKey: SEQ.rhythmKey,
    noteLen: SEQ.noteLen,
    gate: SEQ.gate,
    loopLen: SEQ.loopLen,
    groove: { ...SEQ.groove },
    grid: { ...SEQ.grid },
    drumGrid: { ...DRUM_GRID },
    drumLoopLen,
  };
}

function syncTransportAnchor(msg) {
  return {
    sharedMs: msg.epochMs,
    absStep: msg.transportAbsStep ?? 0,
    revision: msg.transportRevision ?? 0,
  };
}

export function syncApplyFullState(msg) {
  if (msg.bpm !== undefined) SEQ.bpm = msg.bpm;
  if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
  if (msg.noteLen !== undefined) applyNoteLen(msg.noteLen);
  else if (msg.gate !== undefined) SEQ.gate = msg.gate;
  if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
  if (msg.drumLoopLen !== undefined) setDrumLoopLen(msg.drumLoopLen);
  if (msg.groove) Object.assign(SEQ.groove, msg.groove);
  if (msg.grid) SEQ.grid = { ...msg.grid };
  if (msg.drumGrid) {
    Object.keys(DRUM_GRID).forEach(k => delete DRUM_GRID[k]);
    Object.assign(DRUM_GRID, msg.drumGrid);
  }
  syncUpdateUI(msg);
}

export function syncUpdateUI(msg) {
  if (msg.bpm !== undefined) {
    const sl = document.getElementById('seq-bpm'); if (sl) sl.value = msg.bpm;
    const vl = document.getElementById('seq-bpm-val'); if (vl) vl.textContent = msg.bpm;
  }
  if (msg.rhythmKey !== undefined) {
    const sel = document.getElementById('seq-rhythm'); if (sel) sel.value = msg.rhythmKey;
  }
  if (msg.noteLen !== undefined) {
    const sl = document.getElementById('seq-note-len'); if (sl) sl.value = msg.noteLen;
    const vl = document.getElementById('seq-note-len-val'); if (vl) vl.textContent = msg.noteLen;
  }
  if (msg.groove) _syncGrooveUi(msg.groove);
}

export function syncHandleMessage(msg) {
  console.log('[sync] rx:', msg.type, msg);
  switch (msg.type) {
    case 'PLAY':
      setPeerEpochMs(msg.epochMs);
      seqEngine.setPendingPeerAnchor(syncTransportAnchor(msg));
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      syncApplyFullState(msg);
      if (seqEngine.playing) {
        seqEngine.syncToRemoteAnchor(syncTransportAnchor(msg));
      } else {
        seqEngine.play(syncTransportAnchor(msg));
      }
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
    case 'JOINED':
      setPeerEpochMs(msg.epochMs);
      seqEngine.setPendingPeerAnchor(syncTransportAnchor(msg));
      break;
    case 'PAUSE':
      setPeerEpochMs(msg.epochMs);
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      syncApplyFullState(msg);
      seqEngine.pause(true, syncTransportAnchor(msg));
      break;
    case 'STOP':
      setPeerEpochMs(null);
      seqEngine.stop(true);
      break;
    case 'REBASE':
      setPeerEpochMs(msg.epochMs);
      seqEngine.setPendingPeerAnchor(syncTransportAnchor(msg));
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
      if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
      syncUpdateUI(msg);
      if (seqEngine.playing) seqEngine.rebase(true, syncTransportAnchor(msg));
      scheduleDrawSequencer();
      break;
    case 'GRID_SET':
      if (msg.val) SEQ.grid[msg.key] = msg.val; else delete SEQ.grid[msg.key];
      scheduleDrawSequencer();
      break;
    case 'DRUM_SET':
      if (msg.val) DRUM_GRID[msg.key] = msg.val; else delete DRUM_GRID[msg.key];
      scheduleDrmDraw();
      break;
    case 'SEQ_PARAM':
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
      if (msg.noteLen !== undefined) applyNoteLen(msg.noteLen);
      else if (msg.gate !== undefined) SEQ.gate = msg.gate;
      if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
      if (msg.drumLoopLen !== undefined) setDrumLoopLen(msg.drumLoopLen);
      if (msg.groove) Object.assign(SEQ.groove, msg.groove);
      syncUpdateUI(msg);
      if (seqEngine.playing) seqEngine.rebase(true);
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
    case 'PEER_JOINED':
      if (seqEngine.playing) {
        const loopLen = Math.max(1, Math.min(SEQ.loopLen, seqSteps()));
        const snapshot = seqEngine.getTransportSnapshot();
        const nextLoopAbsStep = (Math.floor(snapshot.currentAbsStep / loopLen) + 1) * loopLen;
        const nextLoopEpochMs = seqEngine.transportSharedMsForStep(nextLoopAbsStep);
        Sync.send({
          type: 'PLAY',
          epochMs: nextLoopEpochMs,
          transportAbsStep: nextLoopAbsStep,
          transportRevision: seqEngine._transportRevision,
          masterBpm,
          ...syncGetFullState(),
        });
      } else {
        Sync.send({ type: 'FULL_STATE', playing: false, paused: seqEngine.paused, masterBpm, ...syncGetFullState() });
        if (seqEngine.paused && epochMs !== null) {
          Sync.send({
            type: 'PAUSE',
            epochMs,
            transportAbsStep: seqEngine._anchorAbsStep,
            transportRevision: seqEngine._transportRevision,
            masterBpm,
            ...syncGetFullState(),
          });
        }
      }
      break;
    case 'FULL_STATE':
      syncApplyFullState(msg);
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
  }
}

// ── initSync ──────────────────────────────────────────────────────────

export function initSync() {
  const params    = new URLSearchParams(location.search);
  const serverUrl = params.get('sync') ?? import.meta.env?.VITE_SYNC_URL ?? null;
  if (!serverUrl) return;

  function genRoom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  let roomId = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!roomId) {
    roomId = genRoom();
    const next = new URL(location.href);
    next.searchParams.set('room', roomId);
    history.replaceState(null, '', next.toString());
  }

  const badge = document.createElement('div');
  badge.style.cssText = [
    'position:fixed;top:8px;right:12px;z-index:9999',
    'display:flex;align-items:center;gap:6px',
    'font-size:11px;font-family:monospace',
    'background:#0f172a;border:1px solid #1e293b',
    'border-radius:10px;padding:3px 10px',
  ].join(';');

  const badgeText = document.createElement('span');
  badgeText.style.color = '#94a3b8';
  badgeText.textContent = `● ${roomId}  connecting…`;

  const shareBtn = document.createElement('button');
  shareBtn.textContent = '⎘ share';
  shareBtn.title = 'Copy invite link';
  shareBtn.style.cssText = [
    'font-size:10px;font-family:monospace;cursor:pointer',
    'padding:1px 6px;border-radius:5px',
    'border:1px solid #334155;background:#1e293b;color:#94a3b8',
  ].join(';');
  shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      shareBtn.textContent = '✓ copied';
      setTimeout(() => { shareBtn.textContent = '⎘ share'; }, 2000);
    });
  });

  badge.appendChild(badgeText);
  badge.appendChild(shareBtn);
  document.body.appendChild(badge);

  let peerCount = 0;
  function updateBadge(state) {
    const peers = peerCount > 0 ? `  ${peerCount} peer${peerCount > 1 ? 's' : ''}` : '  waiting…';
    const conf = Number.isFinite(Sync.syncConfidenceMs()) ? `  ±${Sync.syncConfidenceMs().toFixed(1)}ms` : '';
    if (state === 'live') {
      badgeText.style.color = '#4ade80';
      badgeText.textContent = `● ${roomId}${peers}${conf}`;
    } else {
      badgeText.style.color = '#f87171';
      badgeText.textContent = `● ${roomId}  reconnecting…`;
    }
  }

  const bpmGroup = document.getElementById('seq-bpm')?.closest('.syn-group') ?? document.getElementById('seq-bpm')?.parentElement;
  if (bpmGroup) {
    const ratioRow = document.createElement('div');
    ratioRow.style.cssText = 'display:flex;gap:4px;margin-top:4px;align-items:center;';
    const label = document.createElement('span');
    label.textContent = 'ratio:';
    label.style.cssText = 'font-size:11px;color:#94a3b8;font-family:monospace;margin-right:2px;';
    ratioRow.appendChild(label);
    const RATIOS = [{ label: '÷3', val: 1/3 }, { label: '÷2', val: 0.5 }, { label: '×1', val: 1 }, { label: '×2', val: 2 }, { label: '×3', val: 3 }];
    RATIOS.forEach(({ label: lbl, val }) => {
      const btn = document.createElement('button');
      btn.textContent = lbl; btn.dataset.ratio = val;
      btn.style.cssText = 'font-size:11px;padding:1px 7px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;font-family:monospace;';
      if (val === 1) { btn.style.background = '#0f172a'; btn.style.color = '#4ade80'; btn.style.borderColor = '#4ade80'; }
      btn.addEventListener('click', () => {
        setSyncTempoRatio(val);
        ratioRow.querySelectorAll('button').forEach(b => { b.style.background = '#1e293b'; b.style.color = '#94a3b8'; b.style.borderColor = '#334155'; });
        btn.style.background = '#0f172a'; btn.style.color = '#4ade80'; btn.style.borderColor = '#4ade80';
        applyPeerBpm(masterBpm);
      });
      ratioRow.appendChild(btn);
    });
    bpmGroup.appendChild(ratioRow);
  }

  function handleMessageWithPeerCount(msg) {
    if (msg.type === 'PEER_JOINED') { peerCount = Math.max(1, (msg.peers ?? 1) - 1); updateBadge('live'); }
    if (msg.type === 'PEER_LEFT')   { peerCount = Math.max(0, peerCount - 1); updateBadge('live'); }
    syncHandleMessage(msg);
  }

  Sync.connect(
    serverUrl,
    roomId,
    handleMessageWithPeerCount,
    () => { peerCount = 0; updateBadge('live'); },
    () => { peerCount = 0; updateBadge('offline'); },
    () => {
      updateBadge('live');
      if (seqEngine.playing && epochMs !== null && !seqEngine._barJoining) {
        seqEngine._corrTick = 24;
      }
    },
  );
}

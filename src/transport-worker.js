let timer = null;

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function startTimer(intervalMs = 12) {
  stopTimer();
  const gap = Math.max(4, Number(intervalMs) || 12);
  timer = setInterval(() => {
    self.postMessage({ type: 'TICK', perfMs: performance.now() });
  }, gap);
  self.postMessage({ type: 'TICK', perfMs: performance.now() });
}

self.onmessage = event => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'START':
      startTimer(msg.intervalMs);
      break;
    case 'STOP':
      stopTimer();
      break;
  }
};

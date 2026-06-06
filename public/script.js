// ─── DOM refs ────────────────────────────────────────────────
const gaugeArc   = document.getElementById('gaugeArc');
const needle     = document.getElementById('needle');
const liveSpeed  = document.getElementById('liveSpeed');
const liveGbps   = document.getElementById('liveGbps');
const speedLabel = document.getElementById('speedLabel');
const startBtn   = document.getElementById('startBtn');
const logPanel   = document.getElementById('logPanel');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');

const ARC_LEN   = 471;
const MAX_SPEED = 1000; // gauge full scale = 1 Gbps

// ─── Test parameters (tune these) ────────────────────────────
const PING_SAMPLES     = 10;
const DL_CHUNK_BYTES   = 10 * 1024 * 1024;  // 10 MB per chunk
const DL_CHUNKS        = 3;
const UL_CHUNK_BYTES   = 5 * 1024 * 1024;   // 5 MB per chunk
const UL_CHUNKS        = 3;

// ─── History storage ─────────────────────────────────────────
const HISTORY_KEY = 'gbps_history';
const MAX_HISTORY = 10;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
}

function renderHistory() {
  const list = loadHistory();
  if (!list.length) {
    historyList.innerHTML = '<div class="history-empty">No tests recorded.</div>';
    return;
  }

  historyList.innerHTML = list.map((test, idx) => {
    const date = new Date(test.date);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    return `
      <div class="history-item">
        <div class="history-col history-date">
          <span class="history-key">Date</span>
          <span class="history-val">${dateStr}</span>
        </div>
        <div class="history-col history-dl">
          <span class="history-key">Download</span>
          <span class="history-val">${test.download.toFixed(1)} Mbps</span>
        </div>
        <div class="history-col history-ul">
          <span class="history-key">Upload</span>
          <span class="history-val">${test.upload.toFixed(1)} Mbps</span>
        </div>
        <div class="history-col history-ping">
          <span class="history-key">Ping</span>
          <span class="history-val">${test.ping.toFixed(0)} ms</span>
        </div>
        <div class="history-col">
          <span class="history-key">Jitter</span>
          <span class="history-val">${test.jitter.toFixed(1)} ms</span>
        </div>
      </div>
    `;
  }).join('');
}

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all test history?')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

// ─── Gauge ticks (0, 100, 200, 500, 750, 1G) ────────────────
(function drawTicks() {
  const g  = document.getElementById('ticks');
  const cx = 160, cy = 170, r = 130;
  const labels = [0, 100, 200, 500, 750, 1000];
  labels.forEach(v => {
    const pct = v / MAX_SPEED;
    const ang = 180 - pct * 180;
    const rad = ang * Math.PI / 180;
    const x1 = cx + (r - 14) * Math.cos(rad), y1 = cy - (r - 14) * Math.sin(rad);
    const x2 = cx + (r +  2) * Math.cos(rad), y2 = cy - (r +  2) * Math.sin(rad);
    const lx = cx + (r - 28) * Math.cos(rad), ly = cy - (r - 28) * Math.sin(rad);
    const lbl = v === 1000 ? '1G' : String(v);
    g.innerHTML += `<line class="gauge-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    g.innerHTML += `<text class="gauge-tick-label" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle">${lbl}</text>`;
  });
})();

// ─── Helpers ─────────────────────────────────────────────────
const mbpsToGbps = (m) => (m / 1000).toFixed(3);
const sleep      = (ms) => new Promise(r => setTimeout(r, ms));

function setGauge(mbps) {
  const pct    = Math.min(mbps / MAX_SPEED, 1);
  const offset = ARC_LEN - pct * ARC_LEN;
  gaugeArc.style.strokeDashoffset = offset;
  const ang = -90 + pct * 180;
  needle.setAttribute('transform', `rotate(${ang}, 160, 170)`);

  let col = 'var(--accent)';
  if      (mbps > 750) col = 'var(--warn)';
  else if (mbps > 400) col = '#ffe44d';
  gaugeArc.style.stroke = col;
  gaugeArc.style.filter = `drop-shadow(0 0 6px ${col})`;

  liveSpeed.textContent = mbps < 10 ? mbps.toFixed(1) : Math.round(mbps);
  liveGbps.textContent  = mbpsToGbps(mbps);
}

function log(msg, type = '') {
  const ts = new Date().toTimeString().split(' ')[0];
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${type}">${msg}</span>`;
  logPanel.appendChild(el);
  logPanel.scrollTop = logPanel.scrollHeight;
}

function setPhase(p) {
  ['ping', 'dl', 'ul', 'done'].forEach(k =>
    document.getElementById(`phase-${k}`).className = 'phase-item'
  );
  if (p) document.getElementById(`phase-${p}`).classList.add('active');
}
function markDone(p) {
  const el = document.getElementById(`phase-${p}`);
  el.classList.remove('active');
  el.classList.add('done');
}

function animateValue(el, target, dur = 800) {
  const from = parseFloat(el.textContent) || 0;
  const t0   = performance.now();
  function frame(now) {
    const p    = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const v    = from + (target - from) * ease;
    el.textContent = target < 10 ? v.toFixed(1) : Math.round(v);
    el.classList.add('animated-val');
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = target < 10 ? target.toFixed(1) : Math.round(target);
  }
  requestAnimationFrame(frame);
}

// ─── Measurement: Ping + Jitter ──────────────────────────────
async function measurePing() {
  log('Initiating ICMP echo sequence...', 'info');
  setPhase('ping');
  await sleep(300);

  const pings = [];
  let failures = 0;
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = performance.now();
    try {
      await fetch(`/api/speedtest/ping?_=${Date.now()}${Math.random()}`, {
        cache: 'no-store',
      });
      pings.push(performance.now() - t0);
    } catch (e) {
      failures++;
    }
    await sleep(80);
  }

  if (!pings.length) {
    log('Ping failed — server unreachable', 'warn');
    return { ping: 0, jitter: 0, loss: 100 };
  }

  pings.sort((a, b) => a - b);
  const trimmed = pings.slice(1, -1);
  const avg     = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const jitter  = Math.sqrt(
    trimmed.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / trimmed.length
  );
  const loss = (failures / PING_SAMPLES) * 100;

  log(`Ping: ${avg.toFixed(0)}ms  |  Jitter: ${jitter.toFixed(1)}ms  |  Loss: ${loss.toFixed(1)}%`, 'ok');
  return { ping: avg, jitter, loss };
}

// ─── Measurement: Download ───────────────────────────────────
async function measureDownload() {
  setPhase('dl');
  log('Starting download throughput analysis...', 'info');
  speedLabel.textContent = 'DOWNLOADING';
  gaugeArc.style.stroke = 'var(--accent)';
  gaugeArc.style.filter = 'drop-shadow(0 0 6px var(--accent))';

  let totalBytes = 0;
  const t0 = performance.now();

  for (let i = 0; i < DL_CHUNKS; i++) {
    log(`  Chunk ${i + 1}/${DL_CHUNKS} (${(DL_CHUNK_BYTES / 1024 / 1024).toFixed(0)} MB)`);
    const res = await fetch(`/api/speedtest/download?size=${DL_CHUNK_BYTES}&_=${Date.now()}`);
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      const elapsed = (performance.now() - t0) / 1000;
      const mbps = (totalBytes * 8) / elapsed / 1e6;
      setGauge(mbps);
    }
    const elapsed = (performance.now() - t0) / 1000;
    const mbps = (totalBytes * 8) / elapsed / 1e6;
    log(`  Running avg: ${mbps.toFixed(1)} Mbps (${mbpsToGbps(mbps)} Gbps)`);
  }

  const elapsed = (performance.now() - t0) / 1000;
  const finalMbps = (totalBytes * 8) / elapsed / 1e6;
  log(`Download complete: ${finalMbps.toFixed(1)} Mbps (${mbpsToGbps(finalMbps)} Gbps)`, 'ok');
  return finalMbps;
}

// ─── Measurement: Upload ─────────────────────────────────────
async function measureUpload() {
  setPhase('ul');
  log('Starting upload throughput analysis...', 'info');
  speedLabel.textContent = 'UPLOADING';
  gaugeArc.style.stroke = 'var(--warn)';
  gaugeArc.style.filter = 'drop-shadow(0 0 6px var(--warn))';

  // Pre-fill a random payload once, reuse across chunks
  const payload = new Uint8Array(UL_CHUNK_BYTES);
  for (let i = 0; i < payload.length; i += 4096) {
    const end = Math.min(i + 4096, payload.length);
    crypto.getRandomValues(payload.subarray(i, end));
  }

  let totalBytes = 0;
  const t0 = performance.now();

  for (let i = 0; i < UL_CHUNKS; i++) {
    log(`  Chunk ${i + 1}/${UL_CHUNKS} (${(UL_CHUNK_BYTES / 1024 / 1024).toFixed(0)} MB)`);
    await fetch('/api/speedtest/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    totalBytes += payload.byteLength;
    const elapsed = (performance.now() - t0) / 1000;
    const mbps = (totalBytes * 8) / elapsed / 1e6;
    setGauge(mbps);
    log(`  Running avg: ${mbps.toFixed(1)} Mbps (${mbpsToGbps(mbps)} Gbps)`);
  }

  const elapsed = (performance.now() - t0) / 1000;
  const finalMbps = (totalBytes * 8) / elapsed / 1e6;
  log(`Upload complete: ${finalMbps.toFixed(1)} Mbps (${mbpsToGbps(finalMbps)} Gbps)`, 'ok');
  return finalMbps;
}

// ─── Connection info ─────────────────────────────────────────
function populateConnInfo(jitter, loss) {
  const host = window.location.hostname || 'localhost';
  document.getElementById('info-server').textContent = host;
  const proto = window.location.protocol === 'https:' ? 'HTTPS/2' : 'HTTP/1.1';
  document.getElementById('info-proto').textContent  = proto;
  document.getElementById('info-jitter').textContent = `${jitter.toFixed(1)}ms`;
  document.getElementById('info-loss').textContent   = `${loss.toFixed(1)}%`;
}

// ─── Main test flow ──────────────────────────────────────────
async function runTest() {
  startBtn.disabled = true;
  startBtn.textContent = 'RUNNING...';

  // Reset UI
  ['dl-val', 'ul-val', 'ping-val'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '—';
    el.classList.add('result-placeholder');
  });
  ['dl-gbps', 'ul-gbps'].forEach(id => document.getElementById(id).textContent = '—');
  ['card-dl', 'card-ul', 'card-ping'].forEach(id =>
    document.getElementById(id).classList.remove('has-value')
  );
  ['ping', 'dl', 'ul', 'done'].forEach(p =>
    document.getElementById(`phase-${p}`).className = 'phase-item'
  );
  ['info-server', 'info-proto', 'info-jitter', 'info-loss'].forEach(id =>
    document.getElementById(id).textContent = '—'
  );
  logPanel.innerHTML = '';
  setGauge(0);
  gaugeArc.style.stroke = 'var(--accent)';
  gaugeArc.style.filter = 'drop-shadow(0 0 6px var(--accent))';

  log('Diagnostic session started.', 'info');
  log(`Target: ${window.location.host}`);
  await sleep(400);

  // 1. Ping
  const { ping, jitter, loss } = await measurePing();
  markDone('ping');
  const pingEl = document.getElementById('ping-val');
  pingEl.classList.remove('result-placeholder');
  document.getElementById('card-ping').classList.add('has-value');
  animateValue(pingEl, ping);
  populateConnInfo(jitter, loss);

  // 2. Download
  const dlMbps = await measureDownload();
  markDone('dl');
  setGauge(0);
  const dlEl = document.getElementById('dl-val');
  dlEl.classList.remove('result-placeholder');
  document.getElementById('card-dl').classList.add('has-value');
  animateValue(dlEl, parseFloat(dlMbps.toFixed(1)));
  document.getElementById('dl-gbps').textContent = mbpsToGbps(dlMbps);
  speedLabel.textContent = 'DOWNLOAD DONE';
  await sleep(500);

  // 3. Upload
  const ulMbps = await measureUpload();
  markDone('ul');
  setGauge(0);
  gaugeArc.style.stroke = 'var(--accent)';
  gaugeArc.style.filter = 'drop-shadow(0 0 6px var(--accent))';
  const ulEl = document.getElementById('ul-val');
  ulEl.classList.remove('result-placeholder');
  document.getElementById('card-ul').classList.add('has-value');
  animateValue(ulEl, parseFloat(ulMbps.toFixed(1)));
  document.getElementById('ul-gbps').textContent = mbpsToGbps(ulMbps);

  // Done
  setPhase('done');
  markDone('done');
  speedLabel.textContent = 'TEST COMPLETE';
  liveSpeed.textContent  = '✓';
  liveGbps.textContent   = '—';

  log('─────────────────────────────────────', '');
  log(`RESULT  ↓ ${dlMbps.toFixed(1)} Mbps (${mbpsToGbps(dlMbps)} Gbps)  ↑ ${ulMbps.toFixed(1)} Mbps (${mbpsToGbps(ulMbps)} Gbps)  PING ${ping.toFixed(0)}ms`, 'ok');
  log('Diagnostic session complete.', 'ok');

  // Save to history
  const historyList = loadHistory();
  historyList.unshift({
    date: Date.now(),
    download: dlMbps,
    upload: ulMbps,
    ping: ping,
    jitter: jitter,
  });
  saveHistory(historyList);
  renderHistory();

  startBtn.textContent = 'RUN AGAIN';
  startBtn.disabled    = false;
}

startBtn.addEventListener('click', runTest);

// Initial render
renderHistory();

const $ = (id) => document.getElementById(id);
const arc = $('arc');
const speedValue = $('speedValue');
const speedUnit = $('speedUnit');
const phaseLabel = $('phaseLabel');
const startBtn = $('startBtn');

const ARC_LEN = 377; // approx length of the gauge arc
const PING_SAMPLES = 10;
const DL_CHUNK_BYTES = 10 * 1024 * 1024;   // 10 MB per chunk
const DL_CHUNKS = 3;
const UL_CHUNK_BYTES = 5 * 1024 * 1024;    // 5 MB per chunk
const UL_CHUNKS = 3;

function setGauge(fraction /* 0..1 */) {
  const f = Math.max(0, Math.min(1, fraction));
  arc.style.strokeDashoffset = ARC_LEN * (1 - f);
}
function setSpeed(mbps) {
  speedValue.textContent = mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(2);
}
function setUnit(u) { speedUnit.textContent = u; }
function setPhase(p) { phaseLabel.textContent = p; }

// --- Ping / Jitter ---
async function measurePing() {
  const pings = [];
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = performance.now();
    try {
      await fetch('/api/speedtest/ping?_=' + Date.now(), { cache: 'no-store' });
      pings.push(performance.now() - t0);
    } catch (e) { /* ignore single failure */ }
    await new Promise(r => setTimeout(r, 100));
  }
  if (!pings.length) return { ping: 0, jitter: 0 };
  pings.sort((a, b) => a - b);
  // drop highest & lowest for stability
  const trimmed = pings.slice(1, -1);
  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const jitter = Math.sqrt(
    trimmed.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / trimmed.length
  );
  return { ping: avg, jitter };
}

// --- Download ---
async function measureDownload(onProgress) {
  let totalBytes = 0;
  const t0 = performance.now();
  for (let i = 0; i < DL_CHUNKS; i++) {
    const res = await fetch(`/api/speedtest/download?size=${DL_CHUNK_BYTES}&_=${Date.now()}`);
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      const elapsed = (performance.now() - t0) / 1000;
      const mbps = (totalBytes * 8) / elapsed / 1e6;
      onProgress(mbps);
    }
  }
  const elapsed = (performance.now() - t0) / 1000;
  return (totalBytes * 8) / elapsed / 1e6; // Mbps
}

// --- Upload ---
async function measureUpload(onProgress) {
  const payload = new Uint8Array(UL_CHUNK_BYTES);
  // fill with pseudo-random bytes (cheap)
  for (let i = 0; i < payload.length; i += 4096) {
    const end = Math.min(i + 4096, payload.length);
    crypto.getRandomValues(payload.subarray(i, end));
  }
  let totalBytes = 0;
  const t0 = performance.now();
  for (let i = 0; i < UL_CHUNKS; i++) {
    await fetch('/api/speedtest/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    totalBytes += payload.byteLength;
    const elapsed = (performance.now() - t0) / 1000;
    const mbps = (totalBytes * 8) / elapsed / 1e6;
    onProgress(mbps);
  }
  const elapsed = (performance.now() - t0) / 1000;
  return (totalBytes * 8) / elapsed / 1e6;
}

// --- History ---
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('gbps_history') || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem('gbps_history', JSON.stringify(list.slice(0, 10)));
}
function renderHistory() {
  const list = loadHistory();
  const ul = $('historyList');
  if (!list.length) { ul.innerHTML = '<li class="empty">No tests yet.</li>'; return; }
  ul.innerHTML = list.map(r => `
    <li>
      <div><strong>Date</strong><br>${new Date(r.date).toLocaleString()}</div>
      <div><strong>Ping</strong><br>${r.ping.toFixed(0)} ms</div>
      <div><strong>Download</strong><br>${r.download.toFixed(1)} Mbps</div>
      <div><strong>Upload</strong><br>${r.upload.toFixed(1)} Mbps</div>
      <div><strong>Jitter</strong><br>${r.jitter.toFixed(1)} ms</div>
    </li>
  `).join('');
}

// --- Main flow ---
async function runTest() {
  startBtn.disabled = true;
  startBtn.textContent = '…';
  setGauge(0); setSpeed(0);

  try {
    // 1. Ping
    setPhase('Measuring latency…');
    setUnit('ms');
    const { ping, jitter } = await measurePing();
    $('pingVal').textContent = ping.toFixed(0);
    $('jitterVal').textContent = jitter.toFixed(1);
    setGauge(Math.min(ping / 200, 1)); // visual only
    setSpeed(ping);

    // 2. Download
    setPhase('Testing download…');
    setUnit('Mbps');
    const dl = await measureDownload((mbps) => {
      setSpeed(mbps);
      setGauge(Math.min(mbps / 1000, 1)); // scale to 1 Gbps
    });
    $('dlVal').textContent = dl.toFixed(2);

    // 3. Upload
    setPhase('Testing upload…');
    const ul = await measureUpload((mbps) => {
      setSpeed(mbps);
      setGauge(Math.min(mbps / 500, 1));
    });
    $('ulVal').textContent = ul.toFixed(2);

    setPhase(`Done — ↓ ${dl.toFixed(1)} / ↑ ${ul.toFixed(1)} Mbps`);
    setGauge(1);
    setSpeed(dl);

    // Save
    const list = loadHistory();
    list.unshift({ date: Date.now(), ping, jitter, download: dl, upload: ul });
    saveHistory(list);
    renderHistory();
  } catch (err) {
    console.error(err);
    setPhase('Test failed — check connection and try again.');
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'RESTART';
  }
}

startBtn.addEventListener('click', runTest);
renderHistory();
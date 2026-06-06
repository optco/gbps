const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS (open for now; restrict to gbps.me in production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Download test: stream N bytes of random data
app.get('/api/speedtest/download', (req, res) => {
  const size = Math.min(parseInt(req.query.size) || 25 * 1024 * 1024, 100 * 1024 * 1024);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', size);
  res.setHeader('Cache-Control', 'no-store');

  let remaining = size;
  const chunkSize = 64 * 1024;
  const write = () => {
    while (remaining > 0) {
      const n = Math.min(chunkSize, remaining);
      const ok = res.write(crypto.randomBytes(n));
      remaining -= n;
      if (!ok) { res.once('drain', write); return; }
    }
    res.end();
  };
  write();
});

// Upload test: accept raw bytes, report how many were received
app.post('/api/speedtest/upload', (req, res) => {
  const bytes = req.body ? req.body.length : 0;
  res.json({ received: bytes });
});

// Ping test: lightweight HEAD-like response with server timestamp
app.get('/api/speedtest/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ t: Date.now() });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`gbps.me running on http://localhost:${PORT}`));
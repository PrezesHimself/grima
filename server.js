const http = require('http');
const fs = require('fs');
const path = require('path');
const scanner = require('./scanner');
const pkg = require('./package.json');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Start background periodic scanning (every 15s)
scanner.startPeriodicScan(15000);

function sendJson(res, statusCode, data, isHead = false) {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(json)
  });
  if (isHead) {
    res.end();
  } else {
    res.end(json);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const isHead = req.method === 'HEAD';
  const isGet = req.method === 'GET';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- API Routes ---
  if (pathname === '/api/status' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    return sendJson(res, 200, { app: 'grima', version: pkg.version, ...data }, isHead);
  }

  if (pathname === '/api/devices' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    return sendJson(res, 200, {
      count: data.summary.connectedClientsCount,
      wifiCount: data.summary.wifiClientsCount,
      wiredCount: data.summary.wiredClientsCount,
      devices: data.devices
    }, isHead);
  }

  if (pathname === '/api/wifi' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    return sendJson(res, 200, data.wifi, isHead);
  }

  if (pathname === '/api/router' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    return sendJson(res, 200, data.router, isHead);
  }

  if (pathname === '/api/version' && (isGet || isHead)) {
    return sendJson(res, 200, { name: pkg.name, version: pkg.version, description: pkg.description }, isHead);
  }

  if (pathname === '/api/scan' && req.method === 'POST') {
    scanner.cachedData = null;
    const freshData = await scanner.scanAll();
    return sendJson(res, 200, { message: 'Scan complete', data: freshData });
  }

  // --- Static UI Delivery ---
  if ((pathname === '/' || pathname === '/index.html') && (isGet || isHead)) {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      const stat = fs.statSync(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': stat.size
      });
      if (isHead) return res.end();
      return fs.createReadStream(indexPath).pipe(res);
    }
  }

  // 404
  sendJson(res, 404, {
    error: 'Not Found',
    availableEndpoints: ['/', '/api/status', '/api/devices', '/api/wifi', '/api/router', '/api/version', '/api/scan']
  }, isHead);
});

server.listen(PORT, HOST, () => {
  const tsInfo = scanner.getTailscaleInfo();
  console.log(`========================================================`);
  console.log(`  Grima v${pkg.version} is running!`);
  console.log(`  Localhost:      http://localhost:${PORT}`);
  console.log(`  LAN (Ethernet): http://192.168.1.104:${PORT}`);
  console.log(`  Tailscale IP:   http://${tsInfo.ip}:${PORT}`);
  console.log(`  Tailscale DNS:  http://${tsInfo.hostname}:${PORT}`);
  console.log(`========================================================`);
});

// Graceful shutdown with immediate process termination
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

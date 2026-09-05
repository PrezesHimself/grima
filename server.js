const http = require('http');
const fs = require('fs');
const path = require('path');
const scanner = require('./scanner');
const speedTester = require('./speedtest');
const shelly = require('./shelly');
const pkg = require('./package.json');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Start background periodic scanning (every 15s)
scanner.startPeriodicScan(15000);

// Start Shelly Presence bridge (poll + websocket event channel)
shelly.start();

function sendJson(res, statusCode, data, isHead = false) {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
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

function serveFile(res, filePath, contentType, isHead = false) {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'File Not Found' }, isHead);
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  if (isHead) return res.end();
  fs.createReadStream(filePath).pipe(res);
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

  // --- Documentation Endpoints ---
  if ((pathname === '/docs' || pathname === '/api/docs') && (isGet || isHead)) {
    return serveFile(res, path.join(__dirname, 'public', 'docs.html'), 'text/html; charset=utf-8', isHead);
  }

  if ((pathname === '/docs/openapi.json' || pathname === '/api/docs/openapi.json') && (isGet || isHead)) {
    return serveFile(res, path.join(__dirname, 'public', 'openapi.json'), 'application/json; charset=utf-8', isHead);
  }

  if (pathname === '/llms.txt' && (isGet || isHead)) {
    return serveFile(res, path.join(__dirname, 'public', 'llms.txt'), 'text/plain; charset=utf-8', isHead);
  }

  // --- API Routes ---
  if (pathname === '/api/status' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    const hostHeader = req.headers.host || `localhost:${PORT}`;
    const baseUrl = `http://${hostHeader}`;

    return sendJson(res, 200, {
      app: 'grima',
      version: pkg.version,
      documentation: {
        docsUrl: `${baseUrl}/docs`,
        openapiUrl: `${baseUrl}/docs/openapi.json`,
        llmsTxtUrl: `${baseUrl}/llms.txt`,
        description: 'Grima API documentation, OpenAPI 3.0 schema, and agent implementation guide for LLMs and clients.'
      },
      lastSpeedTest: speedTester.lastResult,
      shelly: shelly.getPresenceSummary(),
      ...data
    }, isHead);
  }

  if (pathname === '/api/devices' && (isGet || isHead)) {
    const data = scanner.cachedData || await scanner.scanAll();
    const clients = data.devices.filter(d => !d.isRouter && !d.isLocalHost);
    const classCounts = {};
    clients.forEach((d) => { const c = d.deviceClass || 'unknown'; classCounts[c] = (classCounts[c] || 0) + 1; });
    return sendJson(res, 200, {
      count: data.summary.connectedClientsCount,
      wifiCount: data.summary.wifiClientsCount,
      wiredCount: data.summary.wiredClientsCount,
      deviceClassCounts: classCounts,
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

  // --- Shelly Presence API Endpoints ---
  if (pathname === '/api/shelly' && (isGet || isHead)) {
    return sendJson(res, 200, shelly.getState(), isHead);
  }

  if (pathname === '/api/presence' && (isGet || isHead)) {
    return sendJson(res, 200, shelly.getPresenceSummary(), isHead);
  }

  // --- Speed Test API Endpoints ---
  if (pathname === '/api/speedtest' && req.method === 'POST') {
    try {
      const result = await speedTester.runSpeedTest();
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, 429, { error: e.message, running: speedTester.isRunning });
    }
  }

  if (pathname === '/api/speedtest' && (isGet || isHead)) {
    if (speedTester.lastResult) {
      return sendJson(res, 200, speedTester.lastResult, isHead);
    }
    try {
      const result = await speedTester.runSpeedTest();
      return sendJson(res, 200, result, isHead);
    } catch (e) {
      return sendJson(res, 429, { error: e.message, running: speedTester.isRunning }, isHead);
    }
  }

  if (pathname === '/api/version' && (isGet || isHead)) {
    return sendJson(res, 200, {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      docs: '/docs'
    }, isHead);
  }

  if (pathname === '/api/scan' && req.method === 'POST') {
    scanner.cachedData = null;
    const freshData = await scanner.scanAll();
    return sendJson(res, 200, { message: 'Scan complete', data: freshData });
  }

  // --- Static UI Delivery ---
  if ((pathname === '/' || pathname === '/index.html') && (isGet || isHead)) {
    return serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html; charset=utf-8', isHead);
  }

  // 404
  sendJson(res, 404, {
    error: 'Not Found',
    availableEndpoints: [
      '/',
      '/docs',
      '/docs/openapi.json',
      '/llms.txt',
      '/api/status',
      '/api/devices',
      '/api/wifi',
      '/api/router',
      '/api/shelly',
      '/api/presence',
      '/api/speedtest',
      '/api/version',
      '/api/scan'
    ]
  }, isHead);
});

server.listen(PORT, HOST, () => {
  const tsInfo = scanner.getTailscaleInfo();
  console.log(`========================================================`);
  console.log(`  Grima v${pkg.version} is running!`);
  console.log(`  Dashboard:     http://localhost:${PORT}`);
  console.log(`  API Docs:      http://localhost:${PORT}/docs`);
  console.log(`  Speed Test:    http://localhost:${PORT}/api/speedtest`);
  console.log(`  Tailscale:     http://${tsInfo.ip}:${PORT}`);
  console.log(`  Tailscale DNS: http://${tsInfo.hostname}:${PORT}`);
  console.log(`========================================================`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const https = require('https');

class SpeedTester {
  constructor() {
    this.isRunning = false;
    this.lastResult = null;
  }

  request(url, options = {}, data = null) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const req = https.request(url, options, (res) => {
        const chunks = [];
        let bytesReceived = 0;

        res.on('data', (chunk) => {
          chunks.push(chunk);
          bytesReceived += chunk.length;
        });

        res.on('end', () => {
          const t1 = performance.now();
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            durationMs: t1 - t0,
            bytes: data ? data.length : bytesReceived
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy(new Error('Request timed out'));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }

  async measurePing(samples = 5) {
    const latencies = [];
    let serverColo = 'Cloudflare Edge';

    for (let i = 0; i < samples; i++) {
      try {
        const res = await this.request('https://speed.cloudflare.com/__down?bytes=0', {
          method: 'GET',
          headers: { 'User-Agent': 'Grima-Speedtest/1.0' }
        });
        latencies.push(res.durationMs);

        const cfRay = res.headers['cf-ray'];
        if (cfRay && cfRay.includes('-')) {
          serverColo = `Cloudflare Edge (${cfRay.split('-')[1]})`;
        }
      } catch (e) {
        // Ignore single drop
      }
    }

    if (latencies.length === 0) return { pingMs: null, jitterMs: null, server: serverColo };

    const min = Math.min(...latencies);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    let jitter = 0;
    for (let i = 1; i < latencies.length; i++) {
      jitter += Math.abs(latencies[i] - latencies[i - 1]);
    }
    const avgJitter = latencies.length > 1 ? jitter / (latencies.length - 1) : 0;

    return {
      pingMs: parseFloat(avg.toFixed(1)),
      minPingMs: parseFloat(min.toFixed(1)),
      jitterMs: parseFloat(avgJitter.toFixed(1)),
      server: serverColo
    };
  }

  async measureDownload() {
    // 1. Warm-up
    await this.request('https://speed.cloudflare.com/__down?bytes=2000000', {
      headers: { 'User-Agent': 'Grima-Speedtest/1.0' }
    });

    // 2. Multi-stage measurement (10MB + 25MB)
    let totalBytes = 0;
    let totalDurationMs = 0;

    for (const size of [10000000, 25000000]) {
      const res = await this.request(`https://speed.cloudflare.com/__down?bytes=${size}`, {
        headers: { 'User-Agent': 'Grima-Speedtest/1.0' }
      });
      totalBytes += res.bytes;
      totalDurationMs += res.durationMs;
    }

    const durationSec = totalDurationMs / 1000;
    const mbps = (totalBytes * 8) / (durationSec * 1000000);

    return {
      downloadMbps: parseFloat(mbps.toFixed(2)),
      downloadBytes: totalBytes,
      downloadDurationSec: parseFloat(durationSec.toFixed(2))
    };
  }

  async measureUpload() {
    // 2MB warm-up + 5MB test payload
    const bufWarmup = Buffer.alloc(2 * 1024 * 1024, 'A');
    const bufPayload = Buffer.alloc(5 * 1024 * 1024, 'B');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://speed.cloudflare.com/',
      'Content-Type': 'text/plain;charset=UTF-8'
    };

    // Warm-up
    await this.request('https://speed.cloudflare.com/__up', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': bufWarmup.length }
    }, bufWarmup);

    // Measurement
    const res = await this.request('https://speed.cloudflare.com/__up', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': bufPayload.length }
    }, bufPayload);

    const durationSec = res.durationMs / 1000;
    const mbps = (res.bytes * 8) / (durationSec * 1000000);

    return {
      uploadMbps: parseFloat(mbps.toFixed(2)),
      uploadBytes: bufPayload.length,
      uploadDurationSec: parseFloat(durationSec.toFixed(2))
    };
  }

  async runSpeedTest() {
    if (this.isRunning) {
      throw new Error('A speed test is currently in progress. Please wait for it to complete.');
    }

    this.isRunning = true;
    const start = Date.now();

    try {
      const pingInfo = await this.measurePing(5);
      const downloadInfo = await this.measureDownload();
      const uploadInfo = await this.measureUpload();

      const totalSec = ((Date.now() - start) / 1000).toFixed(1);

      this.lastResult = {
        timestamp: new Date().toISOString(),
        server: pingInfo.server,
        pingMs: pingInfo.pingMs,
        minPingMs: pingInfo.minPingMs,
        jitterMs: pingInfo.jitterMs,
        downloadMbps: downloadInfo.downloadMbps,
        downloadDurationSec: downloadInfo.downloadDurationSec,
        uploadMbps: uploadInfo.uploadMbps,
        uploadDurationSec: uploadInfo.uploadDurationSec,
        totalBytesTransferred: downloadInfo.downloadBytes + uploadInfo.uploadBytes,
        totalDurationSeconds: parseFloat(totalSec),
        status: 'success'
      };

      return this.lastResult;
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new SpeedTester();

/**
 * Shelly Presence Bridge
 * ----------------------
 * Forwards data from a local Shelly Presence (Gen4) mmWave sensor to Grima's
 * API so other apps can consume it.
 *
 * Data sources on the device:
 *   - HTTP RPC  POST /rpc/Shelly.GetDeviceInfo   -> model, mac, firmware
 *   - HTTP RPC  POST /rpc/Shelly.GetComponents   -> presence zone state, illuminance
 *   - WebSocket ws://<ip>/rpc/ws                 -> real-time status/event pushes
 *
 * Zero external dependencies (Node core + built-in WebSocket client).
 */

const http = require('http');

const SHELLY_IP = process.env.SHELLY_IP || '192.168.1.102';
const POLL_INTERVAL_MS = parseInt(process.env.SHELLY_POLL_MS || '5000', 10);
const HTTP_TIMEOUT_MS = 3000;
const MAX_EVENTS = 200;

class ShellyPresenceBridge {
  constructor() {
    this.ip = SHELLY_IP;
    this.deviceInfo = null;
    this.online = false;
    this.lastSeen = null;
    this.consecutiveFailures = 0;

    // Live sensor state (from presencezone component)
    this.presence = {
      present: false,
      numObjects: 0,
      zoneId: null,
      zoneName: 'Room',
      presentSince: null,   // ISO timestamp when presence last became true
      updatedAt: null
    };

    // Ambient light (from illuminance component)
    this.illuminance = {
      level: null,          // 'dark' | 'bright'
      updatedAt: null
    };

    // Main zone config (range limits etc.)
    this.zoneConfig = null;

    // WebSocket liveness
    this.wsConnected = false;

    // Ring buffer of recent state changes / device events
    this.events = [];

    this._pollTimer = null;
    this._ws = null;
    this._wsRetryDelay = 1000;
    this._stopped = false;
  }

  // --- HTTP RPC helper ---

  rpcCall(method, params = {}) {
    return new Promise((resolve) => {
      const body = JSON.stringify({ id: Date.now(), src: 'grima', method, params });
      let settled = false;
      const req = http.request({
        hostname: this.ip,
        port: 80,
        path: '/rpc/' + method,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: HTTP_TIMEOUT_MS
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => { if (!settled) { settled = true; resolve(null); } });
      req.on('timeout', () => { req.destroy(); if (!settled) { settled = true; resolve(null); } });
      req.write(body);
      req.end();
    });
  }

  // --- Event log ---

  recordEvent(type, detail) {
    this.events.push({ ts: new Date().toISOString(), type, detail });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  // --- Polling loop ---

  async pollOnce() {
    const [info, components] = await Promise.all([
      this.rpcCall('Shelly.GetDeviceInfo'),
      this.rpcCall('Shelly.GetComponents')
    ]);

    if (!components || !Array.isArray(components.components)) {
      this._markOffline();
      return;
    }

    const wasOnline = this.online;
    this.online = true;
    this.lastSeen = new Date().toISOString();
    this.consecutiveFailures = 0;
    if (!wasOnline) this.recordEvent('device_online', { ip: this.ip });

    if (info && info.model) {
      this.deviceInfo = {
        id: info.id,
        name: info.name || null,
        mac: info.mac,
        model: info.model,
        gen: info.gen,
        firmware: info.ver,
        fwId: info.fw_id,
        app: info.app,
        matter: !!info.matter
      };
    }

    for (const comp of components.components) {
      if (comp.key === 'presence') {
        const cfg = comp.config || {};
        this.zoneConfig = {
          zmin: cfg.zmin ?? null,
          zmax: cfg.zmax ?? null,
          sensitivity: cfg.sensor?.sensitivity ?? null,
          mainZone: cfg.main_zone ?? null
        };
      } else if (comp.key.startsWith('presencezone')) {
        this._applyPresenceStatus(comp);
      } else if (comp.key.startsWith('illuminance')) {
        this._applyIlluminanceStatus(comp);
      }
    }
  }

  _applyPresenceStatus(comp) {
    const status = comp.status || {};
    const cfg = comp.config || {};
    const nextPresent = !!status.value;
    const nextObjects = Number.isFinite(status.num_objects) ? status.num_objects : null;
    const now = new Date().toISOString();

    this.presence.zoneId = status.id ?? comp.key.split(':')[1] ?? null;
    if (cfg.name) this.presence.zoneName = cfg.name;

    const changed = nextPresent !== this.presence.present ||
      (nextObjects !== null && nextObjects !== this.presence.numObjects);

    this.presence.present = nextPresent;
    if (nextObjects !== null) this.presence.numObjects = nextObjects;
    this.presence.updatedAt = now;

    if (changed) {
      if (nextPresent) {
        this.presence.presentSince = now;
        this.recordEvent('presence_detected', { numObjects: nextObjects, zone: this.presence.zoneName });
      } else {
        this.presence.presentSince = null;
        this.recordEvent('presence_cleared', { zone: this.presence.zoneName });
      }
    }
  }

  _applyIlluminanceStatus(comp) {
    const status = comp.status || {};
    if (status.illumination && status.illumination !== this.illuminance.level) {
      const prev = this.illuminance.level;
      this.illuminance.level = status.illumination;
      this.illuminance.updatedAt = new Date().toISOString();
      this.recordEvent('illuminance_changed', { from: prev, to: status.illumination });
    } else if (status.illumination && !this.illuminance.updatedAt) {
      this.illuminance.level = status.illumination;
      this.illuminance.updatedAt = new Date().toISOString();
    }
  }

  _markOffline() {
    const wasOnline = this.online;
    this.online = false;
    this.consecutiveFailures++;
    if (wasOnline) this.recordEvent('device_offline', { ip: this.ip, failures: this.consecutiveFailures });
  }

  // --- WebSocket real-time channel ---

  connectWs() {
    if (this._stopped || typeof WebSocket === 'undefined') return;
    try {
      this._ws = new WebSocket(`ws://${this.ip}/rpc/ws`);
    } catch (e) {
      this._scheduleWsReconnect();
      return;
    }

    this._ws.onopen = () => {
      this.wsConnected = true;
      this._wsRetryDelay = 1000;
      if (this.online === false) this.recordEvent('ws_connected', {});
    };

    this._ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      this._handleWsMessage(msg);
    };

    this._ws.onclose = () => {
      const was = this.wsConnected;
      this.wsConnected = false;
      if (was) this.recordEvent('ws_disconnected', {});
      this._scheduleWsReconnect();
    };

    this._ws.onerror = () => { /* onclose follows and handles reconnect */ };
  }

  _scheduleWsReconnect() {
    if (this._stopped) return;
    setTimeout(() => this.connectWs(), this._wsRetryDelay);
    this._wsRetryDelay = Math.min(this._wsRetryDelay * 2, 30000);
  }

  _handleWsMessage(msg) {
    const method = msg.method || '';
    const params = msg.params || {};

    // Component status push: {component: "presencezone:200", status: {...}}
    if (params.component && params.status) {
      if (params.component.startsWith('presencezone')) {
        this._applyPresenceStatus({ key: params.component, status: params.status, config: {} });
      } else if (params.component.startsWith('illuminance')) {
        this._applyIlluminanceStatus({ key: params.component, status: params.status });
      }
    }

    // Live tracking objects (UI visualization stream) — record compactly
    if (method === 'Presence.LiveTrackObjects' || method === 'Sys.EventNotify') {
      const evt = params.event;
      if (evt === 'track' || evt === 'no_track') {
        this.recordEvent(evt, { objects: Array.isArray(params.object) ? params.object.length : 0 });
      } else if (evt) {
        this.recordEvent('device_event', { event: evt, component: params.component || null });
      }
    }
  }

  // --- Lifecycle ---

  start() {
    this._stopped = false;
    this.pollOnce();
    this._pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL_MS);
    this.connectWs();
    console.log(`[shelly] Presence bridge started -> ${this.ip} (poll every ${POLL_INTERVAL_MS / 1000}s)`);
  }

  stop() {
    this._stopped = true;
    if (this._pollTimer) clearInterval(this._pollTimer);
    try { this._ws?.close(); } catch (e) {}
  }

  // --- Public snapshot for the API ---

  getState() {
    return {
      source: 'shelly-presence',
      device: this.deviceInfo ? { ...this.deviceInfo, ip: this.ip } : { ip: this.ip, model: null },
      online: this.online,
      lastSeen: this.lastSeen,
      realtimeChannel: this.wsConnected ? 'websocket' : 'polling',
      presence: { ...this.presence },
      illuminance: { ...this.illuminance },
      zoneConfig: this.zoneConfig,
      events: this.events.slice(-50).reverse() // newest first, capped for API responses
    };
  }

  getPresenceSummary() {
    return {
      present: this.presence.present,
      numObjects: this.presence.numObjects,
      zoneName: this.presence.zoneName,
      presentSince: this.presence.presentSince,
      updatedAt: this.presence.updatedAt,
      online: this.online,
      device: this.deviceInfo?.model || null,
      ip: this.ip
    };
  }
}

module.exports = new ShellyPresenceBridge();

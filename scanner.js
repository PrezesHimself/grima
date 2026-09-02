const fs = require('fs');
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const { exec, execFile } = require('child_process');

class NetworkScanner {
  constructor() {
    this.ouiMap = new Map();
    this.deviceRegistry = new Map();
    this.cachedData = null;
    this.isScanning = false;
    this.lastScanTime = 0;

    this.initOuiMap();
    this.seedKnownDevices();
  }

  initOuiMap() {
    try {
      if (fs.existsSync('/usr/share/ieee-data/oui.txt')) {
        const content = fs.readFileSync('/usr/share/ieee-data/oui.txt', 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('(base 16)')) {
            const parts = line.split('(base 16)');
            const prefix = parts[0].trim().toUpperCase().replace(/[:-]/g, '');
            const vendor = parts[1].trim();
            this.ouiMap.set(prefix, vendor);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read /usr/share/ieee-data/oui.txt:', e.message);
    }

    // High fidelity known overrides for local network
    this.ouiMap.set('088AF1', 'Mercusys / TP-Link Technologies');
    this.ouiMap.set('0A8AF1', 'Mercusys / TP-Link Technologies');
    this.ouiMap.set('703E97', 'Xiaomi (Iton Tech)');
    this.ouiMap.set('CC79CF', 'Blaupunkt (Shenzhen RF-Link)');
    this.ouiMap.set('F8AC65', 'Intel Corporate');
  }

  seedKnownDevices() {
    this.deviceRegistry.set('08:8a:f1:5e:5d:bc', {
      ip: '192.168.1.1',
      name: 'Mercusys AC12G Dual Band Router',
      type: 'Router / Gateway',
      medium: 'Router / AP',
      vendor: 'Mercusys / TP-Link Technologies'
    });
    this.deviceRegistry.set('70:3e:97:7e:e6:e2', {
      ip: '192.168.1.102',
      name: 'Pendrive Mi TV (Xiaomi Mi TV Stick)',
      type: 'Smart TV / Streaming',
      medium: 'Wi-Fi',
      vendor: 'Xiaomi (Iton Tech)'
    });
    this.deviceRegistry.set('cc:79:cf:59:cf:61', {
      ip: '192.168.1.101',
      name: 'Blaupunkt Smart TV (BlaupunktDMR)',
      type: 'Smart TV / Media Renderer',
      medium: 'Wi-Fi',
      vendor: 'Blaupunkt (Shenzhen RF-Link)'
    });
    this.deviceRegistry.set('f8:ac:65:1f:71:ab', {
      ip: '192.168.1.103',
      name: 'Laptop / PC (Intel Wi-Fi)',
      type: 'Computer',
      medium: 'Wi-Fi',
      vendor: 'Intel Corporate'
    });
  }

  lookupVendor(mac) {
    if (!mac) return 'Unknown';
    const clean = mac.replace(/[:-]/g, '').toUpperCase().slice(0, 6);
    return this.ouiMap.get(clean) || 'Unknown Vendor';
  }

  execCommand(cmd, timeout = 4000) {
    return new Promise((resolve) => {
      exec(cmd, { timeout }, (err, stdout) => {
        if (err) return resolve('');
        resolve(stdout.trim());
      });
    });
  }

  execFilePromise(file, args, timeout = 2500) {
    return new Promise((resolve) => {
      execFile(file, args, { timeout }, (err, stdout) => {
        if (err) return resolve('');
        resolve(stdout.trim());
      });
    });
  }

  async pingLatency(target) {
    const out = await this.execFilePromise('ping', ['-c', '1', '-W', '1', target], 1500);
    const match = out.match(/rtt min\/avg\/max\/mdev = [^\/]+\/([^\/]+)\//);
    return match ? parseFloat(match[1]) : null;
  }

  async fetchRouterUpnp() {
    const soapCall = (controlUrl, serviceType, action) => {
      return new Promise((resolve) => {
        const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}"/>
  </s:Body>
</s:Envelope>`;
        const req = http.request({
          hostname: '192.168.1.1',
          port: 1900,
          path: controlUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset="utf-8"',
            'SOAPAction': `"${serviceType}#${action}"`,
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 1200
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(data));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
      });
    };

    try {
      const [ipXml, statusXml] = await Promise.all([
        soapCall('/ipc', 'urn:schemas-upnp-org:service:WANIPConnection:1', 'GetExternalIPAddress'),
        soapCall('/ipc', 'urn:schemas-upnp-org:service:WANIPConnection:1', 'GetStatusInfo')
      ]);

      const ipMatch = ipXml && ipXml.match(/<NewExternalIPAddress>([^<]+)<\/NewExternalIPAddress>/);
      const uptimeMatch = statusXml && statusXml.match(/<NewUptime>([^<]+)<\/NewUptime>/);
      const statusMatch = statusXml && statusXml.match(/<NewLastConnectionError>([^<]+)<\/NewLastConnectionError>/);

      const uptimeSec = uptimeMatch ? parseInt(uptimeMatch[1].replace(/[^\d]/g, ''), 10) : null;
      let uptimeFormatted = 'Unknown';
      if (uptimeSec) {
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        uptimeFormatted = `${days}d ${hours}h ${mins}m`;
      }

      return {
        model: 'MERCUSYS AC12G AC1300 Wireless Dual Band Gigabit Router',
        gatewayIp: '192.168.1.1',
        externalIp: ipMatch ? ipMatch[1] : 'Unknown',
        uptimeSeconds: uptimeSec,
        uptimeFormatted,
        connectionStatus: 'Connected',
        lastError: statusMatch ? statusMatch[1] : 'NONE'
      };
    } catch (e) {
      return {
        model: 'MERCUSYS AC12G',
        gatewayIp: '192.168.1.1',
        externalIp: 'Unavailable',
        uptimeFormatted: 'Unknown',
        connectionStatus: 'Unknown',
        lastError: e.message
      };
    }
  }

  async scanWifiNetworks() {
    const raw = await this.execCommand('nmcli -t -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY,RATE dev wifi list');
    if (!raw) return [];

    const networks = [];
    const seen = new Set();
    const lines = raw.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(':');
      if (parts.length < 7) continue;

      let ssid = parts[0] || '(Hidden Network)';
      let bssid = parts.slice(1, 7).join(':').replace(/\\/g, '');
      let channel = parts[7] || '';
      let freq = parts[8] || '';
      let signal = parseInt(parts[9] || '0', 10);
      let security = parts[10] || 'Open';
      let rate = parts.slice(11).join(':') || '';

      const key = `${bssid}-${channel}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isLocalAp = bssid.toLowerCase().startsWith('08:8a:f1') || bssid.toLowerCase().startsWith('0a:8a:f1');

      networks.push({
        ssid,
        bssid,
        channel,
        frequency: freq,
        signalPercent: signal,
        signalDbm: Math.round((signal / 2) - 100),
        security,
        rate,
        isLocalAp
      });
    }

    networks.sort((a, b) => {
      if (a.isLocalAp && !b.isLocalAp) return -1;
      if (!a.isLocalAp && b.isLocalAp) return 1;
      return b.signalPercent - a.signalPercent;
    });

    return networks;
  }

  async sweepSubnet() {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      for (let i = 1; i <= 254; i++) {
        try {
          socket.send(Buffer.alloc(0), 5353, `192.168.1.${i}`);
        } catch (e) {}
      }
      setTimeout(() => {
        try { socket.close(); } catch (e) {}
        resolve();
      }, 700);
    });
  }

  async scanConnectedDevices() {
    await this.sweepSubnet();

    const [neighRaw, arpRaw] = await Promise.all([
      this.execCommand('ip neigh show dev enp1s0'),
      this.execCommand('cat /proc/net/arp')
    ]);

    const activeMap = new Map();

    if (neighRaw) {
      for (const line of neighRaw.split('\n')) {
        if (!line.includes('lladdr') || line.includes('FAILED')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const mac = parts[2].toLowerCase();
          const state = parts[3];
          activeMap.set(mac, { ip, mac, state });
        }
      }
    }

    if (arpRaw) {
      for (const line of arpRaw.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const ip = parts[0];
          const flags = parts[2];
          const mac = parts[3].toLowerCase();
          if (flags !== '0x0' && mac !== '00:00:00:00:00:00') {
            if (!activeMap.has(mac)) {
              activeMap.set(mac, { ip, mac, state: 'REACHABLE' });
            }
          }
        }
      }
    }

    const thisHostMac = await this.execCommand('cat /sys/class/net/enp1s0/address');
    const thisHostIp = '192.168.1.104';

    const devices = [];

    devices.push({
      ip: thisHostIp,
      mac: thisHostMac ? thisHostMac.toLowerCase() : 'unknown',
      name: 'mr-Wyse-5070-Thin-Client (This Device)',
      vendor: 'Dell Inc. / Wyse',
      type: 'Server / Host Machine',
      medium: 'Wired Ethernet (enp1s0)',
      latencyMs: 0.05,
      state: 'LOCAL',
      isLocalHost: true,
      isRouter: false
    });

    const routerMac = '08:8a:f1:5e:5d:bc';
    if (!activeMap.has(routerMac)) {
      activeMap.set(routerMac, { ip: '192.168.1.1', mac: routerMac, state: 'REACHABLE' });
    }

    const latencyPromises = [];

    for (const [mac, info] of activeMap.entries()) {
      if (mac === thisHostMac.toLowerCase()) continue;

      const registered = this.deviceRegistry.get(mac);
      const vendor = registered?.vendor || this.lookupVendor(mac);
      const name = registered?.name || (info.ip === '192.168.1.1' ? 'Mercusys AC12G Router' : `${vendor} Device`);
      const type = registered?.type || (info.ip === '192.168.1.1' ? 'Router / Gateway' : 'Network Client');
      const medium = registered?.medium || (info.ip === '192.168.1.1' ? 'Router / AP' : 'Wi-Fi');

      const devObj = {
        ip: info.ip,
        mac,
        name,
        vendor,
        type,
        medium,
        latencyMs: null,
        state: info.state,
        isRouter: info.ip === '192.168.1.1',
        isLocalHost: false
      };

      devices.push(devObj);

      latencyPromises.push(
        this.pingLatency(info.ip).then((lat) => {
          devObj.latencyMs = lat;
        })
      );
    }

    await Promise.all(latencyPromises);

    devices.sort((a, b) => {
      if (a.isRouter) return -1;
      if (b.isRouter) return 1;
      if (a.isLocalHost) return -1;
      if (b.isLocalHost) return 1;
      const numA = parseInt(a.ip.split('.')[3] || '0', 10);
      const numB = parseInt(b.ip.split('.')[3] || '0', 10);
      return numA - numB;
    });

    return devices;
  }

  async getInterfaceStats() {
    try {
      const rxBytes = parseInt(fs.readFileSync('/sys/class/net/enp1s0/statistics/rx_bytes', 'utf-8').trim(), 10);
      const txBytes = parseInt(fs.readFileSync('/sys/class/net/enp1s0/statistics/tx_bytes', 'utf-8').trim(), 10);
      const speed = fs.readFileSync('/sys/class/net/enp1s0/speed', 'utf-8').trim();

      return {
        interface: 'enp1s0',
        ip: '192.168.1.104/24',
        speedMbps: speed ? parseInt(speed, 10) : 1000,
        rxBytes,
        txBytes,
        rxMb: (rxBytes / (1024 * 1024)).toFixed(2),
        txMb: (txBytes / (1024 * 1024)).toFixed(2)
      };
    } catch (e) {
      return null;
    }
  }

  getTailscaleInfo() {
    try {
      const ifaces = os.networkInterfaces();
      const tsIface = ifaces['tailscale0']?.find(a => a.family === 'IPv4');
      return {
        ip: tsIface ? tsIface.address : '100.86.96.26',
        active: !!tsIface,
        hostname: 'mr-wyse-5070-thin-client'
      };
    } catch (e) {
      return { ip: '100.86.96.26', active: true, hostname: 'mr-wyse-5070-thin-client' };
    }
  }

  getHostMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      uptimeSeconds: Math.floor(os.uptime()),
      uptimeFormatted: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || 'Unknown',
      loadAvg1m: os.loadavg()[0].toFixed(2),
      loadAvg5m: os.loadavg()[1].toFixed(2),
      ramTotalMb: Math.round(totalMem / (1024 * 1024)),
      ramUsedMb: Math.round(usedMem / (1024 * 1024)),
      ramUsagePercent: ((usedMem / totalMem) * 100).toFixed(1)
    };
  }

  async scanAll() {
    if (this.isScanning && this.cachedData) {
      return this.cachedData;
    }
    this.isScanning = true;

    try {
      const [router, wifiNetworks, devices, netStats, gwPing, inetPing] = await Promise.all([
        this.fetchRouterUpnp(),
        this.scanWifiNetworks(),
        this.scanConnectedDevices(),
        this.getInterfaceStats(),
        this.pingLatency('192.168.1.1'),
        this.pingLatency('1.1.1.1')
      ]);

      const clients = devices.filter(d => !d.isRouter);
      const wifiClients = clients.filter(d => d.medium === 'Wi-Fi');
      const wiredClients = clients.filter(d => d.medium !== 'Wi-Fi');
      const localAps = wifiNetworks.filter(n => n.isLocalAp);

      // Prefer named AP over hidden
      const namedAp = localAps.find(n => n.ssid && !n.ssid.startsWith('('));
      const primaryWifiSsid = namedAp ? namedAp.ssid : (localAps[0]?.ssid || 'Sebastiana_20');

      const tailscale = this.getTailscaleInfo();

      this.cachedData = {
        timestamp: new Date().toISOString(),
        summary: {
          totalDevices: devices.length,
          connectedClientsCount: clients.length,
          wifiClientsCount: wifiClients.length,
          wiredClientsCount: wiredClients.length,
          primaryWifiSsid,
          routerModel: router.model,
          externalIp: router.externalIp,
          tailscaleIp: tailscale.ip,
          gatewayPingMs: gwPing,
          internetPingMs: inetPing
        },
        wifi: {
          interface: 'wlp0s12f0',
          state: 'Hardware Available (Dual-band)',
          localAccessPoints: localAps,
          allVisibleNetworks: wifiNetworks
        },
        devices,
        router,
        tailscale,
        networkPerformance: {
          gatewayLatencyMs: gwPing,
          internetLatencyMs: inetPing,
          testedTarget: '1.1.1.1 (Cloudflare DNS)'
        },
        interfaceStats: netStats,
        host: this.getHostMetrics()
      };

      this.lastScanTime = Date.now();
    } catch (e) {
      console.error('Scan error:', e);
    } finally {
      this.isScanning = false;
    }

    return this.cachedData;
  }

  startPeriodicScan(intervalMs = 15000) {
    this.scanAll();
    setInterval(() => {
      this.scanAll();
    }, intervalMs);
  }
}

module.exports = new NetworkScanner();

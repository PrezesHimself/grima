# Grima 📡

> Lightweight Wi-Fi & Network Telemetry Daemon with Tailscale integration and real-time dashboard.

Grima monitors your local network, tracks connected Wi-Fi and wired clients, queries router gateway metrics via UPnP IGD, monitors signal levels and spectrum across nearby networks, and exposes everything via a REST API and real-time web dashboard.

---

## Features

- **Subnet ARP & UDP Device Discovery**: Automatically catalogs active devices on the local `/24` subnet.
- **Hardware Vendor Classification**: Identifies device manufacturers using the IEEE OUI database (Xiaomi, Blaupunkt, Intel, Dell Wyse, etc.).
- **Device Type Detection**: Automatically classifies each client as `phone`, `laptop`, `tv`, or `iot` using MAC randomization detection (iOS/Android Wi-Fi privacy), OUI vendor signatures, mDNS/DNS-SD service discovery, and SSH port probing — exposed per-device (`deviceClass`, `macRandomized`, `classReason`) and aggregated (`deviceClassCounts`).
- **UPnP / SSDP Friendly Name Resolution**: Resolves device friendly names (e.g. "Pendrive Mi TV", "BlaupunktDMR").
- **Wi-Fi Spectrum & Signal Monitoring**: Dual-band scanning (2.4 GHz & 5 GHz) showing signal %, dBm, channels, bitrates, and security.
- **Router Gateway Telemetry**: Queries Mercusys / TP-Link router for WAN IP, router uptime, and connection state.
- **Shelly Presence Bridge**: Forwards live data from the Shelly Presence Gen4 mmWave sensor (room occupancy + object count + ambient light) to Grima's API via 5s RPC polling plus a persistent WebSocket event channel — consumable by any app over LAN or Tailscale.
- **Unified Event Stream (SSE)**: Real-time push feed combining Shelly sensor events (presence detected/cleared, illuminance changes pushed by device webhooks) with LAN device connect/disconnect transitions from router ARP scans — `GET /api/events/stream` for live SSE, `GET /api/events` for recent history.
- **Real-Time Light Telemetry**: The Shelly's own illuminance webhooks (`illuminance.measurement` / `illuminance.change`) are registered on the device and push light-level changes (dark/twilight/bright) straight into Grima — no polling latency.
- **Tailscale Integration**: Bound to `0.0.0.0`, accessible securely across your Tailnet from any authorized device.
- **Web Dashboard**: Responsive dark-mode dashboard with live status cards and real-time auto-refresh.
- **Systemd Autostart**: Runs as a persistent user service (`grima.service`) with user lingering enabled.

---

## Accessing Grima

- **Localhost**: [http://localhost:3000](http://localhost:3000)
- **Local LAN**: `http://192.168.1.104:3000`
- **Tailscale IP**: [http://100.86.96.26:3000](http://100.86.96.26:3000)
- **Tailscale MagicDNS**: [http://mr-wyse-5070-thin-client:3000](http://mr-wyse-5070-thin-client:3000)

---

## API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | Complete network state, telemetry, and device summary |
| `/api/devices` | `GET` | Connected devices breakdown (count, IP, MAC, vendor, medium, latency) |
| `/api/wifi` | `GET` | Wi-Fi spectrum and nearby networks |
| `/api/router` | `GET` | Router WAN IP, uptime, model, and gateway status |
| `/api/shelly` | `GET` | Full Shelly Presence Gen4 state: device identity, occupancy (`present`, `numObjects`), illuminance, zone config, event log |
| `/api/presence` | `GET` | Lightweight room-occupancy feed from the Shelly mmWave sensor for other apps/automations |
| `/api/events/stream` | `GET` | Live SSE event stream: Shelly presence/illuminance events + LAN device connected/disconnected transitions, with initial state snapshot and 25s heartbeats |
| `/api/events` | `GET` | Recent unified event history (last 200, newest first) for clients that can't hold a persistent connection |
| `/api/shelly/webhook` | `POST` | Internal push receiver — the Shelly device's illuminance webhooks POST light-level events here in real time |
| `/api/speedtest` | `POST` | Run an on-demand internet speed test (ping, jitter, download, upload) via Cloudflare edge |
| `/api/speedtest` | `GET` | Get the latest cached speed test result (runs one if none exists) |
| `/api/version` | `GET` | Current Grima release version and metadata |
| `/api/scan` | `POST` | Trigger an immediate manual re-scan |
| `/docs` | `GET` | Interactive API documentation + OpenAPI 3.0 schema (`/docs/openapi.json`) and `llms.txt` agent guide |

---

## Service Management

```bash
# Check service status
systemctl --user status grima.service

# Restart daemon
systemctl --user restart grima.service

# View live log stream
journalctl --user -u grima.service -f
```

---

## Version Bumping & Releases

Grima includes an automated bump workflow that updates `package.json`, writes to `CHANGELOG.md`, creates a Git commit and tag, and restarts the daemon:

```bash
# Patch bump (e.g., 0.1.0 -> 0.1.1)
npm run bump "Describe fix or change"

# Minor bump (e.g., 0.1.0 -> 0.2.0)
npm run bump:minor "New features added"

# Major bump (e.g., 0.1.0 -> 1.0.0)
npm run bump:major "Breaking change or major milestone"

# Custom version
node bump.js 1.0.0 "First official stable release"
```

# Changelog

All notable changes to **Grima** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).











## [0.8.3] - 2026-09-07

### Changed
- Make Shelly sensor configurable and disable it by default if SHELLY_ENABLED is not set to true

## [0.8.2] - 2026-09-07

### Changed
- Remove hardcoded Sebastiana_20 Wi-Fi network fallback and replace with Unknown Network

## [0.8.1] - 2026-09-07

### Changed
- Refactor hardcoded IP addresses to dynamically detect host and gateway IP using 'ip route' commands

## [0.8.0] - 2026-09-05

### Changed
- Real-time light telemetry from Shelly Presence: registered illuminance.measurement + illuminance.change webhooks directly on the device (Webhook.Create/Update via its RPC), pushing light-level changes (dark/twilight/bright) into Grima in real time via new POST /api/shelly/webhook receiver. Illuminance state now tracks 3 levels + optional raw lux field; events flow to SSE stream, /api/events history, and dashboard feed.

## [0.7.0] - 2026-09-05

### Changed
- Dashboard UI for Shelly + event stream: new Room Presence metric card (live mmWave occupancy with sensor online/offline state, green glow when occupied) and Live Event Stream section rendering the SSE feed in real time (shelly + network events, color-coded source badges, 40-row rolling window, seeded from stream snapshot on connect). Footer links to /api/shelly, /api/presence, /api/events/stream.

## [0.6.0] - 2026-09-05

### Changed
- Unified real-time event stream: SSE endpoint GET /api/events/stream combines Shelly sensor events (presence detected/cleared, illuminance changes) with LAN device connect/disconnect transitions from router ARP scans (debounced over 2 consecutive empty sweeps). New events.js pub/sub bus with 200-event ring buffer; GET /api/events exposes recent history. Stream sends initial state snapshot on connect and 25s heartbeats.

## [0.5.0] - 2026-09-05

### Changed
- Shelly Presence Gen4 bridge: forwards mmWave occupancy, object count, and illuminance from the local Shelly sensor to Grima's API via 5s RPC polling + live WebSocket event channel. New endpoints GET /api/shelly (full state + event log) and GET /api/presence (lightweight occupancy feed for other apps); /api/status now includes a shelly block; sensor registered in device inventory.

## [0.4.0] - 2026-09-03

### Changed
- Add automatic device type detection (phone/laptop/tv/iot) via MAC randomization, OUI signatures, mDNS discovery, and SSH probing

## [0.3.0] - 2026-09-03

### Changed
- Add on-demand internet speed test endpoint (/api/speedtest) and live dashboard benchmark

## [0.2.0] - 2026-09-02

### Changed
- Add interactive API docs at /docs, OpenAPI 3.0 schema, llms.txt, and documentation pointers in /api/status

## [0.1.0] - 2026-09-02

### Added
- **Subnet ARP & UDP Device Discovery**: Automated discovery of active devices on the `/24` local subnet.
- **Hardware Vendor Classification**: Integrated IEEE OUI database parsing to identify device manufacturers (Xiaomi, Blaupunkt, Intel, Dell Wyse, Mercusys, etc.).
- **UPnP / SSDP Friendly Name Resolution**: Dynamic discovery of media renderers, smart TVs, and Google Cast devices (e.g., "Pendrive Mi TV", "BlaupunktDMR").
- **Wi-Fi Spectrum & Radio Telemetry**: Dual-band spectrum scanning via `nmcli` exposing signal strength (% and dBm), carrier frequencies, channels, and security suites.
- **Router Gateway Diagnostics (UPnP IGD)**: Direct telemetry query to Mercusys/TP-Link router for WAN public IP, uptime, and link status.
- **Network Performance Monitoring**: Real-time round-trip latency tracking to router gateway and Internet DNS (`1.1.1.1`).
- **Physical NIC Telemetry**: Link speed detection (Gigabit Ethernet) and cumulative RX/TX network traffic tracking.
- **Tailscale Integration**: Automatic binding to `0.0.0.0` exposing the dashboard and API across the secure Tailnet (`100.86.96.26` / `mr-wyse-5070-thin-client`).
- **Web Dashboard**: Modern, responsive dark-mode dashboard with live status cards, connected device inventory, and spectrum meters.
- **REST API**: Complete JSON endpoints for `/api/status`, `/api/devices`, `/api/wifi`, `/api/router`, and `/api/scan`.
- **Systemd Autostart**: Configured `grima.service` with user lingering (`loginctl enable-linger mr`) for automatic startup on machine boot.
- **Local Git Repository**: Initialized version control with initial release tag `v0.1.0`.

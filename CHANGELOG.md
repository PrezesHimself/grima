# Changelog

All notable changes to **Grima** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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

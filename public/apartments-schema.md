# Grima apartment schema — agent reference

Machine-readable schema for the apartment plans served by Grima. Written for
agents (council) that need to read, query or extend the flat's geometry.

## Access

| What | Where |
|---|---|
| Data file (source of truth) | `/home/mr/grima/plans.json` on sebastiana |
| REST API | `GET http://<host>:4981/api/apartments` (tailnet host: `mr-wyse-5070-thin-client`) |
| This doc | `http://<host>:4981/apartments-schema.md` |
| 3D viewer (human) | `http://<host>:4981/apartments` |
| Live events | SSE `GET http://<host>:4981/api/events/stream` |
| Device registry | `GET /api/devices` → `{devices:[{mac,name,ip,state,...}]}` |
| Shelly sensor | `GET /api/shelly` → `[{online, illuminance:{level,lux}, presence:{present,numObjects}}]` |

**After editing plans.json you MUST restart the service** (it loads the file at
boot): `systemctl --user restart grima.service` (USER unit on sebastiana).

## Coordinate system

- Units: **meters**. Plan coordinates `(x, y)` → three.js `(x, 0, y)`, z = up.
- x runs WEST→EAST from 0 to 7.15; y runs NORTH→SOUTH from 0 to 13.
  (y = 0 is the north side with the balcony; y = 13 is the south wall facing Sebastiana St.)
- `wallHeight` = real ceiling height (3.2 m). Viewer wall modes (ghost / ⅓) are
  render-only — geometry data always describes the true building.

## Apartment object fields (`plans.json → apartments[]`)

| Field | Type | Meaning |
|---|---|---|
| `id`, `name` | string | identifier, display name ("sebastiana") |
| `description` | string | provenance + caveats (e.g. listing 75 m² vs traced ≈71 m²) |
| `footprint` | `{width, depth}` | bounding box in m |
| `wallHeight` | number | real ceiling height (3.2) |
| `streetLevel` | number | street surface offset relative to apartment floor (-3.4 = one storey below; adjust after tape measurement) |
| `perimeter` | `[x, y][]` | closed outer footprint, 7 vertices (staircase notch on the NW side) |
| `horizontalWalls` | `[x1, x2, y, label?][]` | interior wall segments along x at fixed y |
| `verticalWalls` | `[y1, y2, x, label?][]` | interior wall segments along y at fixed x |
| `diagonalWalls` | `[x1, y1, x2, y2, label?][]` | slanted segments (45° bathroom chamfer) |
| `openings` | object[] | doors / windows / archways — see below |
| `rooms` | object[] | `{name, center:[x,y], area?, labels?[]}` for labels/legend |
| `groundLabels` | object[] | site marks: `{text, center:[x,y], scale?, atStreet?}` (`atStreet` → rendered on the street surface) |
| `streetLights` | object[] | `{pos:[x,y], label}` — lamp poles; lit only in night mode |
| `exteriorLabels` | object[] | per-edge dimension marks: `{cuts:[t...], labels?[...]}` (t = distance along edge from its start) |
| `sensors` | object[] | live sensor markers — see below |
| `furniture` | object[] | placed furniture — see below |

### openings[]

Axis-aligned: `{type, axis:"h"|"v", from, to, pos, label?, frame?, lightSource?}`
— opening spans `from..to` along the wall at coordinate `pos`.
Diagonal (on a slanted perimeter edge): `{type, a:[x,y], b:[x,y], label?, frame?, lightSource?}`.

| type | renders as |
|---|---|
| `door` | framed opening + closed wooden leaf |
| `double` | two leaves meeting mid-frame (closed) |
| `archway` | frame only, no door (kitchen↔living room; the only `frame:"stone"`) |
| `window` | sill wall + glass at glass height (daylight source) |
| `passage` | plain gap, no frame/door |

- `frame`: `"stone"` → stone jambs+lintel; absent/other → wood.
- `lightSource: true` → the opening glows like a window and counts as a daylight
  entrance (balcony door). **Daylight model: light enters ONLY through the 3
  south windows + balcony door.**

### sensors[]

`{label, center:[x,y], lightPos?:[x,y]}` — e.g. the Shelly Presence Gen4 in the
corridor at `[3.04, 6.2]`; `lightPos [4.57, 6.71]` = where the corridor ceiling
fixture actually is (the "ball of light" appears there when the sensor reports
non-dark illuminance). The viewer binds the first enabled `/api/shelly` entry to
every sensor marker; presence → red pulse + person capsule at `center`.

### furniture[]

`{type, label, center:[x,y], size:[w,d], height?, elev?, color?:"#rrggbb",
rotation? (deg CCW), head?:"west|east|north|south", back?, deviceMac?, note?}`

- types: `bed` (mattress+headboard per `head`+pillows), `sofa` (seat+backrest,
  `back` side), `lamp`, `tv` (screen on north/+z face; glows while the
  `deviceMac` device is online in `/api/devices`), anything else = plain box.
- `elev` lifts the item off the floor (wall-mounted TV); `color` overrides the
  material tint.

## Live behavior (viewer)

- SSE events that re-render state: `presence_detected`, `presence_cleared`,
  `illuminance_changed`, `illuminance_measurement`, `device_online`,
  `device_offline`, `device_connected`, `device_disconnected`.
- Day/night follows Kraków's real sun (50.06N, 19.94E) — hour **and** month;
  street lamps + TV/Shelly glows are the only lights at night.
- Viewer-only state (not in plans.json): press marks, wall mode toggles, sim mode.

## Agent workflow for schema changes

1. Edit `/home/mr/grima/plans.json` (keep valid JSON — `python3 -m json.tool plans.json`).
2. If viewer code changes: extract the inline script and `node --check` it.
3. `systemctl --user restart grima.service`, then verify:
   `curl -s localhost:4981/api/apartments | python3 -m json.tool`.
4. Commit (the council push-reactor pings on new commits). Do not push unless asked.

## Known live devices (2026-09)

- Blaupunkt Smart TV — MAC `cc:79:cf:59:cf:61` @ 192.168.1.107 (linked to the TV item via `deviceMac`)
- Shelly S4SN-0U61X Presence Gen4 @ 192.168.1.102 (corridor sensor)

/**
 * Grima Event Bus
 * ---------------
 * Central pub/sub for all domain events across Grima sources:
 *   - source "shelly":  presence / illuminance / device lifecycle from the Shelly bridge
 *   - source "network": LAN device connect / disconnect transitions from the scanner
 *
 * Keeps a bounded in-memory history so REST clients can fetch recent events,
 * and broadcasts live to SSE subscribers (see /api/events/stream in server.js).
 */

const { EventEmitter } = require('events');

const MAX_HISTORY = 200;

const bus = new EventEmitter();
bus.setMaxListeners(100);

const history = [];

/**
 * Publish an event to all live subscribers and the history ring buffer.
 * @param {string} source  'shelly' | 'network' | 'grima'
 * @param {string} type    e.g. 'presence_detected', 'device_connected'
 * @param {object} detail  arbitrary payload
 */
function publish(source, type, detail = {}) {
  const evt = { ts: new Date().toISOString(), source, type, detail };
  history.push(evt);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  bus.emit('event', evt);
}

/** Recent events, newest first. */
function getHistory() {
  return [...history].reverse();
}

module.exports = { publish, getHistory, bus };

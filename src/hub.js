// -----------------------------------------------------------------------------
// The Healthchecks hub: the project read on a timer of the container (the
// interval chosen in the configuration); the states of the added devices
// published when they change, the scene events fired on transitions, and the
// views the widget and the scene actions read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 5 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire for every check, added to Gladys or not — "a check goes
// down" spares the user one scene per device.
//
// The last state of each check is kept in /data (src/store.js): a check that
// went down while the integration or Gladys restarted is still announced, once.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  VOLATILE,
  buildCheckDevice,
  buildProjectDevice,
  checkIds,
  checkValues,
  parseCheckId,
  projectIds,
  projectValues,
  stateOf,
} from './devices.js';
import { ERROR_KINDS, HcClient, HcError } from './hc/client.js';
import { hostOf, isCloud } from './config.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, formatTime, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'healthchecks-hub' });

export const WIDGET_KEY = 'healthchecks';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  DOWN: 'check_down',
  UP: 'check_up',
  LATE: 'check_late',
});

export const HUB_TIMINGS = {
  // Last ping, next ping, pings and duration change at every ping: published
  // at most this often per check (a state change publishes them at once), so
  // a hundred checks pinging every minute stay below the 300 states per
  // minute Gladys accepts.
  volatileEveryMs: 5 * 60_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Healthchecks again when the last read is older.
  freshMs: 15_000,
};

const MAX_TRANSPORTS_PER_REQUEST = 100;

export class HcHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/hc/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    /** @type {Map<string, object>} checks of the last read, by key */
    this.checks = new Map();
    this.readOnly = false;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    /** When the volatile features of a check were last published, by key. */
    this.volatileAt = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = { checks: {} };
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      checks: saved.checks && typeof saved.checks === 'object' ? saved.checks : {},
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.volatileAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.config && this.config.language !== config.language;
    this.config = config;
    const signature = JSON.stringify([config.url, config.apiKey]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        config.url && config.apiKey
          ? new HcClient({ url: config.url, apiKey: config.apiKey, request: this.request })
          : null;
      this.checks = new Map();
      this.readOnly = false;
      this.readAt = 0;
      this.error = null;
      this.polling = null;
    }
    if (languageChanged) {
      // New names for the Discovery tab, state texts in the new language.
      this.discovered = null;
      this.volatileAt.clear();
    }
    if (this.client) {
      await this.pollNow({ publish: true });
    } else {
      await this.afterChanges(true, { publish: true });
    }
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Healthchecks works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading Healthchecks -------------------------------------------------------

  /** Read the project now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /** Read again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read the project and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    const client = this.client;
    this.polling ??= this.read(client).finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  async read(client) {
    let result;
    try {
      result = await client.checks();
    } catch (err) {
      if (!(err instanceof HcError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(result);
  }

  async applySuccess({ checks, readOnly }) {
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('Healthchecks answers again');
    }
    if (this.readAt === 0 || readOnly !== this.readOnly) {
      logger.info(
        `Healthchecks (${hostOf(this.config.url)}): ${checks.length} check(s)${readOnly ? ', read-only key' : ''}`,
      );
    }
    this.error = null;
    this.readOnly = readOnly;
    this.readAt = this.now();

    const next = new Map();
    const stateChanged = new Set();
    for (const check of checks) {
      if (next.has(check.key)) {
        continue;
      }
      next.set(check.key, check);
      const previous = this.checks.get(check.key);
      if (!previous || stateOf(previous) !== stateOf(check) || previous.name !== check.name) {
        widgetChanged = true;
      }
      if (previous && stateOf(previous) !== stateOf(check)) {
        stateChanged.add(check.key);
      }
      await this.transition(check);
    }
    if ([...this.checks.keys()].some((key) => !next.has(key))) {
      widgetChanged = true; // a check deleted
    }
    this.checks = next;
    // A check deleted in Healthchecks is forgotten (a paused one is still listed).
    for (const key of Object.keys(this.saved.checks)) {
      if (!next.has(key)) {
        delete this.saved.checks[key];
      }
    }
    this.store.save(this.saved);
    await this.publishStates({ changed: stateChanged });
    return widgetChanged;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Healthchecks: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  /** Compare a check with its last state; fire the scene events. */
  async transition(check) {
    const now = this.now();
    const previous = this.saved.checks[check.key];
    const state = stateOf(check);
    // "Running" settles nothing: a job that starts keeps its last state.
    if (state === 'started') {
      if (previous) {
        previous.seenAt = now;
      }
      return;
    }
    if (!previous || previous.state === state) {
      this.saved.checks[check.key] = { state, since: previous?.since ?? now, seenAt: now };
      return;
    }
    this.saved.checks[check.key] = { state, since: now, seenAt: now };
    if (state === 'down' && ['up', 'grace'].includes(previous.state)) {
      logger.info(`${check.name} is down`);
      await this.fireCheck(TRIGGERS.DOWN, check);
    } else if (state === 'grace' && previous.state === 'up') {
      logger.info(`${check.name} is late`);
      await this.fireCheck(TRIGGERS.LATE, check);
    } else if (state === 'up' && previous.state === 'down') {
      const minutes = Math.max(0, Math.round((now - previous.since) / 60_000));
      logger.info(`${check.name} is up again after ${minutes} min`);
      await this.fireCheck(TRIGGERS.UP, check, { downtime_minutes: minutes });
    }
  }

  async fireCheck(key, check, extra = {}) {
    const language = this.config.language;
    const data = {
      device: checkIds(this.gladys, check.key).device,
      check: check.name,
      tags: check.tags,
      last_ping: check.lastPing === null ? '' : formatTime(check.lastPing, language),
      ...extra,
    };
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    const language = this.config.language;
    if (!this.client || this.readAt === 0 || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    return [
      buildProjectDevice(this.gladys, language),
      ...[...this.checks.values()].map((check) => buildCheckDevice(this.gladys, check, language)),
    ];
  }

  /** Publish the Discovery list when it changed (a check added, renamed…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Healthchecks, publish the list again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const key = parseCheckId(this.gladys, device.external_id);
    if (key) {
      this.volatileAt.delete(key);
    }
    await this.publishStates({ changed: new Set(key ? [key] : []) });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   * @param {{ changed?: Set<string> }} options checks whose volatile features go now
   */
  async publishStates({ changed = new Set() } = {}) {
    if (this.readAt === 0 || this.error) {
      return;
    }
    const language = this.config.language;
    const now = this.now();
    const states = [];
    for (const check of this.checks.values()) {
      if (!this.isCreated(checkIds(this.gladys, check.key).device)) {
        continue; // Gladys drops the states of a device not added
      }
      const volatileDue =
        changed.has(check.key) ||
        !this.volatileAt.has(check.key) ||
        now - this.volatileAt.get(check.key) >= this.timings.volatileEveryMs;
      if (volatileDue) {
        this.volatileAt.set(check.key, now);
      }
      for (const { key, ...state } of checkValues(this.gladys, check, language)) {
        if (volatileDue || !VOLATILE.has(key)) {
          states.push(state);
        }
      }
    }
    if (this.isCreated(projectIds(this.gladys).device)) {
      for (const { key: _key, ...state } of projectValues(this.gladys, [...this.checks.values()])) {
        states.push(state);
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: cloud or local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    let transport = isCloud(this.config.url) ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.LOCAL;
    if (this.error) {
      transport = DEVICE_TRANSPORTS.UNREACHABLE;
    }
    const entries = [];
    const ids = [
      projectIds(this.gladys).device,
      ...[...this.checks.keys()].map((key) => checkIds(this.gladys, key).device),
    ];
    for (const externalId of ids) {
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!this.config.apiKey) {
      return { connected: false, message: CONNECTION_TEXT.noKey };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views and commands (widget, scene actions, report) ------------------------------

  /** The check of a device external id, null when it is not one (or no longer exists). */
  find(externalId) {
    const key = parseCheckId(this.gladys, externalId);
    return key ? (this.checks.get(key) ?? null) : null;
  }

  /** Throws the reason Healthchecks cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** An error of a command, in the language of the configuration. */
  commandError(err) {
    if (err instanceof HcError) {
      return new Error(pick(ERROR_TEXT[err.kind], this.config.language));
    }
    return err;
  }

  /** Pause or resume a check (full API key), then read Healthchecks again. */
  async setPaused(check, paused) {
    if (this.readOnly || !check.uuid) {
      throw this.commandError(new HcError(ERROR_KINDS.READ_ONLY, 'Read-only key'));
    }
    try {
      await this.client.setPaused(check.uuid, paused);
    } catch (err) {
      throw this.commandError(err);
    }
    logger.info(`${check.name} ${paused ? 'paused' : 'resumed'}`);
    await this.pollNow();
  }

  /** Send the "success" signal of a check, then read Healthchecks again. */
  async ping(check) {
    if (!check.pingUrl) {
      throw this.commandError(new HcError(ERROR_KINDS.READ_ONLY, 'No ping URL'));
    }
    try {
      await this.client.ping(check.pingUrl);
    } catch (err) {
      throw this.commandError(err);
    }
    logger.info(`${check.name} pinged`);
    await this.pollNow();
  }

  /** "Test the connection": read Healthchecks now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const status = this.connectionStatus();
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const states = [...this.checks.values()].map(stateOf);
      const parts = [text.ok, text.checks(states.length)];
      const down = states.filter((state) => state === 'down').length;
      const late = states.filter((state) => state === 'grace').length;
      if (down > 0) {
        parts.push(text.down(down));
      }
      if (late > 0) {
        parts.push(text.late(late));
      }
      if (this.readOnly) {
        parts.push(text.readOnly);
      }
      message[language] = labelled('Healthchecks', parts.join(', '), language);
    }
    return message;
  }
}

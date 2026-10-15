// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds the ones to
// follow, nothing is created on their behalf):
//
//   - one device per Healthchecks check, identified by its `unique_key` (the
//     same with a full or a read-only API key, see src/hc/client.js):
//       state          text/text      "On time", "Late", "Down"… (the
//                                     language of the configuration)
//       working        input/binary   0 down, 1 otherwise — green / red
//                                     badge, a Yes/No condition.
//       last_ping      text/text      day/month hours:minutes
//       next_ping      text/text      when the check turns late, "-" when
//                                     nothing is expected (down, paused, new)
//       pings          counter-sensor/integer   pings received
//       last_duration  duration/integer (s)     between the "start" and the
//                                     "success" signals, on the checks that
//                                     send a start signal
//
//   - one "Healthchecks" device for the project: checks down, late, in total.
//
// Published with should_poll: false: the integration reads Healthchecks on its
// own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { STATE_TEXT, formatTime, pick } from './texts.js';

export const CHECK_TYPE = 'check';
export const PROJECT_TYPE = 'project';
export const PROJECT_ID = 'summary';
export const MODEL = 'Healthchecks';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  STATE: 'state',
  WORKING: 'working',
  LAST_PING: 'last_ping',
  NEXT_PING: 'next_ping',
  PINGS: 'pings',
  LAST_DURATION: 'last_duration',
});

export const PROJECT_KEYS = Object.freeze({
  DOWN: 'down',
  LATE: 'late',
  TOTAL: 'total',
});

// These change at every ping: published at most every few minutes (src/hub.js).
export const VOLATILE = new Set([
  FEATURE_KEYS.LAST_PING,
  FEATURE_KEYS.NEXT_PING,
  FEATURE_KEYS.PINGS,
  FEATURE_KEYS.LAST_DURATION,
]);

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.STATE]: 'State',
    [FEATURE_KEYS.WORKING]: 'Working',
    [FEATURE_KEYS.LAST_PING]: 'Last ping',
    [FEATURE_KEYS.NEXT_PING]: 'Next ping expected',
    [FEATURE_KEYS.PINGS]: 'Pings received',
    [FEATURE_KEYS.LAST_DURATION]: 'Last run duration',
    [PROJECT_KEYS.DOWN]: 'Checks down',
    [PROJECT_KEYS.LATE]: 'Checks late',
    [PROJECT_KEYS.TOTAL]: 'Checks in total',
  },
  fr: {
    [FEATURE_KEYS.STATE]: 'État',
    [FEATURE_KEYS.WORKING]: 'Fonctionne',
    [FEATURE_KEYS.LAST_PING]: 'Dernier ping',
    [FEATURE_KEYS.NEXT_PING]: 'Prochain ping attendu',
    [FEATURE_KEYS.PINGS]: 'Pings reçus',
    [FEATURE_KEYS.LAST_DURATION]: 'Durée de la dernière exécution',
    [PROJECT_KEYS.DOWN]: 'Contrôles en panne',
    [PROJECT_KEYS.LATE]: 'Contrôles en retard',
    [PROJECT_KEYS.TOTAL]: 'Contrôles au total',
  },
  de: {
    [FEATURE_KEYS.STATE]: 'Zustand',
    [FEATURE_KEYS.WORKING]: 'Funktioniert',
    [FEATURE_KEYS.LAST_PING]: 'Letzter Ping',
    [FEATURE_KEYS.NEXT_PING]: 'Nächster Ping erwartet',
    [FEATURE_KEYS.PINGS]: 'Empfangene Pings',
    [FEATURE_KEYS.LAST_DURATION]: 'Dauer des letzten Laufs',
    [PROJECT_KEYS.DOWN]: 'Ausgefallene Checks',
    [PROJECT_KEYS.LATE]: 'Verspätete Checks',
    [PROJECT_KEYS.TOTAL]: 'Checks insgesamt',
  },
  es: {
    [FEATURE_KEYS.STATE]: 'Estado',
    [FEATURE_KEYS.WORKING]: 'Funciona',
    [FEATURE_KEYS.LAST_PING]: 'Último ping',
    [FEATURE_KEYS.NEXT_PING]: 'Próximo ping esperado',
    [FEATURE_KEYS.PINGS]: 'Pings recibidos',
    [FEATURE_KEYS.LAST_DURATION]: 'Duración de la última ejecución',
    [PROJECT_KEYS.DOWN]: 'Controles caídos',
    [PROJECT_KEYS.LATE]: 'Controles con retraso',
    [PROJECT_KEYS.TOTAL]: 'Controles en total',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_PINGS = 1_000_000_000;
export const MAX_DURATION_S = 7 * 24 * 3600;
export const MAX_CHECKS = 10_000;

/**
 * The state of a check: the API status, "started" (a start signal without its
 * end yet) shown unless the check is down, late or paused.
 * @returns {'up'|'grace'|'down'|'started'|'paused'|'new'}
 */
export function stateOf(check) {
  if (['down', 'paused', 'grace'].includes(check.status)) {
    return check.status;
  }
  if (check.started || check.status === 'started') {
    return 'started';
  }
  return check.status === 'up' ? 'up' : 'new';
}

export const checkIds = (gladys, key) => gladys.externalIds(CHECK_TYPE, key);
export const projectIds = (gladys) => gladys.externalIds(PROJECT_TYPE, PROJECT_ID);

/** The check key of a device external id, null when it is not a check of ours. */
export function parseCheckId(gladys, externalId) {
  const prefix = checkIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const key = externalId.slice(prefix.length);
  return /^[0-9a-f]{40}$/.test(key) ? key : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const counter = (name, externalId, max) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max },
  );

/** The discovery payload of a check. */
export function buildCheckDevice(gladys, check, language = 'en', timed = false) {
  const ids = checkIds(gladys, check.key);
  const names = NAMES[language] ?? NAMES.en;
  const features = [
    text(names[FEATURE_KEYS.STATE], ids.feature(FEATURE_KEYS.STATE)),
    sensor(
      names[FEATURE_KEYS.WORKING],
      ids.feature(FEATURE_KEYS.WORKING),
      DEVICE_FEATURE_CATEGORIES.INPUT,
      DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      { keep_history: true, min: 0, max: 1 },
    ),
    text(names[FEATURE_KEYS.LAST_PING], ids.feature(FEATURE_KEYS.LAST_PING)),
    text(names[FEATURE_KEYS.NEXT_PING], ids.feature(FEATURE_KEYS.NEXT_PING)),
    counter(names[FEATURE_KEYS.PINGS], ids.feature(FEATURE_KEYS.PINGS), MAX_PINGS),
  ];
  // Declared once a run was timed, and kept: Healthchecks omits a zero or
  // reset duration, the device structure must not follow it.
  if (timed || check.lastDuration !== null) {
    features.push(
      sensor(
        names[FEATURE_KEYS.LAST_DURATION],
        ids.feature(FEATURE_KEYS.LAST_DURATION),
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        { unit: DEVICE_FEATURE_UNITS.SECONDS, keep_history: true, min: 0, max: MAX_DURATION_S },
      ),
    );
  }
  const params = [];
  if (check.tags) {
    params.push({ name: 'TAGS', value: check.tags.slice(0, 255) });
  }
  return {
    name: check.name.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features,
  };
}

/** The discovery payload of the project summary. */
export function buildProjectDevice(gladys, language = 'en') {
  const ids = projectIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Healthchecks',
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [],
    features: Object.values(PROJECT_KEYS).map((key) =>
      counter(names[key], ids.feature(key), MAX_CHECKS),
    ),
  };
}

/**
 * The value of every feature of a check: `{ key, externalId, state|text }`,
 * nothing for a value that is not known.
 */
export function checkValues(gladys, check, language) {
  const ids = checkIds(gladys, check.key);
  const state = stateOf(check);
  const values = [{ key: FEATURE_KEYS.STATE, text: pick(STATE_TEXT[state], language) }];
  // Paused and new count as working: not failing (a down check paused must
  // not stay red for the whole pause).
  values.push({ key: FEATURE_KEYS.WORKING, state: state === 'down' ? 0 : 1 });
  if (check.lastPing !== null) {
    values.push({ key: FEATURE_KEYS.LAST_PING, text: formatTime(check.lastPing, language) });
  }
  // A running check's next_ping is its start: nothing to show until it ends.
  if (state !== 'started') {
    values.push({
      key: FEATURE_KEYS.NEXT_PING,
      text:
        check.nextPing !== null && ['up', 'grace'].includes(state)
          ? formatTime(check.nextPing, language)
          : '-',
    });
  }
  values.push({ key: FEATURE_KEYS.PINGS, state: check.pings });
  if (check.lastDuration !== null) {
    values.push({ key: FEATURE_KEYS.LAST_DURATION, state: check.lastDuration });
  }
  return values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}

/** The values of the project summary. */
export function projectValues(gladys, checks) {
  const ids = projectIds(gladys);
  const states = checks.map(stateOf);
  return [
    { key: PROJECT_KEYS.DOWN, state: states.filter((s) => s === 'down').length },
    { key: PROJECT_KEYS.LATE, state: states.filter((s) => s === 'grace').length },
    { key: PROJECT_KEYS.TOTAL, state: checks.length },
  ].map(({ key, state }) => ({ key, device_feature_external_id: ids.feature(key), state }));
}

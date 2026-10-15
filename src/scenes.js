// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is this check down?" is already a scene condition on the device feature.
// The reading actions are about what a condition cannot do: put the state in
// a message ("Nightly backup: down, last ping 14/10 03:12"), and count the
// checks down across the project, added to Gladys or not. Both read
// Healthchecks again when the last read is older than 15 seconds.
//
// The commands (pause, resume, ping) need the full API key: the read-only key
// gives neither the uuid nor the ping URL of a check.
// -----------------------------------------------------------------------------

import { stateOf } from './devices.js';
import { ACTION_TEXT, SENTENCE_TEXT, STATE_TEXT, formatTime, labelled, pick } from './texts.js';

// Names listed in the `names` output, at most (the rest is counted).
export const MAX_LISTED_NAMES = 20;

/** The check of the `device` field, read again if stale. */
async function checkOf(hub, fields) {
  hub.assertReadable();
  if (!hub.find(fields.device)) {
    await hub.refreshIfStale();
  }
  const check = hub.find(fields.device);
  if (!check) {
    throw new Error(pick(ACTION_TEXT.unknownCheck, hub.config.language));
  }
  return check;
}

export const SCENE_ACTIONS = {
  async get_check_status(hub, { fields = {} }) {
    await checkOf(hub, fields);
    await hub.refreshIfStale();
    hub.assertReadable();
    const language = hub.config.language;
    const check = hub.find(fields.device);
    if (!check) {
      throw new Error(pick(ACTION_TEXT.unknownCheck, language));
    }
    const state = stateOf(check);
    const stateText = pick(STATE_TEXT[state], language);
    const lastPing = check.lastPing === null ? '' : formatTime(check.lastPing, language);
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    return {
      down: state === 'down',
      state: stateText,
      name: check.name,
      last_ping: lastPing,
      sentence: `${labelled(check.name, stateText, language)}, ${
        lastPing ? words.lastPing(lastPing) : words.never
      }.`,
    };
  },

  async count_down_checks(hub) {
    hub.assertReadable();
    await hub.refreshIfStale();
    hub.assertReadable();
    const checks = [...hub.checks.values()];
    const down = checks
      .filter((check) => stateOf(check) === 'down')
      .map((check) => check.name)
      .sort((a, b) => a.localeCompare(b));
    const listed = down.slice(0, MAX_LISTED_NAMES);
    return {
      down: down.length,
      late: checks.filter((check) => stateOf(check) === 'grace').length,
      total: checks.length,
      names:
        down.length > listed.length
          ? `${listed.join(', ')}, +${down.length - listed.length}`
          : listed.join(', '),
    };
  },

  async pause_check(hub, { fields = {} }) {
    await hub.setPaused(await checkOf(hub, fields), true);
  },

  async resume_check(hub, { fields = {} }) {
    await hub.setPaused(await checkOf(hub, fields), false);
  },

  async send_ping(hub, { fields = {} }) {
    const check = await checkOf(hub, fields);
    if (!check.pingUrl) {
      throw new Error(pick(ACTION_TEXT.noPingUrl, hub.config.language));
    }
    await hub.ping(check);
  },
};

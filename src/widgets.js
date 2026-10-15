// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `healthchecks`.
//
// The use case: a glance at the wall tablet tells whether the backups and the
// other scheduled jobs ran, and which one did not. So the widget shows the
// number of checks down, late and on time, then one row per check — the
// checks down first, then the late ones, then the others — with the state
// and the last ping.
//
// Every check by default, or the ones chosen in the widget settings (devices
// added to Gladys). The figures are sent as values, not bound to device
// features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts): three tiles, one text when Healthchecks
// does not answer, one status list of ten rows at most, a Refresh button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stateOf } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, STATE_TEXT, formatTime, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 10;

export const TEXT = {
  pick: {
    en: 'Paste the API key of your Healthchecks project in the configuration of the integration.',
    fr: "Collez la clé d'API de votre projet Healthchecks dans la configuration de l'intégration.",
    de: 'Füge den API-Schlüssel deines Healthchecks-Projekts in der Konfiguration der Integration ein.',
    es: 'Pegue la clave de API de su proyecto Healthchecks en la configuración de la integración.',
  },
  empty: {
    en: 'No check yet: add one in Healthchecks.',
    fr: 'Aucun contrôle pour le moment : ajoutez-en un dans Healthchecks.',
    de: 'Noch kein Check: Füge einen in Healthchecks hinzu.',
    es: 'Todavía no hay ningún control: añada uno en Healthchecks.',
  },
  down: { en: 'Down', fr: 'En panne', de: 'Ausgefallen', es: 'Caídos' },
  late: { en: 'Late', fr: 'En retard', de: 'Verspätet', es: 'Con retraso' },
  up: { en: 'On time', fr: "À l'heure", de: 'Pünktlich', es: 'Puntuales' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otros' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Healthchecks read again.',
    fr: 'Healthchecks relu.',
    de: 'Healthchecks neu gelesen.',
    es: 'Healthchecks leído de nuevo.',
  },
};

// Row order: what needs attention first.
const SEVERITY = ['down', 'grace', 'started', 'new', 'paused', 'up'];

const ROW_STYLE = {
  down: { icon: 'x-circle', color: WIDGET_COLORS.DANGER },
  grace: { icon: 'clock', color: WIDGET_COLORS.WARNING },
  started: { icon: 'play-circle', color: WIDGET_COLORS.INFO },
  new: { icon: 'circle', color: WIDGET_COLORS.NEUTRAL },
  paused: { icon: 'pause-circle', color: WIDGET_COLORS.NEUTRAL },
  up: { icon: 'check-circle', color: WIDGET_COLORS.SUCCESS },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The checks the widget shows: the chosen devices, or every check. */
export function selectChecks(hub, settings) {
  const chosen = [settings?.checks ?? []].flat().filter((id) => typeof id === 'string' && id);
  if (chosen.length === 0) {
    return [...hub.checks.values()];
  }
  return [...new Set(chosen)].map((id) => hub.find(id)).filter(Boolean);
}

export function sortChecks(checks) {
  return [...checks].sort(
    (a, b) =>
      SEVERITY.indexOf(stateOf(a)) - SEVERITY.indexOf(stateOf(b)) || a.name.localeCompare(b.name),
  );
}

function rowValue(check, language) {
  const state = pick(STATE_TEXT[stateOf(check)], language);
  return check.lastPing === null ? state : `${state} · ${formatTime(check.lastPing, language)}`;
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const checks = sortChecks(selectChecks(hub, settings));
  if (checks.length === 0 && !hub.error) {
    return message(TEXT.empty, language);
  }

  const count = (state) => checks.filter((check) => stateOf(check) === state).length;
  const down = count('down');
  const late = count('grace');
  const components = [
    {
      type: 'value',
      value: down,
      label: pick(TEXT.down, language),
      icon: 'x-circle',
      color: down > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: late,
      label: pick(TEXT.late, language),
      icon: 'clock',
      color: late > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: count('up'),
      label: pick(TEXT.up, language),
      icon: 'check-circle',
      color: WIDGET_COLORS.SUCCESS,
    },
  ];

  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  if (checks.length > 0) {
    const shown = checks.length > MAX_ROWS ? checks.slice(0, MAX_ROWS - 1) : checks;
    const items = shown.map((check) => ({
      label: fit(check.name, 40),
      value: fit(rowValue(check, language), 40),
      ...ROW_STYLE[stateOf(check)],
    }));
    if (checks.length > shown.length) {
      items.push({
        label: pick(TEXT.more, language),
        value: `+${checks.length - shown.length}`,
        icon: 'more-horizontal',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items });
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  // A check down, late or running moves: refresh sooner.
  const moving =
    hub.error || checks.some((check) => !['up', 'paused', 'new'].includes(stateOf(check)));
  return { ttl_seconds: moving ? 30 : 60, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};

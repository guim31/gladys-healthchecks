// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, check states, the "Test the connection" report,
// scene outputs and errors, dates. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks every
// table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './hc/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noKey: {
    en: 'Paste the API key of your Healthchecks project in the configuration.',
    fr: "Collez la clé d'API de votre projet Healthchecks dans la configuration.",
    de: 'Füge den API-Schlüssel deines Healthchecks-Projekts in der Konfiguration ein.',
    es: 'Pegue la clave de API de su proyecto Healthchecks en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. https://healthchecks.io',
    fr: 'Adresse incomprise, ex. https://healthchecks.io',
    de: 'Adresse nicht verstanden, z. B. https://healthchecks.io',
    es: 'Dirección no válida, p. ej. https://healthchecks.io',
  },
};

// One short explanation per error kind (src/hc/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Healthchecks does not answer',
    fr: 'Healthchecks ne répond pas',
    de: 'Healthchecks antwortet nicht',
    es: 'Healthchecks no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused: copy it again from Settings → API Access',
    fr: "clé d'API refusée : recopiez-la depuis Settings → API Access",
    de: 'API-Schlüssel abgelehnt: Kopiere ihn erneut unter Settings → API Access',
    es: 'clave de API rechazada: cópiela de nuevo desde Settings → API Access',
  },
  [ERROR_KINDS.READ_ONLY]: {
    en: 'this needs the full API key, not the read-only one',
    fr: "il faut la clé d'API complète, pas celle en lecture seule",
    de: 'dafür ist der vollständige API-Schlüssel nötig, nicht der schreibgeschützte',
    es: 'se necesita la clave de API completa, no la de solo lectura',
  },
  [ERROR_KINDS.NOT_HC]: {
    en: 'no Healthchecks at this address',
    fr: 'aucun Healthchecks à cette adresse',
    de: 'kein Healthchecks unter dieser Adresse',
    es: 'no hay ningún Healthchecks en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this check no longer exists in Healthchecks',
    fr: "ce contrôle n'existe plus dans Healthchecks",
    de: 'dieser Check existiert in Healthchecks nicht mehr',
    es: 'este control ya no existe en Healthchecks',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The state of a check, in words (feature "State", widget rows, scene outputs).
export const STATE_TEXT = {
  up: { en: 'On time', fr: "À l'heure", de: 'Pünktlich', es: 'Puntual' },
  grace: { en: 'Late', fr: 'En retard', de: 'Verspätet', es: 'Con retraso' },
  down: { en: 'Down', fr: 'En panne', de: 'Ausgefallen', es: 'Caído' },
  started: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En ejecución' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  new: { en: 'New', fr: 'Nouveau', de: 'Neu', es: 'Nuevo' },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    checks: (count) => `${count} check(s)`,
    down: (count) => `${count} down`,
    late: (count) => `${count} late`,
    readOnly: 'read-only key: pause, resume and ping unavailable',
  },
  fr: {
    ok: 'Connecté',
    checks: (count) => `${count} contrôle(s)`,
    down: (count) => `${count} en panne`,
    late: (count) => `${count} en retard`,
    readOnly: 'clé en lecture seule : pause, reprise et ping indisponibles',
  },
  de: {
    ok: 'Verbunden',
    checks: (count) => `${count} Check(s)`,
    down: (count) => `${count} ausgefallen`,
    late: (count) => `${count} verspätet`,
    readOnly: 'schreibgeschützter Schlüssel: Pausieren, Fortsetzen und Ping nicht möglich',
  },
  es: {
    ok: 'Conectado',
    checks: (count) => `${count} control(es)`,
    down: (count) => `${count} caído(s)`,
    late: (count) => `${count} con retraso`,
    readOnly: 'clave de solo lectura: pausa, reanudación y ping no disponibles',
  },
};

// Errors and results of the scene actions (shown in Gladys).
export const ACTION_TEXT = {
  unknownCheck: {
    en: 'This device is not a Healthchecks check.',
    fr: "Cet appareil n'est pas un contrôle Healthchecks.",
    de: 'Dieses Gerät ist kein Healthchecks-Check.',
    es: 'Este dispositivo no es un control de Healthchecks.',
  },
  noPingUrl: {
    en: 'No ping URL for this check: it needs the full API key.',
    fr: "Pas d'URL de ping pour ce contrôle : il faut la clé d'API complète.",
    de: 'Keine Ping-URL für diesen Check: Dafür ist der vollständige API-Schlüssel nötig.',
    es: 'No hay URL de ping para este control: se necesita la clave de API completa.',
  },
};

// The `sentence` output of "State of a check".
export const SENTENCE_TEXT = {
  en: { lastPing: (time) => `last ping ${time}`, never: 'never pinged' },
  fr: { lastPing: (time) => `dernier ping ${time}`, never: 'jamais pingé' },
  de: { lastPing: (time) => `letzter Ping ${time}`, never: 'noch nie gepingt' },
  es: { lastPing: (time) => `último ping ${time}`, never: 'nunca ha recibido un ping' },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/**
 * A date as day/month hours:minutes, in the time zone of Gladys (the
 * supervisor injects TZ). Day and month: a weekly job pinged six days ago is
 * not "today at 20:39".
 */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Healthchecks project: healthchecks.io or a self-hosted server, and the
// API key of the project (read-only, or full for pause, resume and ping).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_URL = 'https://healthchecks.io';

export const DEFAULT_CONFIG = {
  url: DEFAULT_URL,
  api_key: '',
  poll_interval: '60',
  language: 'fr',
};

// Pages of the Healthchecks interface: a URL copied from the browser points at
// one of them, the API lives at the root.
const INTERFACE_PATH = /\/(projects|checks|accounts|integrations|docs|api|badges)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8000`), or a URL copied from the browser
 * (`https://healthchecks.io/projects/…/checks/`). HTTP by default for a bare
 * host. A path is kept (a server behind a reverse proxy sub-path), the
 * interface pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** healthchecks.io itself (and its regional hosts): the cloud. */
export const isCloud = (url) =>
  /^https?:\/\/([a-z0-9-]+\.)*healthchecks\.io(:\d+)?(\/|$)/i.test(url);

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const typed = text('url') || DEFAULT_URL;
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url: parseServerUrl(typed),
    // A pasted key often carries a trailing space or new line.
    apiKey: text('api_key'),
    pollIntervalMs: Number(pollInterval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

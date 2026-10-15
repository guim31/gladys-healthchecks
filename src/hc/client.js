// -----------------------------------------------------------------------------
// Healthchecks client: the Management API v3 of healthchecks.io and of the
// self-hosted server (same code, BSD-3), authenticated by the API key of a
// project in the `X-Api-Key` header.
//
//   GET  /api/v3/checks/                the checks of the project
//   POST /api/v3/checks/<uuid>/pause    full key only
//   POST /api/v3/checks/<uuid>/resume   full key only
//   GET  <ping_url>                     "success" signal, no key (the ping URL
//                                        is the secret)
//
// A read-only key lists the checks without their uuid, ping and pause URLs,
// with a `unique_key` instead: sha1 of the first 16 hex digits of the uuid
// (hc/api/models.py), computed here from the uuid with a full key, so a check
// keeps its device when the user switches keys.
//
// Redirects are not followed: the key would be sent to wherever the address
// points (an http:// address redirected to https:// is reported instead).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key refused (or missing)
  READ_ONLY: 'read_only', // a write needs the full API key
  NOT_HC: 'not_hc', // something answers, not the Healthchecks API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  NOT_FOUND: 'not_found', // the check no longer exists
  HTTP: 'http', // any other HTTP error
});

export class HcError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'HcError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Healthchecks
 * (test/helpers/fakeHc.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(url, { method = 'GET', headers = {}, timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  return { status: response.status, body: await response.text() };
}

/** sha1 of the first 16 hex digits of the uuid, as Healthchecks computes `unique_key`. */
export const uniqueKeyOf = (uuid) =>
  createHash('sha1').update(uuid.replace(/-/g, '').slice(0, 16)).digest('hex');

const STATUSES = new Set(['new', 'up', 'grace', 'down', 'paused', 'started']);

const dateOf = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

/**
 * One check of the API, normalized; null when it cannot be identified.
 * @returns {object|null} { key, uuid, name, tags, status, started, lastPing,
 *   nextPing, lastDuration, pings, pingUrl }
 */
export function normalizeCheck(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const uuid =
    typeof raw.uuid === 'string' && /^[0-9a-f-]{32,36}$/i.test(raw.uuid) ? raw.uuid : null;
  const key = uuid
    ? uniqueKeyOf(uuid.toLowerCase())
    : typeof raw.unique_key === 'string' && /^[0-9a-f]{40}$/.test(raw.unique_key)
      ? raw.unique_key
      : null;
  if (!key) {
    return null;
  }
  const name =
    (typeof raw.name === 'string' && raw.name.trim()) ||
    (typeof raw.slug === 'string' && raw.slug.trim()) ||
    key.slice(0, 8);
  return {
    key,
    uuid,
    name,
    tags: typeof raw.tags === 'string' ? raw.tags.trim() : '',
    status: STATUSES.has(raw.status) ? raw.status : 'new',
    started: raw.started === true,
    lastPing: dateOf(raw.last_ping),
    nextPing: dateOf(raw.next_ping),
    lastDuration: Number.isFinite(raw.last_duration) ? Math.max(0, raw.last_duration) : null,
    pings: Number.isFinite(raw.n_pings) ? raw.n_pings : 0,
    pingUrl:
      typeof raw.ping_url === 'string' && /^https?:\/\//.test(raw.ping_url) ? raw.ping_url : null,
  };
}

export class HcClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.apiKey project API key
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, apiKey, request = httpRequest, timeoutMs = 10_000 }) {
    this.url = url;
    this.apiKey = apiKey;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  async call(url, { method = 'GET', key = true } = {}) {
    try {
      return await this.request(url, {
        method,
        headers: key ? { 'X-Api-Key': this.apiKey, accept: 'application/json' } : {},
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new HcError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new HcError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
  }

  check(response, { write = false } = {}) {
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new HcError(
        write ? ERROR_KINDS.READ_ONLY : ERROR_KINDS.AUTH,
        write ? `Write refused (HTTP ${status})` : `API key refused (HTTP ${status})`,
        { status },
      );
    }
    if (status >= 300 && status < 400) {
      throw new HcError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new HcError(
        write ? ERROR_KINDS.NOT_FOUND : ERROR_KINDS.NOT_HC,
        write ? 'Check not found (HTTP 404)' : 'No Healthchecks API at this address (HTTP 404)',
        { status },
      );
    }
    if (status < 200 || status >= 300) {
      throw new HcError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
  }

  /**
   * The checks of the project.
   * @returns {Promise<{ checks: object[], readOnly: boolean }>}
   * @throws {HcError}
   */
  async checks() {
    const response = await this.call(`${this.url}/api/v3/checks/`);
    this.check(response);
    let data;
    try {
      data = JSON.parse(response.body);
    } catch {
      data = null;
    }
    if (!data || !Array.isArray(data.checks)) {
      throw new HcError(ERROR_KINDS.NOT_HC, 'The answer is not a Healthchecks check list');
    }
    const raw = data.checks.filter((item) => item && typeof item === 'object');
    const checks = raw.map(normalizeCheck).filter(Boolean);
    // A read-only key hides the uuids; an empty project tells nothing.
    const readOnly = raw.length > 0 && raw.every((item) => typeof item.uuid !== 'string');
    return { checks, readOnly };
  }

  /** Pause or resume a check (full key). */
  async setPaused(uuid, paused) {
    const response = await this.call(
      `${this.url}/api/v3/checks/${encodeURIComponent(uuid)}/${paused ? 'pause' : 'resume'}`,
      { method: 'POST' },
    );
    // Resuming a check that is not paused: 409, nothing to do.
    if (response.status === 409) {
      return;
    }
    this.check(response, { write: true });
  }

  /**
   * Send the "success" signal of a check (its ping URL holds the secret, no
   * key). POST: a check set to "POST only" ignores a GET.
   */
  async ping(pingUrl) {
    const response = await this.call(pingUrl, { method: 'POST', key: false });
    if (response.status < 200 || response.status >= 300) {
      // The ping URL comes from the server (PING_ENDPOINT), not from the key.
      throw new HcError(ERROR_KINDS.HTTP, `Ping refused (HTTP ${response.status})`, {
        status: response.status,
      });
    }
  }
}

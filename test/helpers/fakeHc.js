// -----------------------------------------------------------------------------
// An in-memory Healthchecks: its checks rendered like the Management API v3
// (hc/api/models.py `to_dict`, checked against the real answers of
// test/fixtures/healthchecks in test/client.test.js): uuid and URLs with the
// full key, `unique_key` instead with the read-only one, `last_duration` only
// once a start signal was timed. Pause, resume and ping change the checks.
// -----------------------------------------------------------------------------

import { uniqueKeyOf } from '../../src/hc/client.js';

export const BASE = 'http://192.0.2.10:8000';
export const FULL_KEY = 'fullkeyfullkeyfullkeyfullkey1234';
export const READ_KEY = 'readkeyreadkeyreadkeyreadkey1234';

let next = 1;

/** A check of the fake: up, pinged an hour ago, every day. */
export function check(fields = {}) {
  const n = next++;
  return {
    uuid: `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
    name: `Job ${n}`,
    tags: '',
    status: 'up',
    started: false,
    last_ping: '2026-10-15T09:00:00+00:00',
    next_ping: '2026-10-16T09:00:00+00:00',
    n_pings: 10,
    last_duration: undefined,
    ...fields,
  };
}

export const keyOf = (item) => uniqueKeyOf(item.uuid);

export class FakeHc {
  constructor({ checks } = {}) {
    this.checks = checks ?? [
      check({ name: 'Nightly backup', tags: 'backup nas', last_duration: 420 }),
      check({ name: 'Certbot renew' }),
      check({ name: 'Never pinged', status: 'new', last_ping: null, next_ping: null, n_pings: 0 }),
    ];
    /** 'down': the server does not answer; a number: that HTTP status. */
    this.failure = null;
    this.requests = [];
  }

  get(name) {
    return this.checks.find((item) => item.name === name);
  }

  set(name, fields) {
    Object.assign(this.get(name), fields);
  }

  render(item, full) {
    const out = {
      name: item.name,
      slug: '',
      tags: item.tags,
      desc: '',
      grace: 3600,
      n_pings: item.n_pings,
      status: item.status,
      started: item.started,
      last_ping: item.last_ping,
      next_ping: item.next_ping,
      manual_resume: false,
      methods: '',
    };
    if (item.last_duration !== undefined) {
      out.last_duration = item.last_duration;
    }
    if (full) {
      out.uuid = item.uuid;
      out.ping_url = `${BASE}/ping/${item.uuid}`;
      out.update_url = `${BASE}/api/v3/checks/${item.uuid}`;
      out.pause_url = `${out.update_url}/pause`;
      out.resume_url = `${out.update_url}/resume`;
    } else {
      out.unique_key = keyOf(item);
    }
    out.timeout = 86400;
    return out;
  }

  /** The request seam of src/hc/client.js. */
  request = async (url, { method = 'GET', headers = {} } = {}) => {
    this.requests.push({ url, method, headers });
    if (this.failure === 'down') {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ECONNREFUSED' };
      throw error;
    }
    if (typeof this.failure === 'number') {
      return { status: this.failure, body: '' };
    }
    const json = (status, body) => ({ status, body: JSON.stringify(body) });
    const path = url.slice(BASE.length);
    const ping = path.match(/^\/ping\/([0-9a-f-]+)$/);
    if (ping) {
      const item = this.checks.find((c) => c.uuid === ping[1]);
      if (!item) {
        return { status: 404, body: 'not found' };
      }
      Object.assign(item, { status: 'up', started: false, n_pings: item.n_pings + 1 });
      item.last_ping = '2026-10-15T10:00:00+00:00';
      return { status: 200, body: 'OK' };
    }
    const key = headers['X-Api-Key'];
    if (key !== FULL_KEY && key !== READ_KEY) {
      return json(401, { error: 'wrong api key' });
    }
    if (path === '/api/v3/checks/' && method === 'GET') {
      return json(200, { checks: this.checks.map((c) => this.render(c, key === FULL_KEY)) });
    }
    const write = path.match(/^\/api\/v3\/checks\/([0-9a-f-]+)\/(pause|resume)$/);
    if (write && method === 'POST') {
      if (key !== FULL_KEY) {
        return json(401, { error: 'wrong api key' });
      }
      const item = this.checks.find((c) => c.uuid === write[1]);
      if (!item) {
        return { status: 404, body: '<html>Not Found</html>' };
      }
      if (write[2] === 'pause') {
        Object.assign(item, { status: 'paused', next_ping: null });
      } else if (item.status !== 'paused') {
        return json(409, { error: 'check is not paused' });
      } else {
        Object.assign(item, { status: 'new', next_ping: null });
      }
      return json(200, this.render(item, true));
    }
    return { status: 404, body: '<html>Not Found</html>' };
  };
}

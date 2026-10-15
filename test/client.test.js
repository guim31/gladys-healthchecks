// -----------------------------------------------------------------------------
// The Healthchecks client on the real answers of Healthchecks v4.4
// (test/fixtures/healthchecks), its errors, and the configuration parser.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ERROR_KINDS, HcClient, normalizeCheck, uniqueKeyOf } from '../src/hc/client.js';
import { isCloud, normalizeConfig, parseServerUrl } from '../src/config.js';
import { stateOf } from '../src/devices.js';
import { BASE, FULL_KEY, FakeHc, READ_KEY } from './helpers/fakeHc.js';

const fixture = async (name) =>
  readFile(new URL(`./fixtures/healthchecks/${name}`, import.meta.url), 'utf8');
const full = await fixture('v3-full-key.json');
const readOnly = await fixture('v3-read-only-key.json');

const clientOn = (response, apiKey = FULL_KEY) =>
  new HcClient({
    url: BASE,
    apiKey,
    request: async () => (response instanceof Error ? Promise.reject(response) : response),
  });

test('a full and a read-only key give the same checks, keyed alike', async () => {
  const a = await clientOn({ status: 200, body: full }).checks();
  const b = await clientOn({ status: 200, body: readOnly }).checks();
  assert.equal(a.readOnly, false);
  assert.equal(b.readOnly, true);
  assert.equal(a.checks.length, 6);
  assert.deepEqual(
    a.checks.map((c) => c.key),
    b.checks.map((c) => c.key),
  );
  // The unique_key Healthchecks computed, from the uuid.
  const raw = JSON.parse(readOnly).checks[0].unique_key;
  assert.equal(uniqueKeyOf(JSON.parse(full).checks[0].uuid), raw);
  assert.ok(a.checks.every((c) => c.uuid && c.pingUrl));
  assert.ok(b.checks.every((c) => c.uuid === null && c.pingUrl === null));
});

test('the states of the fixture: on time, late, down, new, paused, running', async () => {
  const { checks } = await clientOn({ status: 200, body: full }).checks();
  const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.deepEqual(Object.fromEntries(checks.map((c) => [c.name, stateOf(c)])), {
    'Nightly backup': 'grace',
    'Certbot renew': 'down',
    'Never pinged': 'new',
    'Paused job': 'paused',
    'Hourly sync': 'up',
    'Long export': 'started',
  });
  assert.equal(byName['Nightly backup'].lastDuration, 7);
  assert.equal(byName['Nightly backup'].tags, 'backup nas');
  assert.equal(byName['Certbot renew'].lastDuration, null);
  assert.equal(byName['Never pinged'].lastPing, null);
  assert.equal(byName['Hourly sync'].nextPing, Date.parse('2026-10-15T18:41:28+00:00'));
});

test('the fake Healthchecks renders the fields of the real one', async () => {
  const realFull = JSON.parse(full).checks[0];
  const realReadOnly = JSON.parse(readOnly).checks[0];
  const hc = new FakeHc();
  const fake = (key) =>
    hc
      .request(`${BASE}/api/v3/checks/`, { headers: { 'X-Api-Key': key } })
      .then((r) => JSON.parse(r.body).checks[0]);
  const used = (item) =>
    Object.keys(item).filter((key) =>
      ['uuid', 'unique_key', 'name', 'tags', 'status', 'started', 'last_ping', 'next_ping']
        .concat(['n_pings', 'last_duration', 'ping_url', 'pause_url', 'resume_url'])
        .includes(key),
    );
  assert.deepEqual(used(await fake(FULL_KEY)).sort(), used(realFull).sort());
  assert.deepEqual(used(await fake(READ_KEY)).sort(), used(realReadOnly).sort());
});

test('a check without uuid nor unique_key is left out; a nameless one gets its slug', () => {
  assert.equal(normalizeCheck({ name: 'x' }), null);
  assert.equal(normalizeCheck(null), null);
  const slug = normalizeCheck({ name: '', slug: 'my-job', unique_key: 'a'.repeat(40) });
  assert.equal(slug.name, 'my-job');
  assert.equal(normalizeCheck({ status: 'weird', unique_key: 'a'.repeat(40) }).status, 'new');
});

test('errors by kind, never with the key in the message', async () => {
  const cases = [
    [{ status: 401, body: '{"error": "wrong api key"}' }, ERROR_KINDS.AUTH],
    [{ status: 404, body: '<html></html>' }, ERROR_KINDS.NOT_HC],
    [{ status: 200, body: '<html></html>' }, ERROR_KINDS.NOT_HC],
    [{ status: 200, body: '{"foo": 1}' }, ERROR_KINDS.NOT_HC],
    [{ status: 301, body: '' }, ERROR_KINDS.REDIRECT],
    [{ status: 500, body: '' }, ERROR_KINDS.HTTP],
    [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), 'unreachable'],
    [
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' },
      }),
      ERROR_KINDS.TLS,
    ],
    [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), ERROR_KINDS.UNREACHABLE],
  ];
  for (const [response, kind] of cases) {
    await assert.rejects(clientOn(response).checks(), (err) => {
      assert.equal(err.kind, kind);
      assert.ok(!err.message.includes(FULL_KEY));
      return true;
    });
  }
});

test('writes: the read-only key is refused, a resume of a running check is fine', async () => {
  const hc = new FakeHc();
  const uuid = hc.checks[0].uuid;
  const ro = new HcClient({ url: BASE, apiKey: READ_KEY, request: hc.request });
  await assert.rejects(ro.setPaused(uuid, true), { kind: ERROR_KINDS.READ_ONLY });
  const client = new HcClient({ url: BASE, apiKey: FULL_KEY, request: hc.request });
  await client.setPaused(uuid, false); // 409: not paused
  await client.setPaused(uuid, true);
  assert.equal(hc.checks[0].status, 'paused');
  await assert.rejects(client.setPaused('00000000-0000-4000-8000-ffffffffffff', true), {
    kind: ERROR_KINDS.NOT_FOUND,
  });
  // The ping goes without the API key: its URL is the secret.
  await client.ping(`${BASE}/ping/${uuid}`);
  assert.deepEqual(hc.requests.at(-1).headers, {});
  assert.equal(hc.checks[0].status, 'up');
});

test('the address: a bare host, a copied page, credentials refused, the cloud recognized', () => {
  assert.equal(parseServerUrl('192.0.2.10:8000'), 'http://192.0.2.10:8000');
  assert.equal(
    parseServerUrl('https://healthchecks.io/projects/abc/checks/'),
    'https://healthchecks.io',
  );
  assert.equal(parseServerUrl('https://example.com/hc/'), 'https://example.com/hc');
  assert.equal(parseServerUrl('https://user:pw@example.com'), null);
  assert.equal(parseServerUrl('ftp://example.com'), null);
  assert.ok(isCloud('https://healthchecks.io'));
  assert.ok(!isCloud('https://healthchecks.io.example.com'));
  assert.ok(!isCloud('http://192.0.2.10:8000'));
  assert.deepEqual(normalizeConfig({}), {
    url: 'https://healthchecks.io',
    apiKey: '',
    pollIntervalMs: 60_000,
    language: 'fr',
  });
  assert.equal(normalizeConfig({ poll_interval: '300', api_key: ' k \n' }).pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ api_key: ' k \n' }).apiKey, 'k');
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
});

// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Healthchecks: discovery,
// states, transitions and scene events, persistence across restarts, errors,
// quiet logs, and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS, PROJECT_KEYS, projectIds } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  BASE,
  FULL_KEY,
  FakeHc,
  READ_KEY,
  createClock,
  createDevices,
  createWorld,
  idsOf,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);

test('one device per check and one for the project, proposed in Discovery, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Healthchecks', 'Nightly backup', 'Certbot renew', 'Never pinged'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  const backup = devices[1];
  assert.ok(backup.features.some((f) => f.external_id.endsWith(FEATURE_KEYS.LAST_DURATION)));
  assert.ok(!devices[2].features.some((f) => f.external_id.endsWith(FEATURE_KEYS.LAST_DURATION)));
  assert.deepEqual(backup.params, [{ name: 'TAGS', value: 'backup nas' }]);
  // Nothing is published for devices not added.
  assert.equal(world.fake.states.length, 0);
  assert.deepEqual(world.fake.connectionStatus.connected, true);
});

test('the states of an added device, at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const ids = idsOf(world, 'Nightly backup');
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.STATE)), 'On time');
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.WORKING)), 1);
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.PINGS)), 10);
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.LAST_DURATION)), 420);
  assert.match(world.fake.lastState(ids.feature(FEATURE_KEYS.LAST_PING)), /^15\/10.*\d\d:00$/);
  assert.match(world.fake.lastState(ids.feature(FEATURE_KEYS.NEXT_PING)), /^16\/10/);
  const never = idsOf(world, 'Never pinged');
  assert.equal(world.fake.lastState(never.feature(FEATURE_KEYS.STATE)), 'New');
  assert.equal(world.fake.lastState(never.feature(FEATURE_KEYS.WORKING)), undefined);
  assert.equal(world.fake.lastState(never.feature(FEATURE_KEYS.LAST_PING)), undefined);
  assert.equal(world.fake.lastState(never.feature(FEATURE_KEYS.NEXT_PING)), '-');
  const project = projectIds(world.gladys);
  assert.equal(world.fake.lastState(project.feature(PROJECT_KEYS.TOTAL)), 3);
  assert.equal(world.fake.lastState(project.feature(PROJECT_KEYS.DOWN)), 0);
  assert.deepEqual(
    [...new Set(world.fake.transports.map((entry) => entry.transport))],
    ['local'],
    'a self-hosted server is local',
  );

  const before = world.fake.states.length;
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');
});

test('last ping and pings are sent at most every 5 minutes, a state change at once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const ids = idsOf(world, 'Certbot renew');
  world.hc.set('Certbot renew', { n_pings: 11, last_ping: '2026-10-15T09:30:00+00:00' });
  world.clock.advance(60_000);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.PINGS)), 10);
  world.clock.advance(4 * 60_000);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.PINGS)), 11);
  world.hc.set('Certbot renew', { status: 'down', n_pings: 12, next_ping: null });
  world.clock.advance(60_000);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.WORKING)), 0);
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.STATE)), 'Down');
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.PINGS)), 12);
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.NEXT_PING)), '-');
  assert.equal(world.fake.lastState(projectIds(world.gladys).feature(PROJECT_KEYS.DOWN)), 1);
});

test('a hundred checks pinging every minute stay under 300 states per minute', async (t) => {
  const hc = new FakeHc({ checks: [] });
  const { check } = await import('./helpers/fakeHc.js');
  for (let i = 0; i < 100; i += 1) {
    hc.checks.push(check({ name: `Job ${i}` }));
  }
  const world = await createWorld({ hc });
  t.after(() => world.app.stop());
  await createDevices(world);
  const start = world.fake.states.length;
  for (let minute = 1; minute <= 10; minute += 1) {
    for (const item of hc.checks) {
      item.n_pings += 1;
      item.last_ping = new Date(world.clock.time).toISOString();
    }
    world.clock.advance(60_000);
    await world.hub.pollNow();
  }
  const perMinute = (world.fake.states.length - start) / 10;
  assert.ok(perMinute < 300, `${perMinute} states per minute`);
});

test('"a check is late", "goes down", "is back up" with the outage, for any check', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.hc.set('Certbot renew', { status: 'grace' });
  await world.hub.pollNow();
  world.clock.advance(30 * 60_000);
  world.hc.set('Certbot renew', { status: 'down' });
  await world.hub.pollNow();
  world.clock.advance(90 * 60_000);
  world.hc.set('Certbot renew', { status: 'up' });
  await world.hub.pollNow();
  const device = idsOf(world, 'Certbot renew').device;
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => [event.key, event.data.device, event.data.check]),
    [
      [TRIGGERS.LATE, device, 'Certbot renew'],
      [TRIGGERS.DOWN, device, 'Certbot renew'],
      [TRIGGERS.UP, device, 'Certbot renew'],
    ],
  );
  assert.equal(events(world, TRIGGERS.UP)[0].data.downtime_minutes, 90);
});

test('no event at the first read, nor for new, paused, resumed or running checks', async (t) => {
  const hc = new FakeHc();
  hc.set('Certbot renew', { status: 'down' });
  const world = await createWorld({ hc });
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0);
  hc.set('Nightly backup', { started: true });
  await world.hub.pollNow();
  hc.set('Nightly backup', { status: 'paused', started: false });
  await world.hub.pollNow();
  hc.set('Nightly backup', { status: 'new' });
  await world.hub.pollNow();
  hc.set('Nightly backup', { status: 'up' });
  await world.hub.pollNow();
  hc.set('Never pinged', { status: 'up' });
  await world.hub.pollNow();
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a check that went down during a restart is announced once, the outage counted from before', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  await first.app.stop();
  first.hc.set('Certbot renew', { status: 'down' });
  const second = await createWorld({ clock, hc: first.hc, dataDir: first.dataDir });
  assert.deepEqual(
    second.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.DOWN],
  );
  await second.app.stop();
  clock.advance(10 * 60_000);
  first.hc.set('Certbot renew', { status: 'up' });
  const third = await createWorld({ clock, hc: first.hc, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.deepEqual(
    third.fake.sceneEvents.map((e) => [e.key, e.data.downtime_minutes]),
    [[TRIGGERS.UP, 10]],
  );
});

test('Healthchecks unreachable: status, badges, one warning, no check event', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.hc.failure = 'down';
  const lines = await captureLogs(t, 'info', async () => {
    await world.hub.pollNow();
    await world.hub.pollNow();
    await world.hub.pollNow();
  });
  assert.equal(lines.length, 1, 'one line for an outage, not one per read');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'Healthchecks does not answer');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.deepEqual(world.fake.sceneEvents, []);
  world.hc.failure = null;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});

test('a refused key and a missing key are reported in the status', async (t) => {
  const bad = await createWorld({ config: { url: BASE, api_key: 'nope', language: 'fr' } });
  t.after(() => bad.app.stop());
  assert.equal(bad.fake.connectionStatus.connected, false);
  assert.match(bad.fake.connectionStatus.message.fr, /clé d'API refusée/);
  const none = await createWorld({ config: { url: BASE } });
  t.after(() => none.app.stop());
  assert.equal(none.fake.connectionStatus.connected, false);
  assert.match(none.fake.connectionStatus.message.en, /Paste the API key/);
  assert.equal(none.hc.requests.length, 0);
  assert.deepEqual(none.fake.discoveredDevices, []);
});

test('healthchecks.io is the cloud', async (t) => {
  const hc = new FakeHc();
  const cloud = 'https://healthchecks.io';
  const request = (url, options) => hc.request(url.replace(cloud, BASE), options);
  const world = await createWorld({
    hc: { ...hc, request },
    config: { url: cloud, api_key: FULL_KEY },
  });
  t.after(() => world.app.stop());
  await createDevices(world, (device) => device.name === 'Healthchecks');
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: projectIds(world.gladys).device,
    transport: 'cloud',
  });
});

test('a read-only key: same devices as the full key, commands refused clearly', async (t) => {
  const hc = new FakeHc();
  const fullWorld = await createWorld({ hc });
  await fullWorld.app.stop();
  const world = await createWorld({ hc, config: { url: BASE, api_key: READ_KEY, language: 'en' } });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    fullWorld.fake.discoveredDevices.map((d) => d.external_id),
  );
  const device = idsOf(world, 'Nightly backup').device;
  for (const key of ['pause_check', 'resume_check']) {
    const ack = await world.fake.sceneAction(key, { device });
    assert.equal(ack.success, false);
    assert.match(ack.error, /full API key/);
  }
  const ping = await world.fake.sceneAction('send_ping', { device });
  assert.match(ping.error, /full API key/);
  const report = await world.fake.action('test_connection');
  assert.match(report.data.message.en, /read-only key/);
});

test('pause, resume and ping a check from a scene', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const device = idsOf(world, 'Nightly backup').device;
  assert.equal((await world.fake.sceneAction('pause_check', { device })).success, true);
  assert.equal(world.hc.get('Nightly backup').status, 'paused');
  assert.equal(world.fake.lastState(idsOf(world, 'Nightly backup').feature('state')), 'Paused');
  assert.equal((await world.fake.sceneAction('resume_check', { device })).success, true);
  assert.equal(world.hc.get('Nightly backup').status, 'new');
  assert.equal((await world.fake.sceneAction('send_ping', { device })).success, true);
  assert.equal(world.hc.get('Nightly backup').status, 'up');
  assert.deepEqual(world.fake.sceneEvents, [], 'no event in answer to an action');
  const unknown = await world.fake.sceneAction('pause_check', { device: 'nope' });
  assert.match(unknown.error, /not a Healthchecks check/);
});

test('"State of a check" and "Count the checks down", in the language of the configuration', async (t) => {
  const hc = new FakeHc();
  hc.set('Certbot renew', { status: 'down' });
  hc.set('Never pinged', { status: 'grace' });
  const world = await createWorld({ hc, config: { url: BASE, api_key: FULL_KEY, language: 'fr' } });
  t.after(() => world.app.stop());
  const state = await world.fake.sceneAction('get_check_status', {
    device: idsOf(world, 'Certbot renew').device,
  });
  assert.equal(state.data.outputs.down, true);
  assert.equal(state.data.outputs.state, 'En panne');
  assert.match(state.data.outputs.sentence, /^Certbot renew : En panne, dernier ping 15\/10/);
  const never = await world.fake.sceneAction('get_check_status', {
    device: idsOf(world, 'Never pinged').device,
  });
  assert.match(never.data.outputs.sentence, /jamais pingé\.$/);
  assert.equal(never.data.outputs.last_ping, '');
  const count = await world.fake.sceneAction('count_down_checks', {});
  assert.deepEqual(count.data.outputs, { down: 1, late: 1, total: 3, names: 'Certbot renew' });
});

test('the widget: checks down first, then late, then the others; a Refresh button', async (t) => {
  const hc = new FakeHc();
  hc.set('Never pinged', { status: 'down' });
  hc.set('Nightly backup', { status: 'grace' });
  const world = await createWorld({ hc });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.success, true, ack.error);
  const { components } = ack.data.content;
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Down', 1],
      ['Late', 1],
      ['On time', 1],
    ],
  );
  const rows = components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.label),
    ['Never pinged', 'Nightly backup', 'Certbot renew'],
  );
  assert.match(rows[1].value, /^Late · 15\/10/);
  assert.equal(components.at(-1).action.key, 'refresh');
  const refreshed = await world.fake.widgetAction(WIDGET_KEY, 'refresh');
  assert.equal(refreshed.success, true);

  // Chosen devices only.
  const chosen = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { checks: [idsOf(world, 'Certbot renew').device] },
  });
  assert.deepEqual(
    chosen.data.content.components.find((c) => c.type === 'status').items.map((r) => r.label),
    ['Certbot renew'],
  );
});

test('the widget says what to do without key, and when Healthchecks does not answer', async (t) => {
  const none = await createWorld({ config: { url: BASE } });
  t.after(() => none.app.stop());
  const empty = await none.fake.widgetGet(WIDGET_KEY, { language: 'fr' });
  assert.match(empty.data.content.components[0].text, /Collez la clé d'API/);
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.hc.failure = 'down';
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, { language: 'en' });
  assert.ok(ack.data.content.components.some((c) => c.text === 'Healthchecks does not answer'));
});

test('a device added later gets its states at once, and the widget refreshes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const refreshes = world.fake.widgetRefreshes.length;
  await createDevices(world, (device) => device.name === 'Certbot renew');
  assert.equal(world.fake.lastState(idsOf(world, 'Certbot renew').feature('state')), 'On time');
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
});

test('a new language renames the devices proposed; a deleted check leaves', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: BASE, api_key: FULL_KEY, language: 'de' });
  assert.ok(
    world.fake.discoveredDevices[1].features.some((f) => f.name === 'Letzter Ping'),
    'German names',
  );
  world.hc.checks.pop();
  await world.hub.pollNow();
  assert.equal(world.fake.discoveredDevices.length, 3);
});

test('Gladys restarted: everything is sent again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const before = world.fake.states.length;
  await world.hub.resync(world.hub.config);
  assert.ok(world.fake.states.length > before);
});

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const sent = world.fake.states.length;
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      world.hc.set('Certbot renew', { n_pings: 11 + cycle, started: cycle % 2 === 0 });
      world.clock.advance(5 * 60_000);
      await world.hub.pollNow();
    }
  });
  assert.ok(world.fake.states.length > sent, 'states were published');
  assert.deepEqual(lines, []);
});

test('the internal timer reads Healthchecks and publishes the changes, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  await createDevices(world);
  const reads = world.hc.requests.length;
  world.hc.set('Certbot renew', { status: 'down' });
  t.mock.timers.tick(60_000);
  // Let the read and the publications settle.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(world.hc.requests.length > reads);
  assert.equal(world.fake.lastState(idsOf(world, 'Certbot renew').feature('working')), 0);
});

// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Healthchecks, a
// temporary /data and a manual clock, with the integration wired on top
// through registerHandlers. No timer runs: the tests read Healthchecks with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-uptime-kuma.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { checkIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { BASE, FULL_KEY, FakeHc, READ_KEY, check, keyOf } from './fakeHc.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 15, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  hc = new FakeHc(),
  config = { url: BASE, api_key: FULL_KEY, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-healthchecks-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: hc.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, hc, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of a check of the fake, by name. */
export const idsOf = (world, name) => checkIds(world.gladys, keyOf(world.hc.get(name)));

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { BASE, FULL_KEY, FakeHc, READ_KEY, check, keyOf };

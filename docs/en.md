# Healthchecks

[Healthchecks](https://healthchecks.io/) watches your scheduled jobs: a cron
task, a backup, a certificate renewal or any script "pings" a URL when it runs,
and Healthchecks raises the alarm when the ping does not come. This integration
brings the checks of a Healthchecks project into Gladys, whether you use
healthchecks.io or your own server: each check becomes a device with its state,
its last ping and the next one expected. Scenes can react when **any** check
goes down, is late or comes back, a dashboard widget lists the checks down
first, and scenes can pause, resume or ping a check.

Tested against a real self-hosted Healthchecks v4.4 (Docker); not yet on
healthchecks.io itself: feedback welcome on
[the issues](https://github.com/guim31/gladys-healthchecks/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Healthchecks project: on [healthchecks.io](https://healthchecks.io/) (free
  plan included) or on your own Healthchecks server, reachable from the Gladys
  machine.
- An API key of the project. The **read-only** key is enough to follow the
  checks; the **full** key also allows pause, resume and "Send a ping".

The integration reads one request per refresh interval (one minute by default):
far below what healthchecks.io accepts.

## Getting started

### 1. Create an API key

In Healthchecks, open your project, then **Settings** → **API Access** →
**Create API Keys**. Two keys appear: the full one ("API key") and the
read-only one. Copy the one you want: Healthchecks shows it again later, but
keep it private.

### 2. Configure the integration

In Gladys, open **Integrations → Healthchecks → Configuration**:

- **Healthchecks address**: `https://healthchecks.io` (default), or the address
  of your server, the one of its `SITE_ROOT` setting (for example
  `http://192.168.1.2:8000`).
- **API key**: the key copied above.
- **Refresh interval**: from 30 seconds to 5 minutes.
- **Language of the names**: language of the feature names, of the states and
  of the scene results (French by default).

Save, then click **Test the connection**: the result gives the number of
checks, the ones down or late, and says when the key is read-only.

### 3. Add the checks

Open the **Discover** tab: a "Healthchecks" device sums up the project, and
each check is proposed with its name. Add the ones you want to see in Gladys.
The scene triggers work for every check, added or not.

## The devices

Each check becomes a device with:

- **State**: On time, Late, Down, Running, Paused or New, as a text.
- **Working**: Yes (green) while the check is on time, late or running, No
  (red) when it is down. Nothing while it is new or paused. Handy as a scene
  condition.
- **Last ping**: day/month and time of the last ping.
- **Next ping expected**: when the check turns late without a new ping; "-"
  when nothing is expected (down, paused or new check).
- **Pings received**: the counter of Healthchecks.
- **Last run duration**: in seconds, between the "start" and the "success"
  signals, for the checks that send a start signal (`/start`).

The **Healthchecks** device of the project counts the **Checks down**, the
**Checks late** and the **Checks in total**.

Last ping, next ping, pings and duration are sent at most every 5 minutes per
check (at once when the state changes), to stay within the limits of Gladys.

## Dashboard

The **Healthchecks** widget shows three tiles (down, late, on time), then one
row per check: down first, then late, then running, new, paused and on time,
with the state and the last ping. Ten rows at most; the rest is counted. In the
widget settings, choose some checks to show only them (devices added to
Gladys). The **Refresh** button reads Healthchecks again.

## Scenes

### Triggers

- **A check goes down**: no ping before the end of its grace time, or a
  failure signal (`/fail`). Variables: check name, tags, last ping.
- **A check is back up**: a check that was down receives a ping again.
  Variables: the same, plus the outage length in minutes.
- **A check is late**: the expected ping did not come and the grace time
  starts: still time to act before the check goes down.

Each trigger can be limited to some checks (empty: any). The state is kept in
the `/data` volume: a check that went down while Gladys or the integration
restarted is announced once at the next read. Nothing is announced at the
first read, nor for a check paused, resumed or running.

### Actions

- **State of a check**: gives `down` (yes/no), the `state` in words, the
  `name`, the `last_ping` and a ready-made `sentence`, for example
  "Nightly backup: Down, last ping 14/10 03:12.".
- **Count the checks down**: down, late, in total, and the names of the checks
  down.
- **Pause a check** and **Resume a check**: for a planned maintenance (full API
  key). A resumed check waits for its next ping.
- **Send a ping**: sends the success signal of a check (full API key), so a
  Gladys scene reports by itself that it ran.

### Scene ideas

- When **A check goes down** with the tag `backup`, send a Telegram message
  "The backup did not run, last ping {{last_ping}}".
- Every morning at 8:00, **Count the checks down** and, if there is at least
  one, read the names on the speaker.
- In a nightly Gladys scene (watering, heating schedule…), end with **Send a
  ping** to a dedicated check: Healthchecks warns you if Gladys itself stopped
  running it.
- Before switching the NAS off for maintenance, **Pause a check** of the
  backup, and **Resume a check** when it is back.

## Troubleshooting

- **API key refused**: copy the key again from Settings → API Access of the
  right project; each project has its own keys.
- **No Healthchecks at this address**: check the address; for your own server
  it is the one of `SITE_ROOT`, with a sub-path if it has one.
- **The address redirects**: enter the final address, usually in `https://`.
  The integration does not follow redirects, so that the key is never sent
  elsewhere.
- **Certificate refused**: a self-signed certificate is not accepted; use the
  `http://` address on the local network, or a trusted certificate.
- **This needs the full API key**: pause, resume and ping need the full key,
  not the read-only one.
- **Send a ping fails on a self-hosted server**: the ping URL is built by
  Healthchecks from its `PING_ENDPOINT` (or `SITE_ROOT`) setting; Gladys must
  be able to reach that address.

## Limits

- One project per configuration (one API key = one project).
- The integration reads Healthchecks: a check is not created or edited from
  Gladys.
- A short outage between two reads can go unseen in the device states;
  Healthchecks keeps the full history.
- "Running" (a start signal without its end) does not change the state used by
  the triggers.
- Developed without access to a healthchecks.io account: tested against the
  self-hosted server (same API). Feedback welcome.

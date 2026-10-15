# Healthchecks for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the checks of a [Healthchecks](https://healthchecks.io/) project —
on healthchecks.io or on your own server — into Gladys: cron jobs, backups and
scripts that "ping" Healthchecks when they run.

- **One device per check**: state (on time, late, down, running, paused, new),
  a green/red "working" badge, last ping, next ping expected, pings received,
  and the duration of the last run when the job sends a start signal.
- **One project device**: checks down, late and in total.
- **Scene triggers**: a check goes down, is back up (with the outage length),
  is late — for any check, added to Gladys or not.
- **Scene actions**: state of a check (with a ready-made sentence), count the
  checks down, pause / resume a check, send a ping (so a Gladys scene reports
  that it ran).
- **Dashboard widget**: checks down first, then the late ones, then the
  others.
- Texts in English, French, German and Spanish.

Tested against a real self-hosted Healthchecks v4.4 (Docker), with full and
read-only API keys. Developed without a healthchecks.io account (same API):
feedback welcome on [the issues](https://github.com/guim31/gladys-healthchecks/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Healthchecks project and one of its API keys (Settings → API Access). The
  read-only key is enough to follow the checks; the full key also allows
  pause, resume and ping.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-healthchecks`. Then open its configuration,
enter the address (`https://healthchecks.io` by default) and the API key, and
add the checks from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The container reads `GET /api/v3/checks/` of the Management API at the chosen
interval (one request every minute by default), publishes the states of the
devices added to Gladys when they change, and fires the scene events on the
transitions of every check. The last state of each check is kept in `/data`, so
a check that went down during a restart is announced once. Redirects are not
followed, so the API key is never sent to another host.

## Limits

- One project per configuration.
- Read-mostly: checks are not created or edited from Gladys.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the
Healthchecks API.

## Credits

- [Healthchecks](https://github.com/healthchecks/healthchecks) by Pēteris
  Caune and contributors (BSD-3-Clause): the API answers in
  `test/fixtures/healthchecks` come from its Docker image, and the
  `unique_key` computation from its code.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-uptime-kuma](https://github.com/guim31/gladys-uptime-kuma).

Not affiliated with Healthchecks.io or SIA Healthchecks.

## License

Apache-2.0, see [LICENSE](LICENSE).

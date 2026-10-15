# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-15

### Added

- The checks of a Healthchecks project (healthchecks.io or self-hosted) in
  Gladys: one device per check (state, working, last ping, next ping expected,
  pings received, last run duration) and one project device (checks down, late
  and in total).
- Scene triggers: a check goes down, is back up (with the outage length), is
  late — for any check, added to Gladys or not, kept across restarts.
- Scene actions: state of a check (with a ready-made sentence), count the
  checks down, pause and resume a check, send a ping.
- Dashboard widget: checks down first, then the late ones, then the others,
  with a Refresh button.
- Read-only and full API keys; "Test the connection"; texts and documentation
  in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-healthchecks/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-healthchecks/releases/tag/v1.0.0

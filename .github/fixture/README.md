# The Darwin test fixture in this repository

This repository is a snapshot of an open-source project (see the top of the README), used to test
[Darwin](https://github.com/dovel-ai/darwin) over days, as a team would use it:

- **Developer activity** (`developer.yml`, daily 06:00 UTC, `developer.mjs`): a simulated developer adds the next
  change from a fixed list: a real dependency at an old release, with code that uses it and a test. Some newer
  releases break that code and need a migration; some change behaviour without changing the API; some must move
  together with another package; some calls reach an API or model a provider retired, or a member the installed
  release marks deprecated.
- **Maintainer** (`maintainer.yml`, every 6 hours, `maintainer.mjs`): a simulated person merges what Darwin marked
  ready, reviews and merges what Darwin held for a person once its CI has passed for a day, and rejects one package's
  updates (`config.json` `reject`) each time Darwin proposes them. Its decisions are comments on the watch issue. Off
  unless the repository variable `FIXTURE_MAINTAINER_MERGES` is `true`.
- **Darwin watch** (`darwin-watch.yml`, every 3 hours, `watch.mjs`): checks that Darwin handled every change within
  `config.json` `deadlineHours`, never marked a pull request ready with failing CI, never edited a test's expectation
  to pass a behaviour change, did not propose a release again after a person closed it twice, has no stuck run, and
  that its console agrees with GitHub. The open issue **Darwin fixture watch** holds the latest report.

Darwin itself runs from `darwin.yml`, on the schedule set in Darwin's console.

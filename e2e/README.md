# End-to-end suite

One continuous story, from an owner's signup to running three companies with HR and fifteen employees working together. Who the people are and what each journey covers: [PERSONAS.md](PERSONAS.md).

## Running it

It needs the real (non-demo) app, the API and the worker running, with the API's console email backend (`JANUS_EMAIL_BACKEND=console`), because the suite reads invite and verification links from the API's output.

```bash
npm run e2e
```

Only one journey (later journeys rely on the people and records from earlier ones, so run them from a full run with `JANUS_E2E_RESUME=1`):

```bash
JANUS_E2E_RESUME=1 npm run e2e -- 09-
```

Settings, all optional:

| Variable | Default | Meaning |
|---|---|---|
| `JANUS_E2E_WEB` | `http://localhost:3011` | The web app. The API bridge's `JANUS_APP_ORIGIN` must allow it. |
| `JANUS_E2E_API` | `http://127.0.0.1:8000` | The API |
| `JANUS_E2E_API_LOG` | found from the running process | The API's output file |
| `JANUS_E2E_CHROMIUM` | Playwright's own | A Chromium already on this machine |

Each full run makes a new group of companies with new addresses, so it leaves data behind in that database. Never point it at production. Run details and failure screenshots go to `e2e/.state/`, which is not committed.

A failing test here states what the business needs and Janus doesn't do yet, or a bug. Don't relax a test to make it pass.

`python3 -I e2e/summary.py` prints the last run's results.

## Where it stands

Last full run, 10 November 2026: 57 passed, none failed. One is skipped on purpose: in journey 06, Vikram creates the project only if Neha could not, and she now can.

The ten failures recorded on 7 November 2026 (Finance discarding saved expenses, budget lines only for the Owner, an empty Assign menu, Customer Support without customers, and departments unable to open their own workspace) were product problems, fixed on 10 November 2026; each has a line in `docs/decisions.md`. Journey 02 now has the Owner give each department its workspace on top of its people's roles.

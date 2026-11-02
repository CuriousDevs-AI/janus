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

Last full run: 47 passed, 10 failed. All ten are in the product, not the suite:

| Failing test | Cause |
|---|---|
| 04 expense and petty-cash top-up after a reload | The Finance store discards its saved expenses, top-ups, draws, bank entries, bank lines, opening cash and close reviews on every load of a real account (since `a529780`) |
| 05 Karan raises a requisition; 05 the requisition is approved; 06 Neha creates the project | `GET /finance/budget-lines` needs `billing:manage`, so everyone but the Owner gets an empty Budget line list. Creating a project with no line does nothing and says nothing. The approval step never ran, because Shalini could not raise the requisition either |
| 07 Arjun assigns the ticket | A manager's Assign menu says "No teammates to assign": the list comes from `/members`, which needs `members:manage` |
| 07 feedback and renewal | Customer Support reads customers from the browser's copy of CRM records, which is empty on a real account |
| 11 Finance, Operations, Projects, IT | Role limits: only the Owner holds `billing:manage`; only Admin and Owner hold `settings:manage`; agents hold neither `stock:adjust` nor `projects:manage`. There is no way to give a department only its own workspace |

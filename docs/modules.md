# How the code is split into modules

Janus is one codebase: one repository, one API, one worker and one database. It is split into
modules (Portfolio, CRM, Finance, HR, Operations, Projects, Support, IT and the rest), and each
module keeps to its own folder and its own tables. Modules are moved into this shape one at a time;
Portfolio is the first. See `docs/decisions.md` for why.

## Backend: `backend/janus_api/<module>/`

| File | Holds |
|---|---|
| `router.py` | The HTTP routes. Thin: reads the request, calls the module, returns the answer. |
| `schemas.py` | What the API takes and returns. |
| `models.py` | The module's tables. Only this module reads or writes them. |
| `service.py`, or one file per job | The module's own logic. |
| `overview.py` | Plain figures other modules may read, such as Finance's money owed or HR's headcount. Read only. |

Rules:

- Another module is used only through its `overview.py` or `service.py`. Importing its `models`
  is not allowed. `core`, `audit` and `auth` are shared by everyone.
- Once a module follows this, add it to `BOUNDED` in `backend/tests/test_module_boundaries.py`,
  and the test suite keeps it that way.
- Two modules must not need each other. When they would, one of them gets an `overview` function
  or the work moves to the module that owns the data.

Portfolio as the example:

```
portfolio/
  router.py       the /v1/portfolio routes
  summary.py      the view, built from each module's overview functions
  attention.py    what needs the owner, and health
  access.py       who sees the Portfolio, and entering a company from it
  companies.py    adding a company
  targets.py      monthly targets (Portfolio's own table)
  compliance/     due_dates.py (the filing rules), plan.py (what applies, what was filed)
  digest.py       the Monday email, sent by the worker
  periods.py      the periods reported on, and rupee amounts
  models.py  schemas.py
```

## Web: `features/<module>/`

| Path | Holds |
|---|---|
| `index.ts` | What the rest of the app may use. |
| `components/` | One file per view or card. |
| `lib/` | Plain functions the views share: formatting, roles, exports. |
| `types.ts` | What the module's API returns. |
| `demo/` | The preview's version, loaded only in demo mode. |

Pages in `app/` stay thin: they render the feature and nothing else. Code outside a feature imports
only `@/features/<name>`, never a file inside it; ESLint (`eslint.config.mjs`) refuses anything
else; a new feature gets its own block there, as Portfolio has. Shared building blocks stay where they are: `components/ui` and `components/shared` for the
design system, `lib/api` for the API client.

# AI checks (Janus AI test prompt, 13 phases)

Drives a running Janus in a browser and prints PASS / FAIL / BLOCKED for each check: Portfolio
Intelligence, knowledge, the seven department chats, Business AI, agents, workflows, the AI
dashboard, usage, settings, error handling, history and role preview. Failure screenshots and
`results.json` go to `e2e/.state/ai-shots/` (not committed).

Run it against the app you already have running (API, worker and web app, as `scripts/dev-up.sh`
starts them), signed in as an Owner of at least three companies. Give the sign-in through the
environment; never write it into a file here.

```bash
JANUS_URL=http://localhost:3000 JANUS_LOGIN=<username> JANUS_PASSWORD=<password> node e2e/ai-checks/phases.js
```

- `GEMINI=1` also runs the model checks. Do Phase 0 by hand first: add a Gemini key under
  Portfolio, AI Models & Keys, and use it in every company.
- `ONLY=P3,P10` runs only those phases.
- `SKIP_BACKEND_DOWN=1` skips the check that pauses the API process for a few seconds.

It adds a fact and a "Refund Policy" document to the first company and removes the fact again.
Never point it at production.

# Janus backend — accounts, lead capture, WhatsApp and deals

This implements the account foundation for the lead capture → saved lead flow: each user has a verified identity, sessions, and explicit access to a business workspace. Python 3.12, FastAPI/Pydantic v2, SQLAlchemy 2 async, Alembic, and Postgres 16. The frontend now connects account access, lead-source setup, CSV imports, ingestion events and lead/customer reads, WhatsApp follow-up/inbox, and saved deal pipelines; see the [root README](../README.md).

Completed: the original backend steps 1–7 plus WhatsApp and deal pipeline integration: accounts, organisations, signed custom webhooks, a transactional inbox, a Postgres worker that creates contacts and leads, provider presets, website forms, scoped API keys, CSV imports, AI provider settings with usage logging, WhatsApp Cloud API messaging, and saved deals with audited stage changes. These are real backend paths, with no generated lead scores or AI output. The remaining frontend modules are gated until their real workflows are connected.

Production packaging and operator steps: [single-VPS pilot deployment](../deploy/README.md).

## Run locally

```sh
cd backend
cp .env.example .env
# Set unique passwords and a random JWT secret in .env before using real accounts.
# Generate JANUS_ENCRYPTION_KEY using the command in .env.example.
# For example: python3 -c 'import secrets; print(secrets.token_hex(32))'
docker compose up --build -d
```

Compose starts Postgres, runs migrations as a separate privileged process, then starts the API as the non-superuser `janus_app` database role and the worker as `janus_worker`. Both run as a non-root OS user. API: `http://localhost:8000`; OpenAPI: `/openapi.json`; interactive docs: `/docs`. The default database port is `55433`. The database initializer runs only for a new volume. Database passwords in Compose URLs must be URL-safe (random hexadecimal works).

For Python development after starting Postgres:

```sh
uv sync --frozen
uv run --env-file .env alembic upgrade head
uv run --env-file .env uvicorn janus_api.main:app --reload --no-access-log --no-proxy-headers
```

Settings come only from `JANUS_*` environment variables. `uv --env-file` and Compose load `.env`; Python does not implicitly search for it. `JANUS_MIGRATION_DATABASE_URL` is for migrations/tests only and is cleared in the API container. Do not give the API a superuser or `BYPASSRLS` connection: startup rejects either. Privileged bootstrap functions are owned by the migration role and have explicit runtime-role grants. Only the worker can claim jobs across tenant queues; it then sets transaction-local tenant context and uses ordinary RLS for processing. The worker cannot read user password hashes or source secrets.

## API contract

All IDs in responses and JWT claims are decimal strings to preserve BIGINT precision in JavaScript. ID inputs accept positive bigint decimal values. Access tokens expire after 15 minutes; refresh sessions expire after 30 days. Refresh tokens rotate on every use. Send access tokens as `Authorization: Bearer <token>`. The Next.js frontend bridge stores tokens in HttpOnly cookies; this backend itself does not create browser cookies.

| Method | Endpoint | Input / behavior |
| --- | --- | --- |
| POST | `/v1/auth/signup` | `name`, `email`, `password`, `business_name`; creates Owner/workspace, sends verification; 201 |
| POST | `/v1/auth/verify-email` | `token`; accepts signup or change-email verification |
| POST | `/v1/auth/resend-verification` | `email`; at most three resend messages per hour |
| POST | `/v1/auth/login` | `email`, `password`; access/refresh pair |
| POST | `/v1/auth/refresh` | `refresh_token`; consumes the previous refresh token |
| POST | `/v1/auth/logout` | Revokes current session |
| POST | `/v1/auth/logout-all` | Revokes all of the user's sessions across workspaces |
| GET | `/v1/auth/sessions` | Own active sessions: device, IP, creation/last-use time, current flag |
| DELETE | `/v1/auth/sessions/{session_id}` | Revokes an owned session |
| POST | `/v1/auth/forgot-password` | `email`; same 200 receipt for known/unknown addresses, including delivery failures |
| POST | `/v1/auth/reset-password` | `token`, `new_password`; consumes reset link, revokes all sessions |
| GET | `/v1/me` | `user`, current `tenant`, `role`, `permissions`, all `tenants` |
| PATCH | `/v1/me` | Optional `name`, `phone`, `avatar_url`, `timezone`, `language`; null clears phone/avatar only |
| POST | `/v1/me/avatar` | Multipart `file`; JPEG/PNG/WebP, maximum 2 MiB |
| POST | `/v1/me/change-password` | `current_password`, `new_password`; revokes other sessions |
| POST | `/v1/me/change-email` | `new_email`, `password`; changes only on verification, then revokes all sessions |
| POST | `/v1/me/switch-tenant` | `tenant_id`; checks active membership, revokes current session, returns new tokens |
| DELETE | `/v1/me` | JSON `password`; soft deletion, blocks the sole Owner, revokes all sessions |
| GET | `/v1/invitations/{token}` | Tenant name, role, inviter name; no email disclosure |
| POST | `/v1/invitations/{token}/accept` | New user: `name`, `password`; existing user: authenticated request with `{}`; returns tokens |
| POST | `/v1/invitations` | Verified member with `members:manage`: `email`, `role`; only Owners can invite Owners |
| PATCH | `/v1/members/{member_id}` | Optional `status` and/or `role`; verifies permissions, protects last active Owner |
| GET / PATCH | `/v1/tenant` | Read/update the current workspace; writes require `settings:manage` |
| GET | `/v1/members` | Workspace member directory including disabled members; requires verified `members:manage` |
| GET | `/v1/roles` | Four system roles and their current permissions; authenticated |
| GET | `/v1/invitations` | Pending, unexpired invitations; verified `members:manage`; never returns tokens/hashes |
| POST | `/v1/invitations/{invitation_id}/resend` | Rotates token and extends expiry to 7 days; 60-second resend cooldown |
| DELETE | `/v1/invitations/{invitation_id}` | Revokes an unused invitation; the email link immediately stops working |
| GET / POST | `/v1/teams` | List teams / create with `name`, optional `description` |
| PATCH / DELETE | `/v1/teams/{team_id}` | Rename/update description / delete team and its assignments |
| GET | `/v1/teams/{team_id}/members` | Active members assigned to this team |
| PUT / DELETE | `/v1/teams/{team_id}/members/{member_id}` | Add/remove a workspace membership; PUT is idempotent |

Pydantic schemas generate the full OpenAPI contract. Errors consistently use `{"error":{"code":"...","message":"..."}}`. Authentication responses are not cacheable. Invalid input returns 422 without echoing passwords or tokens.

## Organisation behavior

`GET /v1/tenant` and its PATCH use the existing frontend field names: `name`, `industry`, `companySize`, `timezone`, `businessHours: {start, end}`, and `defaultChannel`. New workspaces default to Asia/Kolkata, WhatsApp, and 09:00–18:00; industry/company size stay blank until supplied. Hours use `HH:MM`, permit an overnight interval, and reject equal start/end. A default channel is only a preference; it does not connect an integration. Plan/billing/environment flags cannot be edited through these settings.

Org list endpoints accept `limit` (1–100, default 100) and `after_id` (default 0). To continue, use the last returned item's `id`; an empty page ends the list. IDs are stable decimal strings. `member_id` always refers to the workspace **membership** ID, not the global user ID. Member responses include both `id` and `user_id`.

Workspace settings, teams, active team rosters, and system roles can be read by any authenticated member. The full member directory and pending invitations require verified `members:manage`. Team and invitation mutations require that same permission. Role changes additionally require `roles:manage`; only Owners may promote/demote/disable an Owner or manage an Owner invitation. The role contract is the four system roles specified by the backend brief (`owner`, `admin`, `manager`, `agent`); the frontend's earlier mock roles need mapping during frontend integration. There are no custom-role creation/edit endpoints.

Role/status changes take effect on the next request using an existing JWT. Concurrent Owner changes and account deletion are serialized under the workspace lock and preserve at least one active Owner. Deleted accounts cannot be reactivated by changing membership status.

Team names are unique within a workspace, ignoring case. A person can belong to multiple teams. Adding a member requires active membership in the same workspace. Disabling a member preserves team assignments but removes them from active rosters/counts; re-enabling restores them. Deleting a team removes only its assignments, not user accounts or workspace memberships. Composite foreign keys enforce matching tenant IDs for both the team and its membership, in addition to forced RLS.

Only one unexpired unused invitation per email/workspace may be created through the API. Existing members must be managed through their membership. Resend invalidates the previous link, and revoke invalidates the current link. An expired invite can be resent by ID unless a newer invite or membership exists. Accept/resend/revoke acquire locks in the same order and recheck token state before use. SMTP failure rolls back the change. Owner invitations can only be managed by Owners.

All organisation writes produce audit events. HTTP success is sent only after the database transaction commits; commit failures use the shared API error format.

## Identity and tenant security

- Argon2id passwords, 8–128 characters, rejecting the bundled common-password list (case insensitive). Login errors are identical for incorrect email/password. Five failed attempts lock that normalized email + observed client IP for 15 minutes. Unknown emails also accumulate attempts. The account's summary counters are mirrored on `users`; pair-specific enforcement lives in `login_attempts`.
- Verification (24 hours), reset (30 minutes), change-email (30 minutes), and invitation (7 days) tokens are random 256-bit values, stored only as SHA-256 hashes, expiring and single use. Refresh tokens are also hashed. Successful reset/change-password invalidates outstanding account email tokens. Replayed refresh tokens fail; they do not revoke a newly rotated session.
- Every authenticated request checks the live session, user deletion state, and membership status. A disabled member is rejected immediately for that tenant, including refresh; reactivation restores access to otherwise-valid sessions. Unverified users can log in, but `require("members:manage")` and `require("sources:manage")` reject them.
- `require("permission")` is the shared FastAPI permission dependency. Owner has all permissions; Admin excludes billing; Manager has own/team lead read, write, assign; Agent has own lead read/write. System roles are immutable to the runtime database role. Custom roles have schema support but no endpoints.
- Each transaction uses `set_config(..., true)` (parameterized `SET LOCAL`) for tenant/user context. Pending writes flush before a context switch. All tenant tables enable **and force** RLS. Runtime code uses scoped transactions; the context cannot leak through pooled connections.
- Users, login counters, and account email tokens are global account records. Own membership lookup spans tenants for `/me` and switching; session RLS deliberately permits only the owning user to list/revoke their sessions across workspaces. Tenant audit records stay tenant-scoped; global authentication audit records are actor-scoped. The runtime role cannot update/delete audit records.
- Narrow security-definer helpers resolve a hashed refresh/invitation token and create the initial workspace/Owner membership before tenant context is available. They use fixed search paths, no dynamic SQL, and no PUBLIC execute permission.
- Protected requests, account mutations, and refresh serialize on the user row to keep revocation and session writes in a consistent lock order. Invitation use and last-Owner changes also lock their relevant rows. New caller-controlled tenant IDs are never accepted as authorization.

## Email and avatar setup

Development uses `ConsoleEmailSender`, which prints the plaintext email to the console. Production **requires** `JANUS_EMAIL_BACKEND=smtp` and an HTTPS frontend URL. Set `JANUS_SMTP_HOST`, `PORT`, `USERNAME`, `PASSWORD`, `STARTTLS`, and `JANUS_EMAIL_FROM`; port 587 with STARTTLS is the default. Production does not log email bodies/tokens. Templates are in `janus_api/core/templates/`.

Links point to `${JANUS_FRONTEND_URL}/{verify-email|reset-password|change-email|invite}?token=...`. The eventual frontend must render these routes and submit the token to the corresponding API; these pages are not part of this backend change. Do not log token query strings or include third-party scripts on token pages.

For avatars configure `JANUS_S3_BUCKET`, `JANUS_S3_REGION`, `JANUS_S3_PUBLIC_BASE_URL`, and either standard AWS credentials/instance-role access or `JANUS_S3_ACCESS_KEY_ID` / `JANUS_S3_SECRET_ACCESS_KEY`. Set `JANUS_S3_ENDPOINT_URL` only for an S3-compatible service such as R2. The public base must point to a readable media origin/CDN backed by that bucket. Uploaded images are decoded, size/pixel checked, resized to at most 1024 pixels, stripped of metadata, and re-encoded as JPEG before `PutObject`. The API returns 503 if storage is not configured; it never fabricates an upload URL. Deleting old/orphan avatar objects is a storage lifecycle policy concern.

Console email is a development delivery mechanism. Tests replace external email/S3 delivery only; database tests always use real Postgres. Live SMTP delivery and S3 bucket permissions require deployment credentials and are not certified by local adapter tests.

## Deployment notes

Use HTTPS at an India-hosted reverse proxy. Keep the database/API published ports bound to loopback. Proxy headers are disabled by default: if a reverse proxy supplies the client IP, enable Uvicorn proxy headers only for that proxy's exact trusted IP. Otherwise all clients behind that proxy share its IP for the email+IP lockout key. Never trust arbitrary `X-Forwarded-For` from the internet.

Keep standard Uvicorn access logging disabled: invitation URLs contain bearer tokens. Built-in JSON request logs use route templates, request ID, status, and latency, never raw URLs, authorization headers or bodies. Configure proxy logs to redact token-bearing URLs too. Configure backup/restore and volume durability before pilot use. Auth events are stored in `audit_log`; no Redis or external queue is required for this module.

## TABLES

All primary keys are `BIGINT GENERATED ALWAYS AS IDENTITY`.

| Table | Scope / purpose |
| --- | --- |
| `users` | Global account, Argon2 hash, name/email/phone/avatar, timezone/language, verification/lock/deletion timestamps |
| `tenants` | Business workspace, industry/company size, timezone, hours, default channel |
| `roles` | `tenant_id NULL` system roles; nullable tenant FK supports future custom roles |
| `memberships` | Tenant + user + role, active/disabled, unique tenant/user |
| `sessions` | User-owned tenant-bound refresh sessions, device/IP/last use, expiry/revocation |
| `login_attempts` | Global normalized email hash + IP lockout counter |
| `password_resets` | Global hashed single-use account reset tokens |
| `email_verifications` | Global hashed signup/resend tokens and resend quota history |
| `email_changes` | Global hashed verification tokens for pending new email addresses |
| `invitations` | Tenant-scoped hashed tokens, role, email, inviter, expiry/use/revocation and last-send time |
| `teams` | Tenant-scoped named groups with descriptions; unique case-insensitive names |
| `team_members` | Team/membership assignments with tenant-matching composite foreign keys |
| `source_connections` | Webhook/embed/API configuration, origins, provider preset, encrypted webhook secret, public key, mapping |
| `api_keys` | Hashed source-scoped ingestion credentials, public prefix, expiry, revocation, last use |
| `form_rate_limits` | Tenant/source/IP-hash minute counters; no plaintext visitor IP |
| `ingest_receipts` | Global-within-connection idempotency key and body digest, independent of daily partitions |
| `raw_events` | Daily UTC partitions containing received payload, mapping snapshot, processing result/failure |
| `jobs` | Tenant-scoped queue, receipt reference, attempts, next due time, final status |
| `contacts` | Tenant-scoped identity; unique normalized phone/email, supplied name and company |
| `leads` | One opportunity per accepted unique event, contact, owner, requirement, recording URL |
| `audit_log` | Append-only account, organisation, source, and lead events with safe details |

## TESTS

Use a **dedicated disposable** Postgres database. Tests truncate account/contact/ingestion data and delete workspaces; they refuse to run unless `JANUS_ENVIRONMENT=test` and the migration URL are configured. Do not point this suite at a development or production database containing valuable data.

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy janus_api tests migrations
# With .env pointing to the isolated database:
uv run --env-file .env alembic upgrade head
# Separate restricted worker login for the same disposable database:
export JANUS_TEST_WORKER_URL=postgresql+asyncpg://janus_worker:local-worker-password@localhost:55433/janus
JANUS_ENVIRONMENT=test uv run --env-file .env pytest -q
uv run --env-file .env alembic check
```

Fresh-schema verification on that disposable database only:

```sh
uv run --env-file .env alembic downgrade base
uv run --env-file .env alembic upgrade head
```

Coverage includes signup → verify → login → rotate → logout; hashed storage; refresh replay and concurrent rotation; device/all-session revocation; generic forgot-password receipts; reset expiry/reuse and session revocation; change-password session retention; five-failure lockout; resend quota; password policy; profile validation; verified email change; sole-Owner deletion protection; invitation acceptance for new/existing users; disabled members; authorized tenant switching; permission denial by role; source permission verification guard; RLS reads/writes with the actual restricted role; transaction-local context; S3 adapter/image validation; SMTP TLS adapter; email failure rollback; production config restrictions; workspace field validation and isolation; live role changes; concurrent Owner demotion; cached-role deletion protection; invitation listing/resend/revocation/expiry and concurrent acceptance; team lifecycle, membership idempotency, and disabled-member visibility; cross-tenant API and direct RLS/FK denial; pagination; commit failures before HTTP success.

The bundled password list is a frozen copy of [SecLists' 10k common passwords](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10k-most-common.txt) (10,001 entries in the source snapshot). Its license is retained at `janus_api/core/data/SecLists-LICENSE`.


## Lead ingestion (steps 4–5)

This serves **lead captured → saved**. Source management requires verified `sources:manage` (Owner/Admin). Lead reads use `leads:read_own`, `leads:read_team`, or `leads:read_all` scope: agents see their own leads, managers also see active teammates' leads, Owners/Admins see all workspace leads. Contact reads require a visible lead. List endpoints use `after_id` and `limit` (1–100).

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/v1/sources` | Create source: `name`, `connectionKind`, optional `preset`, `description`, `fieldMapping`, `eventIdField`, `allowedOrigins`; webhook secret shown once |
| GET | `/v1/sources` | List actual configured connections; no secret or made-up counts |
| GET / PUT | `/v1/sources/{id}` | Read/replace configuration; PUT requires `name`, `status`; omitted mapping resets to the selected preset |
| POST | `/v1/sources/{id}/rotate-secret` | Replace signing secret; old signatures immediately stop working |
| GET | `/v1/sources/{id}/events` | Pending/processed/failed receipts, resulting contact/lead IDs, safe error codes |
| POST / GET | `/v1/ingest/webhooks/{public_key}` | Custom HMAC POST or provider callback; atomically save event/job; 202 custom / 200 provider |
| GET | `/v1/leads` | Visible leads, stable IDs and actual supplied data |
| GET | `/v1/leads/{id}` | One visible lead |
| GET | `/v1/contacts/{id}` | Contact behind a visible lead |

Create a source with `{"name":"Sales enquiries"}`. `connectionKind` accepts `webhook`, `embed`, or `api_key`. It is immutable after creation. Webhook presets are listed below; other kinds use `preset=custom`. The returned `ingestUrl` (and `webhookUrl` for webhooks) is relative to the API base URL. The create/rotate response also includes an absolute `callbackUrl` built from `JANUS_PUBLIC_API_URL`; non-HMAC provider callbacks include its secret token. `status=connected` means the endpoint is enabled, not that any provider has sent data; `lastEventAt` stays null until a delivery is accepted. PUT `status=available` pauses ingestion without deleting history. Connections default to the creating user as lead owner; if their membership is disabled before processing, new leads are unassigned and visible to Owners/Admins.

`fieldMapping` uses the frontend contract: `[{"rawField":"caller.number","mapsTo":"phone"}]`. Dotted object paths are supported, up to 10 segments. Targets: `name`, `phone`, `email`, `company`, `requirement`, `campaign`, `recording_url`, `recording_reference`; each target is mapped at most once. Custom, website, API, Zapier, Make, and the Tata JSON template use canonical fields from the root JSON object. Call presets select their provider fields; Google Ads converts its column array inside the worker before applying the mapping. Each accepted event snapshots the preset, source classification, mapping, and owner, so editing the source does not reinterpret queued events. Mapped values must be strings. Unknown fields remain in the raw payload, not the contact.

`JANUS_ENCRYPTION_KEY` must contain a stable Fernet key before creating/rotating/using webhook sources. Website sources and API keys do not need Fernet. It encrypts readable signing secrets at rest; missing or mismatched keys return 503. Keep the key backed up separately from the database. Existing account endpoints can run without it. List/detail responses never expose the secret; rotate if the once-shown value is lost.

Custom webhook HMAC contract:

- Raw UTF-8 JSON object, maximum 256 KiB; no NUL, unpaired surrogate, non-finite number, or nesting deeper than 32.
- `X-Janus-Timestamp`: current Unix seconds, accepted within 5 minutes.
- `Idempotency-Key`: provider event ID, 1–128 letters/digits/`.`/`_`/`:`/`-`; stable across retries.
- `X-Janus-Signature`: `sha256=` followed by HMAC-SHA256 hex over `timestamp + "." + idempotency_key + "." + raw_body`, using the once-shown signing secret.
- Retries must send identical body bytes and a fresh timestamp/signature. Same key/body returns the existing receipt with `duplicate=true`; same key/different body returns 409. No extra job or lead is created.

Example sender (use a real connection's URL and secret):

```python
import hashlib, hmac, json, os, time
from urllib.request import Request, urlopen

body = json.dumps({"name": "Asha", "phone": "9876543210", "requirement": "Office chairs"}).encode()
timestamp = str(int(time.time()))
event_id = "provider-event-123"
signed = timestamp.encode() + b"." + event_id.encode() + b"." + body
signature = hmac.new(os.environ["WEBHOOK_SECRET"].encode(), signed, hashlib.sha256).hexdigest()
request = Request(
    os.environ["WEBHOOK_URL"],
    data=body,
    headers={
        "Content-Type": "application/json",
        "Idempotency-Key": event_id,
        "X-Janus-Timestamp": timestamp,
        "X-Janus-Signature": "sha256=" + signature,
    },
)
with urlopen(request, timeout=10) as response:
    print(response.status, response.read().decode())
```

The HTTP request authenticates and queues only. Custom HMAC, website, and API ingestion return 202 after commit; provider callbacks return 200 for compatibility. Inspect events for the eventual result. A worker uses `FOR UPDATE SKIP LOCKED` and holds the job lock until processing commits. Contact/lead/audit/event/job changes commit together. A crash releases the lock and rolls back the transaction, leaving the event available. Ordinary processing exceptions retry after 5, 10, 20, and 40 seconds, then fail on attempt 5; permanent validation conflicts fail immediately. Errors are stored as safe codes; logs never include raw payloads or credentials. An event that failed permanently needs a corrected delivery with a new idempotency key; duplicate delivery does not replay side effects.

Phone normalization uses numbering metadata with default region India (`+91`), including valid landlines and explicit international numbers. Contact matching tries normalized phone, then case-folded email. A merge fills missing fields without overwriting existing supplied data. Conflicting identifiers fail as `contact_identity_conflict` for human resolution. At least one valid phone/email is required. Different unique event IDs create separate leads for the same contact; repeating an event creates none. Recording URLs and opaque recording references are stored on the lead; the backend does not fetch or upload recordings here. Lead stage starts at `new`; the pipeline below saves deal movement and mirrors its stage to the lead. Scoring is still pending. The frontend now displays these records, and the WhatsApp integration below handles follow-up and replies.

Postgres requires partition keys in partitioned unique constraints ([Postgres 16 documentation](https://www.postgresql.org/docs/16/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-LIMITATIONS)). Therefore `raw_events` has a BIGINT identity plus date composite primary key, while `ingest_receipts` enforces unique `(tenant_id, connection_id, idempotency_key)` across days. Other primary keys remain single BIGINT identities. Do not remove receipt rows when archiving raw payload partitions: those keys prevent old events being ingested again. No retention/deletion task is enabled in this step.

A narrowly scoped database function creates daily UTC partitions for yesterday through seven days ahead. Ingest and worker startup invoke it, so ingestion keeps working after downtime without an external scheduler. The parent and every child enforce RLS; runtime roles cannot access child partitions directly. Alembic excludes only these generated daily tables from schema comparisons. Composite foreign keys also prevent cross-tenant source/receipt/contact links.

For an **existing database volume**, migration 0004 creates `janus_worker` with NOLOGIN if absent. As the migration administrator, use psql's `\password janus_worker` to set the same secret as `WORKER_DB_PASSWORD`, then `ALTER ROLE janus_worker LOGIN;`. New volumes create the login through `docker/init-db.sh`. Restart API and worker with the encryption key configured; never give the worker the migration credential. To run the worker outside Compose, set `JANUS_DATABASE_URL` to its restricted login and run `uv run --env-file .env python -m janus_api.worker.main` (ensure the env-file does not override that URL).

Additional coverage: authenticated HMAC ingestion, encrypted secret/rotation/pause, verified-source guard, atomic queue insertion, cross-day and concurrent idempotency, mapping snapshots, phone/email enrichment, conflicting identities, recording linkage, multi-worker locking/recovery, partial-write rollback, retry backoff/exhaustion, real API/worker RLS and partition access denial, lead ownership/team visibility, and disabled-owner handling.


## Provider presets, website forms, and API keys (step 5)

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/v1/sources/presets` | Eight preset definitions, mappings, event ID fields, setup instructions, documentation links |
| GET | `/v1/sources/{id}/embed` | Copyable HTML form and submission script; requires `sources:manage` |
| OPTIONS / POST | `/v1/ingest/forms/{public_key}` | Per-source CORS preflight / public website submission |
| POST / GET | `/v1/sources/{id}/keys` | Create/list API keys for a REST API source; same source-management permission |
| DELETE | `/v1/sources/{id}/keys/{key_id}` | Revoke one key immediately; repeated revocation is safe |
| POST | `/v1/ingest/api/{public_key}` | Source-scoped Bearer API key and `Idempotency-Key`; queue a lead |

### Presets

Create a webhook source with `preset` set to one of the values below. Calls use the same webhook connection and endpoint as other presets; the resulting lead source is `phone_call`. No separate phone integration exists. Google Ads, Zapier, Make, and Custom leads use `webhook`.

| Preset | Incoming format and setup | Stable event ID |
| --- | --- | --- |
| `exotel` | Async Passthru **after** Connect/Voicemail in an inbound flow only; GET query fields `CallFrom`, optional `RecordingUrl`; use the returned secret `callbackUrl` | `CallSid` |
| `knowlarity` | Documented CDR fields `caller_id`, optional `resource_url`, `Call_Type=Incoming`; configure post-call delivery of this payload to the secret callback URL; JSON, form-encoded POST, or GET accepted | `uuid` |
| `myoperator` | Webhook v2 `channel=call`, `event_type=call.end`, `direction=incoming`; phone from `customer_identifier`; subscribe to Call Ended | `event_id` |
| `tata_tele` | Configure an inbound hangup JSON template: `event_id` from `$call_id`, `phone` from `$customer_number_with_prefix`, `recording_url` from `$recording_url`, `direction` from `$direction` | `event_id` |
| `google_ads_lead_form` | Native JSON column array; set the generated signing secret as Google Key in the lead form configuration | `lead_id` |
| `zapier` / `make` | Send canonical contact fields as JSON; use a stable trigger-record ID in `event_id` | `event_id` |
| `custom` | Existing Janus HMAC protocol with user-supplied field mapping | `Idempotency-Key` header |

Provider callback setup follows the [Exotel Passthru reference](https://support.exotel.com/support/solutions/articles/48283-working-with-passthru-applet), [Knowlarity CDR reference](https://developer.knowlarity.com/), [MyOperator v2 schema](https://support.myoperator.com/portal/en/kb/articles/what-is-the-exact-payload-structure-for-every-myoperator-webhook-v2-event), [Tata Smartflo templates](https://docs.smartflo.tatatelebusiness.com/docs/webhook), and [Google Ads webhook contract](https://developers.google.com/google-ads/webhook/docs/implementation). Knowlarity accounts must be configured to deliver the CDR to Janus; this backend does not subscribe to its streaming API. Provider-side account configuration and delivery have not been exercised with live customer credentials.

Except Custom and Google, authenticate with `X-Janus-Token: <signingSecret>` or the secret `callbackUrl` query token. Prefer the header where supported. All webhook credentials remain Fernet-encrypted. Create/rotate returns the secret once; normal source reads never return the token-bearing callback URL. Keep query strings out of reverse-proxy access logs for token callbacks; the API already logs route templates only. Google authenticates its `google_key` using a constant-time comparison; that credential is removed before storing the event. Provider callbacks return 200 after commit; Google returns `{}` as required by its contract.

Google `is_test=true` notifications are acknowledged without creating a receipt, job, contact, or lead. MyOperator notifications other than incoming `call.end`, and outbound Knowlarity/Tata calls, are also ignored. Missing direction in Knowlarity/Tata is rejected. Exotel Passthru does not provide a reliable direction field, so configure it in the **inbound** flow only. Use one final callback per call so the recording is present when the lead is captured. Missing recordings stay absent; recording files are never downloaded automatically.

MyOperator v2 supplies a `payload.recording_filename`; Janus retains it as `recordingReference`. It does not manufacture a playable recording URL from a filename. Where the provider sends a real URL, map that field to `recording_url`. Resolving filenames through a provider API requires that provider's account credentials and is not implemented here.

Provider IDs are opaque strings (up to 1,024 characters), hashed with the preset name for deduplication. A provider retry with the same ID cannot create another lead, even if delivery timestamps change. The original payload remains authoritative. HMAC/API/website keys retain their strict conflict behavior. `eventIdField` can select a dotted path for a configured provider's stable ID. Custom mappings override preset defaults; queued events retain their original mapping and preset.

### Website forms

Create with `{"name":"Website enquiries","connectionKind":"embed","allowedOrigins":["https://shop.example.com"]}`. Set `JANUS_PUBLIC_API_URL` to the externally reachable API origin before copying the embed HTML. The generated form collects name, phone/email, and requirement, includes a honeypot, and retains the submission's idempotency key across retries. This is a lead form; no chat or AI behavior is simulated.

Only exact configured origins are allowed: no wildcard, credentials, URL path, query, or fragment. Production origins and the public API URL must use HTTPS. Missing/`null`/unlisted Origin values are rejected. CORS grants only POST with Content-Type and Idempotency-Key; it does not allow browser credentials. Allowed-origin errors retain CORS headers so the form can display the failure. Public forms have no private API key or webhook secret in the HTML.

`JANUS_FORM_LIMIT_PER_MINUTE` defaults to 10 requests per source and visitor IP per UTC minute. PostgreSQL counters work across API processes and count invalid JSON, honeypot submissions, and duplicate-key conflicts. Non-empty `_janus_hp` rejects the submission without enqueueing. Counters store a keyed IP hash; inactive counters older than a day are removed when the source next receives traffic. Origins and honeypots deter browser misuse but are not proof of a visitor's identity.

The default server ignores forwarded IP headers. Behind a reverse proxy, explicitly replace the API's Uvicorn command with `--proxy-headers --forwarded-allow-ips=<fixed proxy address>` (and retain `--no-access-log`); otherwise all visitors share the proxy IP's quota. Trust only the actual proxy address, never `*`, and ensure that proxy replaces incoming forwarding headers. Direct requests cannot change their quota by supplying a forged X-Forwarded-For header.

### Scoped API keys

Create with `{"name":"ERP capture","connectionKind":"api_key"}`, then POST `{"name":"ERP production","scopes":["leads:ingest"]}` to its `/keys` endpoint. Optional `expiresAt` must be a future timezone-aware timestamp. Only `leads:ingest` is supported; broader or empty scope lists are rejected. The response contains `key` once. Storage contains only SHA-256 hash, prefix, scope, timestamps, and the tenant/source binding.

Use `Authorization: Bearer <key>` and `Idempotency-Key: <stable event ID>` on that source's returned `ingestUrl`. Submit canonical fields or the source's configured mapping. Keys cannot authenticate account APIs, read CRM data, manage members, or ingest into another connection. Expired/revoked keys fail immediately; pausing the source blocks ingestion. Keys are workspace integration credentials and remain independent of the issuing user's login session. Creating/revoking keys produces audit entries without the secret.

Migration 0005 adds API keys and form quotas with forced RLS and tenant-matching foreign keys, plus event preset/source snapshots and optional recording references. Downgrade refuses to discard existing website/API connections; use a fresh disposable database for migration reversal tests. No additional service or dependency was added.


## CSV imports (step 6)

Create a source with `{"name":"Imported enquiries","connectionKind":"csv"}`. Its source value is `csv_import`. The default mapping uses canonical column names (`name`, `phone`, `email`, `company`, `requirement`, `campaign`, `recording_url`). Set `fieldMapping` on the source for other headers, for example `[{"rawField":"Full Name","mapsTo":"name"},{"rawField":"Mobile No.","mapsTo":"phone"}]`. CSV headers are matched literally, including spaces and dots. At least one mapped phone/email column must be present; missing optional columns are ignored.

All import endpoints require a verified owner/admin with `sources:manage`:

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/v1/sources/{id}/imports?fileName=leads.csv` | 202: import ID, real row counts, duplicate flag |
| GET | `/v1/sources/{id}/imports` | Import history (`after_id`, `limit`) |
| GET | `/v1/sources/{id}/imports/{import_id}` | Current processing totals and status |
| GET | `/v1/sources/{id}/imports/{import_id}/rows` | Per-row receipt, result/error and contact/lead IDs (`after_id`, `limit`) |

Upload the file as the raw request body (not multipart):

```sh
curl --request POST "$API_URL/v1/sources/$SOURCE_ID/imports?fileName=leads.csv" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header 'Content-Type: text/csv' \
  --header 'Idempotency-Key: october-enquiries-001' \
  --data-binary @leads.csv
```

Limits: UTF-8 (optional BOM), comma-separated, 5 MB, 1,000 data rows, 64 unique headers, 128 KB per field and 256 KB per serialized row. Quoted commas/newlines are supported; blank lines are skipped. `rowNumber` is the CSV record number, counting the header as 1, not the physical line number inside a quoted multiline value. Malformed structure rejects the entire upload before queuing anything. Invalid phone/email values are accepted into the inbox and fail individually in the worker; valid rows still complete.

The import, raw rows, and jobs commit together before 202. The worker applies the captured mapping, normalizes phone numbers, merges matching contacts and creates leads; uploads never create contacts inline. The same idempotency key and exact file bytes return the existing import; different bytes with that key return 409. Use a new key for a deliberately new import, which creates new leads even for existing contacts. Retrying an existing import keeps its original mapping. All rows have `source=csv_import`.

Rows are stored durably in the existing Postgres inbox; the original file is not separately archived to object storage. Counts come from worker results, with `processing`, `completed`, or `completed_with_errors` status. Migration 0006 adds forced RLS and tenant/source foreign keys for import tracking. No new dependency or service is needed. The frontend upload button remains a prototype until frontend integration.


## AI settings and gateway (step 7)

The backend supports `openai`, `anthropic`, `gemini`, and `openai_compatible`. There is one saved credential per provider per tenant. All settings, tests and usage endpoints require `ai:manage` (owner/admin). Models are real provider model IDs supplied by the caller; no display-name catalog or default key is fabricated.

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/v1/ai/credentials` | Provider, model, enabled state and key's last four characters |
| PUT | `/v1/ai/credentials/{provider}` | Create/update provider settings; `apiKey` required initially, optional on updates |
| DELETE | `/v1/ai/credentials/{provider}` | Delete the encrypted key; retain usage history |
| POST | `/v1/ai/credentials/{provider}/test` | Real bounded completion using the saved settings; response text and usage |
| GET | `/v1/ai/usage` | Per-call history (`after_id`, `limit`), oldest first |

Example settings body: `{"model":"<provider-model-id>","apiKey":"<provider-api-key>","enabled":true}`. Keys are Fernet-encrypted with `JANUS_ENCRYPTION_KEY`; neither reads, errors, audits nor usage rows include the full key. Credential changes are audited. Disabling/deleting a credential prevents subsequent calls; a call already in flight may finish with the settings it started with.

Custom providers also require `baseUrl`, an HTTPS API base (including `/v1` when required by that server). The exact normalized URL must be in the deployment's `JANUS_AI_ALLOWED_BASE_URLS` JSON array, e.g. `["https://models.yourcompany.in/v1"]`. Only the deployment operator should approve these trusted endpoints. Tenant-supplied URLs cannot override native provider endpoints, and redirects are disabled. Removing a URL from the allowlist blocks subsequent calls using saved credentials at that URL.

The internal entry point is `janus_api.ai.service.complete(db, provider, messages, feature=..., max_tokens=...)`. Call it from an authenticated, tenant-scoped transaction, before taking write locks on the tenant row. Every call selects that tenant's saved provider; credentials are passed per request, never set as global SDK keys. The gateway sends a single non-streaming request, with no automatic retry, provider fallback, tools or mock output. Its maximum output is 4,096 tokens and overall provider timeout is 35 seconds. The connection-test prompt lives in `ai/prompts/connection_test.txt` and requests at most 64 output tokens. A test can incur a small real provider charge.

Usage starts as a separately committed `pending` row before calling the provider, then records `succeeded` or `failed`, feature, model, latency, timestamps and token counts. These commits survive rollback of the request transaction. A process crash can leave a `pending` row with an unknown outcome; it is not automatically retried. Failed/unknown calls do not claim zero cost. Usage stores no prompt or response content. SDK message logging is disabled.

`inputTokens`, `outputTokens` and `units` (total tokens) are nullable when the provider omits usage. `costUsd` is a decimal estimate from LiteLLM's model pricing, marked by `costEstimated=true`; it is not a reconciled provider invoice or an INR charge. Unknown/custom model prices remain `null`. The frontend's existing INR usage mocks are not wired to these USD values. See [LiteLLM token usage and costs](https://docs.litellm.ai/docs/completion/token_usage) and [compatible endpoint configuration](https://docs.litellm.ai/docs/providers/openai_compatible).

Migration 0007 creates `ai_credentials` and `ai_usage` with BIGINT identity keys, tenant foreign keys, and forced RLS. Only the API role currently needs these tables; the ingestion worker does not call AI. Two focused tests use real Postgres and actual LiteLLM adapters with substituted HTTP delivery. Live account checks require the customer's provider key; no real provider credentials were used during development. This completes the seven original backend steps. The capture frontend and WhatsApp loop are now integrated; business AI actions and the AI settings frontend remain pending.


## WhatsApp follow-up and inbox

Migration `0008` adds encrypted WhatsApp credentials, conversations and a message outbox. All three tables use BIGINT identities, tenant-qualified foreign keys and forced RLS. The existing raw-event inbox/job queue also handles signed inbound messages and delivery callbacks. One WhatsApp phone number is supported per workspace; its conversations share existing CRM contacts and lead permissions.

### Configure a pilot

1. Apply migrations and restart the API and worker. Set `JANUS_META_GRAPH_VERSION` on **both** to the supported version selected in your Meta app (`vXX.0`). Janus does not guess an API version.
2. Make `JANUS_PUBLIC_API_URL` publicly reachable over HTTPS. Keep `/v1/ingest/whatsapp/*` reachable by Meta, without browser authentication. Janus verifies every POST using the raw-body `X-Hub-Signature-256` and your app secret.
3. Prepare a registered Cloud API phone number, WABA ID, phone number ID, app secret and system user token with `whatsapp_business_management` and `whatsapp_business_messaging`. In Janus, a verified Owner/Admin opens **Lead Sources → WhatsApp Business** and saves those credentials. Janus checks that the phone belongs to the WABA through Meta before saving it.
4. Copy the callback URL and the **one-time verify token** into your Meta app's WhatsApp webhook configuration. Verify the callback, subscribe to the `messages` field, and subscribe the app to the WABA. These are separate Meta configuration steps; a successful GET verification alone does not subscribe the app. Refresh the connection in Janus.
5. Create an approved text template in WhatsApp Manager. This first version supports a text body with positional parameters (`{{1}}`, `{{2}}`), plus static text headers/footers. Media headers, named parameters and buttons are deliberately excluded. Template discovery reads the first 100 returned records; sending rechecks the selected name/language against Meta.
6. Open a captured lead with a phone number, choose **WhatsApp follow-up**, select and review the template, confirm the customer's WhatsApp opt-in and send. Reply from the customer number; it should appear in the same inbox conversation. A new incoming customer creates a lead; subsequent messages reuse the contact/lead instead of creating a lead for every reply.

Saving credentials again rotates the callback verify token and pauses sends until Meta verifies it again. Phone/WABA changes are blocked to keep existing conversations attached to their original business identity. There is no embedded-signup/OAuth onboarding flow yet; this is direct credential setup for the pilot. No credentials are returned by GET endpoints, and no Graph tokens are written to URLs or logs.

### API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET / PUT | `/v1/whatsapp/connection` | Read safe metadata / validate and save `wabaId`, `phoneNumberId`, `accessToken`, `appSecret`; PUT requires verified `sources:manage` |
| GET | `/v1/whatsapp/templates` | Supported approved templates from Meta; requires lead write permission |
| GET / POST | `/v1/whatsapp/conversations` | List visible conversations / open one for an accessible `contactId` |
| GET | `/v1/whatsapp/conversations/{id}` | Contact summary and reply window |
| GET / POST | `/v1/whatsapp/conversations/{id}/messages` | Read history / queue a text or approved-template message; POST returns 202 |
| GET / POST | `/v1/ingest/whatsapp/{public_key}` | Meta verification handshake / signed transactional ingestion |

List endpoints accept `limit` (maximum 100) and `before_id` (0 for the latest page). Conversations are ordered by creation ID descending; message pages return their selected records in display order. POST message requires `Idempotency-Key`; repeating the same key/body returns the original message, and changing the body for that key returns 409. Sending requires a verified user with `leads:write` and access to that customer.

Text: `{"kind":"text","body":"I will prepare the quote."}`. Template: `{"kind":"template","templateName":"enquiry_followup","language":"en_US","parameters":["Asha"],"optInConfirmed":true}`. Template text is fetched/rendered on the server, not accepted as a browser-provided preview. The operator's opt-in confirmation is recorded in the audit log. This is a manual follow-up workflow; there is no automatic send on lead creation.

Free-form replies are accepted only within 24 hours of the latest inbound customer message, checked both when queued and immediately before dispatch. Out-of-window messages require an approved template. Meta documents the [customer support window](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object) and the [messages endpoint](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc).

### Delivery and failure handling

The worker claims outgoing rows using `FOR UPDATE SKIP LOCKED`, commits `sending`, then calls Meta. It checks the current membership, permission, connection and reply window before dispatch. A successful POST means **accepted by Meta**, not delivered. Signed webhooks advance `sent` → `delivered` → `read` without regressing on late events. Callback correlation can reconcile a lost send response using `biz_opaque_callback_data`.

A network timeout, unreadable response or stale worker claim becomes `unknown`; it is never automatically resent. A definite Meta rejection becomes `failed`. Review those results before composing a new send. This deliberately favors avoiding duplicate customer messages over blind retries. Queue submission itself is safe to retry with the same idempotency key. The frontend preserves that key while retrying the same draft.

Inbound duplicates are deduplicated by Meta message ID. Unknown message types/media are retained in the raw receipt and displayed honestly as unsupported; this version does not download, play or upload attachments. Incoming text/button replies are supported. The UI polls every five seconds and pages history in groups of 50. No AI-generated reply or conversation content is fabricated.

### Verification

`tests/test_whatsapp.py` is one integration scenario against real restricted Postgres roles. It covers captured lead → template outbox → customer reply, idempotency, signature rejection, status ordering, uncertain-send reconciliation, disabled senders, crash recovery, new WhatsApp leads and tenant isolation. Only Meta's network boundary is intercepted inside the test. Production code always calls the official Graph API host. Live delivery must still be checked with an actual Meta account and HTTPS callback; local checks do not prove account approval, subscriptions or template delivery.


## Deal pipeline

Migration `0009` adds `deals` with BIGINT identity keys, a tenant-qualified lead foreign key, a unique `(tenant_id, lead_id)` constraint and forced RLS. The first pilot supports one deal per lead. Customer identity and ownership come from the linked lead rather than independent copies. All reads, changes and history checks use existing own/team/all lead visibility; mutations require `leads:write` and an active membership.

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/leads/{id}/deal` | Create a deal or return the existing deal for this lead. Repeated requests never overwrite it or create duplicates. |
| `GET /v1/deals?after_id=0&limit=100` | Ascending ID pagination, filtered to visible lead owners. |
| `GET /v1/deals/{id}` | Deal, current contact details and inherited owner. |
| `PUT /v1/deals/{id}` | Save editable values with the current `version`; returns 409 for stale versions. |
| `GET /v1/deals/{id}/events?limit=50&before_id=...` | Newest-first audit history with cursor pagination. |

Creation accepts `name`, `amount` (INR decimal string), `stage` (defaults to `new`), optional `expectedCloseAt` (date), and `lostReason`. Updates accept those fields plus the current `version`. Stages match the existing board: new, qualified, demo, proposal, negotiation, approval, won, lost. Lost requires a nonblank reason; reopening clears the current reason but retains it in history. Moving to Approval only tracks status and never authorizes consequential business actions.

Amounts use Postgres `NUMERIC(14,2)` and Python Decimal; responses use strings. Invalid, negative, nonfinite and over-precision values are rejected. Creation locks the lead to serialize duplicates; edits lock the deal and check its version. Deal changes, mirrored lead stage/activity and append-only `audit_log` events commit together. No forecast probabilities, AI actions, proposals or invoice delivery are fabricated. Board search and totals are page-local (100 deals); the UI labels them accordingly.

`tests/test_deals.py` adds one real-Postgres scenario covering captured lead → deal → stage changes/history, concurrent creation and stale writes, loss/reopen, exact values, inherited permissions, disabled membership and RLS isolation. Pipeline UI changes do not call Meta or any payment provider.

# Janus pilot on one VPS

This packages the sellable flow: capture → saved lead → WhatsApp follow-up → inbox reply → deal pipeline. Use an India-hosted VPS, two DNS hostnames, SMTP and an approved Meta WhatsApp account. Nothing here provisions a VPS or changes DNS. Local checks do not prove that Meta or SMTP will deliver.

## First deployment

Install Docker Engine with Compose v2 or newer, Git and Python 3 on the VPS. Clone this repository, keep its checkout private, and run these commands from the repository root. Build containers on the VPS or a matching Linux build host; the frontend build fetches its existing Google Fonts. Leave enough memory and disk for both image builds and the database.

```sh
python3 deploy/configure.py init
# Edit deploy/.env on the VPS. It is created with mode 600 and fresh secrets.
# Fill APP_DOMAIN, API_DOMAIN, TLS_EMAIL, SMTP values and JANUS_META_GRAPH_VERSION.
python3 deploy/configure.py check

dc() { docker compose --env-file deploy/.env -f deploy/compose.yml "$@"; }
dc build api web
dc up -d
dc ps -a
dc logs --tail=100 api worker
```

Set `APP_DOMAIN` and `API_DOMAIN` to different hostnames you control, without a scheme, port or path. Point their A records at the VPS; publish AAAA records only if IPv6 reaches that same server. Allow inbound TCP 80 and 443 plus your restricted SSH access. Caddy obtains and renews HTTPS certificates after DNS and those ports are reachable. Its certificate data persists in named volumes. See [Caddy HTTPS prerequisites](https://caddyserver.com/docs/automatic-https).

Enter SMTP credentials directly in `deploy/.env`, using port 587 with STARTTLS for this setup. Single-quote values containing `$` or `#`. The configuration check reads Compose's parsed output without printing secrets. It checks syntax and service boundaries, not DNS, SMTP credentials or provider approval. Do not share `docker compose config` output: it contains secrets. Runtime API/worker containers never receive the migration password, and the frontend receives only its three server-side origin variables.

The database is private to the Compose network; only Caddy publishes host ports. Postgres must become healthy and migrations must finish before the API/worker start. The frontend waits for the API, and the proxy waits for the frontend. These dependencies follow [Compose startup conditions](https://docs.docker.com/compose/how-tos/startup-order/). API/frontend health checks are liveness checks; an actual captured enquiry verifies database and worker processing. There is no worker heartbeat or automatic external monitoring yet.

`init` refuses to overwrite an existing file. Keep a separate encrypted backup of `deploy/.env`, especially `JANUS_ENCRYPTION_KEY`. Changing that key makes saved WhatsApp/provider credentials unreadable. Changing a database password in `.env` does not change an existing Postgres role; role rotation requires a coordinated database update.

## Voice calls

Team Chat calls connect browser to browser. When two people cannot reach each other directly, as on most office and mobile networks, the call relays through the `turn` service (coturn). Point `TURN_DOMAIN` at this VPS with an A record, and allow inbound UDP and TCP 3478 plus UDP 49160–49200. `init` generates `JANUS_TURN_SECRET`; on an existing install, add it to `deploy/.env` yourself with `python3 -c "import secrets; print(secrets.token_hex(32))"`, and set `TURN_DOMAIN`. The API mints each person a TURN credential that lasts an hour, so the secret never reaches a browser.

The relay refuses private, loopback and link-local addresses, so it cannot be used to reach this server's own network. It listens without TLS; browsers still encrypt the call media end to end. A call is a mesh, one connection per pair of people, which suits small team calls; a large call would need a media server. Relayed calls use this VPS's bandwidth.

## Push notifications

Announcements and kudos reach people's browsers even when Janus is closed, once they choose
"Turn on desktop notifications" in Team Chat's menu. `configure.py init` generates
`JANUS_VAPID_PRIVATE_KEY`; set `JANUS_VAPID_SUBJECT` to a `mailto:` address push services can
reach about problems. For an existing `deploy/.env`, add the key with:

```bash
python3 -c "import base64,secrets;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode())"
```

Changing the key later makes every browser subscribe again on its next visit. Without a key,
announcements still go by email and appear as alerts while Janus is open.

## First real enquiry

1. Open the app over HTTPS. Create the pilot workspace, receive its verification email, verify it and sign in. Check that the email links use the app domain.
2. Create a Website Form source and allow the exact origin hosting the form. Install its generated snippet on a page you control and submit an enquiry for a phone number you control. Verify the ingestion result and saved lead. CSV imports can separately check worker processing.
3. In Lead Sources → WhatsApp Business, enter the actual WABA ID, phone number ID, system-user token and app secret. These belong in the Janus UI, never the Git checkout or chat.
4. Configure the displayed HTTPS callback in Meta using the one-time verify token. Verify it, subscribe to `messages`, and subscribe the app to the WABA. These are separate Meta setup steps. Refresh Janus to check its connection status. Follow [the complete WhatsApp setup](../backend/README.md#whatsapp-follow-up-and-inbox).
5. Use an approved text template and a recipient who has opted in and is allowed by the Meta account's current mode. Open the lead → WhatsApp follow-up, review the message and press Send. Check accepted → delivered/read status; an accepted request alone is not proof of delivery.
6. Reply from that phone. Confirm the reply appears in the same inbox thread without creating another lead. Send a text reply while the reply window is open.
7. Open the lead, create a deal, move its stage and reload. Confirm the stage on both the deal and lead and inspect the saved history.

An uncertain send must not be retried blindly: the existing outbox waits for a signed callback to resolve it. If setup fails, inspect API/worker logs and the source's ingestion events. The HTTPS proxy does not enable access logs and strips request objects from runtime errors, so email-link and webhook tokens do not appear there. Do not enable credential/request logging for diagnosis.

No WhatsApp message is sent by deployment or configuration checks. Live delivery is a separate operator-driven action. Media attachments, embedded Meta OAuth signup, quote/invoice delivery, automated follow-ups, Sentry and automatic monitoring remain outside this pilot package. Avatar uploads require the optional S3 variables; message attachments are not implemented. SMTP and Meta process data outside Postgres: hosting the VPS in India alone is not a data-residency or legal-compliance guarantee.

## Backup and recovery

```sh
sh deploy/backup.sh /private-backup-directory
```

The script creates a private, timestamped Postgres custom-format dump, retains role grants/RLS definitions, and only renames the partial file after a successful dump. It never deletes older backups. Run it before updates and on your chosen daily schedule, copy the dumps to encrypted off-server storage, and regularly restore one into an isolated server. No backup schedule is installed by this repository. A dump without the original encryption key cannot recover encrypted integration credentials.

On an **isolated recovery server**, use the same checkout and securely restore the original `deploy/.env`. Start only Postgres so the initializer creates the restricted roles; do not start migrations or the app yet:

```sh
dc up -d postgres
# Wait for healthy status in dc ps.
dc exec -T postgres pg_restore -U janus -d janus --no-owner --exit-on-error < /path/to/janus-backup.dump
```

Restore into a fresh, empty database. Do not use `--clean` or restore over the live pilot. Verify the restored data and grants, run migrations for the intended release, and only then start the API/worker/web/proxy. Use the test flow above before directing customers to the recovered server. Never run `docker compose down -v` on the live deployment; that deletes its database and certificate volumes.

## Updates

Keep the previous application image/release available until the update is verified. Build the next release, take a backup and stop traffic/writes during the migration:

```sh
dc build api web
sh deploy/backup.sh /private-backup-directory
dc stop proxy web api worker
dc run --rm --no-deps migrate
dc up -d
dc ps -a
```

If migration fails, leave the writers stopped and investigate. Do not automatically downgrade a live schema. Restore a tested backup into an isolated database with the matching prior release if rollback is needed. Major database upgrades are separate operations; this deployment keeps Postgres on version 16.

## Local checks

```sh
python3 scripts/check-pilot-config.py
# Against a disposable local instance, verified account and running worker:
JANUS_WEB_ORIGIN=http://127.0.0.1:3000 \
JANUS_TEST_EMAIL=test@example.com \
JANUS_TEST_PASSWORD='<local-test-password>' \
node scripts/check-web-api.mjs
```

The existing web check now covers session cookies, CSRF rejection, refresh, CSV ingestion, worker results, saved lead/contact, deal creation/stage/history and logout. It refuses non-local origins and never sends WhatsApp messages. For a locally trusted HTTPS certificate, use `NODE_EXTRA_CA_CERTS` pointing to that test CA rather than disabling TLS verification. Production uses publicly trusted certificates.

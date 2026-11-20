# Deploying HamPath

HamPath runs as Docker containers on a self-hosted Docker VM (called **vm104** here; the runner label uses that name), behind **Nginx Proxy Manager** (NPM). GitHub Actions tests every push. A merge to `main` that passes CI deploys itself through a self-hosted runner on the VM, so nothing on the LAN is exposed to GitHub.

```
                 Internet
                    │  https://hampath.<domain>
             ┌──────▼──────┐
             │ Nginx Proxy │  TLS (Let's Encrypt), HSTS, websockets not needed
             │  Manager    │
             └──────┬──────┘
                    │  http://<vm104>:8090
┌───────────────────▼──────────── vm104 · docker compose project "hampath-prod" ───┐
│  web   Next.js standalone, :3000 → host :8090    the only published port   │
│   │      /api/* rewritten to ↓                                             │
│  api   Fastify (tsx), :4000                        private network only    │
│   │                                                                        │
│  db    Postgres 16, volume hampath-prod_pgdata         private network only    │
│  migrate   one-shot on each deploy: migrate, seed, load content            │
│  backup    nightly pg_dump → /opt/hampath/backups (14 days)                │
└────────────────────────────────────────────────────────────────────────────┘
        errors → GlitchTip (or Sentry)        uptime ← Uptime Kuma
```

## Files

| File                            | What it is                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `docker-compose.prod.yml`       | The production stack                                                                    |
| `apps/web/Dockerfile`           | Web image (Next standalone, non-root)                                                   |
| `apps/api/Dockerfile`           | API image; also runs the `migrate` service (non-root)                                   |
| `deploy/backup.sh`              | The backup service's script                                                             |
| `deploy/monitoring.compose.yml` | Optional: Uptime Kuma and GlitchTip, if you don't run them already                      |
| `.env.production.example`       | Every setting, documented. The real file lives on the server only.                      |
| `.github/workflows/ci.yml`      | Lint, format, types, dependency audit, tests, content coverage, web build, image builds |
| `.github/workflows/deploy.yml`  | Deploys `main` after CI passes; can also be run by hand                                 |

## One-time setup on vm104

Install Docker and the Compose plugin if the VM doesn't have them.

1. **Directories and settings.**

   ```sh
   sudo mkdir -p /opt/hampath/backups && sudo chown -R "$USER" /opt/hampath
   curl -fsSL https://raw.githubusercontent.com/<you>/HamPath/main/.env.production.example -o /opt/hampath/.env.production
   chmod 600 /opt/hampath/.env.production
   ```

   (For a private repo, copy the example over with `scp` instead.) Fill it in:
   - `APP_ORIGIN`: the public address, such as `https://hampath.example.com`.
   - `POSTGRES_PASSWORD` and `ADMIN_TOKEN`: generate each with `openssl rand -base64 36`.
   - `SMTP_URL` and `MAIL_FROM`: magic-link sign-in needs working e-mail. Any SMTP relay works, for example your provider's, or Brevo or Mailgun.
   - `WEB_PORT=8090`, or any free port on the VM. Set `WEB_BIND=0.0.0.0` if NPM runs in another VM or LXC, or `127.0.0.1` if it runs on vm104.
   - `BACKUP_DIR=/opt/hampath/backups`.
   - Optional: Google sign-in, error monitoring and the backup push monitor (below).

2. **The runner.** The deploy job runs on `[self-hosted, vm104]`. Register a runner for HamPath under GitHub → HamPath → Settings → Actions → Runners → New self-hosted runner (Linux):
   - install it in `/opt/hampath/actions-runner`;
   - give it the label `vm104`;
   - start it with `sudo ./svc.sh install && sudo ./svc.sh start`.

   The runner's user must be in the `docker` group.

3. **The GitHub environment.** Create the environment `production` under Settings → Environments. It holds no secrets, because they live in `/opt/hampath/.env.production`, but it gives you a deploy history and lets you add a required reviewer if you ever want approval before going live.

4. **Nginx Proxy Manager.** Add a proxy host:
   - Domain: `hampath.example.com`
   - Scheme `http`, forward host: vm104's LAN IP, forward port `8090`
   - Turn on: Block Common Exploits. Websockets aren't needed.
   - SSL tab: request a Let's Encrypt certificate, then turn on Force SSL, HTTP/2 and HSTS.

   NPM sets `X-Forwarded-For` and `X-Forwarded-Proto`. The API trusts forwarded headers only from private addresses (`TRUST_PROXY`), which covers NPM on the LAN.

5. **Google sign-in** (optional). Create an OAuth client of type "Web application" in Google Cloud. The authorised redirect URI is `https://hampath.example.com/api/v1/auth/google/callback`. Put the client id and secret in `.env.production`.

6. **First deploy.** Merge to `main`, or run Actions → Deploy → Run workflow. On an empty database the `migrate` service seeds the lessons, imports the question bank and loads all content. Then make yourself an admin:

   ```sh
   docker compose -p hampath-prod exec api node_modules/.bin/tsx ../../packages/db/src/cli/make-admin.ts you@example.com admin
   ```

   Sign in once first, so the account exists. Use `instructor` instead of `admin` for club instructors.

## How a deploy runs

`deploy.yml` starts when CI succeeds on a push to `main`:

1. It checks out the exact commit CI tested, into the runner's workspace.
2. It dumps the live database to `/opt/hampath/backups/pre-deploy-<time>-<sha>.sql.gz`.
3. It runs `docker compose -f docker-compose.prod.yml --env-file /opt/hampath/.env.production up -d --build --remove-orphans`. The images are built on the VM; there's no registry.
   - `migrate` runs first and must succeed: migrations, seeding and content loading, all idempotent.
   - Then `api` starts and waits for its health check, then `web`.
4. It health-checks through the public port, `/api/v1/health` (web → API → database) and `/`. On failure it prints the containers' logs and the job fails.
5. It prunes old images.

The compose project name is fixed (`hampath-prod`), so containers and the `hampath-prod_pgdata` volume carry over from deploy to deploy, whichever workspace the runner checked out.

**Roll back:** Actions → Deploy → Run workflow, and enter the last good commit SHA. A schema migration is not undone by redeploying older code. If you need to go back across one, restore the pre-deploy backup (below).

## Error monitoring

HamPath uses Sentry's SDK, which works with **GlitchTip** (self-hosted, free) or sentry.io. The API reports unexpected errors (500s), the web server reports rendering errors, and the browser reports script errors. Cookies, request bodies and auth headers are stripped before anything is sent.

1. Run GlitchTip, unless you already have it. Use `deploy/monitoring.compose.yml` with a `/opt/hampath/monitoring.env` holding:
   - `GLITCHTIP_DB_PASSWORD` and `GLITCHTIP_SECRET_KEY` (`openssl rand -base64 36`);
   - `GLITCHTIP_DOMAIN=https://errors.example.com`;
   - optionally `GLITCHTIP_EMAIL_URL` for alert e-mails.

   Start it with `docker compose -f deploy/monitoring.compose.yml --env-file /opt/hampath/monitoring.env up -d`, and proxy `errors.example.com` to port 8000 in NPM. Create the first user with `docker compose -f deploy/monitoring.compose.yml exec glitchtip-web ./manage.py createsuperuser`.

2. In GlitchTip, create an organisation and a project called HamPath, and copy its DSN.
3. In `/opt/hampath/.env.production`:
   - `SENTRY_DSN=<dsn>` for server errors;
   - `SENTRY_DSN_BROWSER=<dsn>` for browser errors (it's built into the web image, so it takes effect on the next deploy);
   - `CSP_CONNECT_EXTRA=https://errors.example.com`, so the Content Security Policy lets the browser send reports.
4. Redeploy. Every event is tagged with the deployed commit (`APP_VERSION`), so you can see which release an error came from.

## Uptime checks

In Uptime Kuma (`deploy/monitoring.compose.yml` includes it on port 3001; proxy it as `status.example.com`), add:

| Monitor            | Type                  | Target                                      | Notes                                                                                |
| ------------------ | --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| HamPath site       | HTTP(s) keyword       | `https://hampath.example.com/`              | Keyword `HamPath`; every 60 s                                                        |
| HamPath API and DB | HTTP(s) JSON          | `https://hampath.example.com/api/v1/health` | Expects `{"ok":true}`; this fails if Postgres is down                                |
| HamPath TLS        | (on the site monitor) | certificate expiry                          | Alert 14 days before expiry                                                          |
| HamPath backups    | Push                  | heartbeat interval 25 h                     | Put the push URL in `BACKUP_PUSH_URL`; the backup job pings it after every good dump |
| HamPath origin     | HTTP                  | `http://<vm104>:8090/api/v1/health`         | Optional: tells "NPM is down" apart from "HamPath is down"                           |

Point the notifications wherever you get the homelab's other alerts. The containers also have Docker health checks and `restart: unless-stopped`.

## Backups and restore

- **Nightly:** the `backup` service writes `hampath-YYYYMMDD-HHMMSS.sql.gz` to `/opt/hampath/backups` at about 03:00 and keeps 14 days (`BACKUP_KEEP_DAYS`).
- **Before every deploy:** `pre-deploy-*.sql.gz`, written by the workflow.
- **Off the VM:** include `/opt/hampath/backups` in the Proxmox backup job, or sync it elsewhere. A backup that stays on the same VM is only half a backup.

To restore:

```sh
cd <the runner's HamPath checkout>   # or any checkout of the repo
COMPOSE="docker compose -f docker-compose.prod.yml --env-file /opt/hampath/.env.production"
$COMPOSE stop web api
gunzip -c /opt/hampath/backups/<file>.sql.gz | $COMPOSE exec -T db psql -U hampath -d hampath
$COMPOSE up -d
```

The dumps use `--clean --if-exists`, so a restore replaces the tables it contains.

## Updating the question bank

When ISED publishes a new bank, use the admin page at `/admin/bank`: upload the file, review the diff, then apply it (see `PHASE-3.md`, Step 33). Then commit the new file to `content/bank/` and update any affected lessons. CI's content checks will point at them. Don't edit the bank file by hand.

## Security notes

The application's protections are in `SECURITY.md`. For this setup specifically:

- Only port 8090 is published. Postgres and the API are on the stack's private network.
- Both images run as a non-root user.
- `.env.production` stays on the server, mode 600, and is never in git or in an image (`.dockerignore` excludes it).
- `ADMIN_TOKEN` is refused if it's left as a `change-me` placeholder.
- NPM handles TLS and HSTS. The app adds its own CSP, HSTS and other headers.
- Keep `RATE_LIMITS` unset in production. Rate limits count per session, or per address for sign-in, so a classroom behind one school IP works fine.

## Running the production stack locally

To try the production images on your own machine:

```sh
cp .env.production.example .env.production.local   # set APP_ORIGIN=http://localhost:8090, any passwords,
                                                     # SMTP_URL=smtp://host.docker.internal:1025 (Mailpit), BACKUP_DIR=./backups
docker compose -f docker-compose.prod.yml --env-file .env.production.local up -d --build
```

It uses its own project name and volume, so it doesn't disturb `pnpm dev`.

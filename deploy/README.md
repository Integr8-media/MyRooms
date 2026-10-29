# Deploying the backend on the VPS

The backend runs on our own VPS (Oracle Cloud) with Docker, behind the Caddy that already runs there:

```
                 Internet (HTTPS)
                        │
                 Caddy (on the VPS host)
          ┌─────────────┴──────────────┐
 api.<domain> → 127.0.0.1:8000    sync.<domain> → 127.0.0.1:8080
          │                            │
 Self-hosted Supabase stack       PowerSync stack
 (gateway, auth, rest, db, …)     (powersync + its storage db)
          └────── Docker network `supabase_default` ──────┘
                 PowerSync reads changes from `db`
```

- **Supabase**: the official self-hosted Docker setup, pinned to `self-hosted/v0.8.3`. Its files are downloaded by `supabase/setup.sh` and live outside this repo, because they hold secrets.
- **PowerSync**: `powersync/docker-compose.yml` from this repo.
- Both run on ARM (Oracle Ampere) and x86.
- **Requirements**: Supabase needs at least 4 GB RAM (8 GB recommended), PowerSync about 1 GB more, plus Docker Compose v2.24+ and git.

## 1. DNS

Create two A records pointing at the VPS public IP, for example:

- `api.example.com`: Supabase API and the Studio dashboard
- `sync.example.com`: PowerSync

In the Oracle Cloud console, the subnet's security list (and the VPS firewall) must allow inbound **80** and **443**, which Caddy needs. Don't open 8000, 8080 or 5432: those stay private to the VPS.

## 2. Install Supabase

On the VPS:

```sh
git clone <this repo> ~/myrooms/app && cd ~/myrooms/app/deploy
sh supabase/setup.sh              # creates ~/myrooms/supabase with generated secrets
```

## 3. Configure Supabase

Edit `~/myrooms/supabase/.env`:

| Variable                                    | Value                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `SUPABASE_PUBLIC_URL`                       | `https://api.example.com`                                             |
| `API_EXTERNAL_URL`                          | `https://api.example.com/auth/v1`                                     |
| `SITE_URL`                                  | URL of the web app (e.g. `https://app.example.com`)                   |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio login (letters and numbers only)                               |
| `ENABLE_ANONYMOUS_USERS`                    | `true` for now (Phase 0 sync demo). Set back to `false` in Phase 1.   |
| `SMTP_*`                                    | Mail server for sign-up / password reset emails (needed from Phase 1) |

Then start it:

```sh
cd ~/myrooms/supabase
sh run.sh start
docker compose ps                 # all services should be "healthy"
sh run.sh secrets                 # shows the publishable key for the app's .env.local
```

## 4. Caddy

Add the two blocks from `caddy/Caddyfile.example` (with your domains) to the VPS Caddyfile and reload Caddy (`sudo systemctl reload caddy`, or `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile` if Caddy runs in Docker; see the note at the bottom of the example).

Check: `https://api.example.com` should ask for the Studio login.

## 5. Apply the database migrations

The migrations in `supabase/migrations/` are applied from a developer PC through an SSH tunnel, so Postgres is never exposed publicly.

```sh
# Terminal 1: tunnel local port 54329 to the VPS pooler
ssh -N -L 54329:127.0.0.1:5432 <user>@<vps-ip>

# Terminal 2: from the repo root
# POOLER_TENANT_ID and POSTGRES_PASSWORD come from ~/myrooms/supabase/.env on the VPS
npx supabase db push --db-url "postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:54329/postgres"
```

Then give the PowerSync database role a password (once per server):

```sh
# on the VPS
docker exec -it supabase-db psql -U postgres -c "alter role powersync_role with password '<new-random-password>';"
docker exec -it supabase-db psql -U postgres -c "show wal_level;"     # must print: logical
```

## 6. Install PowerSync

```sh
cd ~/myrooms/app/deploy/powersync
cp .env.example .env              # fill in: powersync_role password, storage password, admin token
docker compose up -d
docker compose logs -f powersync  # should show replication starting, no errors
```

Check: `curl https://sync.example.com/probes/liveness` should succeed.

## 7. Point the app at the VPS

In the repo root `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://api.example.com
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<from `sh run.sh secrets`>
EXPO_PUBLIC_POWERSYNC_URL=https://sync.example.com
```

Restart the app. The "Offline sync check" card should show **Online**. Add a record, then turn Wi-Fi off, add more, and turn it back on: the "Waiting to upload" count should drop to 0, and the records should appear in Studio → Table editor → `sync_checks`.

## Updating

- **Sync rules** (`powersync/sync-config.yaml`): `git pull`, then `docker compose restart powersync`.
- **New migrations**: repeat step 5 (`supabase db push`).
- **Supabase version**: follow the official upgrade notes, using `sh run.sh` and `update.sh` in `~/myrooms/supabase`.

## Backups

The Supabase data is in `~/myrooms/supabase/volumes/db/data`. Until automated backups are set up (Phase 9), take a nightly dump:

```sh
docker exec supabase-db pg_dump -U postgres -Fc postgres > ~/backups/myrooms-$(date +%F).dump
```

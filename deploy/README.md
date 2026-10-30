# Deploying MyRooms

The backend and the web app run on our own VPS (Oracle Cloud) with Docker, behind the Caddy that already runs there. The Windows, Android and iOS apps are built separately and connect to the same backend.

The same guide is published as a page (kept in sync with this file): see `CLAUDE.md` for the link.

```
                 Internet (HTTPS)
                        │
                 Caddy (on the VPS host) ── app.<domain> → /var/www/myrooms (web app files)
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

Create three A records pointing at the VPS public IP, for example:

- `app.example.com`: the web app
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

| Variable                                    | Value                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_PUBLIC_URL`                       | `https://api.example.com`                                                                                                    |
| `API_EXTERNAL_URL`                          | `https://api.example.com/auth/v1`                                                                                            |
| `SITE_URL`                                  | URL of the web app (e.g. `https://app.example.com`)                                                                          |
| `ADDITIONAL_REDIRECT_URLS`                  | `https://app.example.com/**,myrooms://**` (where email links may send people back to)                                        |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio login (letters and numbers only)                                                                                      |
| `ENABLE_ANONYMOUS_USERS`                    | `false` (Phase 1 uses real accounts)                                                                                         |
| `ENABLE_EMAIL_SIGNUP`                       | `true`                                                                                                                       |
| `ENABLE_EMAIL_AUTOCONFIRM`                  | **`false`**. Accepting a staff invitation trusts the confirmed email, so confirmation must stay on.                          |
| `SMTP_*`                                    | Mail server for confirmation, password-reset and invitation emails. **Required**: without it nobody can confirm their email. |
| `MAILER_URLPATHS_*`                         | Leave the defaults (`/auth/v1/verify`).                                                                                      |

Then start it:

```sh
cd ~/myrooms/supabase
sh run.sh start
docker compose ps                 # all services should be "healthy"
sh run.sh secrets                 # shows the publishable key for the app's .env.local
```

## 4. Caddy

Create the web app folder (`sudo mkdir -p /var/www/myrooms && sudo chown $USER /var/www/myrooms`), then add the three blocks from `caddy/Caddyfile.example` (with your domains) to the VPS Caddyfile and reload Caddy (`sudo systemctl reload caddy`, or `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile` if Caddy runs in Docker; see the note at the bottom of the example).

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
EXPO_PUBLIC_APP_URL=https://app.example.com
```

Restart the app, then check the whole flow:

1. **Create account** → open the confirmation email → **Sign in**.
2. **Create organization** (name + first branch). The home screen shows the branch, and the **Sync** card shows **Online**.
3. Offline test: turn Wi-Fi off, go to Settings → Branches → **Add branch**. "Waiting to upload" becomes 1. Turn Wi-Fi on: it drops to 0, and the branch appears in Studio → Table editor → `branches`.
4. Settings → Staff → **Invite** a second email as Cashier for one branch. Sign in with that email on another device or browser: the invitation shows on the welcome screen; **Join** it. The cashier sees only that branch and no Staff or Branches settings.
5. As the owner: Settings → **Station types & prices** → add a type (e.g. PS5 Room, 4 players), a base price, a peak price (18:00–24:00, priority 10) and a 3-hour package. Then Settings → **Stations** → add 3 stations at once and put one in maintenance. The cashier sees the stations and the prices (read-only) and can't add stations.
6. Settings → **Price preview**: 17:00 to 19:30 should cost 1 hour at the base price plus 1.5 hours at the peak price.
7. **Live floor** (home screen): tap a free station → **Start session** (Open). The card turns blue and its timer and cost run. On the cashier's device the same station shows as playing within a few seconds. The station in maintenance can't be tapped.
8. Start a **Fixed time** session of 30 min on another station, then open it and **Add time** +15 min; change the players (if the type allows more than 1) and **Move** it to a free station. **End** it after confirming: the estimated bill lists each part.
9. Alerts: Settings → Account → **Session alerts** → allow notifications. Start a fixed session with a custom duration of 6 minutes: about a minute later you get "5 minutes left", then "time is up" (web/Windows: the app must be open; phones: works in the background).
10. As the cashier, open a running session: there is no **Cancel session** button (owners and managers only). Offline test: switch Wi-Fi off, start and end a session, switch it back on; the session appears in Studio → `sessions`.

Checkout (Phase 4) needs the `create-bill` Edge Function, so do **step 7b first**:

11. **End** a session: the app opens **Checkout** with the bill. "Number given after sync" changes to "Receipt #1" a few seconds later, and the bill appears in Studio → `bills` with the same total.
12. Take part of the bill by **Cash** (enter what the customer handed over to see the change), then the rest by **Instapay** with a reference. The bill shows **Paid**, and Studio → `payments` has both rows with your name in `received_by`.
13. As a manager: on a new bill, **Give a discount** (10 %) before taking payment; on a paid bill, **Refund** part of it with a reason; on another bill, **Void** it with a reason. Studio → `audit_log` lists each one. As the cashier, none of these buttons show.
14. **Print or share receipt**: web/Windows opens the print dialog (choose "Save as PDF" to keep a copy); phones open the share sheet with a PDF. Check it in Arabic too.
15. Offline test: switch Wi-Fi off, end a session and take a cash payment, switch it back on. The bill gets its number, and `payments` has the row. Ended sessions that aren't fully paid are listed under **Waiting for payment** on the floor.

Income (Phase 5) needs no new server parts: it is worked out on each device from the synced payments. After a few bills from items 11–15:

16. As the owner, tap **Income** on the floor: **Today** shows the total, the split by Cash / Visa / Instapay, by branch (with 2+ branches) and by station type, matching the payments in Studio → `payments` (refunds subtracted, void bills left out). Try **This week**, **This month** and a **Custom** range, and pick one branch.
17. As the cashier, tap **My shift**: only the payments they took themselves today, by method, with each payment listed. No other periods or branches. As a manager, only their branches show.

Reservations (Phase 6) need only the new migration (step 5; it turns on the `btree_gist` extension, which self-hosted Supabase ships). No new sync stream, setting or Edge Function:

18. As the cashier, tap **Calendar** on the floor, tap an empty slot on a station at a time later today, enter a name and **Book**. The block appears on the calendar, and in Studio → `sessions` with `kind = reservation`, `status = reserved`. Tap the block to select it, drag it to another time and to another station, and drag its end to make it longer; Studio follows. On a tablet or desktop, try the **Week** view.
19. Book the same station and time again: the app refuses it ("already booked"). **Double booking from two devices:** switch Wi-Fi off on two devices, book the same station and time on both, then switch Wi-Fi on. Only one reservation stays; the other device shows it under **Not saved** (floor and calendar) with **Book again**.
20. 30 minutes before a reservation, the station shows **Reserved soon** on the floor and the booking is listed under **Arrivals**. A walk-in that would run into it gets a warning. Open the reservation and **Check in**: it becomes a playing session that ends at the booked time (checkout as usual). If the station is still busy, use **Check in on another station**.
21. For a reservation nobody came to: **Mark as no-show** appears 15 minutes after the start (Studio: `status = no_show`). A cashier can cancel a reservation, but still can't cancel a running session.

## 7b. Edge Functions (required for checkout)

Two functions run in Supabase's `functions` container:

- `create-bill` (**required** from Phase 4): when a session's bill uploads, it calculates the final bill on the server with the same pricing code as the app (`supabase/functions/_shared/domain`, a copy of `src/domain` made by `npm run domain:sync`) and saves it. Until it is deployed, a device's uploads stop at its first bill: that bill **and every change made after it** wait in the upload queue ("Waiting to upload" doesn't drop to 0). Nothing is lost: it all uploads once the function is there. Deploy it before staff start ending sessions.
- `invite-staff`: saves an invitation and emails people who don't have an account yet. Without it, invitations still work, but nobody is emailed (the app says so).

```sh
# on the VPS
cd ~/myrooms/app && git pull
for f in _shared create-bill invite-staff; do
  rm -rf ~/myrooms/supabase/volumes/functions/$f
  cp -r supabase/functions/$f ~/myrooms/supabase/volumes/functions/
done
cd ~/myrooms/supabase && docker compose restart functions
```

`create-bill` uses the service role key that Supabase's setup already passes to the functions container (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`). It never leaves the server.

Check: `docker compose logs functions` shows no errors after ending a session or sending an invite.

## 8. Publish the web app

Build on a PC with `.env.local` pointing at the VPS (step 7), then copy the files up:

```sh
npm run build:web                                  # → dist/
rsync -az --delete dist/ <user>@<vps-ip>:/var/www/myrooms/
```

Check: `https://app.example.com` loads the sign-in page; after signing in, the Sync card shows **Online**.

## 9. Build the Windows app

- **Locally:** `npm run desktop:build` (uses `.env.local`; set `EXPO_PUBLIC_APP_URL` so password-reset emails sent from Windows link to the web app). The installer is in `src-tauri/target/release/bundle/nsis/`. If the build fails with `windres`, see Troubleshooting in the main README.
- **From GitHub:** set the `EXPO_PUBLIC_*` values (including `EXPO_PUBLIC_APP_URL`) as repository **Variables** (Settings → Secrets and variables → Actions → Variables). The "Windows desktop build" workflow runs on pushes to `dev` and `main` (or by hand) and uploads the installer as a build artifact.
- The installer is not code-signed yet (Phase 10), so Windows SmartScreen will warn on install.
- Session alerts use the Tauri notification plugin (added in Phase 3); rebuild the installer after updating.

## 10. Build the Android and iOS apps

Uses EAS (Expo's build service, needs a free Expo account):

```sh
npx eas-cli login
npx eas-cli init                                   # links the project once
# Backend URLs for cloud builds (once per environment):
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://api.example.com --visibility plaintext
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --visibility plaintext
npx eas-cli env:create --environment development --name EXPO_PUBLIC_POWERSYNC_URL --value https://sync.example.com --visibility plaintext
npx eas-cli build --profile development --platform android   # installable test build (APK)
npx eas-cli build --profile development --platform ios       # needs an Apple Developer account
```

Phase 3 added `expo-notifications` and Phase 4 added `expo-print` and `expo-sharing` (native code), so phones need a **new development build** after updating. Only local notifications are used: no push keys (FCM/APNs) are needed.

Store releases (Google Play, App Store) come in Phase 10.

## Updating

- **Sync rules** (`powersync/sync-config.yaml`): `git pull`, then `docker compose restart powersync`.
- **New migrations**: repeat step 5 (`supabase db push`). Then restart PowerSync if the sync config changed.
- **Edge Functions**: repeat step 7b (always after pulling a change to `src/domain`, since `create-bill` uses a copy of it).
- **Web app**: repeat step 8.
- **Supabase version**: follow the official upgrade notes, using `sh run.sh` and `update.sh` in `~/myrooms/supabase`.

## Backups

The Supabase data is in `~/myrooms/supabase/volumes/db/data`. Until automated backups are set up (Phase 9), take a nightly dump:

```sh
docker exec supabase-db pg_dump -U postgres -Fc postgres > ~/backups/myrooms-$(date +%F).dump
```

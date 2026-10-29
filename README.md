# MyRooms

Gaming center management app: rent PC desks and PlayStation rooms by the hour, manage live sessions and reservations on a calendar, record payments (Cash / Visa / Instapay) and track income across branches.

Runs on **Windows**, **Android / iOS** and the **Web** from one Expo (React Native + TypeScript) codebase, with a self-hosted Supabase backend on our VPS and offline support (PowerSync).

**Status:** Phase 1 (accounts, branches, roles) code done. See the full plan in [docs/PLAN.md](docs/PLAN.md).

## Project layout

```
src/
  app/          Expo Router screens (every file is a route)
  features/     Feature UI + hooks, one folder per feature
  domain/       Pure business logic (money, pricing, …) — no React, heavily unit-tested
  lib/          Infrastructure: i18n, settings, supabase, powersync, config
  ui/           Shared UI kit (Text, Button, Card, Screen, …) styled with NativeWind
  global.css    Tailwind entry + light/dark theme tokens
supabase/       SQL migrations, pgTAP tests, local Supabase config
deploy/         VPS setup: self-hosted Supabase, PowerSync, Caddy
src-tauri/      Tauri v2 shell that wraps the web build as the Windows app
```

Rules: money is integer piasters (`src/domain/money.ts`); layouts use start/end (`ps-`, `pe-`, `text-start`), never left/right; every user-facing string goes through i18n (`src/lib/i18n/locales/{en,ar}.json`).

## Getting started

Requirements: Node 22, npm. For Windows desktop: Rust (stable) + WebView2 (built into Windows 11). For local Supabase: Docker Desktop.

```bash
npm install            # also copies PowerSync web workers to public/@powersync
cp .env.example .env.local
npm run web            # web app at http://localhost:8081
```

| Target  | Command                                          | Notes                                                                                                                                            |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web     | `npm run web`                                    | Production build: `npm run build:web` → `dist/`                                                                                                  |
| Windows | `npm run desktop:dev`                            | Installer: `npm run desktop:build` → `src-tauri/target/release/bundle/`                                                                          |
| Android | `npx expo run:android`                           | Needs a **development build** (PowerSync uses native SQLite, so Expo Go won't work). Cloud: `npx eas-cli build --profile development -p android` |
| iOS     | `npx eas-cli build --profile development -p ios` | Or `npx expo run:ios` on a Mac                                                                                                                   |

Quality checks (also run in CI on every PR):

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run db:test        # pgTAP tests, needs local Supabase running
```

## Backend (self-hosted Supabase + PowerSync on our VPS)

The backend runs on our own VPS with Docker behind Caddy: self-hosted **Supabase** (Postgres, Auth, API) plus the **PowerSync** sync service. Full setup: [deploy/README.md](deploy/README.md).

Signing in needs a backend: fill in `.env.local` (see `.env.example`) with the VPS URLs and the Supabase publishable key, then restart the app. Without it the app shows the sign-in page with a "server is not configured" notice. After the first sign-in on a device, the app works offline: changes are stored in local SQLite and uploaded when the connection returns (see the **Sync** card on the home screen).

- **Schema changes** are SQL migrations in `supabase/migrations/`, applied to the VPS with `supabase db push` over an SSH tunnel (deploy/README.md, step 5).
- **What each device downloads** is defined in `deploy/powersync/sync-config.yaml`.
- **Access rules** (owner / manager / cashier) are RLS policies in the Phase 1 migration, tested by `supabase/tests/phase1_access.test.sql`. Owners see every branch; managers and cashiers only the branches they are assigned to.
- **Invitation emails** are sent by the `invite-staff` Edge Function in `supabase/functions/` (deploy/README.md, step 7b).
- **Optional local backend** (needs Docker Desktop): `npm run db:start` runs Supabase on your PC, and `npm run db:test` runs the pgTAP access tests. CI runs those tests on every PR. Local Supabase emails (confirmations, resets) appear in Inbucket at http://localhost:54324.

## Troubleshooting

**Windows build fails with `windres: preprocessing failed` / `No such file or directory`.** This happens with the Rust GNU toolchain (`x86_64-pc-windows-gnu`) when the project path contains a space (e.g. `C:\Users\First Last\...`). Either install the MSVC toolchain (Visual Studio Build Tools + `rustup default stable-msvc`, recommended), or point Cargo at the space-free 8.3 path of the same folder:

```bash
export CARGO_TARGET_DIR="$(cygpath -d "$PWD/src-tauri")\target"   # Git Bash
npm run desktop:build
```

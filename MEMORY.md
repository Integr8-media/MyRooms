# MyRooms — project memory

Running log of progress, decisions and open items. Update it at the end of every phase (see CLAUDE.md). Newest information at the top of each section.

## Status

| Phase                                   | Status                            | Branch                                        | Notes                                                            |
| --------------------------------------- | --------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| 0 Foundations                           | **Code done, VPS deploy pending** | `feature/phase-0-foundations` (not committed) | Web + Windows verified. Android/iOS and online sync not yet run. |
| 1 Accounts, branches, roles             | Not started                       |                                               |                                                                  |
| 2 Stations and pricing                  | Not started                       |                                               |                                                                  |
| 3 Live floor and walk-ins               | Not started                       |                                               |                                                                  |
| 4 Checkout and payments                 | Not started                       |                                               |                                                                  |
| 5 Income dashboard                      | Not started                       |                                               |                                                                  |
| 6 Calendar and reservations (MVP pilot) | Not started                       |                                               |                                                                  |
| 7 Optional modules                      | Not started                       |                                               |                                                                  |
| 8 Advanced reports                      | Not started                       |                                               |                                                                  |
| 9 Offline hardening                     | Not started                       |                                               |                                                                  |
| 10 Release                              | Not started                       |                                               |                                                                  |

## Phase 0: what was built (2026-10-29)

- Expo SDK 58 app with routes in `src/app/`, a NativeWind theme (light/dark), a UI kit, and i18n (en/ar) with instant RTL switching. Direction is set on the root View plus `LocaleProvider` from expo-router, and `I18nManager` is also updated on native.
- Settings store (language, theme) persisted per device.
- `src/domain/money.ts`: piaster helpers (parse, including Arabic-Indic digits; charge per minute; format EGP), with tests.
- PowerSync local DB (native + web) with a `sync_checks` sample table and a Supabase upload connector. Rejected writes (Postgres 22xxx/23xxx/42501) are discarded so they don't block the upload queue (a TODO is left for the conflict UI in Phase 6/9).
- Home screen "Offline sync check" card: add records offline, see the pending upload count, online status and last sync time.
- Supabase: migration for `sync_checks` (RLS: own rows only) + the `powersync` publication; migration for `powersync_role`; pgTAP RLS test.
- Tauri v2 Windows shell (`com.integr8media.myrooms`, NSIS installer about 7 MB).
- CI: `.github/workflows/ci.yml` (lint, format, typecheck, tests, web build, pgTAP) and `desktop.yml` (Windows installer; needs repo Variables for the `EXPO_PUBLIC_*` values).
- Deploy kit in `deploy/` + the published runbook page (link in CLAUDE.md).

**Verified:** lint, typecheck, 23 Jest tests, expo-doctor 20/20, web export served and tested in a browser (EN/AR, RTL, dark mode, offline write and reload persistence), Windows release build launched and rendered, Android JS bundle exports.
**Not verified:** pgTAP tests and the Docker/compose files (no Docker on the dev PC), the VPS setup itself, online sync end to end, native Android/iOS builds.

### Phase 0 "done when" still open

- [ ] Deploy the VPS stack (deploy guide steps 1–6). Needs the user's domain and VPS access.
- [ ] Prove a record written offline syncs once back online, on web, Windows and a phone.
- [ ] EAS development builds on Android and iOS.

## Decisions

- **2026-10-29: Backend is self-hosted Supabase on the user's Oracle VPS** (Docker + the existing Caddy), not hosted supabase.com. The user chose this over a custom Postgres + API stack. Supabase is pinned to `self-hosted/v0.8.3` (Envoy gateway, asymmetric JWT keys, "publishable key" instead of the anon key).
- **2026-10-29: PowerSync is self-hosted** (`journeyapps/powersync-service:1.27.2`, multi-arch) with its own Postgres for storage. It joins Supabase's Docker network `supabase_default` and connects directly to `db:5432` (replication can't go through the pooler). Auth checks Supabase tokens via JWKS at `http://kong:8000/auth/v1/.well-known/jwks.json`, audience `authenticated`.
- **2026-10-29: Sync config uses Sync Streams (edition 3)**, not legacy `bucket_definitions`.
- **2026-10-29: Web app is hosted by Caddy on the VPS** (`/var/www/myrooms`, SPA fallback) rather than Vercel/Cloudflare.
- **2026-10-29: Routes are in `src/app/`** (current Expo default), not `app/`. PLAN.md was updated.
- **2026-10-29: Phase 0 signs in anonymously** for the sync demo (`ENABLE_ANONYMOUS_USERS=true`). It must be removed or disabled in Phase 1.
- **2026-10-29: Domain names and bundle IDs:** `com.integr8media.myrooms` (iOS, Android, Tauri), URL scheme `myrooms`.
- **2026-10-29: Web export mode is `single`** (SPA), which works for both Caddy and Tauri.

## Environment quirks (dev PC)

- Windows 11; the project path has a space (`C:\Users\Mina Louis\...`).
- Rust uses the **GNU toolchain** (`x86_64-pc-windows-gnu`), and there's no MSVC Build Tools. `windres` fails on the space in the path. Workaround: `CARGO_TARGET_DIR` set to the 8.3 short path (`C:\Users\MINALO~1\Desktop\INTEGR~1\MyRooms\SRC-TA~1\target`). Long-term fix: install VS Build Tools and run `rustup default stable-msvc`.
- No Docker and no global Supabase CLI. The `supabase` CLI is a devDependency (`npx supabase`).
- `npx expo install` can hang on a prompt. Run it with `CI=1`.
- The PowerSync RN SDK v2 wants `@op-engineering/op-sqlite` `>=17.1 <19` (pinned to ^18.2.5). The `@powersync/op-sqlite` package is not used.
- `@babel/plugin-transform-async-generator-functions` must stay on v7 (v8 needs Babel 8).
- TypeScript 6 doesn't auto-include `@types`. `tsconfig.json` sets `types: ["jest", "node"]`, and `nativewind-env.d.ts` declares `*.css`.

## Open questions for the client (from PLAN.md §9)

1. Billing rounding / minimum charge?
2. Prepaid fixed sessions, or always pay at the end?
3. Cash drawer / shift closing in v1?
4. Thermal receipt printer needed?
5. Sell to other gaming centers later?
6. Who owns hosting, store accounts and the Windows code-signing certificate?

## Next steps

1. User: provide the domain and run deploy steps 1–6 on the VPS (or give access).
2. Verify online sync on web and Windows, then do the EAS dev builds.
3. Start Phase 1: real auth (email/password), organizations, branches, memberships, roles, RLS + pgTAP, feature toggles. Turn off anonymous sign-ins and configure SMTP.

# MyRooms — project memory

Running log of progress, decisions and open items. Update it at the end of every phase (see CLAUDE.md). Newest information at the top of each section.

## Status

| Phase                                   | Status                            | Branch                                             | Notes                                                                       |
| --------------------------------------- | --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 0 Foundations                           | **Code done, VPS deploy pending** | `feature/phase-0-foundations` (not committed)      | Web + Windows verified. Android/iOS and online sync not yet run.            |
| 1 Accounts, branches, roles             | **Code done, VPS test pending**   | `feature/phase-1-accounts` (not committed)         | 59 pgTAP checks pass on PGlite; signed-in screens need a backend            |
| 2 Stations and pricing                  | **Code done, VPS test pending**   | `feature/phase-2-stations-pricing` (not committed) | 100 pgTAP checks pass on PGlite; pricing + time-zone code has 31 unit tests |
| 3 Live floor and walk-ins               | Not started                       |                                                    |                                                                             |
| 4 Checkout and payments                 | Not started                       |                                                    |                                                                             |
| 5 Income dashboard                      | Not started                       |                                                    |                                                                             |
| 6 Calendar and reservations (MVP pilot) | Not started                       |                                                    |                                                                             |
| 7 Optional modules                      | Not started                       |                                                    |                                                                             |
| 8 Advanced reports                      | Not started                       |                                                    |                                                                             |
| 9 Offline hardening                     | Not started                       |                                                    |                                                                             |
| 10 Release                              | Not started                       |                                                    |                                                                             |

## Phase 2: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261030100000_phase2_stations_pricing.sql`): `station_types` (kind `pc_desk`/`ps_room`, color, max players), `stations` (per branch, status `active`/`maintenance`, `is_active` to remove), `rate_rules` (price per hour in piasters, players min/max, `days_of_week` bit mask with bit 0 = Sunday, `from_minute`/`to_minute` minutes after local midnight, priority, `valid_from`/`valid_to` dates), `packages` (minutes + fixed price), and `audit_log` (written by triggers on station types, rate rules and packages; owners read it; not synced).
- **Access:** prices and station types: every member reads, owners write. Stations: branch staff read, owners and the branch's managers write (incl. maintenance). Triggers copy `org_id` from the branch / station type, and reject a station type from another org (`invalid_station_type`). Only rate rules can be deleted; the rest are switched off.
- **Sync streams:** `org_pricing` (types, rules, packages for every org the user belongs to), stations added to `assigned_branches` and `owner_data`.
- **Pricing engine** `src/domain/pricing.ts` + `src/domain/zoned-time.ts`: segments → cut at local midnight, every rule edge and DST changes → best rule per piece (priority, then specificity, then id) → per-minute charge rounded per bill line → package covers the first N minutes (full price even if shorter) → items and discount. Time not covered by any rule is charged 0 and reported in `uncovered` (the UI warns).
- **App:** Settings → Station types & prices (type form, rate rules list and editor, packages), Settings → Stations (current branch, add several at once with numbering, maintenance, remove), Settings → Price preview (type, players, start/end date+time, package → line-by-line breakdown). Cashiers see prices read-only and the preview; managers edit stations in their branches.

**Verified:** lint, format, typecheck, 93 Jest tests (pricing edge cases: crossing midnight, peak boundary, weekend switch, overnight window belonging to its start day, player change mid-session, packages + overtime and across a player change, priority/specificity ties, date-limited rules, both Cairo DST changes; plus validation and a price-preview screen test), web export builds. Migrations + 100 pgTAP checks (59 Phase 1 + 41 Phase 2) pass on PGlite, and weakening two policies makes 3 checks fail. Sync config validates.
**Not verified:** the new screens in a browser (they need a signed-in backend), Arabic layout of the new screens, the real pgTAP run, and setting up the client's real center (Phase 2 "done when").

### Phase 2 "done when" still open

- [ ] On the VPS: the owner sets up the client's real station types, prices, packages and stations (deploy guide step 7, items 5–6).
- [ ] Price preview matches the client's own hand-calculated examples. Ask the client for 3–4 real bills to check against.

## Phase 1: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261030000000_phase1_accounts.sql`): `organizations` (feature toggles, timezone, currency), `branches`, `memberships` (role enum `app_role`: owner / manager / cashier; email and display name copied from `auth.users` by triggers), `member_branches` (which branches a manager or cashier works in; owners need none), `invitations`. The Phase 0 `sync_checks` table and demo card were removed.
- **Access helpers** in the `private` schema for every later table: `is_org_owner(org)`, `can_manage_branch(branch)` (owner or assigned manager), `can_access_branch(branch)` (anyone assigned), plus `can_view_membership`, `can_assign_branch`, `confirmed_email`.
- **RPCs** (online only): `create_organization`, `invite_member`, `my_invitations`, `accept_invitation`. They raise stable error keys (`not_allowed`, `last_owner`, ...) that the app translates (`src/lib/errors.ts`).
- **Column-level grants** decide what a client may change (owners can't change `currency`, nobody can move a branch to another org). The PowerSync connector now uploads local INSERTs as `ON CONFLICT DO NOTHING` (no UPDATE privilege needed), and UPDATEs send only changed columns. Never set `created_at`/`updated_at` in a local UPDATE.
- **Sync Streams** (`deploy/powersync/sync-config.yaml`) mirror the RLS rules: own account, own orgs, assigned branches, owner data, a manager's branch staff, sent invitations. Validated with `@powersync/service-sync-rules`.
- **Edge Function** `supabase/functions/invite-staff`: calls `invite_member` as the caller, then emails people without an account (`auth.admin.inviteUserByEmail`). If the function isn't deployed, the app falls back to the RPC and says no email was sent.
- **App**: email/password sign in, sign up (with confirmation), forgot/reset password, a "choose a password" screen after reset/invite links (web URL fragment + native deep link `myrooms://set-password`), onboarding (accept invitations or create an org with its first branch), home with branch switcher and sync status, and settings: organization (name, timezone, feature toggles), branches (add/edit/close), staff (list, invite, role, branch assignments, remove), account (name, password, language/theme, sign out with an unsynced-changes warning).
- The root layout uses `Stack.Protected` with `redirectTo` (exactly one group reachable: `(auth)`, `set-password`, `onboarding`, `(app)`). The router stays unmounted (BootScreen) until auth and the first sync are known.
- Sign-out runs `powersync.disconnectAndClear()` so the next person on the device sees nothing.
- `src/domain/permissions.ts` mirrors the SQL rules for the UI; `src/domain/validation.ts` (zod) holds form rules. New UI kit pieces: TextField, SwitchRow, ListRow, Badge, Notice, ScreenHeader, LoadingView.

**Verified:** lint, typecheck, format, 47 Jest tests. The migrations and all 59 pgTAP assertions run on real Postgres via PGlite (with a small Supabase/pgTAP stand-in, see Quirks), and a deliberately weakened policy makes them fail. The sync config validates. Web export tested in a browser: sign-in/sign-up in EN and AR (RTL), validation messages, protected routes redirect to sign-in.
**Not verified:** anything after sign-in against a real backend (no Docker here, VPS not deployed): onboarding, invitations, staff and branch screens, email links, the Edge Function, and the real pgTAP run in CI / `supabase test db`.

### Phase 1 "done when" still open

- [ ] Run `npm run db:test` (or CI) on real Supabase.
- [ ] On the VPS: owner, manager and cashier each sign in and see only what they should (deploy guide step 7 checklist).

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

- **2026-10-30: Rate rule times are integers** (minutes after local midnight, `to_minute` up to 1440), not Postgres `time`: simpler checks and the same values on the device and the server. A window with end ≤ start runs past midnight and belongs to the day it starts (days mask and valid dates are checked against that day).
- **2026-10-30: Rule choice:** highest priority wins; on a tie the more specific rule (players, time window, days, dates), then the lowest id, so results never depend on order. The UI suggests priority 0 for the first (base) rule and 10 for later ones.
- **2026-10-30: Prices are per station per hour** (the whole room, not per player); player-count pricing is done with player ranges on rules.
- **2026-10-30: Billing uses exact elapsed time** (per minute, with seconds as a fraction), rounded to the piaster per bill line. Rounding/minimum charge is still open question 1 for the client.
- **2026-10-30: Packages** cover the first N minutes of the session from its start (across player changes) and cost their full price even if the session is shorter. Overtime is billed at the rate in force when the package runs out.
- **2026-10-30: No date-fns-tz.** Time zones use `Intl` in `src/domain/zoned-time.ts` (Hermes and Node both support it); Cairo's DST (switches at midnight) is covered by tests.
- **2026-10-30: Stations can be edited by branch managers** (incl. maintenance); station types, prices and packages only by owners. Cashiers can't toggle maintenance.

- **2026-10-30: Branch assignments are a `member_branches` table**, not `memberships.branch_ids[]` as in the first data model draft: simpler RLS and PowerSync streams. Invitations keep `branch_ids uuid[]` (only read by the server).
- **2026-10-30: No `profiles` table.** Name and email are copied onto `memberships` by triggers (name = `full_name` in the user's metadata), so staff lists work offline.
- **2026-10-30: Managers** see and edit only their assigned branches, can invite and assign **cashiers** to those branches, and see the staff of those branches. Only owners create branches, change roles, remove members and change org settings. An org always keeps one owner (`last_owner` trigger), and owners can't demote themselves.
- **2026-10-30: Email confirmation is required** (`ENABLE_EMAIL_AUTOCONFIRM=false`), because `accept_invitation` trusts the confirmed email. This makes SMTP mandatory on the VPS.
- **2026-10-30: Creating an org, inviting and accepting are online-only RPCs.** Everything else (org settings, branches, roles, assignments, removing members) is written locally and synced, with RLS as the final check (rejected writes are dropped and the server state syncs back).
- **2026-10-30: zod only** for validation; react-hook-form isn't needed for forms this size.
- **2026-10-30: Branches are never deleted**, only closed (`is_active = false`), because sessions and payments will reference them.
- **2026-10-29: Backend is self-hosted Supabase on the user's Oracle VPS** (Docker + the existing Caddy), not hosted supabase.com. The user chose this over a custom Postgres + API stack. Supabase is pinned to `self-hosted/v0.8.3` (Envoy gateway, asymmetric JWT keys, "publishable key" instead of the anon key).
- **2026-10-29: PowerSync is self-hosted** (`journeyapps/powersync-service:1.27.2`, multi-arch) with its own Postgres for storage. It joins Supabase's Docker network `supabase_default` and connects directly to `db:5432` (replication can't go through the pooler). Auth checks Supabase tokens via JWKS at `http://kong:8000/auth/v1/.well-known/jwks.json`, audience `authenticated`.
- **2026-10-29: Sync config uses Sync Streams (edition 3)**, not legacy `bucket_definitions`.
- **2026-10-29: Web app is hosted by Caddy on the VPS** (`/var/www/myrooms`, SPA fallback) rather than Vercel/Cloudflare.
- **2026-10-29: Routes are in `src/app/`** (current Expo default), not `app/`. PLAN.md was updated.
- **2026-10-29: Phase 0 signed in anonymously** for the sync demo. Replaced by real accounts in Phase 1 (anonymous sign-in is off).
- **2026-10-29: Domain names and bundle IDs:** `com.integr8media.myrooms` (iOS, Android, Tauri), URL scheme `myrooms`.
- **2026-10-29: Web export mode is `single`** (SPA), which works for both Caddy and Tauri.

## Environment quirks (dev PC)

- **PGlite harness location:** copied into each session's scratchpad (`pgcheck/run.mjs <repo>`, `stub.sql`, `tap.sql`, `validate-sync.mjs`); the original is in the scratchpad of session `589f6d80-…`. Consider moving it into the repo (e.g. `scripts/pgcheck/`) if it keeps being needed.
- PowerSync tables are SQLite views: `INSERT … RETURNING` isn't available; get an id with `SELECT uuid() AS id` first.

- **Testing SQL without Docker:** run the migrations and pgTAP files in PGlite (`@electric-sql/pglite`) with a stand-in for Supabase (roles `anon`/`authenticated`, `auth.users`, `auth.uid()`/`auth.jwt()`, default grants) and a tiny pgTAP subset (plan/ok/is/is_empty/results_eq/lives_ok/throws_ok). PGlite has no pgTAP extension. The harness lived in the session scratchpad, not the repo.
- **Validating sync streams:** `@powersync/service-sync-rules` (`SqlSyncRules.validate(yaml, { defaultSchema: 'public' })`); needs `node --js-explicit-resource-management` on Node 22 (or bun).
- Expo Router `Stack.Protected` without `redirectTo` sends you to the group itself (`/(auth)`, "Unmatched route") when the group has no index. Always pass `redirectTo`.
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

1. User: provide the domain and SMTP details, then run deploy steps 1 to 7b on the VPS (or give access). Set `ENABLE_ANONYMOUS_USERS=false`, `ENABLE_EMAIL_AUTOCONFIRM=false` and `ADDITIONAL_REDIRECT_URLS`.
2. Run the step 7 checklist with three accounts (owner, manager, cashier) on web, Windows and a phone. This also closes Phase 0's "offline write syncs" item.
3. Push the branch so CI runs the pgTAP tests on real Supabase.
4. Ask the client for their real price list (types, hourly prices, peak/weekend rules, packages) and a few real bills, to enter and check in Phase 2's price preview.
5. Phase 3: live floor and walk-in sessions (`sessions`, `session_segments`). Build segments that feed `priceSession` directly; maintenance stations can't be started.

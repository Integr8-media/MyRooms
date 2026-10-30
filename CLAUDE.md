# MyRooms — instructions for Claude

Gaming center management app (PC desks + PlayStation rooms rented by the hour): live floor, sessions, reservations, billing, payments (Cash / Visa / Instapay), income reports, across branches with Owner / Manager / Cashier roles. Arabic + English (RTL), currency EGP.

- **Plan and phases:** [docs/PLAN.md](docs/PLAN.md). Treat it as the source of truth for scope.
- **Progress, decisions, open items:** [MEMORY.md](MEMORY.md). Read it at the start of every session.
- **Deployment:** [deploy/README.md](deploy/README.md), also published as the "MyRooms Deploy Runbook" page: https://claude.ai/artifact/SQZ8xDU2h7H1vWrPkvFAhK (source: `docs/deploy-guide.html`).

@AGENTS.md

## Stack

- Expo SDK 58 (React Native 0.88, React 19), Expo Router, TypeScript strict (TS 6), React Compiler on.
- NativeWind 4 (Tailwind 3) for styling. Theme colors are CSS variables in `src/global.css` (light + `.dark`).
- i18next + react-i18next + expo-localization. Locales: `src/lib/i18n/locales/{en,ar}.json`.
- Offline-first data: PowerSync (local SQLite) ↔ self-hosted Supabase (Postgres, Auth, REST) on the Oracle VPS.
  - Native: `@powersync/react-native` + op-sqlite (needs a dev build, not Expo Go).
  - Web/Windows: `@powersync/web` (WASM workers copied to `public/@powersync` by `postinstall`).
  - Platform split: `src/lib/powersync/database.ts` vs `database.web.ts`. `metro.config.js` stubs the other platform's SDK.
- Windows: Tauri v2 in `src-tauri/`, wrapping the web export (`dist/`).
- Auth: Supabase email/password (email confirmation required). `src/lib/auth/AuthProvider` + `Stack.Protected` route groups in `src/app/_layout.tsx`: `(auth)`, `set-password`, `onboarding`, `(app)`.
- Zustand for UI state (persisted with AsyncStorage): settings, and the active org/branch (`workspace-store`). `useWorkspace()` gives the current org, role, branches, feature toggles and `can(permission)`.
- Session alerts: `expo-notifications` (local notifications, scheduled with the OS) on phones; on web/Windows a 5-second check while the app is open, using the Tauri notification plugin (`@tauri-apps/plugin-notification` + `tauri-plugin-notification`) or the Web Notifications API. Platform split: `src/lib/notifications/alerts.ts` vs `alerts.web.ts`.
- Receipts: HTML from `src/features/checkout/receipt.ts`. Phones: `expo-print` + `expo-sharing` (PDF share sheet). Web/Windows: print from a hidden iframe. Platform split: `shareReceipt.ts` vs `shareReceipt.web.ts`.
- zod for form validation (`src/domain/validation.ts`; messages are i18n keys). Jest (jest-expo) + React Native Testing Library v14 (async `render` and `fireEvent`).

## Layout

```
src/app/        routes only (Expo Router)
src/features/   feature UI, one folder per feature
src/domain/     pure business logic (money, pricing, zoned time, sessions, permissions, validation), no React, heavily unit-tested
src/lib/        infrastructure: config, i18n, settings, supabase, powersync, notifications
src/ui/         shared UI kit (Text, Button, Card, Screen, SegmentedControl, Stepper, ...)
supabase/       migrations/ (SQL, applied with `supabase db push`), tests/ (pgTAP), functions/ (Edge Functions; _shared/domain is a generated copy of src/domain), config.toml (local CLI)
scripts/        sync-domain.mjs (copies src/domain for Edge Functions), pgcheck/ (migrations + pgTAP in PGlite, sync config check)
deploy/         VPS: Supabase setup script + port override, PowerSync compose/config/sync streams, Caddyfile
src-tauri/      Windows shell
```

## Rules

- **Money:** always integer piasters (`src/domain/money.ts`). Never floats.
- **Pricing:** `src/domain/pricing.ts` is the only place prices are calculated: live estimates on the device and the final bill in the `create-bill` Edge Function (through `src/domain/billing.ts`). Keep `src/domain` pure, importing only the other copied files. After changing `money`, `zoned-time`, `pricing`, `sessions` or `billing`, run `npm run domain:sync` (a Jest test fails otherwise). Times go through `src/domain/zoned-time.ts` (org time zone, DST-safe, `Intl` only); never add hours with plain arithmetic on wall-clock times.
- **RTL:** use start/end (`ps-`, `pe-`, `ms-`, `me-`, `text-start`), never left/right. Check every new screen in Arabic.
- **Text:** every user-facing string goes through i18n, with keys added to **both** `en.json` and `ar.json` (a test enforces matching keys). Use the `Text` component from `@/ui`, not RN `Text`.
- **Dependencies:** add with `npx expo install <pkg>` so versions match SDK 58. For dev deps: `npx expo install -- --save-dev <pkg>`. Run with `CI=1`, or it can hang on a prompt.
- **Database:** every schema change is a new file in `supabase/migrations/`. Every table gets RLS policies plus pgTAP tests, and must be added to the `powersync` publication and to `deploy/powersync/sync-config.yaml` (Sync Streams, edition 3) if devices need it. The final bill is computed server-side.
- **Access rules:** build policies from the `private.*` helpers (`is_org_owner`, `can_manage_branch`, `can_access_branch`). Revoke the default grants and grant only the columns clients may write. Keep `src/domain/permissions.ts` (what the UI shows) and the sync streams in step with the SQL rules.
- **Sessions:** a session is a list of `session_segments` (new segment on a player change or a move; a segment is always on the session's current station). Timestamps from the local DB may be Postgres text: parse them with `parseTimestamp` (`src/domain/sessions.ts`), never `Date.parse`. Confirm destructive actions inline (no `Alert.alert`: it doesn't work on web).
- **Local writes** go through PowerSync (`powersync.execute`); never set `created_at`/`updated_at` in an UPDATE. PowerSync tables are views, so `INSERT … RETURNING` doesn't work: get an id first with `SELECT uuid() AS id`. Money changes (prices, bills, discounts, voids, payments, refunds) are recorded in `audit_log` by triggers. Online-only actions (create org, invite, accept) are RPCs. Database functions raise error keys, translated via `src/lib/errors.ts` and `errors.*` in the locales.
- **Bills and payments:** bill id = session id. Only the `create-bill` Edge Function (service role, `public.create_bill`) creates bills; the connector routes local `bills` inserts there. On the device, derive total/paid/status from the bill amounts and local payments (`summarizeBill`), never from `bills.total/paid_amount/status`, and only UPDATE the columns clients may write (`discount_amount`, `discount_reason`, `status` = 'void', `void_reason`). Payments are insert-only; corrections are refunds.
- **Server-only secrets** never go in `EXPO_PUBLIC_*` (those are bundled into the app).
- **Git:** never commit, push or open PRs unless the user explicitly asks in that session. Work on a feature branch off `dev`.

## Commands

```bash
npm run web | npm run desktop:dev       # run web / Windows
npm run lint && npm run format:check && npm run typecheck && npm test   # run all before calling work done
npm run build:web                       # static web export → dist/
npm run desktop:build                   # Windows installer (see GNU toolchain note in MEMORY.md)
npm run db:start | db:reset | db:test   # local Supabase (needs Docker; not installed on this PC)
npm run db:check                        # migrations + pgTAP in PGlite + sync config check (once: npm --prefix scripts/pgcheck install)
npm run domain:sync                     # copy src/domain to supabase/functions/_shared/domain
```

## At the end of every phase (required)

The user asked for these to be kept up to date with each phase:

1. **MEMORY.md:** mark the phase done, record decisions, new quirks, open items and next steps.
2. **CLAUDE.md:** update anything that changed (stack, layout, rules, commands).
3. **Deploy guide:** update `deploy/README.md` **and** `docs/deploy-guide.html`. In the HTML, update the "Current phase" chip, the "Updated" date, the Phase status table, any changed steps, and add a Changelog entry. Then republish to the same URL (Artifact tool, `url: https://claude.ai/artifact/SQZ8xDU2h7H1vWrPkvFAhK`; read it first when publishing from a new conversation).
4. **docs/PLAN.md:** update the status line at the top.

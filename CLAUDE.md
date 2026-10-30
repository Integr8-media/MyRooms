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
- Reports export (Phase 8): `src/features/reports/document.ts` builds tables → CSV (UTF-8 BOM) or A4 HTML (`export.ts`). Phones: `expo-file-system` (`File`/`Paths.cache`) + `expo-sharing` for CSV, `expo-print` for PDF; web/Windows: Blob download and the print dialog. Platform split: `share.ts` vs `share.web.ts`.
- Receipts: HTML from `src/features/checkout/receipt.ts`. Phones: `expo-print` + `expo-sharing` (PDF share sheet). Web/Windows: print from a hidden iframe. Platform split: `shareReceipt.ts` vs `shareReceipt.web.ts`.
- Calendar: custom timeline (`src/features/calendar/`), no library. Drag/resize with RN `PanResponder`; positions use the logical `start` style so time runs right to left in Arabic.
- zod for form validation (`src/domain/validation.ts`; messages are i18n keys). Jest (jest-expo) + React Native Testing Library v14 (async `render` and `fireEvent`).

## Layout

```
src/app/        routes only (Expo Router)
src/features/   feature UI, one folder per feature
src/domain/     pure business logic (money, pricing, zoned time, sessions, reservations, billing, income, reports, items, expenses, permissions, validation), no React, heavily unit-tested
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
- **Reservations:** sessions with `kind = 'reservation'`, `status = 'reserved'`; check-in makes them `active`. The exclusion constraint `sessions_no_double_booking` (plus `private.check_booking`) is the final judge; keep `src/domain/reservations.ts` (`findConflict`, `NO_SHOW_GRACE_MS`) in step with the SQL. Refused uploads are recorded in the local-only `upload_rejections` table and shown by `RejectedChanges`: never drop a write silently.
- **Income:** reports are computed on the device from synced `payments` with `src/domain/income.ts` (net = payments − refunds, by `paid_at` in the org time zone, void bills excluded). Owners/managers (`income.view`) see any period; cashiers only their own payments today. Filter `paid_at` in SQL only loosely (`utcDateWindow`: its text format differs between local and synced rows) and do the exact range check in JS.
- **Reports (Phase 8):** also on the device (`src/domain/reports.ts`, `src/features/reports/`, route `/income`; cashiers get `MyShift`). Net profit = income − expenses (`spent_on`); usage = segment time of active/completed sessions ÷ 24 h per station up to now; snack sales by `session_items.created_at` (cancelled sessions and void bills excluded); top customers by net payments of sessions with a `customer_id`. Each module's section and export part only shows when its toggle is on. Same loose SQL date filter for segments and items. CSV/PDF come from one `ReportDocument`.
- **Bills and payments:** bill id = session id. Only the `create-bill` Edge Function (service role, `public.create_bill`) creates bills; the connector routes local `bills` inserts there. `create_bill` also adds the session's items and the customer's default discount (`discount_reason = 'customer:<pct>'`). On the device, derive items/total/paid/status from the bill's time and discount amounts plus the local `session_items` and payments (`summarizeBill`), never from `bills.items_amount/total/paid_amount/status`, and only UPDATE the columns clients may write (`discount_amount`, `discount_reason`, `status` = 'void', `void_reason`). Payments are insert-only; corrections are refunds.
- **Optional modules (customers, snacks, expenses):** check `useWorkspace().features` before showing any module UI (toggles only hide; the server never refuses writes for a module that is off, and existing items still show on bills). Item prices and names are set by the server from the product; `session_items` are insert/delete only. Stock is never stored: it is `sum(stock_movements) - sum(session_items)` per branch (`useProducts`); never write a movement for a sale. Expenses are owners/managers only. Customers are org-wide and their phone is not unique (warn with `samePhone` instead).
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

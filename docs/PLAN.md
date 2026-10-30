# MyRooms — Gaming Center Management: Project Plan

> Status: **Phase 5 code done** (branch `feature/phase-5-income-dashboard`): income dashboard (today / week / month / custom, by method, branch, station type and day) and the cashier's "My shift" view, worked out on the device from synced payments. Waiting for the VPS to test end to end, like Phases 0–4. Last updated: 2026-10-30.

## 1. Product summary

MyRooms helps a gaming center owner run their business: they rent **PC desks** and **PlayStation rooms** by the hour. The app shows what is occupied right now and what is free, manages walk-in sessions and advance reservations on a calendar, calculates the bill, records how the customer paid (**Cash / Visa / Instapay**), and reports income.

It runs on **Windows (desktop app)**, **Android / iOS**, and the **Web**, sharing one codebase and one cloud database. It keeps working when the center's internet drops.

### Who uses it

| Role                | Can do                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**           | Everything across all branches: branches, stations, prices, staff, feature toggles, all reports and income.                         |
| **Branch manager**  | Everything inside their branch(es): stations, sessions, reservations, expenses, branch reports. No org-wide settings.               |
| **Cashier / staff** | Start/stop/extend sessions, make reservations, add snacks, take payments. No price edits, no income reports beyond their own shift. |

### Key concepts (glossary)

- **Organization (account)** — one gaming-center business (the owner's account). Holds settings and feature toggles.
- **Branch** — a physical location. An organization can have several.
- **Station** — a rentable unit: a **PC desk** (priced per desk per hour) or a **PlayStation room** (priced per room per hour).
- **Station type** — a group of stations with the same pricing, e.g. "PS5 Room", "PS4 Room", "VIP PC", "Standard PC".
- **Session** — a customer using a station. Three kinds:
  - **Open** walk-in: timer runs until stopped; pay for actual time.
  - **Fixed** walk-in: customer picks a duration (e.g. 2h); app alerts when time is up; can extend.
  - **Reservation**: booked in advance for a future time; becomes an active session on check-in.
- **Bill** — what the customer owes for a session: time charge + snacks/drinks − discount.
- **Payment** — money received against a bill, with a method (Cash / Visa / Instapay). A bill can be split across methods.

## 2. Confirmed requirements

| Area             | Decision                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms        | Windows, Android, iOS, Web                                                                                                                    |
| Tech             | **Expo (React Native + TypeScript)** for mobile + web; **Tauri** wraps the web build as the Windows desktop app                               |
| Data             | **Cloud backend + offline cache** — real-time sync across devices, keeps working offline                                                      |
| Tenancy          | **Multiple branches + roles** (Owner / Manager / Cashier)                                                                                     |
| Session types    | Open walk-in, fixed-duration walk-in, advance reservations                                                                                    |
| Pricing          | Rate **per station type**; **player-count rates** (PS rooms: e.g. 2 vs 4 players); **time-based rates** (peak hours, weekends, hour packages) |
| Payment methods  | Cash, Visa, Instapay (recorded in the app; not processed by it — see assumptions)                                                             |
| Optional modules | **Customers**, **Snacks & drinks (with stock)**, **Expenses** — each can be switched on/off **per organization**, **default ON**              |
| Always-on        | Station maintenance status (out of service → can't be booked)                                                                                 |
| Locale           | **Arabic + English** with full RTL support; currency **EGP**                                                                                  |

### Assumptions (please confirm or correct)

1. **Billing is per minute** (proportional to the hourly rate), no rounding or minimum charge. A rounding rule (e.g. round up to 15 min, minimum 30 min) can be added later as a setting.
2. **Payments are only recorded** — the app does not charge cards or call Instapay. Staff marks how the customer paid.
3. **Timezone** is Africa/Cairo by default (stored per organization; all times saved in UTC).
4. The app is built **multi-tenant from day one** (several independent organizations on one backend), so it can later be offered to other gaming centers. The first customer is your client.
5. **Out of scope** for v1: locking/unlocking PCs remotely, a customer-facing booking app, online payment gateways, loyalty points, receipt printers. Listed in the backlog (§8).

## 3. Architecture

```
 ┌───────────────────────── One Expo codebase (TypeScript) ─────────────────────────┐
 │  Expo Router screens · UI kit · i18n (ar/en, RTL) · domain logic (pricing etc.)   │
 └──────┬──────────────────────┬───────────────────────────┬────────────────────────┘
        │ EAS Build            │ expo export (web)         │ same web build
   Android / iOS app       Web app (hosted)         Tauri shell → Windows .exe
        │                      │                           │
        └──────── local SQLite (offline cache + write queue via PowerSync) ────────┘
                                       │  sync when online
                         ┌─────────────▼──────────────┐
                         │          Supabase          │
                         │ Postgres + Row Level Sec.  │
                         │ Auth · Realtime · Edge Fns │
                         └────────────────────────────┘
```

### Stack

| Layer              | Choice                                                                                  | Why                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| App framework      | Expo SDK (latest stable), Expo Router, TypeScript (strict)                              | One codebase for iOS, Android, Web; file-based routing works on all three.                                               |
| Windows            | Tauri v2 wrapping the Expo web export                                                   | Small installer (~10 MB), native notifications, auto-updater.                                                            |
| Styling / UI       | NativeWind (Tailwind for RN) + a small in-house component kit                           | Same styles on native and web; RTL-friendly logical properties (`ps-`, `pe-`).                                           |
| State / data       | PowerSync (local SQLite ↔ Supabase sync) + Zustand for UI state                         | Offline-first: reads/writes go to local DB instantly and sync in the background. Works on native, web, and inside Tauri. |
| Backend            | Supabase: Postgres, Auth, Row Level Security, Realtime, Edge Functions                  | Managed Postgres with per-row access control for multi-branch roles.                                                     |
| Forms / validation | react-hook-form + zod (schemas shared with Edge Functions)                              | One set of validation rules for client and server.                                                                       |
| i18n               | i18next + react-i18next + expo-localization                                             | ar/en, RTL switching, number/date formatting.                                                                            |
| Dates              | date-fns + date-fns-tz                                                                  | Timezone-safe calculations (Africa/Cairo).                                                                               |
| Charts             | react-native-gifted-charts (SVG, works on web)                                          | Income charts on all platforms.                                                                                          |
| Notifications      | expo-notifications (mobile), Tauri notification plugin (Windows), Web Notifications API | "Session ends in 5 minutes" alerts.                                                                                      |
| Testing            | Jest + React Native Testing Library, Playwright (web E2E), pgTAP (database & RLS)       | Pricing and permissions are the riskiest logic; they get the most tests.                                                 |
| CI/CD              | GitHub Actions; EAS Build/Submit; Tauri build action; web on Vercel or Cloudflare Pages | Automated builds for all four targets.                                                                                   |

### Important design rules

- **Money is stored as integers in piasters** (1 EGP = 100 piasters). No floating-point money.
- **No double booking**: Postgres exclusion constraint on `(station_id, time range)` for active/reserved sessions. Because devices can work offline, the server is the final judge; a rejected offline booking shows a clear "conflict" message to resolve.
- **The final bill is computed on the server** (Postgres function / Edge Function) when a session closes. The client shows a live estimate using the same shared pricing code.
- **Every money action is audited** (who, when, what changed) — bills, payments, discounts, price changes, deletions.
- **Feature toggles** (customers, snacks, expenses) live on the organization row; when off, their screens, menu items and report sections are hidden, but existing data is kept.
- **RTL first**: all layouts use start/end instead of left/right; screens are checked in Arabic from Phase 0.

## 4. Data model (first draft)

```
organizations     id, name, currency='EGP', timezone='Africa/Cairo',
                  feature_customers=true, feature_snacks=true, feature_expenses=true
branches          id, org_id, name, address, phone, opening_hours (json), is_active
memberships       id, user_id, org_id, role (owner|manager|cashier), email, display_name
member_branches   id, membership_id, branch_id, org_id, user_id  -- managers/cashiers; owners see all
invitations       id, org_id, email, role, branch_ids[], invited_by, expires_at, accepted_at
station_types     id, org_id, kind (pc_desk|ps_room), name, color, max_players
stations          id, branch_id, station_type_id, name/number,
                  status (active|maintenance), notes, sort_order
rate_rules        id, station_type_id, price_per_hour (piasters),
                  players_min, players_max,            -- player-count pricing
                  days_of_week (mask), time_from, time_to, -- peak / weekend pricing
                  priority, valid_from, valid_to
packages          id, station_type_id, name, minutes, price  -- e.g. "3 hours for 200 EGP"
customers*        id, org_id, name, phone, notes, default_discount_pct
sessions          id, branch_id, station_id, customer_id?, kind (open|fixed|reservation),
                  status (reserved|active|completed|cancelled|no_show),
                  scheduled_start, scheduled_end, actual_start, actual_end,
                  package_id?, created_by
session_segments  id, session_id, station_id, start, end, players
                  -- a new segment starts when player count changes or the group moves station
products*         id, org_id, name, category, price, track_stock, is_active
stock_movements*  id, product_id, branch_id, qty (+/-), reason (purchase|sale|adjustment), ref_id
session_items*    id, session_id, product_id, qty, unit_price
bills             id, session_id, time_amount, items_amount, discount_amount, total,
                  status (open|paid|partially_paid|void), closed_by, closed_at
payments          id, bill_id, method (cash|visa|instapay), amount, reference?, received_by, paid_at
expenses*         id, branch_id, category, amount, method, date, note, created_by
audit_log         id, org_id, actor_id, entity, entity_id, action, before (json), after (json), at
                                                     (* = optional module)
```

### Pricing algorithm (summary)

1. Split the session into **segments** (player-count changes, station moves).
2. Split each segment again at **rate boundaries** (e.g. peak starts at 18:00, a weekend starts at midnight).
3. For each piece, pick the matching `rate_rule` (station type + players + day/time) with the highest priority.
4. Charge `minutes × price_per_hour / 60`, rounded to the nearest piaster.
5. If a **package** was applied, its fixed price covers its minutes; extra time is billed as above.
6. Add snacks, subtract the discount (manual or the customer's default) → **total**.

This logic lives in one shared TypeScript module (used by the app for estimates and the Edge Function for final bills) and gets heavy unit test coverage.

## 5. Main screens

| Screen                | Purpose                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live floor** (home) | Grid of all stations in the branch, color-coded: Free / Active / Ending soon / Overtime / Reserved soon / Maintenance. Each card shows the timer, players and running cost. One tap to start, extend, add snacks, or check out. |
| **Calendar**          | Timeline: stations as rows, time as columns (day view; week view on large screens). Create a reservation by dragging an empty slot; drag to move, resize to change duration. Filter by PC / PS / type.                          |
| **Session sheet**     | Details of one session: customer, players, segments, snacks, live bill, actions (extend, change players, move station, end).                                                                                                    |
| **Checkout**          | Bill breakdown, discount, payment method(s) (Cash / Visa / Instapay, split allowed), confirm.                                                                                                                                   |
| **Income dashboard**  | Today / week / month / custom range: income total, by payment method, by branch, by station type, busiest hours, utilization %; net profit when Expenses is on.                                                                 |
| **Customers***        | List, search by phone, history, default discount.                                                                                                                                                                               |
| **Snacks & stock***   | Products, prices, stock levels, restock, low-stock warning.                                                                                                                                                                     |
| **Expenses***         | Add/list expenses by category and branch.                                                                                                                                                                                       |
| **Settings**          | Organization, branches, station types, stations, rate rules, packages, staff & roles, feature toggles, language.                                                                                                                |

## 6. Implementation phases

Each phase ends with something that can be demoed. **Phases 0–6 = MVP** that the client can use daily; 7–10 complete v1.

### Phase 0 — Foundations

- Expo + TypeScript + Expo Router project; lint, format, strict types, Jest.
- Folder structure (`src/app/` routes, `src/features/*`, `src/domain/*` for pure logic, `src/ui/*`, `src/lib/*` for infrastructure).
- Tauri v2 shell that loads the web build; confirm it runs on Windows.
- Supabase project (dev + prod), migrations in git, local Supabase for development.
- PowerSync connected end-to-end with one sample table (prove offline write → sync works on mobile, web and Tauri).
- i18n with Arabic + English, RTL switching, base theme (light/dark), core UI components.
- GitHub Actions: lint + typecheck + tests on every PR.

**Done when:** a "hello" screen runs on Android, iOS, Web and Windows in both languages, and a record written offline syncs once back online.

### Phase 1 — Accounts, branches, roles

- Sign up / login (email + password; phone OTP optional later), password reset.
- Create organization on first login (owner), create branches.
- Invite staff by email, assign role and branches.
- Row Level Security policies for every table + pgTAP tests (a cashier in branch A can't see branch B; a cashier can't read income or edit prices).
- Organization settings incl. **feature toggles** (default ON) and branch switcher.

**Done when:** owner, manager and cashier each see only what they're allowed to, verified by automated tests.

### Phase 2 — Stations and pricing setup

- CRUD for station types (PC desk / PS room) and stations; maintenance on/off.
- Rate rules editor: base hourly price, player-count rates, peak/weekend time rules, priority.
- Hour packages.
- Shared **pricing module** with unit tests for all edge cases (crossing midnight, crossing peak boundary, player change mid-session, packages + overtime).
- "Price preview" tool in settings: pick type, players, start/end → see the price.

**Done when:** the owner can set up the client's real center and the price preview matches hand-calculated examples.

### Phase 3 — Live floor and walk-in sessions

- Live floor grid with real-time status and timers (synced across devices).
- Start **open** session, start **fixed** session (pick duration or package).
- Extend, change player count (new segment), move to another station, end session.
- Alerts: 5 minutes before end, at end, and overtime — on all platforms.
- Maintenance stations can't be started.

**Done when:** staff can run walk-in customers for a full day from any device, with alerts.

### Phase 4 — Checkout and payments

- Server-side final bill calculation on end.
- Checkout screen: breakdown, manual discount (permission-controlled), payment method(s), split payments.
- Void / refund with reason (owner/manager only), all audited.
- Simple on-screen / shareable receipt (image or PDF via share sheet).

**Done when:** every completed session has a correct bill and recorded payment(s) by method.

### Phase 5 — Income dashboard (basic)

- Today / this week / this month / custom range.
- Totals by payment method (Cash / Visa / Instapay), by branch, by station type.
- Cashier view: only their own collections for the current day (end-of-shift check).

**Done when:** the owner can open the app on their phone and see today's income per method and branch.

### Phase 6 — Calendar and reservations

- Timeline calendar (day view; week view on tablet/desktop) with stations as rows.
- Create reservation from an empty slot; drag to move / resize; edit; cancel.
- Conflict prevention (database constraint) + clear offline-conflict resolution UI.
- Check-in turns a reservation into an active session; mark **no-show** after a grace period.
- Floor view shows "reserved in 30 min" so walk-ins don't block upcoming reservations.

**Done when:** reservations and walk-ins live together with no double booking, even when two devices book at once. → **MVP pilot at the client's center.**

### Phase 7 — Optional modules (behind the feature toggles)

- **Customers**: create/search by phone during session start, history, default discount.
- **Snacks & drinks**: products, add items to a session, items appear on the bill, stock decreases on sale, restock and adjustments, low-stock warning.
- **Expenses**: categories, add/list by branch, payment method.
- Turning a module off hides it everywhere (menus, session sheet, checkout, reports) without deleting data.

**Done when:** each module works when on and disappears cleanly when off.

### Phase 8 — Advanced reports

- Net profit (income − expenses) when Expenses is on.
- Utilization % per station / type, busiest hours heat map, top customers, snack sales.
- Compare branches and periods; export CSV / PDF.

### Phase 9 — Offline hardening and reliability

- Test a full day offline at the center, then sync; conflict scenarios (two devices, same station).
- Sync status indicator, retry, "last synced" time.
- Error tracking (Sentry), performance pass on large stations counts, backup/restore check.

### Phase 10 — Release

- App icons, splash, store listings (Arabic + English).
- EAS builds → Google Play + App Store; Tauri Windows installer (signed) with auto-update; web deployed on a custom domain.
- Short user guide for owner and staff; onboarding wizard for a new organization.

## 7. Risks and how we handle them

| Risk                                                                       | Mitigation                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Expo has no native Windows target                                          | Tauri wraps the web build; proven in Phase 0 before any features.                                   |
| Offline + multiple devices → double bookings                               | Server-side exclusion constraint; conflict UI; tested in Phases 6 and 9.                            |
| Pricing mistakes lose the client money                                     | One shared, heavily unit-tested pricing module; server computes the final bill; price-preview tool. |
| Cross-platform calendar timeline (no good ready-made library for RN + web) | Build a focused custom timeline component; keep it to day/week views.                               |
| RTL layout bugs                                                            | Arabic checked from Phase 0; logical (start/end) styles only.                                       |
| Staff misuse (deleting sessions, unrecorded discounts)                     | Role permissions, audit log, voids require manager/owner.                                           |
| Running costs (Supabase, PowerSync, app stores, code signing)              | Start on free tiers; estimate monthly cost before pilot.                                            |

## 8. Backlog (after v1)

- Remote PC lock/unlock when time ends (agent installed on each PC).
- Customer-facing booking (web link / WhatsApp) and online deposit.
- Loyalty points / prepaid customer balance.
- Thermal receipt printing.
- Cash drawer & shift open/close with cash count.
- Configurable billing rounding and minimum charge.
- Tournaments / events blocking multiple stations.
- Online payment integration (card / Instapay links).

## 9. Open questions

1. Billing rounding: is per-minute billing right, or does the client round (e.g. to 15/30 min) or have a minimum charge?
2. Do customers ever pay **before** playing (prepaid fixed sessions), or always at the end?
3. Does the client need **cash drawer / shift closing** in v1, or is the cashier daily report enough?
4. Receipts: is on-screen/shared receipt enough, or is a thermal printer needed?
5. Do we plan to sell this to other gaming centers (subscriptions/billing for organizations)?
6. Who pays for and owns hosting, store developer accounts, and the Windows code-signing certificate?

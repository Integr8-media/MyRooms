# MyRooms — project memory

Running log of progress, decisions and open items. Update it at the end of every phase (see CLAUDE.md). Newest information at the top of each section.

## Status

| Phase                                   | Status                            | Branch                                                  | Notes                                                                       |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0 Foundations                           | **Code done, VPS deploy pending** | `feature/phase-0-foundations` (not committed)           | Web + Windows verified. Android/iOS and online sync not yet run.            |
| 1 Accounts, branches, roles             | **Code done, VPS test pending**   | `feature/phase-1-accounts` (not committed)              | 59 pgTAP checks pass on PGlite; signed-in screens need a backend            |
| 2 Stations and pricing                  | **Code done, VPS test pending**   | `feature/phase-2-stations-pricing` (not committed)      | 100 pgTAP checks pass on PGlite; pricing + time-zone code has 31 unit tests |
| 3 Live floor and walk-ins               | **Code done, VPS test pending**   | `feature/phase-3-sessions` (not committed)              | 158 pgTAP checks pass on PGlite; 116 Jest tests                             |
| 4 Checkout and payments                 | **Code done, VPS test pending**   | `feature/phase-4-billing` (not committed)               | 212 pgTAP checks pass on PGlite; 144 Jest tests                             |
| 5 Income dashboard                      | **Code done, VPS test pending**   | `feature/phase-5-income-dashboard` (not committed)      | No server changes; 170 Jest tests                                           |
| 6 Calendar and reservations (MVP pilot) | **Code done, VPS test pending**   | `feature/phase-6-calendar-reservations` (not committed) | 256 pgTAP checks pass on PGlite; 207 Jest tests                             |
| 7 Optional modules                      | **Code done, VPS test pending**   | `feature/phase-7-optional-modules` (not committed)      | 315 pgTAP checks pass on PGlite; 252 Jest tests                             |
| 8 Advanced reports                      | **Code done, VPS test pending**   | `feature/phase-8-advanced-reports` (not committed)      | No server changes; 278 Jest tests                                           |
| 9 Offline hardening                     | **Code done, VPS test pending**   | `feature/phase-9-offline-hardening` (not committed)     | 4 new pgTAP checks pass on PGlite; 308 Jest tests                           |
| 10 Release                              | Not started                       |                                                         |                                                                             |

## Phase 9: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261104000000_phase9_server_time.sql`): only `public.server_time()` (stable, security invoker, signed-in users only) for the device clock check. No sync stream or Edge Function change; `create-bill` unchanged, but `zoned-time` changed so the domain copy was re-synced (redeploy step 7b).
- **Sync status:** `src/lib/powersync/health.ts` (pure: `syncState` offline/connecting/syncing/stuck/error/ok, `isLongOffline` (1 h), `ageOf`, `parseQueuedChange` (`ps_crud.data`), `stuckReason` (a new bill at the head of the queue = the create-bill function), `clockSkew`, `isClockWrong` (2 min)). `useSyncHealth()` feeds `SyncBadge` (floor header, opens `/sync`), `SyncNotices` (floor: offline since…, stuck uploads, wrong clock) and `SyncScreen` (`/sync`: state + hint, last sync, pending count, **Sync now**, upload/download errors, Not saved list, queue by table, clock, browser storage, error reports on/off, app version, row counts of the biggest tables). `SyncStatusCard` was removed.
- **Control:** `src/lib/powersync/control.ts`: one `SupabaseConnector`, `connectSync()`, `syncNow()` (reconnect = refresh token + retry uploads now), `checkClock()` (round trip to `server_time`, ignored if > 10 s). `useSyncWatch()` in the `(app)` layout checks the clock on each reconnect and every 30 min. In-memory `useSyncStore` (skew, persistent storage, retrying).
- **Web storage:** `persist.web.ts` calls `navigator.storage.persist()` at sign-in so the browser doesn't evict the local database (phones: always kept). Shown on the Sync page.
- **Not saved:** refused **bills, payments and refunds** now have their own kinds and show amount + method (Phase 4 open item: money taken offline never vanishes silently).
- **Error tracking:** `@sentry/react-native` (~8.28) with the DSN in `EXPO_PUBLIC_SENTRY_DSN` (off when empty) and `EXPO_PUBLIC_APP_ENV`. `src/lib/monitoring/` (`initMonitoring`, `wrapRoot`, `setMonitoringUser` = ids + role + branch tags, `reportError`, `reportWarning`); `scrub.ts` removes emails, phones (Latin and Arabic-Indic digits), tokens and personal fields (names, phones, notes, references, reasons) from every event and breadcrumb, keeps uuids. Errors only (no tracing/replay). The connector reports refused uploads (table/op/code/key, never the row) and server errors that block the queue (at most every 10 min per table+op; plain offline isn't reported). Expo Router `ErrorBoundary` (`ErrorScreen`, "Try again") in the root and `(app)` layouts. Self-hosted **GlitchTip** compose in `deploy/glitchtip` (all-in-one, own Postgres, no Valkey). `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD=true` (no source maps yet). Desktop workflow passes the two new variables.
- **Performance:** `zoned-time` caches the UTC offset per UTC hour (only when the offset is equal at the hour's first and last ms; the DST hour falls back to Intl), plus a last-hour fast path and `localDateKey()`. Floor cards only get the ticking `now` when a session runs. Benchmark `src/domain/perf.bench.ts` (`npm run perf`, not in `npm test`): 300 running sessions priced in 18 ms (was 96), a year of income for 40 stations (117k payments) 0.43 s (was 2.8 s), usage 0.29 s, busiest hours 0.53 s, top customers 0.13 s (Jest timings).
- **Backups:** `deploy/backup/` `backup.sh` (pg_dump -Fc as `supabase_admin` with POSTGRES_PASSWORD from the Supabase .env, row counts file, 14-day rotation, optional rclone `BACKUP_REMOTE`), `check.sh` (restore into a scratch database, compare counts within 1 % + 5 rows, drop it), `restore.sh` (`--yes`; safety dump, PowerSync down, `pg_restore --clean`, Supabase restart, PowerSync storage rebuilt with `down -v`). Deploy guide steps 11 (GlitchTip) and 12 (backups), step 7 checks 30–36 (full offline day, two-device conflicts, clock, stuck uploads, error reports, backups).

**Verified:** lint, format, typecheck, 308 Jest tests (new: sync health domain, scrubbing, connector reporting + throttling, sync badge/notices/screen, refused payment in Not saved, cached time zone vs Intl every 7 min around DST in Cairo, Lord Howe, St John's, Kolkata), perf benchmark within budgets, 9 migrations + pgTAP on PGlite (4 new checks), sync config validates, web export (boots in a browser with no console errors), Android JS bundle, expo-doctor 20/20, `sh -n` on the backup scripts and a dry run of the count comparison.
**Not verified:** anything signed in (no backend), the full offline day and two-device conflicts at the center, GlitchTip and the Sentry SDK sending real events (web, Windows WebView2, phones), the backup scripts against a real Supabase container (user/password, pg_restore errors in the scratch database), the screens in Arabic and on a phone, Hermes timings on a real phone.

### Phase 9 "done when" still open

- [ ] On the VPS: migration (step 5), step 7b redeploy, steps 11–12, then step 7 items 30–36.
- [ ] The full offline day at the center (item 31) and the two-device conflicts (item 32) on web, Windows and a phone.
- [ ] Run `check.sh` once by hand and fix whatever the real Supabase image needs (e.g. if `supabase_admin` can't log in over 127.0.0.1).
- [ ] Check `/sync` and the floor notices in Arabic and on a phone-sized screen.

## Phase 8: what was built (2026-10-30)

- **No server changes** (no migration, sync stream or Edge Function), like Phase 5: every report is worked out on the device from what it already syncs (owners: all branches; managers: their branches).
- **Domain** `src/domain/reports.ts` (not copied to the server): `previousRange` (yesterday / last week / the whole previous calendar month / the same number of days before a custom range), `percentChange` (null when the previous figure is ≤ 0), `netProfit`, `compareBranches`, `summarizeUtilization` (per station, type, branch and overall; segments of active/completed sessions, merged, running ones up to now; only the elapsed part of the range; 24 h a day; stations added during the range count from `created_at`; removed stations only if used), `occupancyHeatmap` (average busy stations per weekday × local hour; steps one hour from local midnight, DST-safe), `topCustomers` (net payments of sessions with a customer, visits = bills paid towards), `summarizeItemSales` (by `session_items.created_at`; cancelled sessions and void bills excluded). `IncomeEntry` gained optional `billId`/`customerId` (the income query now selects `p.bill_id`, `x.customer_id`).
- **App:** the floor button for owners/managers is now **Reports** (route still `/income`; cashiers keep **My shift**). `src/features/reports/ReportsScreen.tsx`: same period/custom/branch pickers, tabs **Overview** (income + change vs previous period, Net profit card with expenses by category when Expenses is on, Compare branches with 2+ branches, by method/type/day), **Usage** (overall %, by type, Busiest hours heat map, by station), **Customers** and **Snacks & drinks** (each only when its module is on). `TotalCard`/`AmountBars` moved to `src/features/income/parts.tsx`. `useReport` (one payments query covering both periods).
- **Export:** `document.ts` turns the model into tables (`ReportDocument`); `export.ts` → CSV (UTF-8 BOM, CRLF, amounts as plain pounds "123.45") or an A4 HTML page (RTL in Arabic). `share.ts` (phones: `expo-file-system` `File(Paths.cache)` + `expo-sharing`; PDF via `expo-print` A4) / `share.web.ts` (Blob download; PDF via the hidden-iframe print dialog). New dependency `expo-file-system` (~58.0.13) → phones need a new dev build.

**Verified:** lint, format, typecheck, 278 Jest tests (16 report domain tests: previous periods incl. leap February, utilization incl. running sessions/merging/new and removed stations, heat map incl. Cairo's DST day, top customers, snack sales, branch comparison; 4 export tests; 6 screen tests: profit + comparison, one branch, usage + heat map, customers + snacks, CSV/PDF content, modules off), web export, Android JS bundle, expo-doctor 20/20.
**Not verified:** anything signed in (no backend), the screen in Arabic and on a phone (heat map width on a small screen), CSV download inside Tauri (WebView2), the share sheet on phones, performance with a year of data.

### Phase 8 "done when" still open

- [ ] On the VPS: step 7 items 27–29.
- [ ] Check Reports in Arabic (RTL heat map: hours run right to left) and on a phone-sized screen.
- [ ] Export CSV from the Windows app (WebView2 download) and from a phone; open in Excel.
- [ ] Try a 1-year custom range on a phone with real data (speed).

## Phase 7: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261103000000_phase7_modules.sql`): `customers` (org-wide: name, phone, notes, `default_discount_pct`, `is_active`; any member adds/edits, only owners/managers change the discount, trigger `check_customer`; phone **not unique**), `sessions.customer_id` (trigger `sessions_customer`: same org), `products` (org-wide, owners only, audited), `session_items` (product, quantity 1-1000; the trigger copies org/branch from the session and **name/unit_price from the product**, so clients can't set prices; insert while the session is active or completed with a non-void bill; delete while active by any branch staff, after it ended only owners/managers, before any payment, and never below the bill's discount; no UPDATE), `stock_movements` (`purchase` > 0 / `adjustment` +/-, per branch, owners and branch managers, insert-only), `expenses` (fixed category list, amount, method, `spent_on` date, note; owners and branch managers read/write/delete; cashiers see nothing). Everything money-related is audited (`audit_row`). `create_bill()` (same signature) now sets `items_amount` from the items and the customer's default discount (`discount_reason = 'customer:<pct>'`); trigger `update_bill_items` keeps `bills.items_amount` in step when items change after the bill. The `create-bill` Edge Function and `src/domain/billing.ts` are unchanged (no `domain:sync` needed).
- **Sync:** new stream `org_catalog` (products + customers of every org the user belongs to); `session_items` and `stock_movements` added to `assigned_branches` and `owner_data`; `expenses` in `owner_data` and `manager_branch_staff` (managed branches only). Publication extended.
- **Stock = sum(stock_movements) - sum(session_items)** per branch and product, computed on the device in SQL (`useProducts`). Sales are not movements, so offline sales can't double-count and removing an item puts it back. A count saves the difference as an adjustment.
- **Domain:** `src/domain/items.ts` (`itemsTotal`, `groupItems`, `stockState` ok/low/out/untracked, `adjustmentFor`, `customerDiscount` (= `percentDiscount`), `customerDiscountReason`/`parseCustomerDiscount`, `normalizePhone` (Arabic-Indic digits, +20/0020), `searchCustomers`, `samePhone`), `src/domain/expenses.ts` (`EXPENSE_CATEGORIES` = SQL check list, `summarizeExpenses`). New zod schemas: customer, product, stock, expense. New permissions: `customers.manage`, `customers.discount`, `products.edit`, `items.sell`, `items.removeAfterEnd`, `stock.manage`, `expenses.manage`. New error keys: `invalid_customer`, `invalid_product`, `invalid_quantity`.
- **App:** floor strip `ModuleLinks` (Customers, Snacks & stock with a low-stock count, Expenses for owners/managers) shown only for modules that are on. Routes `/customers` + `/customers/[id]` (search by phone/name, edit, default discount, visits and total paid), `/products` + `/products/[id]` (stock in the current branch, low-stock notice, owners edit products, owners/managers restock and count, history), `/expenses` + `/expenses/[id]` (today/week/month by category, add/edit/delete with inline confirm). `CustomerPicker` (search, quick add with duplicate-phone warning) on the start screen, reservation form (fills name/phone) and session sheet (`setSessionCustomer`). `ItemsCard` on the session sheet (active) and checkout (until void). Checkout, `UnpaidList`, the session estimate and the receipt add up the **local** `session_items` (never `bills.items_amount`), list items, and label `customer:<pct>` as "Customer discount (n%)". `insertBill` applies the customer discount locally like `create_bill`. The "Not saved" list names item/customer/stock/expense rejections.
- **Module toggles only hide UI.** The server accepts writes whatever the toggle (an offline sale or expense must not be lost). With snacks off, item lines already on a bill still show at checkout and on the receipt (the money is real); only adding/removing is hidden.

**Verified:** lint, format, typecheck, 252 Jest tests (new: items/expenses domain, permissions, validation; ItemsCard add/remove, products list low-stock, stock count/restock, owner adds product, ModuleLinks on/off; CustomerPicker search/quick add/duplicate; customer edit (cashier can't send a discount), visits; expenses period totals, permission/module-off, add/edit/delete; checkout items + customer discount, snacks off; receipt items; start screen and reservation form pass `customerId`; session sheet items in the estimate). 8 migrations + 315 pgTAP checks pass on PGlite (59 new); removing the server price override, letting cashiers restock or see expenses, dropping the discount check, or letting cashiers remove items after the end each make tests fail. Sync config validates. Web export builds.
**Not verified:** anything signed in (no backend), the new screens in Arabic and on a phone, the real pgTAP run, two devices selling the last item offline.

### Phase 7 "done when" still open

- [ ] On the VPS: step 7 items 22-26 (migration + PowerSync restart first).
- [ ] Check the new screens in Arabic (RTL) and on a phone-sized screen.
- [ ] Switch each module off and on with real data and confirm it disappears cleanly (floor, start screen, reservation form, session sheet, checkout).

## Phase 6: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261102000000_phase6_reservations.sql`): reservations are rows in `sessions` (`kind = 'reservation'`, `status = 'reserved'`, booked `[scheduled_start, scheduled_end)`), with new columns `players` (planned), `customer_name`, `customer_phone`. `btree_gist` + exclusion constraint `sessions_no_double_booking` (station, time range) on reserved rows: the final judge when two offline devices book the same slot (23P01). `private.check_booking` also refuses a booking that overlaps another reservation or an active session's planned end (`booking_conflict`, 23P01); open walk-ins don't block. Rules in `check_session`: maintenance stations can't be booked; check-in (reserved→active) needs an in-service, free station (unique index → 23505); no-show only 15 min after the start (`too_early`); any branch staff cancels a reservation (still audited by the Phase 3 trigger), only managers/owners cancel a running session; `scheduled_start`/`players` change only while reserved; `actual_start` is set only at check-in. No sync-config change (`SELECT *` picks up the columns).
- **Domain** `src/domain/reservations.ts` (not copied to the server): `bookingFromRow`, `findConflict` (same rule as SQL), `overlappingIds` (offline overlaps to flag), reservation states (upcoming / soon −30 min / due / late after 15 min grace / over), `nextReservation`, `isReservedSoon`, `runsIntoReservation`, DST-safe day windows (`dayWindow`, `hourMarks`: 23/25-hour days), `weekDates`, `slotAt`, `dragRange` (15-min snap, 15 min–24 h), `reservationRange`/`rangeToForm`.
- **App:** `/calendar` (`src/features/calendar/`): day timeline (stations as rows, sideways-scrolling 24 h, now line, tap an empty slot → new reservation at that 15-min slot, tap a reservation to select it then drag to move (time + station) or drag the end handle to resize; a second tap or "Open" opens it), week view on screens ≥ 900 px (7 day strips per station; tap a day to open it), PC/PS filter, legend, red border + notice for overlapping bookings. `/reservations/new` (book, or `?id=` to edit; station chips, date, start time, length, players, name, phone, note, live conflict check, price estimate) and `/reservations/[id]` (check in, check in on another free station, no-show after the grace, edit, cancel with inline confirm). Floor: **Reserved soon** card status (`reserved` theme colour), "Reserved 18:00 Name" on cards (red on a running session that would run into it), **Arrivals** list (next 2 h + late ones), Calendar button. The start screen warns when a walk-in would run into the next reservation; the session screen shows the customer, lets checked-in reservations add time, and warns about a clash.
- **Conflict UI:** the connector now records every refused upload in the local-only table `upload_rejections` (table, op, row, full row data, error key) before dropping it. `RejectedChanges` (floor + calendar) lists them ("Reservation not saved", "Walk-in session not saved", …) with the reason, **Book again** (prefilled form; the entry is removed once saved) and **Dismiss**. 23P01 → `booking_conflict`, 23505 on sessions → `station_busy`.
- Permission `reservations.manage` (all roles). New theme colour `--color-reserved`.

**Verified:** lint, format, typecheck, 207 Jest tests (20 reservation domain tests incl. Cairo's 23-hour day and a booking across a DST change; calendar day view, tap-to-book slot snapping, select → open, day stepping, overlap warning; form booking/conflict/edit/redo; detail check-in, check-in elsewhere, no-show grace, cancel; floor reserved-soon + arrivals; start-screen clash warning; "Not saved" list; connector records rejections and keeps temporary failures queued). 7 migrations + 256 pgTAP checks pass on PGlite (44 new; the constraint alone is tested with the trigger disabled; weakened rules make tests fail). Web export builds.
**Not verified:** anything signed in (no backend), dragging with a real mouse/finger (PanResponder inside scroll views) on web, Windows and phones, the sideways-scroll start position in Arabic on phones, the screens in Arabic and on a phone, the real pgTAP run.

### Phase 6 "done when" still open

- [ ] On the VPS: step 7 items 18–21, including two devices booking the same slot offline.
- [ ] Try drag/resize on web (mouse), Windows (WebView2) and a phone; check the timeline in Arabic (time runs right to left).
- [ ] MVP pilot at the client's center.

## Phase 5: what was built (2026-10-30)

- **No server changes.** Income is computed on the device from the `payments` (+ `bills`, `sessions`, `stations`) each device already syncs: owners get every branch, managers their branches, cashiers their branches. Works offline; no migration, sync stream or Edge Function. (PLAN's deploy table had "report views" for Phase 5; not needed.)
- **Domain** `src/domain/income.ts` (not copied to the server): `periodRange` (today / this week / this month in the org time zone, DST-safe through `fromLocal`), `customRange` (both days included, max 366 days, errors `invalid_date` / `end_before_start` / `range_too_long`), `summarizeIncome` (net = payments − refunds; totals by method, branch, station type and local day; void bills and unreadable rows skipped; filter by branch or `received_by`), `utcDateWindow` (loose SQL pre-filter, see Quirks), `datesInRange`, `ranked`, `share`.
- **App:** route `src/app/(app)/income.tsx` → `src/features/income/IncomeScreen.tsx`, opened from a button on the floor header (**Income** for owners/managers, **My shift** for cashiers). Owners/managers: period picker, custom From/To (`YYYY-MM-DD`), branch filter (2+ branches), total with payment/refund counts, bars by method, by branch (all branches), by station type, by day (ranges over 1 day; every day up to 31 days, otherwise only days with money). Cashiers: their own payments today (total, by method, list with time, station and receipt number).
- **Station type** of a payment = the type of the session's current station (`sessions.station_id` → `stations.station_type_id`), so a session moved between types counts fully under the last one.

**Verified:** lint, format, typecheck, 170 Jest tests (21 income domain: periods incl. week start, year/month ends, leap February, Cairo's 23-hour DST day, local vs UTC day, refunds on their own day, voids, filters; 5 screen tests: owner today/branch filter/week/custom range errors, cashier only sees their own payments today), web export builds.
**Not verified:** anything signed in (no backend yet), the screen in Arabic and on a phone, numbers against a real day at the center.

### Phase 5 "done when" still open

- [ ] On the VPS: deploy guide step 7 items 16–17 (owner on a phone sees today's income per method and branch; cashier sees only their own collections).
- [ ] Check the income screen in Arabic (RTL bars and numbers) and on a phone-sized screen.

## Phase 4: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261101000000_phase4_billing.sql`): `bills` (one per completed session, **`bills.id = session id`** so two devices checking out the same session make the same bill; `number` per branch from `private.bill_counters`; `time_amount`, `items_amount` (0 until Phase 7), `discount_amount`, `total`, `paid_amount`, `status` open/partially_paid/paid/void, `details` jsonb with the priced lines, discount/void who/why/when, `closed_by`, `closed_at` = session end) and `payments` (kind payment/refund, method cash/visa/instapay, positive `amount`, `reference`, `reason`, `received_by` forced to the caller, `paid_at` device time). `total`/`paid_amount`/`status` are kept by triggers, not generated columns (generated columns don't go through logical replication to PowerSync).
- **Server-side bill:** only `public.create_bill(session, time_amount, details, actor)` inserts bills, and only the **service role** may call it. The **`create-bill` Edge Function** reads the session, segments, time zone, rules and package _as the caller_ (RLS), prices it with `src/domain` and calls `create_bill`. Idempotent. The PowerSync connector sends a local `bills` INSERT to this function instead of the REST insert (400/403/409 = dropped like other rejected writes; 401/404/5xx/network = retried, which blocks the queue until the function is deployed).
- **Shared code for Deno:** `scripts/sync-domain.mjs` copies `money`, `zoned-time`, `pricing`, `sessions`, `billing` from `src/domain` to `supabase/functions/_shared/domain` with `.ts` import extensions (`npm run domain:sync`). `src/domain/server-copy.test.ts` fails if the copy is stale. The copy also runs under `node --experimental-strip-types`.
- **Rules:** everyone in the branch takes payments (split across methods). Owners + branch managers: discount (only before any payment, at most the subtotal), refund (reason required, at most what was paid), void (reason required, final; the bill no longer counts, payments stay). Overpayment is **accepted** by the server (an offline payment must never be lost); the app blocks it and shows "paid too much". Payments are never updated or deleted. Audit: bill insert (actor = closed_by), discount and void changes, every payment and refund (`audit_row`).
- **Domain** `src/domain/billing.ts`: row mappers shared by app and server (`rateRuleFromRow`, `packageFromRow`, `segmentFromRow`), `computeFinalBill` (a running segment is charged up to the session end, nothing after it; reports `gapMinutes` and `uncoveredMinutes`), `parseBillDetails`, `billFromDetails`, `netPaid`, `billStatus` (mirrors the SQL), due/overpaid/change, percent discount, payment/refund/discount validation.
- **App:** ending a session creates the bill locally in the same transaction and opens **Checkout** (`src/app/(app)/checkout/[id].tsx`, `src/features/checkout/`): breakdown with a discount line, gap/unpriced warnings, total/paid/due, payments list, payment form (method, amount defaulting to what's due, cash received → change, reference for Visa/Instapay), discount (amount or %), refund and void with inline confirmation, receipt. On the device, totals and status come from the bill amounts + local payments (never from `bills.total/paid_amount/status`, which only change on the server). The floor lists **Waiting for payment** (completed sessions with no bill or not fully paid). Older sessions without a bill get a "Make the bill" button.
- **Receipt:** `receipt.ts` builds standalone HTML (RTL in Arabic). Phones: `expo-print` → PDF → `expo-sharing` share sheet. Web/Windows: hidden iframe + `print()` (expo-print on web prints the whole page). The `expo-sharing` config plugin was removed from app.json (it is only needed to _receive_ shares).
- **PGlite harness moved into the repo:** `scripts/pgcheck/` (`npm --prefix scripts/pgcheck install` once, then `npm run db:check`: migrations + all pgTAP files, then the sync config check). `node scripts/pgcheck/run.mjs . phase4` runs one file.

**Verified:** lint, format, typecheck, 144 Jest tests (billing domain, server-copy check, checkout screen: full/split/too-large payments, change, permissions, percent discount, no discount after payment, void, unsynced number, older sessions, receipt HTML in EN/AR), web export, Android JS bundle, expo-doctor 20/20. 6 migrations + 212 pgTAP checks (59 + 41 + 58 + 54) pass on PGlite; granting `create_bill` to clients, letting cashiers refund, or not forcing `received_by` each make tests fail. Sync config validates. The domain copy gives the same bill under Node's TypeScript stripping.
**Not verified:** the Edge Function in Deno or on the VPS (no Deno or Docker here), anything signed in, printing/sharing on real devices and in Tauri, the new screens in Arabic and on a phone, the real pgTAP run.

### Phase 4 "done when" still open

- [ ] Deploy `create-bill` (deploy step 7b) and run step 7 items 11–15 on web, Windows and a phone.
- [ ] Check that a bill calculated on the server matches the device estimate for a session with a player change and a package.
- [ ] Check checkout and the receipt in Arabic and on a phone-sized screen; print a receipt from Windows (Tauri WebView2).

## Phase 3: what was built (2026-10-30)

- **Database** (`supabase/migrations/20261031000000_phase3_sessions.sql`): `sessions` (kind `open`/`fixed`/`reservation`, status `reserved`/`active`/`completed`/`cancelled`/`no_show`, current `station_id`, `package_id`, `scheduled_start/end`, `actual_start/end`, `note`, `created_by`/`ended_by` set by triggers) and `session_segments` (station, station type copied by trigger, players, `started_at`, `ended_at` null = running). Segments feed `priceSession` directly.
- **Server rules (triggers):** only walk-ins can be inserted for now (status `active`, not `reservation`); station must be in the branch, active and not removed (`station_unavailable`); one active session per station (unique partial index → 23505 when two devices start the same station offline); package must match the station type; players ≤ type max (`too_many_players`); allowed transitions active→completed/cancelled and reserved→active/cancelled/no_show; closed sessions can't change (`session_closed`); a running session's `actual_end` is forced to null; ending closes the running segment (backstop). Segments: must be on the session's **current** station, inserted open, can't overlap (start clamped to the session start and the last segment's end), closed once only.
- **Access:** all branch staff read/start/extend/change/move/end; only owners and branch managers cancel (trigger, `not_allowed`); cancellations go to `audit_log`. No deletes. Sync streams: sessions + segments in `assigned_branches` and `owner_data`.
- **Domain** `src/domain/sessions.ts`: floor status (free / active / ending soon at −5 min / overtime / maintenance), timers, `extendEnd` (adds to the planned end even when over time), `toPricingSegments`, alert schedule (−5 min, end, +15 min; keys include the planned end so extending re-arms), `dueAlerts` for timer-based devices (latest due alert only, 2-minute grace), and `parseTimestamp` (device ISO and Postgres text like `2026-01-05 12:00:00.123456+00`).
- **App:** the home screen is now the **Live floor** (`src/features/sessions/FloorScreen.tsx`): station cards in a responsive grid with status colors, timer (elapsed for open, remaining/over for fixed), players and running cost, plus a status summary. Routes `sessions/start?stationId=` (open or fixed; quick durations, custom minutes or a package; players; note; live estimate or current rate) and `sessions/[id]` (timer, add time, change players, move to a free station, end/cancel with inline confirmation, estimated bill, history of segments). Writes in `src/features/sessions/api.ts` run in local transactions with the same checks as the server.
- **Alerts:** `src/lib/notifications/alerts.ts` (phones: expo-notifications scheduled with the OS, reconciled whenever sessions change) and `alerts.web.ts` (web + Windows: checked every 5 s while the app is open; Tauri notification plugin or the Web Notifications API, plus a short Web Audio beep). `useSessionAlerts()` is mounted in `src/app/(app)/_layout.tsx` and covers the current branch. Per-device switch in Settings → Account → Session alerts (`sessionAlerts` in the settings store, default on). Sign-out cancels scheduled alerts.
- UI kit: `Stepper`; `Screen` has a `wide` option. `BillBreakdown` moved to `src/features/pricing/BillBreakdown.tsx` and is shared by the price preview and the session screen.

**Verified:** lint, format, typecheck, 116 Jest tests (domain timers/status/alerts/timestamps, floor/start/session screen tests), web export and Android JS bundle build, expo-doctor 20/20, `cargo check` of the Tauri shell with the notification plugin. Migrations + 158 pgTAP checks (59 + 41 + 58) pass on PGlite; mutations (cashiers can cancel, no cancel audit, org-wide reads, segments not closed, no player limit, created_by not set) each make tests fail. Sync config validates.
**Not verified:** anything signed-in in a real browser or device (no backend yet), notifications on a real phone / Windows / browser, Arabic layout of the new screens, the real pgTAP run.

### Phase 3 "done when" still open

- [ ] On the VPS: staff run walk-ins for a full day from web, Windows and a phone, with alerts (deploy guide step 7, items 7–10).
- [ ] Check the floor, start and session screens in Arabic (RTL) and on a phone-sized screen.
- [ ] New EAS development builds (expo-notifications is native) and a new Windows installer (notification plugin).

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

- **2026-10-30: Error tracking = Sentry SDK + self-hosted GlitchTip** (fits the self-hosting choice; sentry.io works with the same DSN setting). Optional: no DSN = nothing sent. No personal data in reports (scrubbed on the device), errors only, 30-day retention in GlitchTip.
- **2026-10-30: Synced history is not limited yet** (Phase 3 open item). Reports run on the device and need the history; the benchmark shows a year of a 40-station center is fine. The Sync page shows row counts so a slow device can be spotted; revisit (server-side reports or limiting cashiers' devices) if a device gets slow.
- **2026-10-30: A wrong device clock is warned about, not corrected** (warning above 2 minutes, checked against `server_time()`). Times stay device times so offline work keeps its real order.
- **2026-10-30: Backups are logical dumps** (pg_dump nightly, 14 days on the VPS, optional encrypted rclone remote) with a weekly automatic restore check. PowerSync storage is rebuilt after a restore, not backed up.

- **2026-10-30: Reports stay on the device** (Phase 5 decision kept). If a year of payments/segments gets slow on phones, move heavy reports to server RPCs in Phase 9.
- **2026-10-30: Utilization counts 24 hours a day** (opening hours aren't set up; `branches.opening_hours` is unused). Ask the client for their hours; then the available time can be limited to them.
- **2026-10-30: "This month" compares with the whole previous month**, even while this month is still running (likewise this week vs last week). Custom ranges compare with the same number of days just before.
- **2026-10-30: Snack sales count on the day the item was added**, top customers by money paid in the period (`paid_at`), so the two can differ from bill dates.
- **2026-10-30: Export = CSV + printable page** (PDF via the share sheet on phones, "Save as PDF" in the print dialog on web/Windows); no PDF library.

- **2026-10-30: Stock is derived, not stored:** restocks/corrections minus items sold, per branch. No trigger writes sale movements. Selling when stock is 0 is allowed (warning only): counts are corrected later.
- **2026-10-30: The server sets item prices** from the product at upload time (like `create-bill` pricing time): an offline sale made just before a price change is billed at the new price.
- **2026-10-30: The customer's default discount is applied once, when the bill is made** (`create_bill` and `insertBill`), on time + items at that moment. Items added at checkout afterwards are not discounted; a manager can change the discount before payment. Cashiers can't set a customer's discount.
- **2026-10-30: Customer phone numbers are not unique** (offline duplicates would make the linked session fail to upload). The app warns about a known number and offers to pick that customer.
- **2026-10-30: Products and customers are org-wide; stock and expenses are per branch.** Expense categories are a fixed list (rent, salaries, electricity, internet, maintenance, supplies, snacks, other); ask the client if they need their own.
- **2026-10-30: Feature toggles only hide the modules in the app**; the server doesn't refuse writes when a module is off (offline devices may not know yet). Existing items stay on bills.
- **2026-10-30: Expenses are owners and managers only** (cashiers neither see nor sync them). Edits and deletes are allowed and audited. Net profit is Phase 8.

- **2026-10-30: Reservations live in `sessions`** (kind `reservation`), not a separate table: check-in is a status change; billing, alerts and sync work unchanged; bill id = session id still holds.
- **2026-10-30: The constraint blocks double booking between reservations only**; a booking that overlaps a walk-in's planned end is refused by the trigger (point-in-time check). Extending a running session into a booking, and open walk-ins, are only warned about in the app, never refused (an offline extension must not be lost).
- **2026-10-30: Check-in keeps the booked end** as the session's planned end (alerts fire as for fixed sessions; staff add time). An early check-in plays and pays from the actual start.
- **2026-10-30: No-show grace is 15 minutes, "reserved soon" 30 minutes** (`NO_SHOW_GRACE_MS` must match the SQL). Not automatic: staff mark no-shows. Ask the client for their grace period.
- **2026-10-30: Any staff member books, moves, cancels and checks in reservations**; cancellations are still written to `audit_log`.
- **2026-10-30: Refused uploads are kept per device** (`upload_rejections`, local-only, cleared on sign-out), not synced: the device that lost the race is the one that must tell the customer.

- **2026-10-30: Income reports run on the device** from synced payments, not server views: works offline, no new server code. Revisit in Phase 8/9 if history gets too big to sync (see the Phase 3 open item) — then move reports to server-side RPCs.
- **2026-10-30: Income is counted when the money changes hands** (`paid_at`, device time, org time zone), refunds on their own day; payments on void bills never count.
- **2026-10-30: Weeks start on Saturday** (`DEFAULT_WEEK_START`). Ask the client; it's one constant.
- **2026-10-30: The cashier restriction is in the app only.** Cashiers can read their branch's payments in the database (checkout needs them); the app shows them only their own payments today. Enforcing it server-side would need a separate payments feed for checkout.

- **2026-10-30: The final bill is calculated by an Edge Function** (`create-bill`) running the same `src/domain` code, not ported to SQL. Clients can't write amounts: only the service role inserts bills. The device's bill is an estimate until it syncs.
- **2026-10-30: Bill id = session id**, so two devices can never make two bills for one session, and payments taken on both attach to the same bill.
- **2026-10-30: The server prices with the rules in force when the bill uploads**, not when the session was played. They only differ if the owner changes prices while a device is offline with an unpaid bill. Revisit if it matters to the client.
- **2026-10-30: Early-end times are not clamped or audited.** Device times are kept (offline uploads are legitimately late); `bills.created_at` (server) next to `closed_at` (device) lets reports spot a wrong clock later.
- **2026-10-30: Discounts only before any payment**, by owners and branch managers. Cashiers can't discount (ask the client whether they need a small allowance).
- **2026-10-30: Overpayments are accepted by the server**, refunds correct mistakes, payments are immutable. Voiding should come after refunding (the UI says so; the server doesn't enforce it, and void bills don't count as income).

- **2026-10-30: Session times come from the device** (sessions start offline). The server checks they make sense (end ≥ start, segments don't overlap) but not that the clock is right. A cashier can still end a session with an early time; Phase 4 should decide whether to audit or clamp ends far from the upload time.
- **2026-10-30: Only cancellations are audited in Phase 3**; bills and payments get their audit in Phase 4. Cancel = owners and branch managers.
- **2026-10-30: A session with a package can only move to a station of the same type** (packages belong to one type). The UI explains it; the server rejects it (`invalid_package`).
- **2026-10-30: Extending a fixed session adds to the planned end**, not to "now", so overtime already played stays billed.
- **2026-10-30: Alerts are local notifications only** (no push server). Phones schedule them with the OS; web/Windows need the app open. Each device alerts for the branch it is set to, and can turn alerts off.
- **2026-10-30: A running session wins over maintenance on the floor** (a station put in maintenance mid-session still shows the session so it can be ended). Maintenance only blocks starting.

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

- The PGlite harness loads `btree_gist` from `@electric-sql/pglite/contrib/btree_gist`, and `stub.sql` creates the `extensions` schema.
- React Compiler lint rejects refs and mutated `useState` values passed to `PanResponder.create`; `BookingBlock` keeps the responder in a small class (`DragController`) updated through a method in `useLayoutEffect`.
- Jest can't load `@powersync/common` (ESM): mock it (`UpdateType` only) in tests that import the connector.
- The logical `start` style works for absolute positions on native and react-native-web (RNW maps it to left/right by direction).

- `payments.paid_at` on the device is ISO text for local rows but Postgres text (`2026-01-05 12:00:00+00`) after sync, so text comparisons are unreliable. Both start with the UTC date: pre-filter with `substr(paid_at, 1, 10) BETWEEN` (`utcDateWindow`, one day wider each side) and do the exact check after `parseTimestamp`.
- Jest's environment runs domain code about 10x slower than plain Node (`node --experimental-strip-types` on the `_shared/domain` copy): fine as a phone stand-in for `npm run perf`, but don't compare its numbers with Node.
- `@sentry/react-native` is mocked globally in `jest.setup.js`; tests that render `SyncScreen` need `@powersync/react` mocked with `useStatus`.
- expo-doctor prints a harmless Sentry warning (no organization/project in the plugin config).
- Python on Windows writes CRLF in text mode: open files with `newline=''` when editing them from scripts.
- **PGlite harness is in the repo** (`scripts/pgcheck/`, `npm run db:check`). Its `tap.sql` used to `grant execute on all functions in schema public to public`, which silently re-opened locked-down functions like `create_bill`; it now grants only the test helpers.
- Edge Functions need `.ts` extensions on imports; app code imports without them. Never edit `supabase/functions/_shared/domain` by hand: run `npm run domain:sync`.
- `eslint-plugin-import` can't see `Notifications.AndroidImportance` (re-exported through a types module); it is disabled for that one line.
- Jest: variables used inside `jest.mock` factories must be named `mock…`.
- Jest: test mocks of `useWorkspace` must include `features` (`{ customers, snacks, expenses }`), and any screen that renders `ItemsCard` or `CustomerPicker` needs `jest.mock('@/lib/powersync/database', () => ({ powersync: {} }))` (their write modules import the database).
- Long inline Python heredocs in the Bash tool sometimes fail with "unexpected EOF while looking for matching `''" (seen with Arabic text and some symbols). Write the script to the scratchpad and run it instead.

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
5. Run the Phase 3 checks on the VPS (step 7 items 7–10) on web, Windows and a phone; check the new screens in Arabic.
6. Deploy `create-bill` with the other Edge Functions (step 7b) **before** staff end sessions, then run step 7 items 11–15.
7. Ask the client: may cashiers give small discounts? Is an on-screen/shared receipt enough (open question 4), and what should it show (logo, address, tax number)?
8. Run the Phase 5 checks (step 7 items 16–17) once the VPS is up. Ask the client which day their week starts on and whether cashiers should see anything beyond their own day.
9. Run the Phase 6 checks (step 7 items 18–21), try drag/resize on each platform, then the MVP pilot. Ask the client: the no-show grace period, and whether reservations need a deposit or always a phone number.
10. Run the Phase 7 checks (step 7 items 22-26) after the migration and a PowerSync restart. Ask the client: their snack/drink list and prices, whether the expense categories fit, whether cashiers may restock, and whether a customer discount should also cover items added at checkout.
11. Run the Phase 8 checks (step 7 items 27–29). Ask the client: their opening hours (for usage %), and which report numbers they look at most (to put first).
12. Run the Phase 9 checks (deploy steps 11–12, step 7 items 30–36), including a full offline day at the center. Ask the client: is a 2-minute clock tolerance right, and who should receive error alerts?
13. Phase 10: release (icons, store listings, signed Windows installer with auto-update, production domain, user guide).

### Open items from Phase 4

- If `create-bill` is missing or answers 5xx, a device's upload queue stops at the bill (nothing lost, but nothing after it uploads). Phase 9: the badge shows **Not uploading** and the floor names the bill service.
- A bill the server rejects (e.g. because its session's end was rejected) disappears together with any payments taken for it on the device. Phase 9: they are listed under Not saved with the amount and method, so the money can be recorded again.
- The server doesn't require refunds before a void. Reports must exclude void bills' payments.

### Open items from Phase 3

- Every session and segment ever recorded syncs to every device of the branch. Phase 9 decision: kept (reports need it; benchmarked fine for a year); revisit if a device gets slow.
- When the server rejects an offline session (station already taken), the losing device's session silently disappears after sync. Needs the conflict UI planned for Phases 6/9.
- An active session can be left with no running segment if a client closes one without opening the next (the app never does this). Phase 4 billing should treat gaps as unbilled and flag them.

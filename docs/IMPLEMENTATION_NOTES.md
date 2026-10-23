# Implementation notes (decisions on top of BUILD_SPEC.md)

The contract is `packages/shared/src` (types.ts, api.ts, socket.ts). Every app imports `@demo/shared` (compiled CommonJS in `packages/shared/dist`; run `pnpm build:shared` after changing it). If the spec and the shared types disagree, **the shared types win**.

## Environment / ports

| App | Port | Env |
|---|---|---|
| API (NestJS, global prefix `/api`, Swagger at `/docs`) | 3000 | `MONGO_URL` (default `mongodb://127.0.0.1:27017/hydro_one_demo`), `JWT_SECRET`, `DEMO_CUSTOMER_FIRST_NAME`, `DEMO_ENROLLED_CUSTOMER_FIRST_NAME`, `EV_ALWAYS_CHARGING`, `DEMO_TIMEZONE` |
| Web (Vite) | 5173 | `VITE_API_URL` (default `http://localhost:3000`), `VITE_MOBILE_WEB_URL` (default `http://localhost:8081`) |
| Mobile (Expo; web on 8081) | 8081 | `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`) |

The root `.env` is read by the API via dotenv (`path: ../../.env` relative to apps/api, falling back to defaults). The API enables CORS for all origins (demo).

The API dev loop is `tsc -w` + `node --watch` (NOT tsx/esbuild): Nest DI needs `emitDecoratorMetadata`. apps/api/tsconfig must set `experimentalDecorators`, `emitDecoratorMetadata`, `module: node16`, `outDir: dist`, `rootDir: src`.

## Auth (mock)

- `POST /api/auth/login` accepts any password. Email must match a seeded user.
- Seeded logins: `manny@demo.test` (unenrolled demo customer), `priya@demo.test` (enrolled demo customer), `staff@demo.test` (STAFF). First names come from env.
- Token: JWT (HS256, `JWT_SECRET`, 7-day expiry) with `{ sub, role, customerId? }`.
- Customer endpoints (`/me/*` incl. `PATCH /me/autopay`, `/energy`, `/bills` (list), `/bills/current`, `/bills/usage-history`, `/payments`, `/messages`, `/enrollments`, `/ev-detections/mine/*`, `/dr-events/:id` GET, `/responses`, `/result/me`, `/programs/current`, `/outages/near-me`) need role CUSTOMER. `/outage-reports` allows anonymous (address required then).
- Staff endpoints (`/stats/*` incl. `/stats/reports`, `/substations*`, `/feeders/*`, `/live-events`, `/campaigns*`, `GET /dr-events` (list), `/dr-events/:id/start|end`, `/demo/*`, `/sim/*`) need role STAFF.
- Socket.IO on the same origin/port as the API; client passes `auth: { token }`. STAFF → room `staff`; CUSTOMER → room `customer:<customerId>`. Invalid token → disconnect.

## Data / seed

- Collections: config, substations, feeders, premises, customers, users, evdetections, enrollments, programs, messages, campaigns, drevents, eventresponses, bills, payments, outages, outagereports, liveevents.
- **SUB-01 is "live"**: its premises, customers, detections and enrollments are generated, and all its counts are computed from data. Every other substation/feeder is static stats from the seed table.
- Overview totals = static baseline (non-SUB-01) + live SUB-01. At seed time: SUB-01 known 222 / unenrolled 241 → baseline known 1504 / unenrolled 1529 so the headline is exactly 1,726 / 1,770 / 51%.
- SUB-01 feeder splits at seed (known / unenrolled / premises): F1 69/77/665 (confirmedByEnrollment 54, groundTruthValidated 23, penetration 22.0), F2 46/44/650, F3 38/35/500, F4 15/34/460, F5 23/21/300, F6 19/19/250, F7 12/11/170. SUB-01 penetration is shown as 15.3 (static display value from the source); feeder penetration is computed as evs/premises.
- "known" = customer on the feeder with ACTIVE enrollment (with or without detection). "unenrolled" = EvDetection with status DETECTED and no ACTIVE enrollment. Only premises with an EV get Premise/Customer docs (≈463), feeder.premisesCount holds the total.
- Demo customers on SUB-01-F1: **Manny** (`manny@demo.test`, hasSolar, NO detection, NO enrollment at start, evChargingActive=false) and **Priya** (`priya@demo.test`, hasSolar, enrolled — she is one of F1's 69 known, evChargingActive=true). Manny is NOT counted in F1's 77 until detected.
- ~3% of synthetic customers optedOutOfMessages, ~2% lifeSupport. Demo customers never.
- **Substation regions**: `SubstationDoc.region` is assigned round-robin by substation index over `Central | East | Northwest | South` (`seed/allocate.ts` `regionForIndex`; SUB-01 = Central, SUB-02 = East, SUB-03 = Northwest, SUB-04 = South, SUB-05 = Central …; dead substations continue the sequence). Exposed as `SubstationStat.region` (GET /substations) and `BlindSpot.region` (optional in the type; the API fills it from the substation).
- **Static EV allocation** per substation lives in the pure `seed/allocate.ts` (`allocateFeederEvs`): live feeders keep their seeded known + unenrolled, the remainder is spread over the static feeders with descending weights (F1 most), min 1 each, rounding difference handed out round-robin. `allocate.spec.ts` asserts the per-feeder allocations sum to every SUBSTATIONS row.
- **Bills**: each demo customer gets 6 BillDocs, periods 15th → 14th ending May…Oct 2026, kWh exactly **520 / 610 / 730 / 690 / 820 / 1142**. Amounts are derived from kWh in `seed/bills.ts` with the October rates (Electricity 92.40/1142 per kWh, Delivery 61.15/1142, Regulatory 9.52/1142, HST 13% of the subtotal, every figure rounded to cents), so October is exactly $184.27 (92.40 / 61.15 / 9.52 / 21.20), period Sep 15–Oct 14 (30 days), due Nov 8 2026 (periodEnd + 25 days) and **UNPAID**; the five earlier bills are PAID (totals 83.89 / 98.43 / 117.79 / 111.34 / 132.32). `GET /bills/usage-history` is derived from the last 6 bills (oldest first, month = month the period ends in, demo timezone), so the chart stays 520/610/730/690/820/1142. `GET /bills` returns `BillSummary[]` newest first; `GET /bills/current` is the newest bill.
- **AutoPay**: `CustomerDoc.autoPay = { enabled, method, since }`, seeded off for everyone; reset clears it. `PATCH /me/autopay { enabled, method? }` (method ∈ SAVED_CARD | BANK_PAD | WALLET, required when enabled → 400 otherwise) returns the updated `CustomerProfile` and emits `me:changed` to that customer. `CustomerProfile.autoPay` (so `/me/summary` → `customer.autoPay`) always carries `{ enabled:false, method:null, since:null }` when off. Demo only: no real payment data.
- Each demo customer also gets 2 older inbox messages (BILL "Your October bill is ready" Oct 15, OUTAGE "Power restored at …" Oct 3).
- One active Outage on SUB-01-F2 (near Manny): 212 affected, CREW_ASSIGNED, est. restore today 8:45 PM local (or now+2h if that's past), cause null.
- Program: single doc from `PROGRAM` in brand.ts.
- `pnpm seed` = seed only if empty; `pnpm seed:reset` and `POST /api/demo/reset` = drop all collections and reseed (the API seeds automatically on boot if the DB is empty). Reset emits `demo:reset` to everyone (payload below).

## Energy model (apps/api energy service) — deterministic + small noise

Local time h (fractional hour, DEMO_TIMEZONE):
- solarKw = hasSolar ? max(0, 1.15·sin(π·(h−7.5)/10)) when 7.5<h<17.5 else 0 (peak ≈1.13 kW ~12:30)
- baseKw = 0.55 + 0.45·[17≤h<22] + 0.3·[6≤h<9] + noise(±0.05); split for breakdown: alwaysOn 0.25 kW constant, heating 45% of the rest, other the remainder
- evKw = 7.2 when customer.evChargingActive (or EV_ALWAYS_CHARGING=true and customer has an EV detection/enrollment) AND not (an ACTIVE DrEvent on their feeder AND their response is PAUSE); else 0
- homeKw = baseKw + evKw; gridImportKw = max(0, homeKw − solarKw); gridExportKw = max(0, solarKw − homeKw)
- Ticker: every 5 s emit `energy:reading` to each connected customer room.
- Summary day: integrate the model in 15-min steps from local midnight to now (EV assumed charging 18:00–23:00 historically when the customer has an EV, plus "now" state). week = day-average×7-ish deterministic, month ×30, year ×365 with labels "Oct 19 – 25", "October 2026", "2026". selfConsumed = min(solar, home) per step. Cost = imported × DEMO_RATE_PER_KWH.

## Flows (exact behaviour)

**A. `POST /sim/ev-detected {customerId}`** → create EvDetection (if none DETECTED) + set evChargingActive=true; LiveEvent EV_DETECTED (headline "New EV detected", summary "at <address> (<feeder>), not enrolled", actionTaken "Onboarding message sent in app automatically" when not enrolled); if not enrolled create Message EV_DETECTED (tag "EV", category Offers, title "We noticed an EV charging at your home", body "Earn [Incentive] by joining [DR Program Name]. Tap to learn more.", route "/program") and emit `message:popup` + `message:new` + `me:changed` to the customer; emit `feeder:statsChanged` + `liveEvent:new` to staff.
`POST /enrollments` → ACTIVE enrollment (consent must be true, 400 otherwise; 409 if already enrolled), mark the referenced message acted ENROLLED, update campaign stats if the message has a campaignId, emit `me:changed`, `feeder:statsChanged`, `campaign:statsChanged`.
`POST /ev-detections/mine/not-ev` → detection CONFIRMED_NOT_EV, evChargingActive=false, EV_DETECTED messages action NOT_EV, emit updates.

**B. `POST /sim/stopped-charging-cluster {substationCode}`** → LiveEvent STOPPED_CHARGING_CLUSTER, headline "284 EVs stopped charging", summary "on SUB-01 between <t−12m> and <t+3m> · 118 not enrolled" (count 284, unenrolledCount = 118). Pick 118 unenrolled customers on the substation, ALWAYS including Manny (create his detection silently — no popup — if missing, and he must not be enrolled; if he is enrolled, still pick 118 others). Store their ids on the LiveEvent (not exposed). `suggested = { label: "Target 118 with enrollment offer", campaignType: ENROLL_OFFER, audience: { kind: LIVE_EVENT, liveEventId, segment: UNENROLLED_EV } }`.

**C. `POST /sim/feeder-forecast-high {feederCode}`** → set feeder.forecastLoadPct=92, LiveEvent FEEDER_FORECAST_HIGH headline "<feeder> forecast at 92% of capacity", summary ", <window> · <n> enrolled EVs on this feeder", suggested { label "Send stop-charging request", STOP_CHARGING, FEEDER/ENROLLED_EV }.
Window: if local now < 17:00 → today 17:00–20:00; else start = next full hour + 0, end = start + 3h.

**Campaigns** `POST /campaigns`: resolve audience (FEEDER+segment, or LIVE_EVENT stored ids), apply exclusions (contactedLast7Days = had any campaign message in the last 7 days; never excludes demo customers for contactedLast7Days so repeated demo runs work), or `testCustomerId` only. Create one Message per target (ENROLL_OFFER: tag "Offer", category Offers, route `/messages/<id>`; STOP_CHARGING: tag "Grid alert", category Alerts, route `/dr-events/<drEventId>`). Merge fields replaced per customer: `{first_name}`, `{incentive}`, `{event_window}`, `{neighbours_enrolled}` (= known on their feeder). STOP_CHARGING also creates a SCHEDULED DrEvent (window as in C, title = campaign title with merge fields resolved). Emit `message:new` to each target (demo customers matter), `campaign:statsChanged`, LiveEvent CAMPAIGN_SENT.
Stats: sent = targeted; delivered/opened/acted for real customers update on their actions; for **synthetic** targets the API simulates over ~25 s (timers): delivered 98%, opened 62%, enrolled 18% (offer → creates real enrollments, so feeder counts move) / responded 84%, paused 76% of targets, opted-out 8% (DR). Each tick emits `campaign:statsChanged` (+ `feeder:statsChanged` when enrollments happen). peakReducedMw = paused × 7.2 / 1000 (3 decimals).
`GET /messages/:id` marks openedAt (first time) and bumps campaign opened.

**DR events**: `POST /dr-events/:id/start` → ACTIVE, windowStart = now (keep duration); `POST /dr-events/:id/end` → ENDED, windowEnd = now if still in future; compute per-response results (PAUSE: kwhShifted = 7.2 × window hours at most 3 h, peakReducedKw 7.2, earned = PROGRAM.perEventIncentive). Emit `drEvent:statusChanged` to staff and every targeted customer, LiveEvent DR_EVENT_ENDED ("<n> homes paused charging · peak cut by <mw> MW"). Customer response: `POST /dr-events/:id/responses` (upsert, mark message acted RESPONDED, update stats). `GET /dr-events/:id/result/me` 409 until ENDED.

**Demo**: `GET /demo/state` → `DemoState { customers, staffSockets, activeDrEvent, lastReset, serverTime, timezone (DEMO_TIMEZONE), evAlwaysCharging (EV_ALWAYS_CHARGING), nextEventWindow { start, end } (the window from `common/time.ts nextEventWindow`, i.e. what a simulator/campaign would use right now), phoneAppUrl }`.
`GET /demo/phone` → `DemoPhone { url, qrSvg }`: the customer-app URL for a phone on the same network plus an inline SVG QR code (same `qrcode` options as the start page). The URL logic (`originOf` honouring x-forwarded-*, loopback host → first physical LAN IPv4, `/app` suffix) lives in `demo/phone-url.ts` and is shared with `static.ts`.
`POST /demo/reset` body `DemoResetRequest { keepSessions?: boolean }` (optional, default **true**; DTO-validated). Drops + reseeds, clears simulation timers, then emits `demo:reset` with payload `{ keepSessions }` to everyone. Demo customer/user ids are fixed, so tokens stay valid across resets: with `keepSessions` true clients just refetch; `false` asks customer clients to sign out. Socket type: `'demo:reset': (p?: { keepSessions: boolean }) => void` (payload absent = older server = treat as sign out).

**Reports** `GET /stats/reports` (STAFF, `grid/reports.service.ts`) → `ReportsSummary { generatedAt; enrollments: { active, bySource: { APP_POPUP, CAMPAIGN, LEGACY }, last30Days: { date: "YYYY-MM-DD", count }[] (30 entries, oldest first, zero-filled, demo-timezone days ending today), today }; drProgram: { eventsEnded, householdsPaused, kwhShifted, peakReducedMw }; campaigns: { total, offers, drRequests, testSends } }`. One aggregation per collection: enrollments ($facet on ACTIVE: count, group by source, enrolledAt in last 31 days), drevents (ENDED count), eventresponses (PAUSE with kwhShifted set: count, Σ kwhShifted, Σ peakReducedKw → MW, 3 decimals), campaigns (counts by type / isTest). Day bucketing is the pure exported `bucketByDay(dates, now, days, tz)` (spec in `reports.spec.ts`). Also `GET /dr-events` (STAFF) lists the latest 50 DR events (`ApiPaths.drEvents`).

## Payments / outages
- `PaymentProvider` interface with `MockKubraProvider` (confirmation "KB-" + 8 digits). Marks the bill PAID, emits `me:changed`. AutoPay (above) is a stored preference only; it never charges anything.
- `EvDetectionSource` interface with `SimulatedNet2GridSource` used by the sim controller.
- Outage report reference "OR-" + 6 digits; links to the nearby outage if one exists on the customer's substation.

## Front-end conventions
- Wireframes are the look. IBM Plex Sans/Mono. Colours from `colors` in shared tokens.
- Brand strings from `BRAND` / `PROGRAM`; never hard-code "[DR Program Name]" elsewhere.
- Web routes: `/` → `/feeders`, `/feeders`, `/campaigns`, `/campaigns/new?type=ENROLL_OFFER|STOP_CHARGING&feeder=SUB-01-F1&segment=UNENROLLED_EV|ENROLLED_EV&liveEventId=…`, `/demo`, `/events` (DR events list, `api.drEvents()`), `/reports` (`api.reports()`), `/login`. Staff auto-logs in as staff@demo.test on first load (demo), token in localStorage (wrapped in try/catch).
- Mobile routes (Expo Router, `src/app`): `/login`, `/(tabs)/{index,energy,bill,outage,messages}`, `/pay`, `/program`, `/enrolled`, `/messages/[id]`, `/dr-events/[id]`, `/dr-events/[id]/result`, `/ev-detected` (modal/transparent sheet). Token in AsyncStorage. A global provider owns the socket, listens for `message:new` (banner), `message:popup` (push `/ev-detected`), `me:changed`, `drEvent:statusChanged` (when ENDED and customer was targeted → banner "See your event result" → `/dr-events/<id>/result`), `demo:reset` (payload `{ keepSessions }`: refetch when true, log out to `/login` when false/absent).

## Enhancement round (Oct 23, 2026): front-end additions

- **Staff app routes**: `/reports` is real (lazy-loaded chunk with Recharts; aggregations in `apps/web/src/lib/reports.ts`, data from `GET /stats/reports`, `/campaigns`, `/dr-events`, `/substations*`, `/stats/blind-spots`); `*` renders `pages/NotFound.tsx`. `/feeders` Region filter is real (filters substations + blind spots; KPIs stay global); Period only windows the Live events panel. The Map toggle renders `components/MapView.tsx`, a deterministic schematic SVG (no map provider): nodes are keyboard-selectable buttons.
- **Presenter mode**: `lib/demoScript.ts` holds the §13 script as data (talk track, expectations, one-click action, `advanceOn` socket predicate, `doneWhen` state predicate). `lib/useScript.ts` is the shared controller (progress in localStorage `h1demo.script`, synced between the `/demo` card and the bottom `PresenterBar`). `Shift+P` or `?presenter=1` toggles the bar (localStorage `h1demo.presenter`); hotkeys N/B next/back, 1/2/3 simulate EV detected / cluster / forecast, E end event, R reset keeping sessions. `/demo` also shows Preflight (API, socket, phones online, EV_ALWAYS_CHARGING, server time, next DR window) and Phone pairing (QR from `GET /demo/phone`).
- **Connection state**: web `useConnection()` and mobile `useSession().status` expose `connected | reconnecting | offline`; both refetch after a reconnect (web: every `useLoad` re-runs on `connectionEpoch`; mobile: summary + inbox). The staff shell dot and the mobile `OfflinePill` show it.
- **`demo:reset` payload**: `{ keepSessions }`. Mobile keeps the session, refreshes and returns Home when true; signs out when false or when the payload is missing. Demo ids are fixed, so tokens stay valid either way.
- **Mobile routes added**: `/settings` (profile, channel toggles, AutoPay + bill history links, Switch account, Sign out), `/autopay` (`PATCH /me/autopay`), `/bill-history` (`GET /bills`), `/program-terms` (`PROGRAM.termsSummary`). Informational "not in this demo" notes use `components/InfoSheet.tsx` (bottom sheet), never the red `ErrorBox`. Biometric sign-in is a 700 ms mock overlay then the normal login. The Outage screen's map is `components/MapView.tsx` (react-native-svg schematic).
- **Brand**: `BRAND.vendorName`, `BRAND.appName`, `BRAND.partners.{evDetection,payments}`, `BRAND.demoTown`, `PROGRAM.termsSummary` in `packages/shared/src/brand.ts`; no partner or utility name is hard-coded in display strings (the only literal left is `apps/mobile/app.json`, which cannot import TypeScript). PowerConnect logo assets: `packages/shared/assets/powerconnect-*.png`, mirrored in `apps/web/public/brand/` and `apps/mobile/assets/brand/`.
- **Tests**: Vitest specs sit next to the code (`*.spec.ts`; excluded from `dist`). `tests/e2e` is Playwright Test (`fixtures.ts` gives `web`, `mob`, `api`, console-error assertion; `helpers.ts` wraps the sim/campaign API calls); specs: `flowA/B/C`, `basics`, `demo`. Serial, one shared DB. CI runs them against `node apps/api/dist/main.js` with `E2E_START_SERVER=1`.

## Round 3 (Oct 23, 2026): scripted assistant, smart charging, campaign tools

### Scripted assistant (no LLM, no network)
- `POST /api/assistant/staff` (STAFF) and `POST /api/assistant/me` (CUSTOMER) take `{ question (1–300), context? }`; `GET …/suggestions` returns a greeting and suggestion chips. Stateless: the client echoes `context` (`lastIntent`, `feederCode`, `campaignId`) so "and SUB-02-F1?" follows up.
- Pipeline: `assistant/nlu.ts` (normalise incl. typo fixes, entities: feeder codes padded to `SUB-02-F1`, month, range, campaign type, top N; weighted keyword/regex intent match with negative keywords, threshold 2) → `AssistantService` gathers only the facts the intent needs → pure `staff-answers.ts` / `customer-answers.ts`. Every answer carries `disclosure` = `ASSISTANT.disclosure`.
- Staff intents: FEEDER_STATUS, BLIND_SPOTS, OVERVIEW, CAMPAIGN_PERFORMANCE, DR_PERFORMANCE, ENROLLMENT_TREND, GRID_RISK, DRAFT_CAMPAIGN, FLEX_LOAD, FALLBACK. Customer intents: BILL_WHY_HIGH, BILL_DUE, USAGE_TODAY, EV_COST, BEST_TIME, RATE_PLAN, SOLAR, GRID_EVENT, OUTAGE, FALLBACK.
- Drafts (`copy-drafts.ts`): variant A social proof, B reward; merge fields checked against `MERGE_FIELDS`. Hand-off to Campaign 360 is by query string, built by `campaignDraftLink()` (web `lib/links.ts`) and read by `parseDraftParams()` (web `lib/campaignDraft.ts`): `type, segment, feeder | feeders, liveEventId, title, body, cta, titleB, bodyB, ctaB, src=assistant`.
- UI: staff top-bar search opens a right-side drawer (`components/AssistantPanel.tsx`); customer Home "Ask the energy assistant" opens the `/assistant` sheet. Text reveals word by word (≤1.2 s, instant with reduced motion).

### Smart EV charging
- `GET/PUT /api/me/smart-charging`, `POST /api/me/smart-charging/boost` (charge now for 1 h), `GET /api/me/rate-plans`. Settings live on `customer.smartCharging`; demo customers start with it off (null), ~30% of synthetic enrolled-EV homes have it on.
- Off: EV behaviour and cost are exactly as before. On: the plan decides EV kW (even when `evChargingActive` is true), a DR PAUSE still wins, and cost is priced on the chosen rate plan.
- Planner (`energy/charging-plan.ts`): session from plug-in 18:00 to the next ready-by; before last night's ready-by the session is last night's, so it is stable through the day. 15-min blocks chosen by rate, then CO₂, then adjacency; SCHEDULED/ACTIVE DR events targeting the customer are excluded unless they opted out. Savings vs a baseline that charges from plug-in. `SmartChargingService.planFor` caches per customer-minute for 5 s.
- Rates and carbon are placeholders in `brand.ts`: `RATE_PLANS` (Ontario-style TOU, ULO, tiered), `GRID_CO2_G_PER_KWH`, `SMART_CHARGING`. Bills still use their own amounts (~$0.081/kWh energy line), so the assistant explains bills from bill data only.
- Integration math is `energy/integrate.ts` (pure, with an equivalence spec against the old implementation).

### Campaign power tools
- Audience kind `FEEDERS` (2–10 feeder codes). A stop-charging request still creates one DR event: `feederCode` = first, `feederCodes` = all.
- Scheduling: `schedule.sendAt` between now + 1 min and now + 24 h. While SCHEDULED, `sentAt` holds the planned time (keeps list sorting). `CampaignDispatcher` polls every 5 s and claims due rows atomically (SCHEDULED → SENDING); audience and DR window are resolved at send time; an empty audience cancels; failures retry 3× a minute apart. `POST /api/campaigns/:id/cancel` only while SCHEDULED (409 otherwise). Test sends are always immediate.
- A/B: optional `variants` [A, B]. Demo customers always get A; others split ~50/50 by hash. Stats per variant (`variantStats`), DR responses attributed through the customer's message. `winner` needs ≥20 sends per variant and a ≥3-point lead on the key rate. Variant B's simulated response is scaled 0.85–1.15 (synthetic, labelled).
- `GET /api/campaigns/:id/detail` (campaign, DR event, timeline, audit). Staff pages `/campaigns/:id` and `/audit`.
- Audit log (`audit` collection, `GET /api/audit`, socket `audit:new`): campaign sent / test sent / scheduled / cancelled / dispatched (actor "Scheduler"), DR started / ended, demo reset. Reset wipes it, then writes the reset entry plus 3 seeded entries by a second staff user, Jordan Reyes (`ops@demo.test`).

### Other fixes this round
- Bill due dates use calendar arithmetic (`localDatePlusDays`): adding 25 × 24 h across the Nov 1 DST change showed Nov 7 instead of Nov 8.

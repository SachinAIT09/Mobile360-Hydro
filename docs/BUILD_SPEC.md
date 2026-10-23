# Hydro One EV & Energy Demo: Build Spec

Version 1.0 · 2026-10-21 · Owner: Sachin (PowerConnect.AI)

## 1. What we are building and why

Hydro One (about 1.5M customers) pays for Net2Grid's EV detection through its innovation hub but has not rolled it out to customers. Net2Grid has no customer-facing front end. This demo shows PowerConnect.AI as that front end:

- **Mobile app (customers):** portal basics plus EV/DR features fed by Net2Grid detection.
- **Web app (Hydro One staff):** feeder visibility dashboard plus Campaign 360 to act on it.
- **The two are interlinked.** An action in one shows up in the other in real time. The demo's main job is to make that loop visible.

This is a **teaser demo, not a production system**: mock data, simulated Net2Grid events, mocked Kubra payment, no real CIS integration. It still needs to be built properly (typed, structured, runnable) so it can grow into a real product.

### Two use cases the client asked for

1. **EV detected, not enrolled:** the moment Net2Grid first detects an EV at a home that is not on a DR program, the customer gets an in-app pop-up inviting them to enroll.
2. **Feeder-level messaging through Campaign 360:** staff pick the customers behind a feeder and send either
   - an **enrollment offer** to unenrolled EV owners, or
   - a **stop/pause-charging request** (DR event) to enrolled EV owners.

The client also requires a **real-time self-consumption dashboard** (mobile) and a **feeder visibility dashboard** (web).

## 2. Wireframes are the visual source of truth

`wireframes/mobile/*.dc.html` and `wireframes/web/*.dc.html` are the approved wireframes. They are HTML with inline styles; read them for layout, copy, colours, spacing and states. Ignore the `<x-dc>`, `<helmet>`, `<sc-for>`, `<sc-if>` wrapper tags and the `support.js` include: those belong to the design tool. The `renderVals()` blocks contain the sample data and interaction states.

Match the wireframes closely. Do not redesign. Where the wireframe and this spec disagree, this spec wins on behaviour and the wireframe wins on look.

| Wireframe file | Build as |
|---|---|
| mobile/Login.dc.html | Mobile: Login |
| mobile/Home.dc.html | Mobile: Home |
| mobile/Bill.dc.html | Mobile: Bill |
| mobile/Pay.dc.html | Mobile: Pay (Kubra mock) |
| mobile/Outage.dc.html | Mobile: Report outage |
| mobile/Energy.dc.html | Mobile: Energy insights (real-time) |
| mobile/EVDetected.dc.html | Mobile: EV-detected pop-up (bottom sheet + banner) |
| mobile/Program.dc.html | Mobile: DR program details + enroll |
| mobile/Enrolled.dc.html | Mobile: Enrollment confirmed |
| mobile/Inbox.dc.html | Mobile: Messages inbox |
| mobile/Offer.dc.html | Mobile: Enrollment offer message |
| mobile/StopCharging.dc.html | Mobile: Stop-charging request |
| mobile/EventSummary.dc.html | Mobile: Event result |
| web/FeederDashboard.dc.html | Web: Feeder visibility dashboard |
| web/Campaign.dc.html | Web: Campaign 360 feeder campaign |

## 3. Stack and repo layout

The stack aligns with PowerConnect.AI (React, NestJS, MongoDB).

```
hydro-one-ev-demo/
  apps/
    api/        NestJS + MongoDB (Mongoose) + Socket.IO gateway
    web/        React + Vite + TypeScript (staff app)
    mobile/     React Native + Expo (SDK current stable) + TypeScript + Expo Router (customer app)
  packages/
    shared/     TypeScript types, enums, design tokens, API client, socket event names
  docker-compose.yml   MongoDB (and api, optional)
  pnpm-workspace.yaml
  CLAUDE.md
  docs/BUILD_SPEC.md
  wireframes/
```

- Package manager: **pnpm workspaces**.
- **TypeScript strict** everywhere.
- Web charts: Recharts. Mobile charts: plain Views (bars) as in the wireframes, or react-native-svg if needed.
- Fonts: IBM Plex Sans (body/UI), IBM Plex Mono (numbers, IDs on web).
- Mobile must also run with **Expo Web** (`npx expo start --web`), so the whole demo can run on one laptop with the phone view in a browser window next to the staff app.
- Real-time: **Socket.IO** (api ↔ web, api ↔ mobile).
- Push: in the demo, notifications are shown as an **in-app banner driven by Socket.IO** (works on Expo Web and devices). Expo push notifications are optional (Milestone 6).

## 4. Design tokens (put in packages/shared/tokens.ts)

| Token | Value | Use |
|---|---|---|
| navy | #0B2545 | Headers, staff top bar, home node |
| primary | #1557C0 | Primary buttons, links, active nav |
| primaryDark | #0B3D91 | Hover/pressed |
| bg | #F2F5F8 | App background |
| surface | #FFFFFF | Cards |
| text | #0F1B2D | Body text |
| textMuted | #4A5768 | Secondary text |
| border | #DDE3EA | Card borders |
| borderInput | #C3CCD8 | Inputs |
| solar | #F2B33D | Solar, enrolled/known EVs (text on it: #2B1A00) |
| ev | #5B4BC4 | EV, unenrolled EVs, DR program |
| evDeep | #2A1F66 | Program headers |
| evTint | #EEEAFB | EV cards |
| grid | #4A5768 | Grid node |
| success | #1E6B3A on #E3F4E9 | Live, enrolled, done |
| warning | #8A4B00 on #FFF1D6 | Grid alerts |
| alertHeader | #7A3E00 | Stop-charging header |
| danger | #8A1C1C on #FDE8E8 | Downed-wire warning |

Radii: cards 14–16, buttons 10–12, pills 8–22. Touch targets ≥ 44px. Text contrast ≥ 4.5:1.

**Branding:** Hydro One logo is a placeholder box `[Hydro One logo]` until we receive brand assets. Keep the logo as one component (`<BrandLogo/>`) so it can be swapped in one place. Put a small "Concept demo" label in the web footer and mobile Settings.

## 5. Shared data model (MongoDB collections; types in packages/shared)

```ts
Substation   { _id, code: 'SUB-01', region, premisesCount }
Feeder       { _id, code: 'SUB-01-F1', substationCode, premisesCount,
               capacityKw, forecastLoadPct }            // forecast drives DR alerts
Premise      { _id, address, feederCode, substationCode, hasSolar: boolean }
Customer     { _id, firstName, lastName, email, accountNo, premiseId,
               optedOutOfMessages: boolean, lifeSupport: boolean,
               channels: { push: boolean, sms: boolean, email: boolean } }
EvDetection  { _id, premiseId, firstDetectedAt, source: 'NET2GRID',
               status: 'DETECTED' | 'CONFIRMED_NOT_EV',
               groundTruthValidated: boolean }
Program      { _id, name: '[DR Program Name]', signupIncentive: '[Incentive]',
               perEventIncentive: '[$X]', maxEventsPerSeason: '[N]', terms }
Enrollment   { _id, customerId, programId, enrolledAt, source: 'APP_POPUP' | 'CAMPAIGN' | 'LEGACY',
               evMake?, chargerType?, status: 'ACTIVE' | 'LEFT' }
Message      { _id, customerId, kind: 'EV_DETECTED' | 'ENROLL_OFFER' | 'STOP_CHARGING' | 'BILL' | 'OUTAGE',
               title, body, cta, campaignId?, drEventId?, createdAt,
               deliveredAt?, openedAt?, actedAt?, action? }
Campaign     { _id, type: 'ENROLL_OFFER' | 'STOP_CHARGING', feederCode,
               segment: 'UNENROLLED_EV' | 'ENROLLED_EV', trigger,
               exclusions: { optedOut, contactedLast7Days, lifeSupport },
               title, body, cta, channels: { push, inApp, sms, email },
               schedule: { sendAt, expiresAt }, status: 'DRAFT' | 'SENT',
               stats: { targeted, sent, delivered, opened, acted } }
DrEvent      { _id, feederCode, windowStart, windowEnd, campaignId, status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' }
EventResponse{ _id, drEventId, customerId, response: 'PAUSE' | 'REMIND' | 'OPT_OUT',
               respondedAt, kwhShifted?, peakReducedKw?, earned? }
Bill         { _id, customerId, periodStart, periodEnd, kWh, lines: [{label, amount}], total, dueDate, status }
Payment      { _id, customerId, billId, amount, method, status: 'CONFIRMED', confirmationNo, createdAt }
OutageReport { _id, customerId?, premiseId, type: 'NO_POWER' | 'PARTIAL' | 'FLICKER',
               notifyOnRestore: boolean, createdAt }
Outage       { _id, feederCode, affectedCount, status, estRestoreAt, cause? }
EnergyReading{ premiseId, ts, solarKw, gridImportKw, gridExportKw, homeKw, evKw }   // 1 per 5 s in demo
LiveEvent    { _id, ts, kind: 'EV_DETECTED' | 'STOPPED_CHARGING_CLUSTER' | 'FEEDER_FORECAST_HIGH',
               feederCode?, substationCode, summary, count?, unenrolledCount?, actionTaken? }
```

Enrolled / unenrolled counts per feeder are **derived** (EvDetection joined with Enrollment), never stored, so they move when a customer enrolls.

## 6. Seed data

Use the Net2Grid anonymized pilot numbers, labelled "Sample data" in the UI.

**Headline:** 37 substations with matched EVs, 108 feeders, 1,726 known/enrolled EVs, 1,770 detected/unenrolled, 51% invisible. Generating every premise is optional; the headline KPIs may come from a stats seed, but **SUB-01 must be fully generated** so it is interactive.

**Substations (top 8):**

| Code | EVs | % known | Penetration |
|---|---|---|---|
| SUB-01 | 463 | 48 | 15.3% |
| SUB-02 | 436 | 52 | 21.7% |
| SUB-03 | 342 | 46 | 17.5% |
| SUB-04 | 273 | 59 | 16.7% |
| SUB-05 | 246 | 58 | 15.9% |
| SUB-06 | 245 | 51 | 34.2% |
| SUB-07 | 202 | 42 | 14.1% |
| SUB-08 | 139 | 60 | 12.2% |

Also seed SUB-09 to SUB-37 with counts from the source if wanted, and 14 dead substations (SUB-38 to SUB-51, zero EVs).

**SUB-01 feeders:**

| Code | EVs | Known | Unenrolled | Premises |
|---|---|---|---|---|
| F1 | 146 | 69 | 77 | 665 |
| F2 | 90 | gen | gen | gen |
| F3 | 73 | gen | gen | gen |
| F4 | 49 | 15 | 34 | 460 |
| F5 | 44 | gen | gen | gen |
| F6 | 38 | gen | gen | gen |
| F7 | 23 | gen | gen | gen |

For "gen", split roughly 48/52 known/unenrolled so the SUB-01 total stays 463 with 48% known. For SUB-01-F1, also seed 54 "also confirmed by enrollment" and 23 ground-truth validated, and set the penetration to 22%.

**Worst blind spots (seed as feeder stats):**

| Feeder | Enrolled | Unenrolled | Penetration | Gap |
|---|---|---|---|---|
| SUB-26-F1 | 2 | 15 | 35.4% of 48 | 88.2% |
| SUB-15-F3 | 2 | 13 | 18.8% of 80 | 86.7% |
| SUB-11-F2 | 5 | 28 | 23.1% of 143 | 84.8% |
| SUB-11-F3 | 5 | 24 | 28.2% of 103 | 82.8% |
| SUB-27-F1 | 3 | 13 | 20% of 80 | 81.2% |
| SUB-09-F1 | 10 | 23 | 9.3% of 355 | 69.7% |
| SUB-01-F4 | 15 | 34 | 10.7% of 460 | 69.4% |
| SUB-11-F1 | 11 | 25 | 24.3% of 148 | 69.4% |

**No-activity block:** 14 substations dead, 25 more with at least one dead feeder (55 feeders, 383 premises). 21,257 matched premises, 17,761 with no EV signal, 458 without grid location.

**Demo customer:** first name configurable via `DEMO_CUSTOMER_FIRST_NAME` (default "Manny"), on SUB-01-F1, hasSolar = true, **no EvDetection and no Enrollment at start**. Address `[123 Main St, Peterborough]`, account `•••• 4821`. Bill $184.27 due Nov 8, 2026 with lines Electricity 92.40, Delivery 61.15, Regulatory 9.52, HST 21.20; 6 months of usage for the chart. A second demo login for an **already-enrolled** customer on SUB-01-F1 (first name configurable, default "Priya") is used for the stop-charging flow.

**Program:** name `[DR Program Name]`, incentives as placeholders (configurable in `.env` / seed), so the real names can be dropped in later.

## 7. How the two apps are interlinked (the core of the demo)

Everything goes through the API. The web app and mobile app never talk directly. The API emits Socket.IO events; both apps subscribe.

### Socket events (names live in packages/shared/socket.ts)

| Event | Emitted when | Web listens | Mobile listens (room = customerId) |
|---|---|---|---|
| `liveEvent:new` | Simulator or system creates a LiveEvent | Live events feed | – |
| `feeder:statsChanged` | Detection / enrollment changes counts | KPIs, substation list, feeder diagram, blind spots | – |
| `message:new` | Message created for a customer | Campaign stats | Banner + inbox + badge |
| `message:popup` | First EV detection for a non-enrolled customer | – | Opens EV-detected sheet |
| `campaign:statsChanged` | Delivered / opened / acted changes | Campaign results panel, live feed | – |
| `drEvent:statusChanged` | Event starts / ends | Event status | Alert countdown, then event result |
| `energy:reading` | Every 5 s for the demo premise | – | Energy screen + Home "Right now" |

### Flow A: Use case 1, EV detected → pop-up → enroll

1. Staff (or the demo panel) fires **"Simulate: EV detected at demo customer's home"** → `POST /sim/ev-detected { customerId }`.
2. The API creates an EvDetection and a LiveEvent (`EV_DETECTED`).
3. If the customer has no active Enrollment, the API creates a Message (`EV_DETECTED`) and emits `message:popup` to the customer's room. LiveEvent `actionTaken` is "Onboarding message sent in app automatically".
4. **Mobile:** the banner slides in ("We noticed an EV charging at your home"), then the EV-detected bottom sheet opens over Home. The Home EV card switches to "EV detected · Not enrolled".
5. The feeder's unenrolled count goes up by 1 → `feeder:statsChanged` → **web** KPIs and feeder diagram update live; the live feed shows the row with "✓ Auto-sent".
6. Customer taps **See program & enroll** → Program → **Enroll now** → `POST /enrollments` → Enrolled screen.
7. Unenrolled −1, enrolled +1 → `feeder:statsChanged` → **web updates live**. Home card changes to "Enrolled · [DR Program Name]".
8. "Not an EV? Let us know" → `POST /ev-detections/:id/not-ev` → status `CONFIRMED_NOT_EV`, counts revert, and the web shows it.
9. "Remind me later" closes the sheet; the message stays in the inbox.

### Flow B: Use case 2a, enrollment offer to a feeder

1. Web live feed: **"284 EVs stopped charging on SUB-01 between 9:30 and 9:45 PM · 118 not enrolled"** (from `POST /sim/stopped-charging-cluster { substationCode }`). The button **Target 118 with enrollment offer** opens Campaign with type and segment prefilled.
   - From the feeder detail panel or a blind-spots row, **Target N unenrolled** opens Campaign prefilled for that feeder.
2. Campaign page: type **Enrollment offer**, segment **Detected, unenrolled EVs**. The audience count is computed live from filters and exclusions (`POST /campaigns/preview-audience`).
3. **Send to N customers** → `POST /campaigns/:id/send` → one Message per target (`ENROLL_OFFER`) → `message:new` to each customer room.
4. **Mobile.** The demo customer must be in the audience. `/sim/stopped-charging-cluster` therefore always includes the demo customer's premise: it creates an EvDetection for them if missing, **without** the Flow A pop-up, and they stay unenrolled. When they open the app: banner "EV owners near you are saving with [DR Program Name]", inbox item under Offers, badge +1.
5. Customer opens it → `openedAt` set → `campaign:statsChanged` → **web results: Opened +1**.
6. **Enroll in 1 minute** → Program → Enroll → `actedAt` set and Enrollment created → **web: Enrolled +1**; feeder counts update.
7. **Not interested** → action `DECLINED`, recorded in stats.

### Flow C: Use case 2b, stop-charging request (DR event)

1. Web live feed: **"SUB-02-F3 forecast at 92% of capacity, 5–8 PM · 41 enrolled EVs"** (from `POST /sim/feeder-forecast-high { feederCode }`), with a **Send stop-charging request** button. Also reachable from the feeder panel: **Stop-charging request to N enrolled**.
   - For the demo, the enrolled demo customer ("Priya") sits on **SUB-01-F1**; the demo panel lets you fire the forecast alert for SUB-01-F1 so she is in the audience.
2. Campaign page: type **Stop-charging request**, segment **Enrolled EVs**, channels push + in-app + SMS, expires at event end. Send → creates a DrEvent and a Message (`STOP_CHARGING`) per target.
3. **Mobile:** banner "Please pause EV charging 5–8 PM today", inbox item tagged Grid alert, alert screen with countdown ("Starts in 47 min"), duration, earnings, current EV charging kW (from `energy:reading`).
4. Customer picks **Yes, I'll pause** / **Remind me at 4:55 PM** / **I can't take part today** and confirms → `POST /dr-events/:id/responses` → **web results: Responded +1, Paused charging +1 (or opted out)**.
5. Demo panel **"End event now"** → `drEvent:statusChanged` ENDED → API computes per-customer results (kWh shifted, peak reduced, earned) plus the feeder total → **mobile** shows Event result (earned, energy shifted, peak reduced, chart of home load with the event window shaded, neighbourhood total) → **web** results show Peak reduced in MW.
6. During the event, the demo customer's simulated EV load drops to 0 kW if they chose PAUSE, so the Energy screen visibly changes.

### Cross-app navigation

- Web Campaign **Preview on phone** shows the push card. **Open in-app screen** opens the mobile app's matching route (`/messages/:id` preview mode) in a new tab using Expo Web's URL (`MOBILE_WEB_URL` env).
- Mobile deep links: `hydroonedemo://messages/:id`, `hydroonedemo://program`, `hydroonedemo://dr-events/:id`. Messages carry these so a tap goes to the right screen.

### Demo control panel (web, route `/demo`, hidden from the nav, linked from the footer)

- Pick a demo customer (Manny unenrolled / Priya enrolled).
- **Simulate EV detected** (Flow A)
- **Simulate 284 EVs stopped charging on SUB-01** (Flow B)
- **Simulate forecast high on SUB-01-F1** (Flow C)
- **Start event now / End event now**
- **Reset demo** (re-seed to the starting state)
- Shows socket connection status for web and mobile.

## 8. Mobile app (customer), screen by screen

Bottom tabs: **Home, Energy, Billing, Outage, Messages** (Messages shows an unread badge). Banners for incoming messages appear on top of any screen and are tappable.

| # | Route | Content (see wireframe) | Data / actions |
|---|---|---|---|
| M1 | `/login` | Brand panel, email/account + password, Forgot password, biometric button (mock), "Power out? Report an outage without signing in", Register link | `POST /auth/login` (mock JWT; seeded demo users, any password). Biometric = same login. |
| M2 | `/(tabs)/home` | Navy header with greeting + account + address, bell with badge; Amount due card (Pay now / View bill); EV/DR status card (states: hidden, "EV detected · Not enrolled", "Enrolled · [DR Program Name]", "Grid event today"); "Right now" live card (solar / from grid / EV charging kW, today's kWh and self-consumption %); quick tiles: Report outage (with status), Messages (counts) | `GET /me/summary`; `energy:reading` socket |
| M3 | `/bill` | Period, unpaid pill, amount, due date, kWh; Pay button; line items + total; 6-month usage bars (current month highlighted); EV share of bill with link to program; AutoPay, Bill history (stubs) | `GET /bills/current`, `GET /bills/usage-history` |
| M4 | `/pay` | "Secure checkout powered by Kubra" chip; amount (due / other); method (saved card placeholder, bank PAD, Apple/Google Pay); date; Pay button; receipt note | `POST /payments` (mock), then confirmation screen/toast with confirmationNo; bill status → PAID. **No real payment data; Kubra is mocked. Abstract behind `PaymentProvider` so the real Kubra hosted page can replace it.** |
| M5 | `/outage` | Downed-wire warning; outage map placeholder with known outage circle + home pin; "Known outage near you" (affected, crew, ETA); address; issue type radios; "Text me when power is back"; Submit | `GET /outages/near-me`, `POST /outage-reports` → success state with reference number. Also reachable logged out from Login (asks for address). |
| M6 | `/(tabs)/energy` | Live pill; Day/Week/Month/Year segmented control; date nav; flow diagram Solar → Home ← Grid, Home → EV with live kW; self-consumption row (kWh + %, highlighted), sent to grid, bought from grid, total used + cost; "Where your energy went" stacked bar (EV charging, heating/cooling, always-on, other); solar peak | Day = live `energy:reading` + `GET /energy/summary?range=day`; Week/Month/Year = aggregates. **Non-solar homes:** hide solar node and self-consumption rows, keep grid → home → EV and the breakdown. |
| M7 | sheet over Home | Push-style banner at top; bottom sheet: EV icon, "Looks like you've got a new EV", detection address + timestamp, program bullet card, **See program & enroll**, Remind me later, Not an EV? | Opened by `message:popup`; actions per Flow A |
| M8 | `/program` | Program header; 3 stat tiles (sign-up reward, per event, events/season); How it works (3 steps); optional EV make / charger type; consent checkbox (required) with terms link; **Enroll now** (disabled until consent) | `GET /programs/current`, `POST /enrollments` |
| M9 | `/enrolled` | Success check, welcome copy, What happens next, notification channel toggles (App / SMS / Email), Back to home | `PATCH /me/channels` |
| M10 | `/(tabs)/messages` | Filter chips All / Alerts / Offers / Billing; list with tag pill, time, title, body, unread state | `GET /messages`; `message:new` socket |
| M11 | `/messages/[id]` (ENROLL_OFFER) | Hero "Recommended for you", personal message with neighbour count, evening EV kWh/day, **Enroll in 1 minute**, Not interested | Marks opened on view; actions per Flow B |
| M12 | `/dr-events/[id]` (STOP_CHARGING) | Amber/brown header "Grid alert · your local line"; starts-in / duration / you-earn tiles; EV charging-now card; explanation; 3-option choice; confirmation text; Confirm | Countdown from `windowStart`; `POST /dr-events/:id/responses` |
| M13 | `/dr-events/[id]/result` | Earned hero; energy shifted + peak reduced tiles; home load chart with event window shaded; neighbourhood result; Done | `GET /dr-events/:id/result/me` |

## 9. Web app (Hydro One staff), screen by screen

Top bar: logo placeholder, "Grid Edge Insights", nav **Feeder visibility · Campaign 360 · DR events · Reports** (the last two can be simple list/stub pages), staff name. Responsive down to tablet. Footer: "Concept demo · Sample data" and a link to /demo.

### W1 `/feeders`: Feeder visibility dashboard

- Headline "You manage the EVs that signed up. This shows the ones that didn't." plus subtext; Region and Period filters (Period can be a stub).
- KPI tiles: substations, feeders, known/enrolled, detected/unenrolled, % invisible (live via `feeder:statsChanged`).
- **Live events from Net2Grid** panel: newest first, each row with time, summary and an action button (Target… / Send stop-charging request) or "✓ Auto-sent". Live via `liveEvent:new`.
- Three-column area (wraps on smaller screens):
  - Substation list ranked by EVs with % known, penetration and a split bar; selecting one loads its feeders.
  - Feeder diagram: substation box, bus line, one stacked bar per feeder (amber known / indigo unenrolled), Diagram/Map toggle (Map = placeholder for v1); click selects a feeder.
  - Feeder detail: known, unenrolled, total, also confirmed by enrollment, ground-truth validated, premises, penetration, % invisible sentence; buttons **Target N unenrolled · enrollment offer** and **Stop-charging request to N enrolled** → Campaign prefilled.
- **Worst blind spots** table (≥15 EVs, ranked by gap) with a gap bar and a **Target N** button per row.
- **No observed EV activity** summary block.
- Data: `GET /stats/overview`, `GET /substations`, `GET /substations/:code/feeders`, `GET /feeders/:code`, `GET /stats/blind-spots`, `GET /live-events`.

### W2 `/campaigns/new?type=&feeder=&segment=`: Campaign 360

- Back link; title; description naming the feeder.
- Type tabs: **Enrollment offer** / **Stop-charging request**. Switching swaps segment, trigger, default copy, channels, expiry and the result metrics (copy and defaults are in the wireframe's `renderVals()`).
- **1 Audience:** trigger, feeder, segment selects; exclusions (opted out, contacted last 7 days, life-support/medical priority); live audience count.
- **2 Message:** title, body, merge fields `{first_name}`, `{incentive}`, `{event_window}`, `{neighbours_enrolled}` (clicking inserts at the cursor), button label.
- **3 Channels:** App push, In-app inbox, SMS, Email (SMS/Email are recorded only, not actually sent in the demo).
- **4 Schedule:** send now / later; expiry.
- Buttons: **Send test to me** (sends to the selected demo customer only) and **Send to N customers**.
- Right column: phone push preview (live as you type), **Open in-app screen**, and a results panel. After sending, the panel shows live stats for this campaign: Sent, Delivered, Opened, Enrolled for offers; Delivered, Responded, Paused charging, Peak reduced for DR. The wireframe's numbers are sample values for before the first send.
- `/campaigns` list page: name, type, feeder, sent date, key stats.

### W3 `/demo`: Demo control panel (section 7)

## 10. API surface (NestJS modules: auth, customers, energy, billing, payments, outages, programs, enrollments, messages, campaigns, dr-events, grid (substations/feeders/stats), live-events, sim, realtime)

Auth: mock JWT with roles `CUSTOMER` and `STAFF`. Staff login for web: seeded `staff@demo` (any password). Validate every request body with class-validator DTOs.

Endpoints listed in sections 7–9 are the minimum. Return consistent `{ data, error }` shapes, or use Nest's default exceptions. Put the OpenAPI doc at `/docs`.

**Energy simulator:** a service ticking every 5 s for each demo premise. Solar follows the clock (0 at night; peak ~1.1–1.3 kW midday in October); home base load 0.6–1.5 kW with noise; EV 7.2 kW while "charging" (default 6 PM to 11 PM, or always on when demo mode `EV_ALWAYS_CHARGING=true`); EV → 0 while a DR event is ACTIVE and the customer chose PAUSE. Compute grid import/export from these. Store readings (TTL index, 7 days) and aggregate for day/week/month/year.

## 11. Non-goals and placeholders (do not build for real)

- Real Net2Grid integration: keep an `EvDetectionSource` interface, with `SimulatedNet2GridSource` implemented.
- Real Kubra payments: `PaymentProvider` interface, `MockKubraProvider` implemented. Never collect real card numbers; the saved method is a placeholder string.
- Real CIS / billing: seeded data only.
- Real SMS/email: record intent only.
- Real maps: placeholder panels (leave a `MapView` component boundary).
- Hydro One logo, colours, program name, incentive values: placeholders, all in one config file `packages/shared/brand.ts`.

## 12. Build order and acceptance

| Milestone | Scope | Done when |
|---|---|---|
| M0 | Monorepo, shared package, tokens, docker-compose Mongo, seed script, README with run steps | `pnpm i && pnpm seed && pnpm dev` starts api + web + mobile (Expo Web) |
| M1 | API core + auth + grid stats + seed | `/docs` lists endpoints; stats match section 6 |
| M2 | Web W1 feeder dashboard (static from API) | Visually matches web/FeederDashboard wireframe; selecting a substation/feeder works |
| M3 | Mobile M1–M6 (login, home, bill, pay mock, outage, energy with live readings) | Matches mobile wireframes; energy updates every 5 s |
| M4 | Flow A end to end (M7–M9 + live feed + live counts) | Fire from /demo → phone pop-up → enroll → web counts change without refresh |
| M5 | Web W2 Campaign + Flows B and C (M10–M13) | Both campaign types send; stats move live on web as the phone acts; event result shows after End event |
| M6 | Polish: empty/loading/error states, responsive web, accessibility labels, optional Expo push, /campaigns list, Reset demo | Full demo script (section 13) runs twice in a row after Reset with no manual DB edits |

General acceptance: TypeScript builds with no errors, ESLint clean, no console errors, all buttons ≥ 44px tall on mobile, every icon-only button has an accessibility label, and the app works on Expo Web at 390×844 and on a physical phone via Expo Go.

## 13. Demo script (what Steve will show)

1. Laptop split screen: web `/feeders` on the left, mobile (Expo Web, 390 wide) on the right, logged in as **Manny**.
2. Show Home, the bill, Pay with Kubra, Report outage, and Energy (live self-consumption).
3. **Use case 1:** /demo → Simulate EV detected → pop-up on the phone, live row on the web, unenrolled +1. Enroll on the phone → web enrolled +1, unenrolled −1.
4. **Use case 2a:** Reset → Simulate 284 stopped charging → **Target 118** → Campaign → Send → banner on the phone → open → enroll → web results tick up.
5. **Use case 2b:** switch the phone to **Priya** → Simulate forecast high on SUB-01-F1 → Send stop-charging request → phone alert → "Yes, I'll pause" → web Responded/Paused +1 → End event → phone event result + web peak reduced.
6. Back on the web: worst blind spots → "this is where Campaign 360 goes next".

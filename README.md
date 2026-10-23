# Hydro One EV & Energy Demo (PowerConnect.AI concept)

Two apps linked live through one server:

- **Staff web app** (`/staff`): Hydro One staff see feeder-level EV visibility and use Campaign 360 to message customers behind a feeder.
- **Customer mobile app** (`/app`): bill, Kubra payment, outage, real-time self-consumption, EV-detected DR enrollment, stop-charging alerts.

Open them in two tabs, or the customer app on a phone. An action in one shows up in the other immediately.

Everything is sample data. The logo, program name and incentive amounts are placeholders in `packages/shared/src/brand.ts`.

## Quick start on Windows

1. Install **Node.js LTS** from https://nodejs.org (skip if `node -v` already works).
2. Double-click **`start-demo.cmd`** in this folder.
3. Wait for the browser to open **http://localhost:3000** (the first run downloads packages and a database, so it takes a few minutes).

No Docker or database install is needed: the app starts its own built-in database. Restarting the app resets the demo data.

## Host it

See **[DEPLOY.md](DEPLOY.md)**. Short version, on a server with Docker:

```bash
docker compose up -d --build
```

Then open `http://<server>:3000`. The start page links to both apps and shows a QR code for the phone.

## Demo script

1. Open the **Staff app** in one tab and the **Customer app** in another tab or on a phone. Sign in as `manny@demo.test`, any password.
2. **Use case 1, EV detected:** Staff → Demo control panel → *Simulate EV detected* for Manny. The pop-up appears on the phone, and the staff dashboard's unenrolled count goes up. Enroll on the phone, and the enrolled count goes up.
3. **Use case 2a, enrollment offer:** *Reset demo* → *Simulate 284 EVs stopped charging* → Feeder visibility → **Target 118 with enrollment offer** → Send. The offer arrives on the phone; open it and enroll. Campaign results update live.
4. **Use case 2b, stop charging:** sign the phone in as `priya@demo.test` → *Simulate forecast high on SUB-01-F1* → **Send stop-charging request** → Send. The alert appears on the phone → "Yes, I'll pause" → staff sees responses → *End event now* → the phone shows the event result.

## Develop locally

Requires Node.js 20+ and pnpm (`npm i -g pnpm`). The API starts a built-in database when `MONGO_URL` isn't set.

```bash
copy .env.example .env      # Windows (cp on macOS/Linux)
pnpm i
pnpm dev
```

`pnpm dev` runs the three parts separately with hot reload: API on http://localhost:3000, staff app on http://localhost:5173, customer app on http://localhost:8081.

To try the production build locally: `pnpm build` then `pnpm start`, and open http://localhost:3000.

| Command | What it does |
|---|---|
| `pnpm dev` | Develop with hot reload (3 ports) |
| `pnpm build` / `pnpm start` | Production build / run everything on one port |
| `pnpm seed:reset` | Wipe and reseed demo data |
| `pnpm typecheck` | Type-check every app |
| `pnpm lint` | ESLint, zero warnings allowed |
| `pnpm test` | Unit tests (Vitest) for the API maths, shared helpers and web libs |
| `pnpm e2e` | Playwright tests for all flows across both apps (`BASE_URL=http://localhost:3000` for the production build; first time: `pnpm --filter @demo/e2e exec playwright install chromium`) |

## Project layout

| Folder | What |
|---|---|
| `apps/api` | NestJS + MongoDB + Socket.IO. Also serves the built apps and the start page (`src/static.ts`) |
| `apps/web` | Staff app: React + Vite |
| `apps/mobile` | Customer app: Expo / React Native, built for the web at `/app`. Can also run in Expo Go on a phone |
| `packages/shared` | Shared types, API client, socket events, design tokens, brand placeholders |
| `tests/e2e` | Browser tests for the three demo flows |
| `docs/` | Build spec and implementation notes |
| `wireframes/` | Approved screen designs |

Working on it with Claude Code in VS Code: open this folder. `CLAUDE.md` gives it the context.

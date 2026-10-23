# Hydro One EV & Energy Demo

PowerConnect.AI concept demo for Hydro One: a customer **mobile app** and a staff **web app**, interlinked through one API. Net2Grid EV detection drives DR enrollment and Campaign 360 feeder messaging. **It is built and working**; changes from here are iterations.

Read first: `docs/BUILD_SPEC.md` (scope, flows, screens), `docs/IMPLEMENTATION_NOTES.md` (exact API behaviour, seed numbers, energy model). Look in `wireframes/` for the approved look.

## Layout

- `packages/shared`: the contract. Types (`types.ts`), REST paths and client (`api.ts`), socket events (`socket.ts`), design tokens, `brand.ts` placeholders, format helpers. Compiled to CommonJS in `dist/`; run `pnpm build:shared` after changing it (`pnpm dev` does this).
- `apps/api`: NestJS 12 (ESM, `module: nodenext`) + Mongoose + Socket.IO. One folder per module. Dev loop is `tsc -w` + `node --watch` (not tsx: Nest DI needs decorator metadata). Seeds itself on boot when the DB is empty. With `MONGO_URL` unset it starts a built-in MongoDB (`src/database.ts`, mongodb-memory-server). In production it also serves the built staff app at `/staff`, the customer app at `/app` and a start page at `/` (`src/static.ts`).
- `apps/web`: React 19 + Vite + react-router. Production build uses base `/staff/`; API is same-origin in production. Pages in `src/pages`, API/socket client in `src/lib/client.tsx`.
- `apps/mobile`: Expo SDK 58 + Expo Router (`src/app`). Providers in `src/lib`, UI kit in `src/components`. Runs on Expo Web (8081) and Expo Go. `pnpm --filter @demo/mobile build:web` exports it with base `/app` (`app.config.js`). Read `apps/mobile/AGENTS.md` before touching Expo APIs.
- `tests/e2e`: Playwright scripts that drive flows A/B/C across both apps (needs `pnpm dev` running).

## Rules

- Mobile and web never talk directly. Cross-app effects go API → Socket.IO events.
- External systems stay simulated behind interfaces: Net2Grid (`EvDetectionSource`), Kubra (`PaymentProvider`), SMS/email. Never collect real payment or ID data.
- The staff feeder map uses real basemaps (Light/Streets from OpenStreetMap, Satellite from Esri) with feeders routed along real streets from the committed `apps/web/src/data/feeder-routes.json` (regenerate with `node scripts/gen-feeder-routes.mjs`); positions are synthetic (`packages/shared/src/geo.ts`) and labelled illustrative; it falls back to the schematic when tiles can't load. The customer outage map is still a schematic.
- The assistant is scripted on purpose: no LLM or network calls. Answers come from live demo data and always show the disclosure.
- Brand values and program names are placeholders in `packages/shared/src/brand.ts`. Don't hard-code them elsewhere.
- Match the wireframes. Don't redesign without being asked.
- TypeScript strict; DTO validation on every API body; touch targets ≥ 44px; accessibility labels on icon-only buttons.
- Lint is ESLint 10 flat config at the root (`eslint.config.mjs`) with the React Compiler rules on: no `setState` synchronously inside an effect (use promise chains or callbacks), no ref reads during render, and in `apps/web` a file that exports a component exports nothing else.
- Unit tests are Vitest (`*.spec.ts` next to the code in `apps/api`, `apps/web/src/lib`, `packages/shared`). API tests never boot Nest DI (`AppModule`, `@nestjs/testing`): esbuild emits no decorator metadata. Test pure functions or hand-built services; the maths lives in small modules for that reason (`campaigns/merge.ts`, `campaigns/simulation-plan.ts`, `campaigns/ab.ts`, `campaigns/schedule.ts`, `dr-events/dr-result.ts`, `grid/feeder-stat.ts`, `energy/tariff.ts`, `energy/charging-plan.ts`, `energy/integrate.ts`, `assistant/nlu.ts`, `assistant/*-answers.ts`, `assistant/copy-drafts.ts`, `seed/allocate.ts`, `seed/bills.ts`).
- After changes: `pnpm typecheck`, `pnpm lint`, `pnpm test`, then run `pnpm dev` and `pnpm e2e` (Playwright Test in `tests/e2e`, serial, asserts live socket updates).

## Hosting

One server, one port: `docker compose up -d --build` (see DEPLOY.md), or `pnpm build && pnpm start`. Keep it that way. The point is that the demo needs no local setup.

Zoho Catalyst AppSail (India DC) runs the same image: `pnpm deploy:catalyst` (`scripts/deploy-catalyst.ps1`; needs `catalyst login` + `catalyst init` once, and Docker Desktop). Hosting constraints the code relies on, don't undo them:
- `apps/api/src/main.ts` opens the port before loading Nest, Express, Socket.IO or the database (AppSail kills apps not listening within 10 s); a 503 "Starting…" gate (`boot/gate.ts`) covers the ~3 s boot.
- The port comes from `X_ZOHO_CATALYST_LISTEN_PORT`, then `API_PORT`, `PORT`, 3000 (`resolvePort` in `config.ts`).
- The image ships the mongod binary (`MONGOMS_SYSTEM_BINARY`); nothing downloads at start.
- Socket.IO clients use default transports (polling first, then WebSocket) and the server pings every 20 s, inside AppSail's 30 s request limit.
- AppSail doesn't pass WebSockets: on AppSail the server serves polling only (`socketPollingOnly` in `config.ts`). Its proxy also rejects `[` `]` in paths, so `apps/mobile/scripts/fix-export-names.mjs` renames Expo's bracketed route chunks after export.
- One instance only: live sync and the in-memory DB live in one process.

## Commands

- `pnpm i`: install
- Database: built-in by default (no setup). `docker compose up -d mongo` + `MONGO_URL` for a persistent one
- `start-demo.cmd`: Windows double-click install + build + start
- `pnpm seed` / `pnpm seed:reset`: seed / wipe and reseed
- `pnpm dev`: api (3000, Swagger at /docs) + web (5173) + mobile web (8081)
- `pnpm build` then `pnpm start`: production, everything on :3000
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`
- Demo day: staff app `/demo` has the guided script, preflight checks and phone QR; `Shift+P` on any staff page toggles the presenter bar (hotkeys N/B next/back, 1/2/3 simulate, E end event, R reset). "Reset (keep phone signed in)" is the default reset; demo customer ids are fixed so tokens survive it.

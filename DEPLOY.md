# Hosting the demo

One server process serves everything on one port:

| Path | What |
|---|---|
| `/` | Start page: links to both apps, QR code for the phone, demo script |
| `/staff` | Staff web app (feeder visibility, Campaign 360, DR events, demo control panel at `/staff/demo`) |
| `/app` | Customer mobile app (open in a second tab, or on a phone) |
| `/api`, `/socket.io` | API and live updates that link the two apps |
| `/docs` | API docs (Swagger) |

Because both apps talk through the same server, they stay in sync whether they're in two tabs on one laptop or on a laptop and a phone.

**Database:** with `MONGO_URL` unset, the app starts a built-in MongoDB (downloaded once on first start, data kept in memory, so a restart resets the demo). Set `MONGO_URL` to use a real MongoDB (Docker compose does this). Data is sample data only; **Reset demo** on `/staff/demo` restores the starting state.

## Option A: Docker (recommended)

On any Linux server with Docker:

```bash
git clone <your repo> hydro-one-ev-demo   # or copy the folder
cd hydro-one-ev-demo
docker compose up -d --build
```

Open `http://<server>:3000`. This starts two containers: `app` (the demo) and `mongo` (database, bound to localhost only). To use a different port: `APP_PORT=8080 docker compose up -d --build`.

Update after code changes: `docker compose up -d --build`. Logs: `docker compose logs -f app`.

## Option B: Plain Node (no Docker)

Requirements: Node.js 20+ and pnpm (`npm i -g pnpm`). No database needed (built-in), unless you want data to survive restarts.

```bash
pnpm i
pnpm build
pnpm start
```

On Windows you can just double-click `start-demo.cmd`, which does the same. To use your own MongoDB, set `MONGO_URL` in `.env` (see `.env.example`). Keep it running with pm2, systemd or a Windows service.

The first start downloads the MongoDB binary from fastdl.mongodb.org. If a corporate proxy blocks that, set `MONGO_URL` to a MongoDB you can reach (e.g. a free MongoDB Atlas cluster).

## HTTPS and domains

Put the app behind your usual reverse proxy (nginx, Caddy, an AWS ALB) and forward everything to port 3000. **WebSockets must be allowed** (`/socket.io`), or the apps fall back to slower polling. Example nginx:

```nginx
server {
  server_name demo.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The phone needs to reach the same address, so use a public URL or the server's network IP. `localhost` only works on the server itself.

## Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URL` | unset = built-in database | Your own MongoDB, if you want one |
| `PORT` | `3000` | Port the server listens on |
| `JWT_SECRET` | demo value | Signs the demo login tokens. Set your own |
| `DEMO_CUSTOMER_FIRST_NAME` | `Manny` | Name of the unenrolled demo customer |
| `DEMO_ENROLLED_CUSTOMER_FIRST_NAME` | `Priya` | Name of the enrolled demo customer |
| `DEMO_TIMEZONE` | `America/Toronto` | Drives the solar curve and event times |

Logo, program name and incentive amounts are placeholders in `packages/shared/src/brand.ts`. Change them and rebuild.

## Before you share the link

- This is a demo with **mock logins** (any password works) and sample data. Don't put real customer data in it.
- Anyone with the URL can open it. Restrict it at the proxy (basic auth or an IP allow-list) if needed.
- One shared demo state: if two people demo at once, they see each other's actions. Use **Reset demo** before each session.

## Checking it works

With the server running: `BASE_URL=http://localhost:3000 pnpm e2e` runs the Playwright suite (flows A/B/C, customer-app basics, demo controls) against the single-port build (first time: `pnpm --filter @demo/e2e exec playwright install chromium`). Tests run serially because the demo has one shared database.

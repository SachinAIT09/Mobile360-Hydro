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

## Option C: Zoho Catalyst AppSail

Catalyst AppSail runs the same Docker image as a managed service with an HTTPS URL. The built-in in-memory database is used, so nothing else needs setting up.

**What to expect on AppSail**
- **Demo data resets when the service sleeps.** AppSail stops an instance after about 5 minutes without traffic, and the in-memory database goes with it. The next visit starts fresh: it shows "Starting the demo…" for a few seconds, then the app. Signed-in phones keep working because the demo accounts are recreated with the same IDs. To keep data across sleeps, set `MONGO_URL` to a MongoDB such as a free Atlas cluster.
- **One instance only.** Live sync and the in-memory data live in one server process. AppSail adds instances only past 80 concurrent requests per instance, far above demo traffic. If you share the URL widely, ask Zoho support to cap the service at one instance.
- **Live updates use HTTP long-polling.** AppSail doesn't pass WebSocket upgrades through (tested on the live service). When the server sees AppSail's port variable it stops offering the upgrade, so browsers don't log failed WebSocket attempts. Each poll finishes well inside AppSail's 30-second request limit. Elsewhere the apps still upgrade to WebSockets; `SOCKET_POLLING_ONLY=true|false` overrides.
- **Startup is fast enough.** The server opens its port in under a second; AppSail requires 10 s. The database and sample data load behind a "Starting…" page in about 3 s.
- **The map needs internet access** to OpenStreetMap and Esri tiles from the viewer's browser. Without it, the diagram view shows instead.

### One-time setup

1. Install the Catalyst CLI and sign in. Your account is on the India data center (`catalyst.zoho.in`):
   ```powershell
   npm i -g zcatalyst-cli
   catalyst login
   ```
2. In this folder, link it to a Catalyst project. Create one called "Hydro One EV Demo" if you don't have it:
   ```powershell
   catalyst init
   ```
   This links the folder to the project in `.catalystrc` (project IDs, not secrets; it's committed). Init may stop before writing `catalyst.json`; the AppSail deploy doesn't need it.
3. Start Docker Desktop.

### Deploy

```powershell
pnpm deploy:catalyst
```

This builds the image for `linux/amd64` (the platform AppSail requires), saves it to `.catalyst-build/hydro-one-demo.tar`, and runs `catalyst deploy appsail --name hydroonedemo --source docker-archive://... --port 3000`. To redeploy the last built image without rebuilding: `pnpm deploy:catalyst -SkipBuild`.

### First-time console settings (Catalyst console > AppSail > hydroonedemo)

| Setting | Value |
|---|---|
| Memory | 1024 MB (it uses about 220 MB; the headroom covers resets and the seed) |
| Disk | 1024 MB (the image is about 0.8 GB) |
| Environment variable `JWT_SECRET` | Any long random string |
| Optional: `DEMO_TIMEZONE`, `EV_ALWAYS_CHARGING`, `DEMO_CUSTOMER_FIRST_NAME` | As in the settings table below |

Then open the **development** URL (`https://hydroonedemo-<id>.development.catalystappsail.com`) and check `/`, `/staff` and `/app`. When it looks right, use **Deploy to production** in the console. You can map your own domain under the service's domain settings.

### Development URL

`https://hydroonedemo-50047125140.development.catalystappsail.in` (project Mobile360-Hydro, India DC). On a cold start the "Starting the demo…" page answers in under a second and the app is ready in about 7 s.

### Check it from this PC

```powershell
$env:BASE_URL = "https://hydroonedemo-<id>.development.catalystappsail.com"; pnpm e2e
```

The browser tests reset the demo data, so don't run them while someone is presenting.

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
| `PUBLIC_URL` | unset = from the request | Public address used for the start page links and the phone QR code, e.g. your custom domain `https://ev-demo.example.com`. Behind proxies the address is worked out from the forwarded headers; set this if the QR code shows the wrong address |
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

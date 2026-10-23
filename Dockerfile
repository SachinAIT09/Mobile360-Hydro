# Hydro One EV & Energy demo: one image serving the staff web app (/staff),
# the customer app (/app), the API (/api, /socket.io) and a start page (/).
#
# Database: with MONGO_URL unset the app runs a built-in in-memory MongoDB. The mongod binary is
# downloaded here at build time and shipped in the image (MONGOMS_SYSTEM_BINARY), so containers
# start without any download. This keeps cold starts fast on hosts like Zoho Catalyst AppSail.
# Set MONGO_URL to use an external MongoDB instead (docker-compose.yml does).
#
# Build for linux/amd64 (required by Catalyst AppSail):
#   docker build --platform linux/amd64 -t hydro-one-demo:latest .

ARG MONGOMS_VERSION=8.2.6

# ---------- build ----------
FROM node:22-bookworm-slim AS build
ARG MONGOMS_VERSION
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Production-only copy of the API with its dependencies (incl. the compiled shared package)
RUN pnpm --filter @demo/api deploy --legacy --prod /out
# Fetch the MongoDB server binary for this platform (Debian 12, x86-64) once, at build time.
RUN cd apps/api \
 && MONGOMS_DOWNLOAD_DIR=/opt/mongo-dl MONGOMS_VERSION=${MONGOMS_VERSION} \
    node -e "require('mongodb-memory-server').MongoBinary.getPath().then((p) => require('fs').writeFileSync('/tmp/mongod-path', p))" \
 && BIN="$(cat /tmp/mongod-path)" && echo "mongod: $BIN" \
 && mkdir -p /opt/mongo && cp "$BIN" /opt/mongo/mongod && rm -rf /opt/mongo-dl /tmp/mongod-path

# ---------- runtime ----------
FROM node:22-bookworm-slim
ARG MONGOMS_VERSION
# mongod links against libcurl and OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcurl4 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    STAFF_DIST=/srv/web \
    APP_DIST=/srv/app \
    MONGOMS_SYSTEM_BINARY=/opt/mongo/mongod \
    MONGOMS_VERSION=${MONGOMS_VERSION}
WORKDIR /srv/api
COPY --from=build /out ./
COPY --from=build /repo/apps/web/dist /srv/web
COPY --from=build /repo/apps/mobile/dist /srv/app
COPY --from=build /opt/mongo/mongod /opt/mongo/mongod
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]

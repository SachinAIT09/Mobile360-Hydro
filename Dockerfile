# Hydro One EV & Energy demo: one image serving the staff web app (/staff),
# the customer app (/app), the API (/api, /socket.io) and a start page (/).
# Needs MongoDB (see docker-compose.yml) via MONGO_URL.

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Production-only copy of the API with its dependencies (incl. the compiled shared package)
RUN pnpm --filter @demo/api deploy --legacy --prod /out

# ---------- runtime ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    STAFF_DIST=/srv/web \
    APP_DIST=/srv/app
WORKDIR /srv/api
COPY --from=build /out ./
COPY --from=build /repo/apps/web/dist /srv/web
COPY --from=build /repo/apps/mobile/dist /srv/app
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]

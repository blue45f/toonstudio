FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @webtoon-nest/api build

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS runtime
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
ENV NODE_ENV=production
ENV API_RUNTIME_ROLE=capability-worker
ENV BACKEND_CAPABILITY_WORKER_ENABLED=true
ENV PORT=4001
COPY --from=build --chown=node:node /repo /repo
EXPOSE 4001
USER node
WORKDIR /repo/apps/api
CMD ["node", "dist/apps/api/src/main.js"]

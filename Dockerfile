FROM node:22-slim AS base
RUN corepack enable

# Build web frontend
FROM base AS web-build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@staccato/web

# Build server: compile TS, then strip devDeps from hoisted node_modules
FROM base AS server-build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@staccato/server
RUN pnpm prune --prod

# Final image — no docs, no dev dependencies
FROM node:22-slim
RUN apt-get update && apt-get install -y libchromaprint-tools && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/apps/server/dist ./apps/server/dist
COPY --from=server-build /app/apps/server/drizzle ./drizzle
COPY --from=web-build /app/apps/web/dist ./apps/web/dist
CMD ["node", "apps/server/dist/index.js"]

# Standalone image for the Staccato metadata service (façade in front of the
# MusicBrainz mirror). Built and deployed independently — NOT bundled into the
# main Staccato server image. Build from the repo root:
#   docker build -f apps/metadata-service/Dockerfile -t staccato-metadata .

FROM node:22-slim AS base
RUN corepack enable

# Build: compile TS, then strip devDeps from the hoisted node_modules.
FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@staccato/metadata-service
RUN pnpm prune --prod

# Final image — only the service + its (pruned) deps.
FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/metadata-service/dist ./apps/metadata-service/dist
CMD ["node", "apps/metadata-service/dist/index.js"]

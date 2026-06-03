import Fastify from "fastify";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { createAuthPreHandler } from "./plugins/apiKey.js";
import healthRoutes from "./routes/health.js";
import recordingRoutes from "./routes/recordings.js";
import releaseRoutes from "./routes/releases.js";
import releaseSearchRoutes from "./routes/releases-search.js";
import releaseGroupRoutes from "./routes/release-groups.js";
import artistRoutes from "./routes/artists.js";
import artistImageRoutes from "./routes/artist-image.js";
import coverArtRoutes from "./routes/cover-art.js";
import searchRoutes from "./routes/search.js";

logger.info(
  {
    mirrorUrl: config.MB_MIRROR_URL,
    port: config.PORT,
    concurrency: config.MIRROR_CONCURRENCY,
    intervalCap: config.MIRROR_INTERVAL_CAP,
    intervalMs: config.MIRROR_INTERVAL_MS,
    popularityEnabled: config.POPULARITY_ENABLED,
    listenbrainzUrl: config.LISTENBRAINZ_API_URL,
    apiKeyConfigured: Boolean(config.METADATA_SERVICE_API_KEY),
  },
  "metadata-service config loaded",
);

const app = Fastify({ loggerInstance: logger });

app.register(healthRoutes);

// All /v1 routes share an encapsulated scope so the auth preHandler hook
// applies only to them and not to /health.
app.register(
  async (v1) => {
    if (config.METADATA_SERVICE_API_KEY) {
      v1.addHook(
        "preHandler",
        createAuthPreHandler(config.METADATA_SERVICE_API_KEY),
      );
    }
    v1.register(recordingRoutes);
    v1.register(releaseRoutes);
    v1.register(releaseSearchRoutes);
    v1.register(releaseGroupRoutes);
    v1.register(artistRoutes);
    v1.register(artistImageRoutes);
    v1.register(coverArtRoutes);
    v1.register(searchRoutes);
  },
  { prefix: "/v1" },
);

const start = async () => {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
};

start().catch((err) => {
  logger.fatal({ err }, "metadata-service failed to start");
  process.exit(1);
});

import Fastify from "fastify";
import { logger } from "./logger.js";
import { config } from "./config.js";
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
  },
  "metadata-service config loaded",
);

const app = Fastify({ loggerInstance: logger });

app.register(healthRoutes);
app.register(recordingRoutes, { prefix: "/v1" });
app.register(releaseRoutes, { prefix: "/v1" });
app.register(releaseSearchRoutes, { prefix: "/v1" });
app.register(releaseGroupRoutes, { prefix: "/v1" });
app.register(artistRoutes, { prefix: "/v1" });
app.register(artistImageRoutes, { prefix: "/v1" });
app.register(coverArtRoutes, { prefix: "/v1" });
app.register(searchRoutes, { prefix: "/v1" });

const start = async () => {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
};

start().catch((err) => {
  logger.fatal({ err }, "metadata-service failed to start");
  process.exit(1);
});

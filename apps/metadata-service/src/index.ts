import "./env.js";
import Fastify from "fastify";
import { logger } from "./logger.js";
import { config } from "./config.js";
import healthRoutes from "./routes/health.js";
import recordingRoutes from "./routes/recordings.js";
import releaseRoutes from "./routes/releases.js";
import releaseGroupRoutes from "./routes/release-groups.js";
import artistRoutes from "./routes/artists.js";
import searchRoutes from "./routes/search.js";

const app = Fastify({ loggerInstance: logger });

app.register(healthRoutes);
app.register(recordingRoutes, { prefix: "/v1" });
app.register(releaseRoutes, { prefix: "/v1" });
app.register(releaseGroupRoutes, { prefix: "/v1" });
app.register(artistRoutes, { prefix: "/v1" });
app.register(searchRoutes, { prefix: "/v1" });

const start = async () => {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
};

start().catch((err) => {
  logger.fatal({ err }, "metadata-service failed to start");
  process.exit(1);
});

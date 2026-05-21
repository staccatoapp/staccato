import "./env.js";
import Fastify from "fastify";
import { logger } from "./logger.js";
import { config } from "./config.js";
import healthRoutes from "./routes/health.js";
import recordingRoutes from "./routes/recordings.js";

const app = Fastify({ loggerInstance: logger });

app.register(healthRoutes);
app.register(recordingRoutes, { prefix: "/v1" });

const start = async () => {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
};

start().catch((err) => {
  logger.fatal({ err }, "metadata-service failed to start");
  process.exit(1);
});

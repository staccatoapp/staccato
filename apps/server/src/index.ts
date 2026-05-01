import Fastify from "fastify";
import dotenvFlow from "dotenv-flow";
import sessionPlugin, { requireAuth } from "./plugins/session.js";
import authRoutes from "./routes/auth.js";
import scanRoutes from "./routes/scan.js";
import resolutionRoutes from "./routes/resolution.js";
import fastifyStatic from "@fastify/static";
import { runMigrations } from "./db/migrate.js";
import { db } from "./db/client.js";
import { tracks } from "./db/schema/tracks.js";
import { startScan } from "./scanner/index.js";
import { startWatcher } from "./scanner/watcher.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libraryRoutes from "./routes/library.js";
import playbackRoutes from "./routes/playback.js";
import tracksRoutes from "./routes/tracks.js";
import playlistRoutes from "./routes/playlists.js";
import settingsRoutes from "./routes/settings.js";
import searchRoutes from "./routes/search.js";
import previewRoutes from "./routes/preview.js";
import recommendationRoutes from "./routes/recommendations.js";

if (process.env.STACCATO_ENV !== "production") {
  dotenvFlow.config({
    node_env: process.env.STACCATO_ENV ?? "development",
  });
}

const app = Fastify();

app.register(sessionPlugin);

app.get("/api/health", async () => {
  return { status: "ok" };
});

app.register(authRoutes, { prefix: "/api/auth" });

app.register(async (protectedApp) => {
  protectedApp.addHook("preHandler", requireAuth);
  protectedApp.register(scanRoutes, { prefix: "/api/library" });
  protectedApp.register(resolutionRoutes, { prefix: "/api/library" });
  protectedApp.register(libraryRoutes, { prefix: "/api/library" });
  protectedApp.register(playbackRoutes, { prefix: "/api/playback" });
  protectedApp.register(tracksRoutes, { prefix: "/api" });
  protectedApp.register(playlistRoutes, { prefix: "/api/playlists" });
  protectedApp.register(settingsRoutes, { prefix: "/api/settings" });
  protectedApp.register(searchRoutes, { prefix: "/api/search" });
  protectedApp.register(previewRoutes, { prefix: "/api/preview" });
  protectedApp.register(recommendationRoutes, {
    prefix: "/api/recommendations",
  });
});

if (process.env.STACCATO_ENV !== "development") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.register(fastifyStatic, {
    root: path.join(__dirname, "../../web/dist"),
    wildcard: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      reply.status(404).send({ error: "Not found" });
    } else {
      reply.sendFile("index.html");
    }
  });
}

const start = async () => {
  runMigrations();

  const musicDir = process.env.MUSIC_DIR ?? "./music";
  const port = Number(process.env.PORT) || 8280;
  await app.listen({ port, host: "0.0.0.0" });

  const hasTrack = db.select({ id: tracks.id }).from(tracks).limit(1).get();
  if (!hasTrack) {
    console.log("[startup] no tracks found, starting initial scan");
    startScan(musicDir).catch((err) =>
      console.error("[startup] initial scan error", err),
    );
  }

  startWatcher(musicDir);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

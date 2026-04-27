import Fastify from "fastify";
import dotenvFlow from "dotenv-flow";
import defaultUserPlugin from "./plugins/default-user.js";
import scanRoutes from "./routes/scan.js";
import resolutionRoutes from "./routes/resolution.js";
import fastifyStatic from "@fastify/static";
import { runMigrations } from "./db/migrate.js";
import { seedDefaultUser } from "./db/seed.js";
import { db } from "./db/client.js";
import { users } from "./db/schema/users.js";
import { tracks } from "./db/schema/tracks.js";
import { startScan } from "./scanner/index.js";
import { startWatcher } from "./scanner/watcher.js";
import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libraryRoutes from "./routes/library.js";
import playbackRoutes from "./routes/playback.js";
import tracksRoutes from "./routes/tracks.js";
import playlistRoutes from "./routes/playlists.js";
import settingsRoutes from "./routes/settings.js";
import searchRoutes from "./routes/search.js";
import previewRoutes from "./routes/preview.js";

if (process.env.STACCATO_ENV !== "production") {
  dotenvFlow.config({
    node_env: process.env.STACCATO_ENV ?? "development",
  });
}

const app = Fastify();

app.register(defaultUserPlugin);
app.register(scanRoutes, { prefix: "/api/library" });
app.register(resolutionRoutes, { prefix: "/api/library" });
app.register(libraryRoutes, { prefix: "/api/library" });
app.register(playbackRoutes, { prefix: "/api/playback" });
app.register(tracksRoutes, { prefix: "/api" });
app.register(playlistRoutes, { prefix: "/api/playlists" });
app.register(settingsRoutes, { prefix: "/api/settings" });
app.register(searchRoutes, { prefix: "/api/search" });
app.register(previewRoutes, { prefix: "/api/preview" });

app.get("/api/health", async () => {
  return { status: "ok" };
});

// TODO - refactor into users query file when auth is properly implemented
app.get("/api/me", async (request, reply) => {
  const user = db
    .select({ id: users.id, username: users.username, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, request.userId))
    .get();
  if (!user) return reply.status(404).send({ error: "User not found" });
  return user;
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
  seedDefaultUser();

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

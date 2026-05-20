import "./env.js";
import Fastify from "fastify";
import sessionPlugin, { requireAuth } from "./plugins/session.js";
import authRoutes from "./routes/auth.js";
import scanRoutes from "./routes/scan.js";
import fastifyStatic from "@fastify/static";
import { runMigrations } from "./db/migrate.js";
import { startLibraryPipeline } from "./library/index.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { artistImagesDir, coversDir, metadataDir } from "./paths.js";
import libraryRoutes from "./routes/library.js";
import albumRoutes from "./routes/albums.js";
import artistRoutes from "./routes/artists.js";
import playbackRoutes from "./routes/playback.js";
import tracksRoutes from "./routes/tracks.js";
import playlistRoutes from "./routes/playlists.js";
import settingsRoutes from "./routes/settings.js";
import searchRoutes from "./routes/search.js";
import previewRoutes from "./routes/preview.js";
import recommendationRoutes from "./routes/recommendations.js";
import downloadRoutes from "./routes/downloads.js";
import { startLidarrPoller } from "./lidarr/poller.js";
import { logger } from "./logger.js";
import {
  findUserIdsWithListenbrainzToken,
  resetInflightOnBoot,
  upsertWarmingRow,
} from "./db/queries/recommendation-cache.js";
import { startRefresher, tick } from "./recommendations/refresher.js";
import { listRegisteredSources } from "./recommendations/source.js";
import "./recommendations/sources/index.js";

const app = Fastify({ loggerInstance: logger });

app.register(sessionPlugin);

fs.mkdirSync(metadataDir, { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });
fs.mkdirSync(artistImagesDir, { recursive: true });
app.register(fastifyStatic, {
  root: metadataDir,
  prefix: "/metadata/",
  decorateReply: false,
  maxAge: "1y",
  immutable: true,
});

app.get("/api/health", async () => {
  return { status: "ok" };
});

app.register(authRoutes, { prefix: "/api/auth" });

app.register(async (protectedApp) => {
  protectedApp.addHook("preHandler", requireAuth);
  protectedApp.register(scanRoutes, { prefix: "/api/library" });
  protectedApp.register(libraryRoutes, { prefix: "/api/library" });
  protectedApp.register(albumRoutes, { prefix: "/api/albums" });
  protectedApp.register(artistRoutes, { prefix: "/api/artists" });
  protectedApp.register(playbackRoutes, { prefix: "/api/playback" });
  protectedApp.register(tracksRoutes, { prefix: "/api" });
  protectedApp.register(playlistRoutes, { prefix: "/api/playlists" });
  protectedApp.register(settingsRoutes, { prefix: "/api/settings" });
  protectedApp.register(searchRoutes, { prefix: "/api/search" });
  protectedApp.register(previewRoutes, { prefix: "/api/preview" });
  protectedApp.register(recommendationRoutes, {
    prefix: "/api/recommendations",
  });
  protectedApp.register(downloadRoutes, { prefix: "/api/downloads" });
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

  resetInflightOnBoot();

  const tokenedUserIds = findUserIdsWithListenbrainzToken();
  const sources = listRegisteredSources();
  const now = Date.now();
  for (const userId of tokenedUserIds) {
    for (const source of sources) {
      upsertWarmingRow(userId, source.id, source.kind, now);
    }
  }
  if (tokenedUserIds.length > 0) {
    logger.info(
      {
        userCount: tokenedUserIds.length,
        sourceCount: sources.length,
      },
      "recommendation cache boot backfill complete",
    );
  }

  const musicDir = process.env.MUSIC_DIR ?? "./music";
  const port = Number(process.env.PORT) || 8280;
  await app.listen({ port, host: "0.0.0.0" });

  startLibraryPipeline(musicDir).catch((err) =>
    logger.error({ err }, "library pipeline failed to start"),
  );

  startLidarrPoller();

  startRefresher();
  void tick().catch((err) =>
    logger.error({ err }, "initial recommendation tick failed"),
  );
};

start().catch((err) => {
  logger.fatal({ err }, "server failed to start");
  process.exit(1);
});

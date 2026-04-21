import Fastify from "fastify";
import dotenvFlow from "dotenv-flow";
import defaultUserPlugin from "./plugins/default-user.js";
import scanRoutes from "./routes/scan.js";
import fastifyStatic from "@fastify/static";
import { runMigrations } from "./db/migrate.js";
import { seedDefaultUser } from "./db/seed.js";
import { db } from "./db/index.js";
import { users } from "./db/schema/users.js";
import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libraryRoutes from "./routes/library.js";

if (process.env.STACCATO_ENV !== "production") {
  dotenvFlow.config({
    node_env: process.env.STACCATO_ENV ?? "development",
  });
}

const app = Fastify({ logger: true });

app.register(defaultUserPlugin);
app.register(scanRoutes, { prefix: "/api/library" });
app.register(libraryRoutes, { prefix: "/api/library" });

app.get("/api/health", async () => {
  return { status: "ok" };
});

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
  const port = Number(process.env.PORT) || 8280;
  await app.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { describe, it, expect } from "vitest";
import fastifyStatic from "@fastify/static";
import os from "node:os";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "./plugins/session.js";
import { buildSessionApp } from "./routes/__fixtures__/app.js";

const metadataPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.register(fastifyStatic, {
    root: os.tmpdir(),
    prefix: "/metadata/",
    decorateReply: false,
  });
};

describe("GET /metadata/**", () => {
  it("returns 401 when unauthenticated", async () => {
    const { app } = buildSessionApp(metadataPlugin);
    const res = await app.inject({
      method: "GET",
      url: "/metadata/covers/nonexistent.jpg",
    });
    expect(res.statusCode).toBe(401);
  });

  it("passes auth and attempts to serve file when authenticated", async () => {
    const { app } = buildSessionApp(metadataPlugin, "user-1");
    const res = await app.inject({
      method: "GET",
      url: "/metadata/covers/nonexistent.jpg",
    });
    expect(res.statusCode).not.toBe(401);
  });
});

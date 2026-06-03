import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createAuthPreHandler } from "./apiKey.js";

function buildApp(apiKey: string) {
  const app = Fastify({ logger: false });
  if (apiKey) {
    app.addHook("preHandler", createAuthPreHandler(apiKey));
  }
  app.get("/test", async () => ({ ok: true }));
  return app;
}

describe("createAuthPreHandler — key configured", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const app = buildApp("secret-key");
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when token does not match", async () => {
    const app = buildApp("secret-key");
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer wrong-key" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when Authorization scheme is not Bearer", async () => {
    const app = buildApp("secret-key");
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Basic secret-key" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 when token matches", async () => {
    const app = buildApp("secret-key");
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer secret-key" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("createAuthPreHandler — key empty (auth disabled)", () => {
  it("passes through with no Authorization header", async () => {
    const app = buildApp("");
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(200);
  });
});

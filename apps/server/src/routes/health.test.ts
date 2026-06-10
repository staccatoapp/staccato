import { describe, expect, it } from "vitest";
import healthRoutes from "./health.js";
import { buildApp } from "./__fixtures__/app.js";

describe("GET /api/health", () => {
  it("returns ok status with product name and version", async () => {
    const app = buildApp(healthRoutes);
    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.name).toBe("staccato");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

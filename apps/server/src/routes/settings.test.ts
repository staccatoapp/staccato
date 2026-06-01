import { describe, it, expect, vi, beforeEach } from "vitest";
import settingsRoutes from "./settings.js";
import { buildApp } from "./__fixtures__/app.js";

vi.mock("../listenbrainz/client.js");
vi.mock("../db/queries/settings.js");
vi.mock("../db/queries/server-settings.js");
vi.mock("../recommendations/eligibility.js");
vi.mock("../recommendations/refresher.js");

describe("PATCH /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(settingsRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: "/",
      payload: { unknownField: 123 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /validate-listenbrainz-token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(settingsRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/validate-listenbrainz-token",
      payload: { notAToken: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import downloadRoutes from "./downloads.js";
import { buildApp } from "./__fixtures__/app.js";

vi.mock("../db/queries/download-requests.js");
vi.mock("../lidarr/submit.js");

describe("POST /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(downloadRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { notValid: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

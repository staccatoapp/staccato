import { describe, it, expect, vi, beforeEach } from "vitest";
import settingsRoutes from "./settings.js";
import { buildApp } from "./__fixtures__/app.js";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import { serverConfig } from "../config/server-config.js";
import type { ServerConfig } from "../config/server-config.js";

vi.mock("../listenbrainz/client.js");
vi.mock("../db/queries/settings.js");
vi.mock("../config/server-config.js", () => ({
  serverConfig: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../recommendations/eligibility.js");
vi.mock("../recommendations/refresher.js");

const defaultConfig: ServerConfig = {
  lidarr: {
    url: null,
    apiKey: null,
    qualityProfileId: null,
    metadataProfileId: null,
    rootFolderPath: null,
  },
  metadata: {
    confidenceThreshold: 0.75,
  },
  lastfm: {
    apiKey: null,
    secret: null,
  },
};

describe("GET /server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns metadataConfidenceThreshold from server config", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({
      ...defaultConfig,
      metadata: { confidenceThreshold: 0.85 },
    });
    const app = buildApp(settingsRoutes);
    const res = await app.inject({ method: "GET", url: "/server" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ metadataConfidenceThreshold: 0.85 });
  });
});

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

describe("GET /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns listenbrainzTokenSet: true when a token is stored", async () => {
    vi.mocked(getOrCreateUserSettings).mockReturnValue({
      listenbrainzToken: "secret-token",
      volume: 80,
      musicbrainzUsername: "user",
      id: "row-1",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof getOrCreateUserSettings>);

    const app = buildApp(settingsRoutes);
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.listenbrainzTokenSet).toBe(true);
    expect(body).not.toHaveProperty("listenbrainzToken");
  });

  it("returns listenbrainzTokenSet: false when no token is stored", async () => {
    vi.mocked(getOrCreateUserSettings).mockReturnValue({
      listenbrainzToken: null,
      volume: 50,
      musicbrainzUsername: null,
      id: "row-2",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof getOrCreateUserSettings>);

    const app = buildApp(settingsRoutes);
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.listenbrainzTokenSet).toBe(false);
    expect(body).not.toHaveProperty("listenbrainzToken");
  });
});

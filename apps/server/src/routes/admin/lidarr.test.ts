import { beforeEach, describe, expect, it, vi } from "vitest";
import lidarrRoutes from "./lidarr.js";
import { buildApp } from "../__fixtures__/app.js";
import { serverConfig } from "../../config/server-config.js";
import type { ServerConfig } from "../../config/server-config.js";

vi.mock("../../config/server-config.js", () => ({
  serverConfig: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../lidarr/client.js");

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

describe("GET /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Lidarr settings from server config", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({
      ...defaultConfig,
      lidarr: {
        url: "http://lidarr.local",
        apiKey: "secret",
        qualityProfileId: 1,
        metadataProfileId: 2,
        rootFolderPath: "/music",
      },
    });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBe("http://lidarr.local");
    expect(body.apiKeySet).toBe(true);
    expect(body.qualityProfileId).toBe(1);
    expect(body.metadataProfileId).toBe(2);
    expect(body.rootFolderPath).toBe("/music");
  });

  it("returns null fields and apiKeySet: false when Lidarr is not configured", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBeNull();
    expect(body.apiKeySet).toBe(false);
  });
});

describe("PATCH /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: "/",
      payload: { unknownField: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("calls serverConfig.set with mapped fields from valid body", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    await app.inject({
      method: "PATCH",
      url: "/",
      payload: {
        url: "http://lidarr.local",
        apiKey: "new-key",
        qualityProfileId: 3,
      },
    });
    expect(serverConfig.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lidarr: {
          url: "http://lidarr.local",
          apiKey: "new-key",
          qualityProfileId: 3,
        },
      }),
    );
  });

  it("returns 204 on success", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: "/",
      payload: { url: "http://lidarr.local" },
    });
    expect(res.statusCode).toBe(204);
  });

  it("clears lidarrUrl when null is passed", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    await app.inject({
      method: "PATCH",
      url: "/",
      payload: { url: null },
    });
    expect(serverConfig.set).toHaveBeenCalledWith(
      expect.objectContaining({ lidarr: { url: null } }),
    );
  });

  it("does not call serverConfig.set when body has no recognized fields", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    await app.inject({ method: "PATCH", url: "/", payload: {} });
    expect(serverConfig.set).not.toHaveBeenCalled();
  });
});

describe("GET /connectivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when Lidarr is not configured", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({ method: "GET", url: "/connectivity" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /options", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when Lidarr is not configured", async () => {
    vi.mocked(serverConfig.get).mockReturnValue({ ...defaultConfig });
    const app = buildApp(lidarrRoutes);
    const res = await app.inject({ method: "GET", url: "/options" });
    expect(res.statusCode).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile, rm, mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify } from "yaml";
import { ServerConfigService } from "./server-config.js";

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

async function waitForCondition(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("ServerConfigService", () => {
  let tmpDir: string;
  let configPath: string;
  let service: ServerConfigService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "staccato-config-test-"));
    configPath = path.join(tmpDir, "server.yaml");
  });

  afterEach(async () => {
    service?.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("initial load", () => {
    it("returns defaults when config file does not exist", () => {
      service = new ServerConfigService(configPath);
      const config = service.get();
      expect(config.lidarr.url).toBeNull();
      expect(config.lidarr.apiKey).toBeNull();
      expect(config.lidarr.qualityProfileId).toBeNull();
      expect(config.lidarr.metadataProfileId).toBeNull();
      expect(config.lidarr.rootFolderPath).toBeNull();
      expect(config.metadata.confidenceThreshold).toBe(0.75);
    });

    it("loads values from an existing YAML file", async () => {
      await writeFile(
        configPath,
        stringify({
          lidarr: {
            url: "http://lidarr.local",
            apiKey: "secret-key",
            qualityProfileId: 1,
            metadataProfileId: 2,
            rootFolderPath: "/music",
          },
          metadata: { confidenceThreshold: 0.9 },
        }),
      );
      service = new ServerConfigService(configPath);
      const config = service.get();
      expect(config.lidarr.url).toBe("http://lidarr.local");
      expect(config.lidarr.apiKey).toBe("secret-key");
      expect(config.lidarr.qualityProfileId).toBe(1);
      expect(config.lidarr.metadataProfileId).toBe(2);
      expect(config.lidarr.rootFolderPath).toBe("/music");
      expect(config.metadata.confidenceThreshold).toBe(0.9);
    });

    it("fills in defaults for fields absent from the YAML file", async () => {
      await writeFile(
        configPath,
        stringify({ lidarrUrl: "http://lidarr.local" }),
      );
      service = new ServerConfigService(configPath);
      expect(service.get().metadata.confidenceThreshold).toBe(0.75);
      expect(service.get().lidarr.apiKey).toBeNull();
    });

    it("falls back to defaults when the YAML is unparseable", async () => {
      await writeFile(configPath, "{ unclosed: [bracket");
      service = new ServerConfigService(configPath);
      expect(service.get().metadata.confidenceThreshold).toBe(0.75);
      expect(service.get().lidarr.url).toBeNull();
    });

    it("falls back to defaults when the config fails schema validation", async () => {
      await writeFile(
        configPath,
        stringify({ metadataConfidenceThreshold: "not-a-number" }),
      );
      service = new ServerConfigService(configPath);
      expect(service.get().metadata.confidenceThreshold).toBe(0.75);
    });
  });

  describe("set()", () => {
    it("updates the in-memory config immediately", async () => {
      service = new ServerConfigService(configPath);
      await service.set({ lidarr: { url: "http://new.local" } });
      expect(service.get().lidarr.url).toBe("http://new.local");
    });

    it("preserves untouched fields when updating a subset", async () => {
      service = new ServerConfigService(configPath);
      await service.set({
        lidarr: {
          url: "http://lidarr.local",
          apiKey: "key",
        },
      });
      await service.set({ lidarr: { url: "http://updated.local" } });
      expect(service.get().lidarr.apiKey).toBe("key");
    });

    it("writes the config to the YAML file", async () => {
      service = new ServerConfigService(configPath);
      await service.set({
        lidarr: {
          url: "http://lidarr.local",
          apiKey: "key",
        },
      });
      expect(existsSync(configPath)).toBe(true);
      const written = await readFile(configPath, "utf-8");
      expect(written).toContain("lidarr:");
      expect(written).toContain("http://lidarr.local");
    });

    it("persists config so a fresh instance reads the same values", async () => {
      service = new ServerConfigService(configPath);
      await service.set({
        lidarr: {
          url: "http://lidarr.local",
          apiKey: "key",
        },
        metadata: {
          confidenceThreshold: 0.8,
        },
      });

      const service2 = new ServerConfigService(configPath);
      try {
        expect(service2.get().lidarr.url).toBe("http://lidarr.local");
        expect(service2.get().lidarr.apiKey).toBe("key");
        expect(service2.get().metadata.confidenceThreshold).toBe(0.8);
      } finally {
        service2.close();
      }
    });

    it("creates parent directories if they do not exist", async () => {
      const nestedPath = path.join(tmpDir, "nested", "deep", "server.yaml");
      service = new ServerConfigService(nestedPath);
      await service.set({ lidarr: { url: "http://lidarr.local" } });
      expect(existsSync(nestedPath)).toBe(true);
    });

    it("sets null values explicitly", async () => {
      service = new ServerConfigService(configPath);
      await service.set({ lidarr: { url: "http://lidarr.local" } });
      await service.set({ lidarr: { url: null } });
      expect(service.get().lidarr.url).toBeNull();
    });
  });

  describe("file watch", () => {
    it("reloads config when the file is changed externally", async () => {
      await writeFile(
        configPath,
        stringify({ lidarr: { url: "http://original.local" } }),
      );
      service = new ServerConfigService(configPath);
      expect(service.get().lidarr.url).toBe("http://original.local");

      await writeFile(
        configPath,
        stringify({ lidarr: { url: "http://updated.local" } }),
      );
      await waitForCondition(
        () => service.get().lidarr.url === "http://updated.local",
      );
      expect(service.get().lidarr.url).toBe("http://updated.local");
    }, 10_000);
  });
});

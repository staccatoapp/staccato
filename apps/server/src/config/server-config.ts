import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { getEnvironment } from "../environment/environment.js";
import { logger } from "../logger.js";
import { staccatoDataRoot } from "../paths.js";

const log = logger.child({ module: "server-config" });

export const ServerConfigSections = {
  Lidarr: "lidarr",
  Metadata: "metadata",
  Lastfm: "lastfm",
} as const;
export type ServerConfigSection =
  (typeof ServerConfigSections)[keyof typeof ServerConfigSections];

const LidarrConfigSchema = z.object({
  url: z.string().nullable().default(null),
  apiKey: z.string().nullable().default(null),
  qualityProfileId: z.number().int().nullable().default(null),
  metadataProfileId: z.number().int().nullable().default(null),
  rootFolderPath: z.string().nullable().default(null),
});
export type LidarrConfig = z.infer<typeof LidarrConfigSchema>;

const MetadataConfigSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).default(0.75),
});
export type MetadataConfig = z.infer<typeof MetadataConfigSchema>;

const LastfmConfigSchema = z.object({
  apiKey: z.string().nullable().default(null),
  secret: z.string().nullable().default(null),
});
export type LastfmConfig = z.infer<typeof LastfmConfigSchema>;

const ServerConfigSchema = z.object({
  lidarr: LidarrConfigSchema.default({
    url: null,
    apiKey: null,
    qualityProfileId: null,
    metadataProfileId: null,
    rootFolderPath: null,
  }),
  metadata: MetadataConfigSchema.default({
    confidenceThreshold: 0.75,
  }),
  lastfm: LastfmConfigSchema.default({
    apiKey: null,
    secret: null,
  }),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const DEFAULTS: ServerConfig = ServerConfigSchema.parse({});

export class ServerConfigService {
  private config: ServerConfig = { ...DEFAULTS };
  private watcher: FSWatcher | null = null;

  constructor(private readonly filePath: string) {
    this.config = this.load();
    this.startWatch();
  }

  get(): ServerConfig {
    return this.config;
  }

  async set(partial: DeepPartial<ServerConfig>): Promise<void> {
    this.config = ServerConfigSchema.parse(
      this.deepMerge(this.config, partial),
    );
    await this.writeAtomic();
  }

  close(): void {
    void this.watcher?.close();
  }

  private load(): ServerConfig {
    if (!existsSync(this.filePath)) {
      return { ...DEFAULTS };
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = ServerConfigSchema.safeParse(parse(raw));
      if (!parsed.success) {
        log.error(
          { err: parsed.error, filePath: this.filePath },
          "server config validation failed, using defaults",
        );
        return { ...DEFAULTS };
      }
      return parsed.data;
    } catch (err) {
      log.error(
        { err, filePath: this.filePath },
        "server config read failed, using defaults",
      );
      return { ...DEFAULTS };
    }
  }

  private async writeAtomic(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, stringify(this.config), "utf-8");
    await rename(tmp, this.filePath);
  }

  private startWatch(): void {
    this.watcher = chokidar
      .watch(this.filePath, {
        ignoreInitial: true,
        persistent: false,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      })
      .on("add", () => this.reload())
      .on("change", () => this.reload())
      .on("error", (err) =>
        log.error(
          { err, filePath: this.filePath },
          "server config watcher error",
        ),
      );
  }

  private reload(): void {
    this.config = this.load();
    log.info({ filePath: this.filePath }, "server config reloaded");
  }

  private deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof T)[]) {
      const val = override[key];
      if (val === undefined) continue;
      const baseVal = base[key];
      result[key] =
        val !== null && typeof val === "object" && typeof baseVal === "object"
          ? (this.deepMerge(baseVal as object, val as object) as T[keyof T])
          : (val as T[keyof T]);
    }
    return result;
  }
}

function resolveConfigPath(): string {
  const env = getEnvironment().STACCATO_SERVER_CONFIG_PATH;
  if (env) return env;
  const ymlPath = path.join(staccatoDataRoot, "config.yml");
  return existsSync(ymlPath)
    ? ymlPath
    : path.join(staccatoDataRoot, "config.yaml");
}

export const serverConfig = new ServerConfigService(resolveConfigPath());

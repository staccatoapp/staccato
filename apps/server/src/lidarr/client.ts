import { z } from "zod";
import { Logger } from "pino";
import { logger as appLogger } from "../logger.js";
import {
  LidarrAlbum,
  LidarrAlbumSchema,
  LidarrArtist,
  LidarrArtistSchema,
  LidarrProfile,
  LidarrProfileSchema,
  LidarrQueueItem,
  LidarrQueueResponseSchema,
  LidarrRootFolder,
  LidarrRootFolderSchema,
} from "./schemas.js";
import { LidarrOptions } from "@staccato/shared";

export type {
  LidarrAlbum,
  LidarrAlbumStatistics,
  LidarrArtist,
  LidarrProfile,
  LidarrQueueItem,
  LidarrRootFolder,
} from "./schemas.js";

export class LidarrClient {
  private baseUrl: string;
  private apiKey: string;
  private logger: Logger;

  constructor(baseUrl: string, apiKey: string, logger?: Logger) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.logger = logger ?? appLogger;
    this.logger.child({ module: "lidarr-client" });
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Lidarr ${method} ${path} → ${res.status}`);
    }
    if (res.status === 204) return undefined;
    return res.json();
  }

  async testConnection(): Promise<boolean> {
    this.logger.debug("Testing Lidarr connection");
    try {
      await this.request("GET", "/system/status");
      return true;
    } catch {
      return false;
    }
  }

  async getQualityProfiles(): Promise<LidarrProfile[]> {
    this.logger.debug("Fetching Lidarr quality profiles");
    const raw = await this.request("GET", "/qualityprofile");
    try {
      return z.array(LidarrProfileSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getQualityProfiles" },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async getMetadataProfiles(): Promise<LidarrProfile[]> {
    this.logger.debug("Fetching Lidarr metadata profiles");
    const raw = await this.request("GET", "/metadataprofile");
    try {
      return z.array(LidarrProfileSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getMetadataProfiles" },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async getRootFolders(): Promise<LidarrRootFolder[]> {
    this.logger.debug("Fetching Lidarr root folders");
    const raw = await this.request("GET", "/rootfolder");
    try {
      return z.array(LidarrRootFolderSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getRootFolders" },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async getArtists(): Promise<LidarrArtist[]> {
    this.logger.debug("Fetching all Lidarr artists");
    const raw = await this.request("GET", "/artist");
    try {
      return z.array(LidarrArtistSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getArtists" },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async addArtist(params: {
    artistMbid: string;
    artistName: string;
    qualityProfileId: number;
    metadataProfileId: number;
    rootFolderPath: string;
  }): Promise<LidarrArtist> {
    this.logger.debug(
      `Adding artist ${params.artistName} (${params.artistMbid})`,
    );
    const raw = await this.request("POST", "/artist", {
      foreignArtistId: params.artistMbid,
      artistName: params.artistName,
      qualityProfileId: params.qualityProfileId,
      metadataProfileId: params.metadataProfileId,
      rootFolderPath: params.rootFolderPath,
      monitored: true,
      addOptions: {
        monitor: "none",
        searchForMissingAlbums: false,
      },
    });
    try {
      return LidarrArtistSchema.parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "addArtist", artistMbid: params.artistMbid },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async getAlbumsForArtist(lidarrArtistId: number): Promise<LidarrAlbum[]> {
    this.logger.debug(`Fetching albums for Lidarr artist ${lidarrArtistId}`);
    const raw = await this.request("GET", `/album?artistId=${lidarrArtistId}`);
    try {
      return z.array(LidarrAlbumSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getAlbumsForArtist", lidarrArtistId },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async getAlbumsByIds(ids: number[]): Promise<LidarrAlbum[]> {
    this.logger.debug(`Fetching albums by ids: ${ids.join(",")}`);
    if (ids.length === 0) return [];
    const query = ids.map((id) => `albumIds=${id}`).join("&");
    const raw = await this.request("GET", `/album?${query}`);
    try {
      return z.array(LidarrAlbumSchema).parse(raw);
    } catch (err) {
      this.logger.error(
        { err, operation: "getAlbumsByIds", ids },
        "lidarr response validation failed",
      );
      throw err;
    }
  }

  async setAlbumMonitored(albumId: number, monitored: boolean): Promise<void> {
    this.logger.debug(`Setting album ${albumId} as monitored: ${monitored}`);
    const raw = await this.request("GET", `/album/${albumId}`);
    const album = z.record(z.unknown()).parse(raw);
    await this.request("PUT", `/album/${albumId}`, { ...album, monitored });
  }

  async triggerAlbumSearch(albumId: number): Promise<void> {
    this.logger.debug(`Triggering album search for ${albumId}`);
    await this.request("POST", "/command", {
      name: "AlbumSearch",
      albumIds: [albumId],
    });
  }

  async getQueue(): Promise<LidarrQueueItem[]> {
    this.logger.debug("Fetching Lidarr queue");
    const raw = await this.request("GET", "/queue?pageSize=1000");
    try {
      const res = LidarrQueueResponseSchema.parse(raw);
      return res.records ?? [];
    } catch (err) {
      this.logger.error(
        { err, operation: "getQueue" },
        "lidarr response validation failed",
      );
      throw err;
    }
  }
}

export async function fetchLidarrOptions(
  client: LidarrClient,
): Promise<LidarrOptions> {
  const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
    client.getQualityProfiles(),
    client.getMetadataProfiles(),
    client.getRootFolders(),
  ]);
  return {
    qualityProfiles: qualityProfiles.map((p) => ({ id: p.id, name: p.name })),
    metadataProfiles: metadataProfiles.map((p) => ({ id: p.id, name: p.name })),
    rootFolders: rootFolders.map((r) => ({ id: r.id, path: r.path })),
  };
}

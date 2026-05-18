import { Logger } from "pino";
import { logger as appLogger } from "../logger.js";

export type LidarrArtist = {
  id: number;
  artistName: string;
  foreignArtistId: string;
  monitored: boolean;
};

export type LidarrAlbumStatistics = {
  trackCount: number;
  trackFileCount: number;
  percentOfTracks: number;
  sizeOnDisk: number;
};

export type LidarrAlbum = {
  id: number;
  title: string;
  foreignAlbumId: string;
  artistId: number;
  monitored: boolean;
  statistics?: LidarrAlbumStatistics;
};

export type LidarrQueueItem = {
  id: number;
  albumId: number;
  title: string;
  status: string;
};

type LidarrProfile = { id: number; name: string };
type LidarrRootFolder = { id: number; path: string };

export type LidarrDefaults = {
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath: string;
};

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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
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
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
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

  private cachedDefaults: LidarrDefaults | null = null;

  async getDefaults(): Promise<LidarrDefaults> {
    this.logger.debug("Fetching Lidarr defaults");
    if (this.cachedDefaults) return this.cachedDefaults;
    const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
      this.request<LidarrProfile[]>("GET", "/qualityprofile"),
      this.request<LidarrProfile[]>("GET", "/metadataprofile"),
      this.request<LidarrRootFolder[]>("GET", "/rootfolder"),
    ]);
    if (!qualityProfiles[0])
      throw new Error("Lidarr has no quality profiles configured");
    if (!metadataProfiles[0])
      throw new Error("Lidarr has no metadata profiles configured");
    if (!rootFolders[0])
      throw new Error("Lidarr has no root folders configured");
    this.cachedDefaults = {
      qualityProfileId: qualityProfiles[0].id,
      metadataProfileId: metadataProfiles[0].id,
      rootFolderPath: rootFolders[0].path,
    };
    return this.cachedDefaults;
  }

  async getArtists(): Promise<LidarrArtist[]> {
    this.logger.debug("Fetching all Lidarr artists");
    return this.request("GET", "/artist");
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
    return this.request("POST", "/artist", {
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
  }

  async getAlbumsForArtist(lidarrArtistId: number): Promise<LidarrAlbum[]> {
    this.logger.debug(`Fetching albums for Lidarr artist ${lidarrArtistId}`);
    return this.request("GET", `/album?artistId=${lidarrArtistId}`);
  }

  async getAlbumsByIds(ids: number[]): Promise<LidarrAlbum[]> {
    this.logger.debug(`Fetching albums by ids: ${ids.join(",")}`);
    if (ids.length === 0) return [];
    const query = ids.map((id) => `albumIds=${id}`).join("&");
    return this.request("GET", `/album?${query}`);
  }

  async setAlbumMonitored(albumId: number, monitored: boolean): Promise<void> {
    this.logger.debug(`Setting album ${albumId} as monitored: ${monitored}`);
    const album = await this.request<Record<string, unknown>>(
      "GET",
      `/album/${albumId}`,
    );
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
    const res = await this.request<{ records: LidarrQueueItem[] }>(
      "GET",
      "/queue?pageSize=1000",
    );
    return res.records ?? [];
  }
}

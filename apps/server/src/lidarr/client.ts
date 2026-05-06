export type LidarrArtist = {
  id: number;
  artistName: string;
  foreignArtistId: string;
  monitored: boolean;
};

export type LidarrAlbum = {
  id: number;
  title: string;
  foreignAlbumId: string;
  artistId: number;
  monitored: boolean;
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

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
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
    try {
      await this.request("GET", "/system/status");
      return true;
    } catch {
      return false;
    }
  }

  private cachedDefaults: LidarrDefaults | null = null;

  async getDefaults(): Promise<LidarrDefaults> {
    if (this.cachedDefaults) return this.cachedDefaults;
    const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
      this.request<LidarrProfile[]>("GET", "/qualityprofile"),
      this.request<LidarrProfile[]>("GET", "/metadataprofile"),
      this.request<LidarrRootFolder[]>("GET", "/rootfolder"),
    ]);
    if (!qualityProfiles[0]) throw new Error("Lidarr has no quality profiles configured");
    if (!metadataProfiles[0]) throw new Error("Lidarr has no metadata profiles configured");
    if (!rootFolders[0]) throw new Error("Lidarr has no root folders configured");
    this.cachedDefaults = {
      qualityProfileId: qualityProfiles[0].id,
      metadataProfileId: metadataProfiles[0].id,
      rootFolderPath: rootFolders[0].path,
    };
    return this.cachedDefaults;
  }

  async getArtists(): Promise<LidarrArtist[]> {
    return this.request("GET", "/artist");
  }

  async addArtist(params: {
    artistMbid: string;
    artistName: string;
    qualityProfileId: number;
    metadataProfileId: number;
    rootFolderPath: string;
  }): Promise<LidarrArtist> {
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
    return this.request("GET", `/album?artistId=${lidarrArtistId}`);
  }

  async setAlbumMonitored(albumId: number, monitored: boolean): Promise<void> {
    const album = await this.request<Record<string, unknown>>("GET", `/album/${albumId}`);
    await this.request("PUT", `/album/${albumId}`, { ...album, monitored });
  }

  async triggerAlbumSearch(albumId: number): Promise<void> {
    await this.request("POST", "/command", {
      name: "AlbumSearch",
      albumIds: [albumId],
    });
  }

  async getQueue(): Promise<LidarrQueueItem[]> {
    const res = await this.request<{ records: LidarrQueueItem[] }>(
      "GET",
      "/queue?pageSize=1000",
    );
    return res.records ?? [];
  }
}

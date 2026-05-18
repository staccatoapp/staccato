export type DownloadRequestStatus =
  | "requested"
  | "sent_to_lidarr"
  | "downloading"
  | "completed"
  | "failed";

export type DownloadRequest = {
  id: string;
  releaseGroupMbid: string;
  artistMbid: string;
  artistName: string;
  albumTitle: string | null;
  status: DownloadRequestStatus;
  errorMessage: string | null;
  lidarrAlbumId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type LidarrSettings = {
  url: string | null;
  apiKeySet: boolean;
  qualityProfileId: number | null;
  metadataProfileId: number | null;
  rootFolderPath: string | null;
};

export type LidarrProfileOption = { id: number; name: string };
export type LidarrRootFolderOption = { id: number; path: string };

export type LidarrOptions = {
  qualityProfiles: LidarrProfileOption[];
  metadataProfiles: LidarrProfileOption[];
  rootFolders: LidarrRootFolderOption[];
};

export type LidarrTestResult = {
  connected: boolean;
  options: LidarrOptions | null;
};

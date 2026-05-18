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
};

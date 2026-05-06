export type DownloadRequestStatus =
  | "requested"
  | "sent_to_lidarr"
  | "downloading"
  | "completed"
  | "failed";

export type DownloadRequest = {
  id: string;
  recordingMbid: string;
  artistName: string;
  trackTitle: string;
  albumTitle: string | null;
  status: DownloadRequestStatus;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type LidarrSettings = {
  url: string | null;
  apiKeySet: boolean;
};

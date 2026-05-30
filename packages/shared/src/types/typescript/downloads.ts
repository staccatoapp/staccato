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

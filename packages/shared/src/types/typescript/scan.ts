export type TrackStatusCounts = {
  pending: number;
  resolving: number;
  resolved: number;
  failed: number;
};

export type ScanProgress = {
  running: boolean;
  scanned: number;
  resolved: number;
  failed: number;
  inFlight: number;
  total: number | null;
  startedAt: string | null;
  completedAt: string | null;
  counts: TrackStatusCounts;
};

export interface ResolutionProgress {
  running: boolean;
  resolved: number;
  failed: number;
  total: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

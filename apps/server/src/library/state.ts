export interface LibraryProgress {
  running: boolean;
  // Incremented at discovery: a pending row now exists and is visible in the
  // library. Climbs at local-IO pace, ahead of `resolved`.
  scanned: number;
  // Incremented when the resolution stage commits a track (incl. fast path).
  resolved: number;
  failed: number;
  // Resolution-stage tasks currently in flight.
  inFlight: number;
  total: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export const libraryProgress: LibraryProgress = {
  running: false,
  scanned: 0,
  resolved: 0,
  failed: 0,
  inFlight: 0,
  total: null,
  startedAt: null,
  completedAt: null,
};

export function resetProgress(): void {
  libraryProgress.running = true;
  libraryProgress.scanned = 0;
  libraryProgress.resolved = 0;
  libraryProgress.failed = 0;
  libraryProgress.inFlight = 0;
  libraryProgress.total = null;
  libraryProgress.startedAt = new Date();
  libraryProgress.completedAt = null;
}

export function completeProgress(): void {
  libraryProgress.running = false;
  libraryProgress.completedAt = new Date();
}

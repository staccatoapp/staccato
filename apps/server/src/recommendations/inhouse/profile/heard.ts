export interface HeardRow {
  recordingMbid: string | null;
  playCount: number;
  lastListenedAtMs: number;
}

export interface HeardIndex {
  isHeard(recordingMbid: string): boolean;
  playCount(recordingMbid: string): number;
  lastPlayed(recordingMbid: string): number | null;
  readonly size: number;
}

/** Build the heard-index from listen aggregates. Keyed by recording MBID;
 * rows without an MBID are excluded (they can't be matched to candidates). */
export function buildHeardIndex(rows: HeardRow[]): HeardIndex {
  const byMbid = new Map<string, { playCount: number; lastPlayed: number }>();
  for (const row of rows) {
    if (!row.recordingMbid) continue;
    byMbid.set(row.recordingMbid, {
      playCount: row.playCount,
      lastPlayed: row.lastListenedAtMs,
    });
  }
  return {
    isHeard: (mbid) => byMbid.has(mbid),
    playCount: (mbid) => byMbid.get(mbid)?.playCount ?? 0,
    lastPlayed: (mbid) => byMbid.get(mbid)?.lastPlayed ?? null,
    get size() {
      return byMbid.size;
    },
  };
}

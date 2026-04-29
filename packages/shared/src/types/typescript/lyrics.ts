export type SyncedLyricsRow = {
  startingTime: number;
  lyrics: string;
};

export type TrackLyrics = {
  trackId: string;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: SyncedLyricsRow[] | null;
};

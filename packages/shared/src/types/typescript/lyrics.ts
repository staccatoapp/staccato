export type SyncedLyricsLine = {
  startingTime: number;
  lyrics: string;
};

export type TrackLyrics = {
  trackId: string;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: SyncedLyricsLine[] | null;
};

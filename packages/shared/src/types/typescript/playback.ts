export type PlaybackTrack = {
  id: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  artistName: string | null;
  coverArtUrl: string | null;
  durationSeconds: number | null;
};

export type PlaybackSession = {
  trackQueue: PlaybackTrack[];
  currentTrackIndex: number;
  currentTrackPositionInSeconds: number;
  currentTrackAccumulatedPlayTimeInSeconds: number;
  currentTrackListenEventCreated: boolean;
  isPlaying: boolean;
};

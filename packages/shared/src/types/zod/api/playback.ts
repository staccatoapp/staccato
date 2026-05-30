import { z } from "zod";
import { TrackArtistCreditSchema } from "./credits.js";

export const PlaybackTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  artistName: z.string().nullable(),
  coverArtUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  artists: z.array(TrackArtistCreditSchema),
});
export type PlaybackTrack = z.infer<typeof PlaybackTrackSchema>;

export const PlaybackSessionSchema = z.object({
  trackQueue: z.array(PlaybackTrackSchema),
  currentTrackIndex: z.number(),
  currentTrackPositionInSeconds: z.number(),
  currentTrackAccumulatedPlayTimeInSeconds: z.number(),
  currentTrackListenEventCreated: z.boolean(),
  isPlaying: z.boolean(),
});
export type PlaybackSession = z.infer<typeof PlaybackSessionSchema>;

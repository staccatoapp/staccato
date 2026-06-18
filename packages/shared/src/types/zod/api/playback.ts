import { z } from "zod";
import { TrackArtistCreditSchema } from "./credits.js";

export const PlaybackTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  artistName: z.string().nullable(),
  albumTitle: z.string().nullable(),
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

/**
 * Where a queued track was played from. Captured at enqueue time and threaded
 * through the play/queue requests so the server can stamp each recorded listen
 * with its origin (powering recently-played). Only album/playlist origins are
 * tracked; contextless plays (search, flat library) send no source.
 */
export const PlaybackSourceSchema = z.object({
  type: z.enum(["album", "playlist"]),
  id: z.string(),
});
export type PlaybackSource = z.infer<typeof PlaybackSourceSchema>;

/** Body of PUT /api/playback/session/play. */
export const PlaybackPlayRequestSchema = z.object({
  trackIds: z.array(z.string()),
  startIndex: z.number(),
  source: PlaybackSourceSchema.optional(),
});
export type PlaybackPlayRequest = z.infer<typeof PlaybackPlayRequestSchema>;

/** Body of POST/PUT /api/playback/session/queue. */
export const PlaybackQueueRequestSchema = z.object({
  trackIds: z.array(z.string()),
  source: PlaybackSourceSchema.optional(),
});
export type PlaybackQueueRequest = z.infer<typeof PlaybackQueueRequestSchema>;

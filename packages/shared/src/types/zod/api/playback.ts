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
  // The Staccato Connect device currently allowed to emit audio. null = no
  // device has claimed the session yet (the next client to connect claims it).
  activeDeviceId: z.string().nullable(),
});
export type PlaybackSession = z.infer<typeof PlaybackSessionSchema>;

// --- Staccato Connect: device awareness & switching ---

export const DeviceTypeSchema = z.enum(["mobile", "web"]);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const DeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  deviceType: DeviceTypeSchema,
  // True for the device that currently owns audio output (session.activeDeviceId).
  isActive: z.boolean(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DevicesResponseSchema = z.array(DeviceSchema);
export type DevicesResponse = z.infer<typeof DevicesResponseSchema>;

// The Staccato Connect real-time message envelope (ServerMessage / ClientMessage
// / TransportCommand) lives in ../../../playback/protocol.ts.

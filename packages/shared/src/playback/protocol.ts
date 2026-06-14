import { z } from "zod";
import {
  DevicesResponseSchema,
  PlaybackSessionSchema,
} from "../types/zod/api/playback.js";

/**
 * Staccato Connect real-time protocol. The playback WebSocket is bidirectional:
 *
 * - The server fans out authoritative state (`session-updated`), presence
 *   (`devices-updated`), and per-device control signals (relayed `command`,
 *   `yield`, `assume-active`) as {@link ServerMessage}s.
 * - Clients send {@link ClientMessage}s: the single active device reports its
 *   ground-truth playback state (`state-report`); any device issues transport
 *   intents (`command`) which the server relays to the active device.
 *
 * Authority is split by whether a thing needs a running clock: the active
 * device owns live position/play-state; the server owns the active-device
 * pointer, the queue, and durable last-known state. See
 * .claude/rules/server-architecture.md.
 */

/**
 * A transport intent. Absolute, never relative (`setPlaying`, not "toggle"), so
 * a command redelivered after a flaky reconnect is idempotent.
 */
export const TransportCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setPlaying"), value: z.boolean() }),
  z.object({ kind: z.literal("seek"), positionSeconds: z.number() }),
  z.object({ kind: z.literal("next") }),
  z.object({ kind: z.literal("prev") }),
  z.object({ kind: z.literal("jumpToIndex"), index: z.number() }),
]);
export type TransportCommand = z.infer<typeof TransportCommandSchema>;

/**
 * The active device's authoritative report of live playback state. `seq` is a
 * per-active-session monotonic counter (reset to 0 whenever the active device
 * changes) the server uses to drop stale/reordered reports.
 */
export const StateReportSchema = z.object({
  isPlaying: z.boolean(),
  currentTrackIndex: z.number(),
  positionSeconds: z.number(),
  accumulatedPlayTimeSeconds: z.number(),
  currentTrackListenEventCreated: z.boolean().optional(),
  seq: z.number(),
});
export type StateReport = z.infer<typeof StateReportSchema>;

// client -> server
export const ClientMessageSchema = z.discriminatedUnion("type", [
  // Active device only; the server rejects reports from any other connection.
  z.object({ type: z.literal("state-report"), data: StateReportSchema }),
  // Any device. The server relays it to the active device (or applies it to the
  // durable session row when no device is active).
  z.object({ type: z.literal("command"), data: TransportCommandSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// server -> client
export const ServerMessageSchema = z.discriminatedUnion("type", [
  // Sent once on connect: the deviceId the server assigned this connection, so
  // it can compute "am I the active device?".
  z.object({
    type: z.literal("connected"),
    data: z.object({ deviceId: z.string() }),
  }),
  // Authoritative session snapshot. `serverTimeMs` is the server's wall clock at
  // send time, so passive devices can dead-reckon position free of clock skew.
  z.object({
    type: z.literal("session-updated"),
    data: PlaybackSessionSchema,
    serverTimeMs: z.number(),
  }),
  z.object({
    type: z.literal("devices-updated"),
    data: DevicesResponseSchema,
  }),
  // A transport command relayed to the active device for it to execute.
  z.object({ type: z.literal("command"), data: TransportCommandSchema }),
  // Sent to the outgoing active device at handoff: pause, flush a final report,
  // become passive.
  z.object({
    type: z.literal("yield"),
    data: z.object({ reason: z.literal("handoff") }),
  }),
  // Sent to the incoming active device at handoff: pre-warm (load + seek) the
  // given track/position, then resume on the next authoritative session-updated.
  z.object({
    type: z.literal("assume-active"),
    data: z.object({
      trackId: z.string().nullable(),
      positionSeconds: z.number(),
      isPlaying: z.boolean(),
    }),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

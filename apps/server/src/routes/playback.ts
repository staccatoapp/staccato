import { FastifyPluginAsync, FastifyBaseLogger } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { z } from "zod";
import {
  appendToQueue,
  getOrCreatePlaybackSession,
  updatePlaybackSession,
  type PlaybackSessionRow,
} from "../db/queries/playback-session.js";
import {
  getExistingTrackIds,
  getPlaybackTracksByIds,
  type PlaybackTrackRow,
} from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { recordListen } from "../scrobbling/dispatch.js";
import {
  getLyricsByTrackId,
  getTrackMetaForLyrics,
  insertLyrics,
} from "../db/queries/track-lyrics.js";
import { fetchLyrics, parseSyncedLyrics } from "../lyrics/client.js";
import {
  ClientMessageSchema,
  getNextTrackState,
  getPrevTrackState,
  type ClientMessage,
  type Device,
  type DeviceType,
  type ServerMessage,
  type StateReport,
  type TrackLyrics,
  type TransportCommand,
} from "@staccato/shared";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import {
  computeActiveDeviceOnConnect,
  deviceRegistry,
} from "../playback/device-registry.js";
import { findAuthTokenById } from "../db/queries/auth-tokens.js";

/**
 * Staccato Connect handoffs in progress, keyed by userId. When a switch targets
 * a still-online active device we don't flip the pointer immediately: we ask the
 * outgoing device to `yield` and pre-warm the incoming one, then complete the
 * switch the moment the outgoing device flushes its final authoritative report
 * (or disconnects). This keeps the single-writer rule intact — the outgoing
 * device is still the active device when its flush is accepted.
 */
const pendingHandoffs = new Map<string, { from: string; to: string }>();

/**
 * The device id that last held the active role per user, recorded when it
 * disconnects. Lets the original owner reconnecting after a brief WS drop
 * reclaim its session without the forced "resume paused" that a *different*
 * device claiming an orphaned session gets (SC-2). Cleared once consumed.
 */
const lastActiveDeviceId = new Map<string, string>();

/** Test seam: clear in-process handoff state between cases. */
export function __resetConnectState(): void {
  pendingHandoffs.clear();
  lastActiveDeviceId.clear();
}

const playbackRoutes: FastifyPluginAsync = async (fastify) => {
  // Self-contained so route tests (which register this plugin on a bare Fastify)
  // and the WebSocket route below both work without app-level wiring.
  await fastify.register(fastifyWebsocket);

  fastify.get("/session", async (req) => {
    const session = getOrCreatePlaybackSession(req.userId);
    return buildSessionResponse(session);
  });

  // Staccato Connect: live, bidirectional playback channel. The active device
  // reports authoritative state (`state-report`) and any device sends transport
  // intents (`command`); the server relays commands to the active device and
  // broadcasts the resulting session to every connected device. Presence is the
  // WS connection itself (registered here, removed on close).
  fastify.get("/ws", { websocket: true }, (socket, req) => {
    const userId = req.userId;
    const query = req.query as { deviceId?: string; deviceName?: string };

    // CSWSH guard: WebSocket handshakes are exempt from the same-origin policy
    // but still carry the session cookie, so a malicious page could open this
    // socket as the victim. Reject cross-origin upgrades for cookie-authenticated
    // (web) connections. Bearer-authenticated (mobile, req.tokenId set) clients
    // don't rely on the cookie and a foreign page can't forge the Authorization
    // header, so they are exempt.
    if (!req.tokenId && isCrossOriginWebSocket(req)) {
      req.log.warn(
        { userId, origin: req.headers.origin },
        "playback ws: rejected cross-origin upgrade",
      );
      socket.close(1008, "bad origin");
      return;
    }

    // Mobile clients are identified by their bearer token id; web clients (cookie
    // auth, no token) supply a client-generated deviceId on the handshake.
    const deviceId = req.tokenId ?? query.deviceId;
    if (!deviceId) {
      req.log.warn(
        { userId },
        "playback ws: connection without a device id, closing",
      );
      socket.close(1008, "deviceId required");
      return;
    }
    const deviceType: DeviceType = req.tokenId ? "mobile" : "web";
    let deviceName: string;
    if (req.tokenId) {
      const tokenRow = findAuthTokenById(req.tokenId);
      deviceName = tokenRow?.deviceName ?? "Mobile device";
    } else {
      deviceName = query.deviceName?.slice(0, 100) || "Web player";
    }

    const send = (message: ServerMessage) => {
      socket.send(JSON.stringify(message));
    };

    const connId = handleDeviceConnect(
      { userId, deviceId, deviceName, deviceType, log: req.log },
      send,
    );

    socket.on("message", (raw: Buffer) => {
      let message: ClientMessage;
      try {
        message = ClientMessageSchema.parse(JSON.parse(raw.toString()));
      } catch (err) {
        req.log.warn(
          { err, userId, deviceId },
          "playback ws: failed to parse client message",
        );
        return;
      }
      try {
        handleClientMessage({ userId, deviceId, log: req.log }, message);
      } catch (err) {
        req.log.error(
          { err, userId, deviceId, messageType: message.type },
          "playback ws: failed to handle client message",
        );
      }
    });

    // Heartbeat: native WebSocket clients don't always notice half-open sockets,
    // so ping periodically and terminate a connection that stops ponging.
    let alive = true;
    socket.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        req.log.warn(
          { userId, deviceId },
          "playback ws heartbeat timed out, terminating",
        );
        socket.terminate();
        return;
      }
      alive = false;
      try {
        socket.ping();
      } catch (err) {
        req.log.warn({ err, userId, deviceId }, "playback ws ping failed");
      }
    }, 30_000);

    socket.on("error", (err: Error) => {
      req.log.warn({ err, userId, deviceId }, "playback ws error");
    });

    socket.on("close", () => {
      clearInterval(heartbeat);
      handleDeviceDisconnect({ userId, deviceId, connId, log: req.log });
    });
  });

  // Lists the user's online Staccato Connect devices (presence = live WS).
  fastify.get("/devices", async (req) => {
    const session = getOrCreatePlaybackSession(req.userId);
    return buildDevicesResponse(req.userId, session.activeDeviceId);
  });

  // Hands audio output to another online device (the "Connect to a device" tap).
  fastify.put("/devices/active", async (req, reply) => {
    const parsed = z.object({ deviceId: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      req.log.warn(
        { err: parsed.error },
        "PUT /devices/active: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { deviceId } = parsed.data;
    if (!deviceRegistry.isOnline(req.userId, deviceId)) {
      req.log.warn(
        { userId: req.userId, deviceId },
        "PUT /devices/active: target device is not online",
      );
      return reply.status(404).send({ error: "device-not-online" });
    }

    const session = getOrCreatePlaybackSession(req.userId);
    const outgoing = session.activeDeviceId;

    // Orchestrated handoff: the outgoing device is online, so ask it to yield a
    // final exact position and pre-warm the incoming device. The active pointer
    // flips when that flush arrives (handleClientMessage), so the incoming device
    // resumes from the precise position instead of a stale one.
    if (
      outgoing &&
      outgoing !== deviceId &&
      deviceRegistry.isOnline(req.userId, outgoing)
    ) {
      pendingHandoffs.set(req.userId, { from: outgoing, to: deviceId });
      const currentTrackId =
        session.trackQueue[session.currentTrackIndex] ?? null;
      deviceRegistry.sendTo(req.userId, deviceId, {
        type: "assume-active",
        data: {
          trackId: currentTrackId,
          positionSeconds: session.currentTrackPositionInSeconds,
          isPlaying: session.isPlaying,
        },
      });
      deviceRegistry.sendTo(req.userId, outgoing, {
        type: "yield",
        data: { reason: "handoff" },
      });
      return buildSessionResponse(session);
    }

    // No online outgoing device: switch immediately (nothing to flush).
    const updated = updatePlaybackSession(req.userId, {
      activeDeviceId: deviceId,
      stateSeq: 0,
      playbackUpdatedAtMs: Date.now(),
    });
    const response = buildSessionResponse(updated);
    broadcastSession(req.userId, updated);
    broadcastDevices(req.userId, deviceId);
    return response;
  });

  // TODO(queue-items): queue order via array index breaks when items insert
  // ahead of the current track. Switch to fractional indexing + a queue_items
  // table in a future plan.
  fastify.post("/session/queue", async (req, reply) => {
    const parsedQueue = z
      .object({ trackIds: z.array(z.string()) })
      .safeParse(req.body);
    if (!parsedQueue.success) {
      req.log.warn(
        { err: parsedQueue.error },
        "POST /session/queue: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { trackIds } = parsedQueue.data;
    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    getOrCreatePlaybackSession(req.userId);
    const session = appendToQueue(req.userId, valid);
    return respondWithSession(req.userId, session);
  });

  // TODO(queue-items): see comment on POST /session/queue.
  fastify.put("/session/queue", async (req, reply) => {
    const parsedQueue = z
      .object({ trackIds: z.array(z.string()) })
      .safeParse(req.body);
    if (!parsedQueue.success) {
      req.log.warn(
        { err: parsedQueue.error },
        "PUT /session/queue: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { trackIds } = parsedQueue.data;
    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0 && trackIds.length > 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    getOrCreatePlaybackSession(req.userId);
    const session = updatePlaybackSession(req.userId, { trackQueue: valid });
    return respondWithSession(req.userId, session);
  });

  fastify.put("/session/play", async (req, reply) => {
    const parsedPlay = z
      .object({
        trackIds: z.array(z.string()),
        startIndex: z.number(),
      })
      .safeParse(req.body);
    if (!parsedPlay.success) {
      req.log.warn(
        { err: parsedPlay.error },
        "PUT /session/play: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { trackIds, startIndex } = parsedPlay.data;

    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    const safeStartIndex = (() => {
      const target = trackIds[startIndex];
      if (target) {
        const translated = valid.indexOf(target);
        if (translated >= 0) return translated;
      }
      return Math.max(0, Math.min(startIndex, valid.length - 1));
    })();

    getOrCreatePlaybackSession(req.userId);
    const session = updatePlaybackSession(req.userId, {
      trackQueue: valid,
      currentTrackIndex: safeStartIndex,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
      isPlaying: true,
      playbackUpdatedAtMs: Date.now(),
    });

    return respondWithSession(req.userId, session);
  });

  fastify.get("/lyrics", async (req, reply) => {
    const parsedQuery = z.object({ trackId: z.string() }).safeParse(req.query);
    if (!parsedQuery.success) {
      req.log.warn(
        { err: parsedQuery.error },
        "GET /lyrics: missing or invalid trackId query param",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { trackId } = parsedQuery.data;

    let row = getLyricsByTrackId(trackId);

    if (!row) {
      const meta = getTrackMetaForLyrics(trackId);
      if (!meta) return reply.status(204).send();

      const fetched = await fetchLyrics({
        artistName: meta.artistName,
        trackName: meta.trackTitle,
        albumName: meta.albumTitle ?? "",
        durationSeconds: meta.durationSeconds ?? 0,
      });

      row = insertLyrics({
        trackId,
        instrumental: fetched?.instrumental ?? false,
        plainLyrics: fetched?.plainLyrics ?? null,
        syncedLyrics: fetched?.syncedLyrics ?? null,
      });
    }

    if (row.instrumental || (!row.plainLyrics && !row.syncedLyrics)) {
      return reply.status(204).send();
    }

    const result: TrackLyrics = {
      trackId,
      instrumental: row.instrumental,
      plainLyrics: row.plainLyrics ?? null,
      syncedLyrics: row.syncedLyrics
        ? parseSyncedLyrics(row.syncedLyrics)
        : null,
    };

    return result;
  });
};

interface DeviceContext {
  userId: string;
  deviceId: string;
  log: FastifyBaseLogger;
}

/**
 * A device opened its playback socket: register presence, auto-claim the active
 * role when nobody owns it or the owner is offline (resuming paused — there is
 * no live clock to inherit), and send this connection its id + the current
 * session/device snapshots.
 */
export function handleDeviceConnect(
  ctx: DeviceContext & { deviceName: string; deviceType: DeviceType },
  send: (message: ServerMessage) => void,
): number {
  const { userId, deviceId, deviceName, deviceType, log } = ctx;
  const connId = deviceRegistry.register({
    deviceId,
    deviceName,
    deviceType,
    userId,
    send,
  });
  log.info({ userId, deviceId, deviceType }, "playback device connected");

  const session = getOrCreatePlaybackSession(userId);
  const resolvedActive = computeActiveDeviceOnConnect({
    currentActiveDeviceId: session.activeDeviceId,
    connectingDeviceId: deviceId,
    isActiveOnline: session.activeDeviceId
      ? deviceRegistry.isOnline(userId, session.activeDeviceId)
      : false,
  });
  const activeChanged = resolvedActive !== session.activeDeviceId;
  // The original owner reconnecting after a brief drop reclaims its session and
  // keeps playing; only a *different* device claiming an orphaned session
  // resumes paused (no live clock to inherit). See SC-2.
  const reclaimingPriorOwner =
    activeChanged && lastActiveDeviceId.get(userId) === resolvedActive;
  if (activeChanged) lastActiveDeviceId.delete(userId);
  const currentSession = activeChanged
    ? updatePlaybackSession(userId, {
        activeDeviceId: resolvedActive,
        // Reset the report counter for the new owner. Preserve isPlaying for the
        // reconnecting owner; force paused only for a different claimant.
        ...(reclaimingPriorOwner ? {} : { isPlaying: false }),
        stateSeq: 0,
        playbackUpdatedAtMs: Date.now(),
      })
    : session;

  // Tell the device its own id (so it can compute "am I the active device?")
  // then the current session snapshot. On auto-claim the broadcast below already
  // fans the snapshot to every connection including this one, so sending it
  // directly too would deliver session-updated twice — the controller would run
  // applySessionUpdate a second time, re-issuing play()/pause() and racing the
  // in-flight audio load (SC-9). Send it directly only when nothing broadcasts.
  send({ type: "connected", data: { deviceId } });
  if (!activeChanged) {
    send(sessionUpdatedMessage(buildSessionResponse(currentSession)));
  }
  // Presence changed: every connection needs the new device list.
  broadcastDevices(userId, resolvedActive);
  if (activeChanged) broadcastSession(userId, currentSession);
  return connId;
}

/**
 * A device closed its socket: drop presence. If it was mid-handoff, complete the
 * pending switch to the incoming device; otherwise, if it owned the active role,
 * release it so the next connector can auto-claim.
 */
export function handleDeviceDisconnect(
  ctx: DeviceContext & { connId: number },
): void {
  const { userId, deviceId, connId, log } = ctx;
  deviceRegistry.unregister(userId, deviceId, connId);
  log.info({ userId, deviceId }, "playback device disconnected");

  const pending = pendingHandoffs.get(userId);
  if (pending && pending.from === deviceId) {
    pendingHandoffs.delete(userId);
    completeHandoff(userId, pending.to);
    return;
  }

  const latest = getOrCreatePlaybackSession(userId);
  const wasActive = latest.activeDeviceId === deviceId;
  // Remember the departing owner so a quick reconnect keeps its play state
  // instead of being force-paused on reclaim (SC-2).
  if (wasActive) lastActiveDeviceId.set(userId, deviceId);
  const after = wasActive
    ? updatePlaybackSession(userId, { activeDeviceId: null })
    : latest;
  if (wasActive) broadcastSession(userId, after);
  broadcastDevices(userId, after.activeDeviceId);
}

/** Route an inbound client message. Exported for unit testing the WS protocol. */
export function handleClientMessage(
  ctx: DeviceContext,
  message: ClientMessage,
): void {
  const { userId, deviceId, log } = ctx;

  if (message.type === "state-report") {
    const row = getOrCreatePlaybackSession(userId);
    // Single-writer rule: only the active device may write playback state.
    if (deviceId !== row.activeDeviceId) {
      log.warn(
        { userId, deviceId, activeDeviceId: row.activeDeviceId },
        "playback: state-report from non-active device, dropping",
      );
      return;
    }
    // Stale/reordered guard (e.g. a late report from a reconnect window).
    if (message.data.seq <= row.stateSeq) {
      log.debug(
        { userId, deviceId, seq: message.data.seq, stateSeq: row.stateSeq },
        "playback: dropping stale state-report",
      );
      return;
    }
    const updated = applyStateReport(userId, row, message.data, log);

    // The outgoing device's flush completes a pending handoff.
    const pending = pendingHandoffs.get(userId);
    if (pending && pending.from === deviceId) {
      pendingHandoffs.delete(userId);
      completeHandoff(userId, pending.to);
      return;
    }
    broadcastSession(userId, updated);
    return;
  }

  // command: relay to the active device, or apply to the durable row when none.
  const row = getOrCreatePlaybackSession(userId);
  if (
    row.activeDeviceId &&
    deviceRegistry.isOnline(userId, row.activeDeviceId)
  ) {
    deviceRegistry.sendTo(userId, row.activeDeviceId, {
      type: "command",
      data: message.data,
    });
    return;
  }
  const updated = applyCommandToRow(userId, row, message.data);
  if (updated) broadcastSession(userId, updated);
}

/**
 * Persist an authoritative state-report and fire the listen-event when the
 * play-time threshold trips (see .claude/rules/listen-events.md). Stamps the
 * server receipt time and the report's seq for ordering. Does not broadcast —
 * the caller decides (a pending handoff folds it into a single broadcast).
 */
function applyStateReport(
  userId: string,
  current: PlaybackSessionRow,
  report: StateReport,
  log: FastifyBaseLogger,
): PlaybackSessionRow {
  const currentTrackId = current.trackQueue[report.currentTrackIndex];
  const currentTrackDurationSeconds = currentTrackId
    ? getTrackDurationSeconds(currentTrackId)
    : null;

  let listenEventCreated = current.currentTrackListenEventCreated;
  // only scrobble if listened to more than half the track or 4 mins as per
  // listenbrainz docs.
  if (
    !current.currentTrackListenEventCreated &&
    report.isPlaying &&
    report.accumulatedPlayTimeSeconds >
      Math.min(240, (currentTrackDurationSeconds ?? 480) / 2)
  ) {
    if (currentTrackId) {
      recordListen(userId, currentTrackId, log).catch(() => {
        /* logged inside */
      });
    } else {
      log.warn(
        { userId, currentTrackIndex: report.currentTrackIndex },
        "scrobble triggered but no track at currentTrackIndex",
      );
    }
    listenEventCreated = true;
  }

  return updatePlaybackSession(userId, {
    isPlaying: report.isPlaying,
    currentTrackIndex: report.currentTrackIndex,
    currentTrackPositionInSeconds: report.positionSeconds,
    currentTrackAccumulatedPlayTimeInSeconds: report.accumulatedPlayTimeSeconds,
    currentTrackListenEventCreated:
      report.currentTrackListenEventCreated ?? listenEventCreated,
    stateSeq: report.seq,
    playbackUpdatedAtMs: Date.now(),
  });
}

/**
 * Apply a transport command directly to the durable session row. Only used when
 * no device is active (no live clock to conflict with); otherwise commands are
 * relayed to the active device.
 */
function applyCommandToRow(
  userId: string,
  row: PlaybackSessionRow,
  cmd: TransportCommand,
): PlaybackSessionRow | null {
  const now = Date.now();
  switch (cmd.kind) {
    case "setPlaying":
      return updatePlaybackSession(userId, {
        isPlaying: cmd.value,
        playbackUpdatedAtMs: now,
      });
    case "seek":
      return updatePlaybackSession(userId, {
        currentTrackPositionInSeconds: cmd.positionSeconds,
        playbackUpdatedAtMs: now,
      });
    case "next": {
      const s = getNextTrackState(row.currentTrackIndex, row.trackQueue.length);
      return updatePlaybackSession(userId, { ...s, playbackUpdatedAtMs: now });
    }
    case "prev": {
      const s = getPrevTrackState(
        row.currentTrackIndex,
        row.currentTrackPositionInSeconds,
        row.isPlaying,
        row.currentTrackAccumulatedPlayTimeInSeconds,
      );
      return updatePlaybackSession(userId, { ...s, playbackUpdatedAtMs: now });
    }
    case "jumpToIndex":
      if (cmd.index < 0 || cmd.index >= row.trackQueue.length) return null;
      return updatePlaybackSession(userId, {
        isPlaying: true,
        currentTrackIndex: cmd.index,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: 0,
        currentTrackListenEventCreated: false,
        playbackUpdatedAtMs: now,
      });
  }
}

/** Flip the active pointer to the incoming device (or release it if that device
 *  went offline mid-handoff) and broadcast the result. */
function completeHandoff(userId: string, to: string): void {
  const target = deviceRegistry.isOnline(userId, to) ? to : null;
  const updated = updatePlaybackSession(userId, {
    activeDeviceId: target,
    stateSeq: 0,
    playbackUpdatedAtMs: Date.now(),
  });
  broadcastSession(userId, updated);
  broadcastDevices(userId, updated.activeDeviceId);
}

function filterExistingTrackIds(trackIds: string[]): string[] {
  const existing = getExistingTrackIds(trackIds);
  return trackIds.filter((id) => existing.has(id));
}

function getTrackDurationSeconds(trackId: string): number | null {
  const [track] = getPlaybackTracksByIds([trackId]);
  return track?.durationSeconds ?? null;
}

function orderTracksByQueue(
  queue: string[],
  tracks: PlaybackTrackRow[],
): PlaybackTrackRow[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return queue
    .map((id) => byId.get(id))
    .filter((t): t is PlaybackTrackRow => t !== undefined);
}

function buildSessionResponse(session: PlaybackSessionRow) {
  const sessionTracks = getPlaybackTracksByIds(session.trackQueue);
  const credits = groupCreditsByTrack(
    listTrackArtistsForTracks(session.trackQueue),
  );
  const orderedTracks = orderTracksByQueue(
    session.trackQueue,
    sessionTracks,
  ).map((t) => ({
    ...t,
    coverArtUrl: t.albumId
      ? resolveAlbumCoverNow({
          albumId: t.albumId,
          releaseGroupMbid: t.releaseGroupMbid,
          coverArtUrl: t.coverArtUrl,
        })
      : t.coverArtUrl,
    artists: credits.get(t.id) ?? [],
  }));

  return {
    trackQueue: orderedTracks,
    currentTrackIndex: session.currentTrackIndex,
    currentTrackPositionInSeconds: session.currentTrackPositionInSeconds,
    currentTrackAccumulatedPlayTimeInSeconds:
      session.currentTrackAccumulatedPlayTimeInSeconds,
    currentTrackListenEventCreated: session.currentTrackListenEventCreated,
    isPlaying: session.isPlaying,
    activeDeviceId: session.activeDeviceId,
  };
}

type SessionResponse = ReturnType<typeof buildSessionResponse>;

/** Wrap a session response in a session-updated message, stamped with the server
 *  clock so passive devices can dead-reckon position free of clock skew. */
function sessionUpdatedMessage(response: SessionResponse): ServerMessage {
  return { type: "session-updated", data: response, serverTimeMs: Date.now() };
}

function broadcastSession(userId: string, session: PlaybackSessionRow): void {
  deviceRegistry.broadcast(
    userId,
    sessionUpdatedMessage(buildSessionResponse(session)),
  );
}

function broadcastDevices(userId: string, activeDeviceId: string | null): void {
  deviceRegistry.broadcast(userId, {
    type: "devices-updated",
    data: buildDevicesResponse(userId, activeDeviceId),
  });
}

// Builds + broadcasts the new session to every connected device after a REST
// mutation, then returns it to the caller.
function respondWithSession(
  userId: string,
  session: PlaybackSessionRow,
): SessionResponse {
  const response = buildSessionResponse(session);
  deviceRegistry.broadcast(userId, sessionUpdatedMessage(response));
  return response;
}

/**
 * True when a WebSocket upgrade is cross-origin (or its Origin is missing or
 * unparseable). Used to block Cross-Site WebSocket Hijacking on the cookie-authed
 * web path: a legitimate browser handshake's Origin host matches the request
 * host (the SPA is served same-origin).
 *
 * Compares against Fastify's resolved `req.host` rather than the raw `Host`
 * header so a reverse proxy that rewrites Host to an internal upstream name
 * doesn't lock out legitimate web clients: with `trustProxy` enabled, `req.host`
 * is derived from `X-Forwarded-Host` (the external URL the browser used) and
 * keeps the port, matching `new URL(origin).host`. See SC-4.
 */
export function isCrossOriginWebSocket(req: {
  headers: { origin?: string };
  host: string;
}): boolean {
  const { origin } = req.headers;
  if (!origin) return true;
  try {
    return new URL(origin).host !== req.host;
  } catch {
    return true;
  }
}

function buildDevicesResponse(
  userId: string,
  activeDeviceId: string | null,
): Device[] {
  return deviceRegistry.listForUser(userId).map((c) => ({
    deviceId: c.deviceId,
    deviceName: c.deviceName,
    deviceType: c.deviceType,
    isActive: c.deviceId === activeDeviceId,
  }));
}

export default playbackRoutes;

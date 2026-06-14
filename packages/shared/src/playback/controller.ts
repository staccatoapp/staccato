import type { PlaybackSession } from "../types/zod/api/playback.js";
import type { ClientMessage, ServerMessage, TransportCommand } from "./protocol.js";
import {
  computePlayDelta,
  getNextTrackState,
  getPrevTrackState,
  MAX_PLAYBACK_DELTA_SECONDS,
  type TrackChangeState,
} from "./transitions.js";

/**
 * Thin per-app wrapper over the real audio player. The controller never touches
 * URLs or auth — `load(trackId)` lets each app build its own stream URL/headers.
 */
export interface PlayerAdapter {
  load(trackId: string): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getPosition(): number;
  getDuration(): number | null;
}

/** What the player UI renders. Queue/track metadata is read separately from the
 *  session query cache; this carries only the volatile transport state. */
export interface PlaybackViewState {
  isActiveDevice: boolean;
  isPlaying: boolean;
  currentTrackIndex: number;
  displayPositionSeconds: number;
  durationSeconds: number;
}

export interface PlaybackControllerOptions {
  adapter: PlayerAdapter;
  send: (message: ClientMessage) => void;
  now?: () => number;
}

/**
 * Framework-agnostic Staccato Connect playback state machine, shared by the web
 * and mobile clients (each supplies a {@link PlayerAdapter}). It implements the
 * hybrid-authority model: the active device owns the live clock (it drives its
 * real player and reports authoritative state); passive devices send commands
 * and render an interpolated, clock-skew-free position. The host drives time by
 * calling {@link PlaybackController.heartbeat} (no timers live in here, so the
 * machine is fully unit-testable). See .claude/rules/server-architecture.md.
 */
export class PlaybackController {
  private readonly adapter: PlayerAdapter;
  private readonly send: (message: ClientMessage) => void;
  private readonly now: () => number;
  private readonly listeners = new Set<(v: PlaybackViewState) => void>();

  private myDeviceId: string | null = null;
  private session: PlaybackSession | null = null;
  private loadedTrackId: string | null = null;

  /** Monotonic per-active-session report counter; reset on every takeover. */
  private seq = 0;
  /** Genuine accumulated play time for the current track (scrobble accounting). */
  private accumulated = 0;
  /** Last player position sampled, to derive genuine play deltas. */
  private lastPlayerPos: number | null = null;

  /** server clock − local clock, captured at the last session-updated, so
   *  passive interpolation runs on the server timeline (skew-free). */
  private clockOffsetMs = 0;
  /** serverTimeMs of the last session-updated (the interpolation base instant). */
  private baseServerMs = 0;

  /** Set on `yield`: suppress active behaviour until the next session-updated so
   *  the outgoing device stops reporting the instant it hands off. */
  private suppressActive = false;
  /** Set on `assume-active`: the incoming device is pre-warmed and waiting for
   *  the authoritative session-updated before it resumes. */
  private awaitingResume = false;

  /** Optimistic overlays for snappy local UI, cleared on every session-updated. */
  private overlayIsPlaying: boolean | null = null;
  private overlayBasePos: number | null = null;
  private overlayBaseServerMs: number | null = null;

  constructor(opts: PlaybackControllerOptions) {
    this.adapter = opts.adapter;
    this.send = opts.send;
    this.now = opts.now ?? (() => Date.now());
  }

  // --- inputs -------------------------------------------------------------

  onServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "connected":
        this.myDeviceId = message.data.deviceId;
        this.emit();
        return;
      case "session-updated":
        this.applySessionUpdate(message.data, message.serverTimeMs);
        return;
      case "command":
        // The server only relays commands to the active device.
        if (this.isActive()) this.executeCommand(message.data);
        return;
      case "yield":
        this.handleYield();
        return;
      case "assume-active":
        this.handleAssumeActive(message.data);
        return;
      case "devices-updated":
        // Presence is rendered from the devices query cache, not here.
        return;
    }
  }

  /** A transport command from this device's own UI. */
  command(cmd: TransportCommand): void {
    if (this.isActive()) {
      this.executeCommand(cmd);
      return;
    }
    // Passive: optimistically reflect the common cases (decision: snappy UI),
    // then relay to the server so it reaches the active device.
    if (cmd.kind === "setPlaying") {
      this.overlayIsPlaying = cmd.value;
    } else if (cmd.kind === "seek") {
      this.overlayBasePos = cmd.positionSeconds;
      this.overlayBaseServerMs = this.serverNow();
    }
    this.send({ type: "command", data: cmd });
    this.emit();
  }

  /** The current track finished. Only the active device advances the queue. */
  onEnded(): void {
    if (!this.isActive() || !this.session) return;
    this.applyTrackChange(
      getNextTrackState(this.session.currentTrackIndex, this.session.trackQueue.length),
    );
  }

  /** The player's play/pause flipped outside our control (lock screen, audio
   *  interruption). The active device reports the new state. */
  onExternalPlayPause(isPlaying: boolean): void {
    if (!this.isActive() || !this.session) return;
    // Ignore events that merely echo our own intent (the controller's own
    // play()/pause() calls fire DOM play/pause events too); only a genuine
    // external flip — e.g. a media key — diverges and is worth reporting.
    if (isPlaying === this.isIntendedPlaying()) return;
    this.overlayIsPlaying = isPlaying;
    this.report({
      isPlaying,
      currentTrackIndex: this.session.currentTrackIndex,
      positionSeconds: this.adapter.getPosition(),
    });
  }

  /** Host clock tick (~every 500ms). Active+playing → report; always re-renders
   *  so the passive interpolated position advances. */
  heartbeat(): void {
    if (this.isActive() && this.session && this.isIntendedPlaying()) {
      const pos = this.adapter.getPosition();
      this.accumulated += computePlayDelta(this.lastPlayerPos, pos);
      this.lastPlayerPos = pos;
      this.report({
        isPlaying: true,
        currentTrackIndex: this.session.currentTrackIndex,
        positionSeconds: pos,
      });
    }
    this.emit();
  }

  // --- outputs ------------------------------------------------------------

  getViewState(): PlaybackViewState {
    const session = this.session;
    const index = session?.currentTrackIndex ?? 0;
    const track = session?.trackQueue[index];
    const isActive = this.isActive();
    const isPlaying = this.isIntendedPlaying();
    const duration =
      (isActive ? this.adapter.getDuration() : null) ?? track?.durationSeconds ?? 0;

    let displayPositionSeconds: number;
    if (isActive) {
      displayPositionSeconds = this.adapter.getPosition();
    } else {
      const base = this.overlayBasePos ?? session?.currentTrackPositionInSeconds ?? 0;
      const baseAt = this.overlayBaseServerMs ?? this.baseServerMs;
      const elapsed = isPlaying ? Math.max(0, (this.serverNow() - baseAt) / 1000) : 0;
      const projected = Math.max(0, base + elapsed);
      displayPositionSeconds = duration > 0 ? Math.min(projected, duration) : projected;
    }

    return {
      isActiveDevice: isActive,
      isPlaying,
      currentTrackIndex: index,
      displayPositionSeconds,
      durationSeconds: duration,
    };
  }

  subscribe(listener: (v: PlaybackViewState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- internals ----------------------------------------------------------

  private isActive(): boolean {
    return (
      !this.suppressActive &&
      this.myDeviceId !== null &&
      this.session?.activeDeviceId === this.myDeviceId
    );
  }

  /** Intended play state: optimistic overlay if present, else the session. */
  private isIntendedPlaying(): boolean {
    return this.overlayIsPlaying ?? this.session?.isPlaying ?? false;
  }

  private serverNow(): number {
    return this.now() + this.clockOffsetMs;
  }

  private applySessionUpdate(data: PlaybackSession, serverTimeMs: number): void {
    const wasActive = this.isActive();
    this.session = data;
    this.clockOffsetMs = serverTimeMs - this.now();
    this.baseServerMs = serverTimeMs;
    this.suppressActive = false;
    this.overlayIsPlaying = null;
    this.overlayBasePos = null;
    this.overlayBaseServerMs = null;

    if (this.isActive()) {
      this.reconcileActivePlayer(!wasActive || this.awaitingResume);
    } else {
      // Passive (or just lost active): the local player must stay silent.
      this.adapter.pause();
    }
    this.emit();
  }

  private reconcileActivePlayer(takeover: boolean): void {
    const session = this.session;
    if (!session) return;
    const track = session.trackQueue[session.currentTrackIndex];
    const trackId = track?.id ?? null;
    const trackChanged = trackId !== this.loadedTrackId;

    if (takeover) {
      this.seq = 0;
      // The pre-warm wait ends the moment we take over, even for an empty queue
      // (trackId null). Clearing it only inside the track-load block below would
      // leave awaitingResume stuck on a trackId:null handoff, so every later
      // session-updated would re-takeover and reset seq to 0 — the device's
      // reports then come in stale and the server drops them (SC-6).
      this.awaitingResume = false;
    }

    // A same-track server-side reset (e.g. PUT /session/play replaying the
    // current track rewinds position + accumulated to 0 on the durable row)
    // doesn't change the track id, so without this it would be skipped: the
    // track wouldn't restart and our now-stale (high) accumulator would re-trip
    // the re-armed scrobble gate, double-counting the listen (SC-5). Require a
    // backwards jump in *both* position and accumulated beyond the seek
    // threshold so the active device's normally-slightly-ahead live values
    // (floor + echo lag) during steady-state playback are never clobbered.
    const serverRewound =
      session.currentTrackPositionInSeconds + MAX_PLAYBACK_DELTA_SECONDS <
        (this.lastPlayerPos ?? 0) &&
      session.currentTrackAccumulatedPlayTimeInSeconds +
        MAX_PLAYBACK_DELTA_SECONDS <
        this.accumulated;

    if (trackId && (takeover || trackChanged || serverRewound)) {
      if (trackChanged) {
        this.adapter.load(trackId);
        this.loadedTrackId = trackId;
      }
      this.adapter.seek(session.currentTrackPositionInSeconds);
      this.lastPlayerPos = session.currentTrackPositionInSeconds;
      this.accumulated = session.currentTrackAccumulatedPlayTimeInSeconds;
    }
    if (session.isPlaying) this.adapter.play();
    else this.adapter.pause();
  }

  private executeCommand(cmd: TransportCommand): void {
    const session = this.session;
    if (!session) return;
    switch (cmd.kind) {
      case "setPlaying":
        this.overlayIsPlaying = cmd.value;
        if (cmd.value) this.adapter.play();
        else this.adapter.pause();
        this.report({
          isPlaying: cmd.value,
          currentTrackIndex: session.currentTrackIndex,
          positionSeconds: this.adapter.getPosition(),
        });
        return;
      case "seek":
        this.adapter.seek(cmd.positionSeconds);
        this.lastPlayerPos = cmd.positionSeconds;
        this.report({
          isPlaying: this.isIntendedPlaying(),
          currentTrackIndex: session.currentTrackIndex,
          positionSeconds: cmd.positionSeconds,
        });
        return;
      case "next":
        this.applyTrackChange(
          getNextTrackState(session.currentTrackIndex, session.trackQueue.length),
        );
        return;
      case "prev":
        this.applyTrackChange(
          getPrevTrackState(
            session.currentTrackIndex,
            this.adapter.getPosition(),
            session.isPlaying,
            this.accumulated,
          ),
        );
        return;
      case "jumpToIndex":
        if (cmd.index < 0 || cmd.index >= session.trackQueue.length) return;
        this.applyTrackChange({
          isPlaying: true,
          currentTrackIndex: cmd.index,
          currentTrackPositionInSeconds: 0,
          currentTrackAccumulatedPlayTimeInSeconds: 0,
          currentTrackListenEventCreated: false,
        });
        return;
    }
  }

  private applyTrackChange(state: TrackChangeState): void {
    const session = this.session;
    if (!session) return;
    const track = session.trackQueue[state.currentTrackIndex];
    if (track) {
      if (track.id !== this.loadedTrackId) {
        this.adapter.load(track.id);
        this.loadedTrackId = track.id;
      }
      this.adapter.seek(state.currentTrackPositionInSeconds);
    }
    this.accumulated = state.currentTrackAccumulatedPlayTimeInSeconds;
    this.lastPlayerPos = state.currentTrackPositionInSeconds;
    this.overlayIsPlaying = state.isPlaying;
    if (state.isPlaying) this.adapter.play();
    else this.adapter.pause();
    this.report({
      isPlaying: state.isPlaying,
      currentTrackIndex: state.currentTrackIndex,
      positionSeconds: state.currentTrackPositionInSeconds,
      currentTrackListenEventCreated: state.currentTrackListenEventCreated,
    });
  }

  private handleYield(): void {
    const session = this.session;
    this.adapter.pause();
    // Report the *intended* play state (honouring an in-flight optimistic
    // pause), not the last server-acked session.isPlaying — otherwise a pause
    // that hasn't round-tripped yet would tell the incoming device to resume
    // audio the user just stopped (SC-3). Yielding still pauses locally.
    this.report({
      isPlaying: this.isIntendedPlaying(),
      currentTrackIndex: session?.currentTrackIndex ?? 0,
      positionSeconds: this.adapter.getPosition(),
    });
    this.suppressActive = true;
    this.emit();
  }

  private handleAssumeActive(data: {
    trackId: string | null;
    positionSeconds: number;
    isPlaying: boolean;
  }): void {
    if (data.trackId) {
      this.adapter.load(data.trackId);
      this.loadedTrackId = data.trackId;
      this.adapter.seek(data.positionSeconds);
      this.lastPlayerPos = data.positionSeconds;
    }
    this.awaitingResume = true;
    this.adapter.pause();
    this.emit();
  }

  private report(fields: {
    isPlaying: boolean;
    currentTrackIndex: number;
    positionSeconds: number;
    currentTrackListenEventCreated?: boolean;
  }): void {
    this.seq += 1;
    this.send({
      type: "state-report",
      data: {
        isPlaying: fields.isPlaying,
        currentTrackIndex: fields.currentTrackIndex,
        // Round (not floor) the display position, and send accumulated unfloored:
        // flooring delayed/dropped the scrobble because the server's float gate
        // (accumulated > min(240, dur/2)) effectively needed a whole extra second,
        // and a track ending in the sub-second window before the next tick was
        // never recorded (SC-10).
        positionSeconds: Math.round(fields.positionSeconds),
        accumulatedPlayTimeSeconds: this.accumulated,
        ...(fields.currentTrackListenEventCreated !== undefined
          ? { currentTrackListenEventCreated: fields.currentTrackListenEventCreated }
          : {}),
        seq: this.seq,
      },
    });
    this.emit();
  }

  private emit(): void {
    const view = this.getViewState();
    for (const listener of this.listeners) listener(view);
  }
}

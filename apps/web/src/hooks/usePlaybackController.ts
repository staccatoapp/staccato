import {
  PlaybackController,
  ServerMessageSchema,
  type ClientMessage,
  type PlaybackViewState,
  type PlayerAdapter,
  type TransportCommand,
} from "@staccato/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useWebDeviceId } from "./useWebDeviceId";

/** TanStack Query key for the user's Staccato Connect device list. */
export const DEVICES_QUERY_KEY = ["devices"];

const MAX_RECONNECT_MS = 30_000;
/** How often we tick the controller (active: report; passive: advance display). */
const HEARTBEAT_MS = 500;

const INITIAL_VIEW: PlaybackViewState = {
  isActiveDevice: false,
  isPlaying: false,
  currentTrackIndex: 0,
  displayPositionSeconds: 0,
  durationSeconds: 0,
};

/** Adapts the page's single `<audio>` element to the shared PlayerAdapter. */
function createAudioAdapter(
  audioRef: RefObject<HTMLAudioElement | null>,
): PlayerAdapter {
  return {
    load(trackId) {
      const audio = audioRef.current;
      if (audio) audio.src = `/api/tracks/${trackId}/stream`;
    },
    play() {
      audioRef.current?.play().catch(() => {
        /* autoplay/load races settle on the next reconcile */
      });
    },
    pause() {
      audioRef.current?.pause();
    },
    seek(seconds) {
      const audio = audioRef.current;
      if (audio) audio.currentTime = seconds;
    },
    getPosition() {
      return audioRef.current?.currentTime ?? 0;
    },
    getDuration() {
      const d = audioRef.current?.duration;
      return d != null && Number.isFinite(d) ? d : null;
    },
  };
}

/**
 * Drives the web player from the shared {@link PlaybackController}: opens the
 * bidirectional playback socket, feeds server pushes into the controller and the
 * TanStack Query caches, ticks the controller on a heartbeat, and exposes the
 * rendered {@link PlaybackViewState} plus a `command` dispatcher. All the
 * active/passive logic lives in the shared controller — this hook is glue.
 */
export function usePlaybackController(
  audioRef: RefObject<HTMLAudioElement | null>,
): {
  viewState: PlaybackViewState;
  command: (cmd: TransportCommand) => void;
} {
  const queryClient = useQueryClient();
  const { deviceId, deviceName } = useWebDeviceId();
  const sendRef = useRef<(m: ClientMessage) => void>(() => {});
  const controllerRef = useRef<PlaybackController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new PlaybackController({
      adapter: createAudioAdapter(audioRef),
      send: (m) => sendRef.current(m),
    });
  }
  const controller = controllerRef.current;

  const [viewState, setViewState] = useState<PlaybackViewState>(INITIAL_VIEW);

  useEffect(() => {
    setViewState(controller.getViewState());
    return controller.subscribe(setViewState);
  }, [controller]);

  // Bidirectional socket: server pushes update the controller + caches; the
  // controller's outbound reports/commands go back over the same socket.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({ deviceId, deviceName });
    const url = `${proto}://${window.location.host}/api/playback/ws?${params.toString()}`;

    const connect = () => {
      ws = new WebSocket(url);
      sendRef.current = (m) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      };

      ws.onopen = () => {
        attempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = ServerMessageSchema.parse(JSON.parse(event.data));
          if (message.type === "session-updated") {
            queryClient.setQueryData(["playback-session"], message.data);
          } else if (message.type === "devices-updated") {
            queryClient.setQueryData(DEVICES_QUERY_KEY, message.data);
          }
          controller.onServerMessage(message);
        } catch (err) {
          console.warn("playback ws: failed to handle message", err);
        }
      };

      ws.onerror = (event) => {
        console.warn("playback ws: socket error", event);
      };

      ws.onclose = () => {
        if (closedByUs) return;
        attempts += 1;
        const delay = Math.min(
          MAX_RECONNECT_MS,
          1000 * 2 ** Math.min(attempts, 5),
        );
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [queryClient, deviceId, deviceName, controller]);

  // Heartbeat: drives active-device reporting + passive display advancement.
  useEffect(() => {
    const id = setInterval(() => controller.heartbeat(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [controller]);

  // Player element events the controller needs (queue advance, external pause).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => controller.onEnded();
    const onPlay = () => controller.onExternalPlayPause(true);
    const onPause = () => controller.onExternalPlayPause(false);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [controller, audioRef]);

  const command = useCallback(
    (cmd: TransportCommand) => controller.command(cmd),
    [controller],
  );

  return { viewState, command };
}

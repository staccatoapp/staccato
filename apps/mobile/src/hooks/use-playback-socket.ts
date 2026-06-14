import {
  ServerMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "@staccato/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useSession } from "@/lib/session";
import { PLAYBACK_SESSION_KEY } from "./use-playback-session";

/** TanStack Query key for the user's Staccato Connect device list. */
export const DEVICES_KEY = ["devices"];

/** Largest reconnect backoff between dropped-socket retries. */
const MAX_RECONNECT_MS = 30_000;

function toWebSocketUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/, "ws")}/api/playback/ws`;
}

// React Native's WebSocket accepts a third `options` argument with custom
// headers; the bundled DOM lib typings only describe the 2-arg browser form.
type RNWebSocketCtor = new (
  url: string,
  protocols: string | string[] | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

/**
 * Opens the single bidirectional playback WebSocket for the session. Server
 * pushes are written into the TanStack Query caches (session + devices) and
 * forwarded to `onServerMessage` (the {@link PlaybackController}); the returned
 * `send` carries the controller's reports/commands back to the server.
 */
export function usePlaybackSocket(
  onServerMessage: (message: ServerMessage) => void,
): { send: (message: ClientMessage) => void } {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const onMessageRef = useRef(onServerMessage);
  const sendRef = useRef<(m: ClientMessage) => void>(() => {});
  useEffect(() => {
    onMessageRef.current = onServerMessage;
  });

  const serverUrl = session?.serverUrl;
  const token = session?.token;

  useEffect(() => {
    if (!serverUrl || !token) return;

    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const url = toWebSocketUrl(serverUrl);

    const connect = () => {
      // React Native's WebSocket accepts a headers option (unlike the browser),
      // so mobile authenticates the handshake with its bearer token.
      ws = new (WebSocket as unknown as RNWebSocketCtor)(url, undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });
      sendRef.current = (m) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      };

      ws.onopen = () => {
        attempts = 0;
      };

      ws.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const message = ServerMessageSchema.parse(
            JSON.parse(event.data as string),
          );
          if (message.type === "session-updated") {
            queryClient.setQueryData(
              [...PLAYBACK_SESSION_KEY, serverUrl],
              message.data,
            );
          } else if (message.type === "devices-updated") {
            queryClient.setQueryData([...DEVICES_KEY, serverUrl], message.data);
          }
          onMessageRef.current(message);
        } catch (err) {
          console.warn("playback ws: failed to handle message", err);
        }
      };

      ws.onerror = (event) => {
        console.warn("playback ws: socket error", event);
      };

      ws.onclose = () => {
        if (closedByUs) return;
        // Native WebSocket has no auto-reconnect; back off and retry. A dead
        // token is handled by the playback-session GET's 401 -> signOut path.
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
  }, [serverUrl, token, queryClient]);

  return { send: useCallback((m: ClientMessage) => sendRef.current(m), []) };
}

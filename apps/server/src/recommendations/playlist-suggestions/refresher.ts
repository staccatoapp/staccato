import { logger } from "../../logger.js";
import { getPlaylist } from "../../db/queries/playlists.js";
import {
  claimSuggestionForRefresh,
  deleteSuggestionRow,
  findDueSuggestionRowIds,
  writeSuggestionError,
  writeSuggestionReady,
} from "../../db/queries/playlist-suggestions-cache.js";
import {
  EMPTY_RETRY_MS,
  MAX_ERROR_BACKOFF_MS,
  REFRESH_INTERVAL_MS,
} from "./constants.js";
import { computeSuggestions } from "./compute.js";

const log = logger.child({ module: "playlist-suggestions-refresher" });
const TICK_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | null = null;

export function startSuggestionsRefresher(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    suggestionsTick().catch((err) =>
      log.error({ err }, "suggestions refresher tick failed"),
    );
  }, TICK_INTERVAL_MS);
  log.info(
    { intervalMs: TICK_INTERVAL_MS },
    "playlist-suggestions refresher started",
  );
}

export function stopSuggestionsRefresher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export async function suggestionsTick(now: number = Date.now()): Promise<void> {
  const dueIds = findDueSuggestionRowIds(now);
  log.debug({ dueCount: dueIds.length }, "suggestions refresher tick");
  for (const id of dueIds) {
    void refreshOneSuggestion(id).catch((err) =>
      log.error({ err, rowId: id }, "refreshOneSuggestion failed"),
    );
  }
}

export async function refreshOneSuggestion(rowId: string): Promise<void> {
  const claimedAt = Date.now();
  const claimed = claimSuggestionForRefresh(rowId, claimedAt);
  if (!claimed) return;

  // The playlist may have been deleted between the due-scan and the claim
  // (cascade-delete normally removes the row, but guard the race anyway).
  const playlist = getPlaylist(claimed.playlistId);
  if (!playlist) {
    deleteSuggestionRow(rowId);
    log.info(
      { rowId, playlistId: claimed.playlistId },
      "removed suggestions row; playlist gone",
    );
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await computeSuggestions(claimed.playlistId, log);
    const finishedAt = Date.now();
    const nextRefreshAt =
      result.length === 0
        ? finishedAt + EMPTY_RETRY_MS
        : finishedAt + REFRESH_INTERVAL_MS;
    writeSuggestionReady(
      rowId,
      JSON.stringify(result),
      finishedAt,
      nextRefreshAt,
    );
    log.info(
      {
        userId: claimed.userId,
        playlistId: claimed.playlistId,
        durationMs: finishedAt - startedAt,
        payloadCount: result.length,
      },
      "playlist suggestions refresh complete",
    );
  } catch (err) {
    const finishedAt = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    const backoff = Math.min(REFRESH_INTERVAL_MS, MAX_ERROR_BACKOFF_MS);
    writeSuggestionError(rowId, message, finishedAt + backoff, finishedAt);
    log.warn(
      {
        err,
        userId: claimed.userId,
        playlistId: claimed.playlistId,
        durationMs: finishedAt - startedAt,
      },
      "playlist suggestions refresh failed",
    );
  }
}

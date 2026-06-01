import { logger } from "../logger.js";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import {
  claimForRefresh,
  deleteRow,
  findDueRowIds,
  writeError,
  writeReady,
} from "../db/queries/recommendation-cache.js";
import { getSource } from "./source.js";
import "./sources/index.js";

const log = logger.child({ module: "recommendations-refresher" });

const TICK_INTERVAL_MS = 60_000;
const MAX_ERROR_BACKOFF_MS = 15 * 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;

export function startRefresher(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick().catch((err) => log.error({ err }, "refresher tick failed"));
  }, TICK_INTERVAL_MS);
  log.info(
    { intervalMs: TICK_INTERVAL_MS },
    "recommendation refresher started",
  );
}

export function stopRefresher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export async function tick(now: number = Date.now()): Promise<void> {
  const dueIds = findDueRowIds(now);
  log.debug({ dueCount: dueIds.length }, "refresher tick");
  for (const id of dueIds) {
    void refreshOne(id).catch((err) =>
      log.error({ err, rowId: id }, "refreshOne failed"),
    );
  }
}

export async function refreshOne(rowId: string): Promise<void> {
  const claimedAt = Date.now();
  const claimed = claimForRefresh(rowId, claimedAt);
  if (!claimed) return;

  const source = getSource(claimed.source, claimed.kind);
  if (!source) {
    log.warn(
      { rowId, source: claimed.source, kind: claimed.kind },
      "recommendation source not registered",
    );
    writeError(
      rowId,
      "source not registered",
      claimedAt + 24 * 60 * 60 * 1000,
      claimedAt,
    );
    return;
  }

  const settings = getOrCreateUserSettings(claimed.userId);
  if (!source.isEligible(settings)) {
    deleteRow(rowId);
    log.info(
      {
        rowId,
        userId: claimed.userId,
        source: claimed.source,
        kind: claimed.kind,
      },
      "removed recommendation row; user no longer eligible for source",
    );
    return;
  }

  const ctx = source.buildContext(settings);

  const startedAt = Date.now();
  try {
    const result = await source.fetch(ctx, log);
    const finishedAt = Date.now();
    const nextRefreshAt =
      result.length === 0 && source.emptyRetryIntervalMs
        ? finishedAt + source.emptyRetryIntervalMs
        : finishedAt + source.refreshIntervalMs;
    writeReady(rowId, JSON.stringify(result), finishedAt, nextRefreshAt);
    log.info(
      {
        userId: claimed.userId,
        source: claimed.source,
        kind: claimed.kind,
        durationMs: finishedAt - startedAt,
        payloadCount: result.length,
      },
      "recommendation refresh complete",
    );
  } catch (err) {
    const finishedAt = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    const backoff = Math.min(source.refreshIntervalMs, MAX_ERROR_BACKOFF_MS);
    writeError(rowId, message, finishedAt + backoff, finishedAt);
    log.warn(
      {
        err,
        userId: claimed.userId,
        source: claimed.source,
        kind: claimed.kind,
        durationMs: finishedAt - startedAt,
      },
      "recommendation refresh failed",
    );
  }
}

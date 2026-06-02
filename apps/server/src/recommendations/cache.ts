import { z } from "zod";
import type { RecommendationsResponse } from "@staccato/shared";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import {
  findRowsForUserKind,
  upsertWarmingRow,
} from "../db/queries/recommendation-cache.js";
import type { RecommendationCacheRow } from "../db/schema/recommendation-cache.js";
import { listRegisteredSources } from "./source.js";
import { logger } from "../logger.js";

function parsePayload<T>(
  row: RecommendationCacheRow,
  schema: z.ZodType<T>,
): T | null {
  if (!row.payload) return null;
  try {
    const parsed = JSON.parse(row.payload);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        { source: row.source, kind: row.kind, errors: result.error.issues },
        "recommendation cache payload failed validation",
      );
      return null;
    }
    return result.data;
  } catch (err) {
    logger.warn(
      { err, source: row.source, kind: row.kind },
      "recommendation cache payload failed to parse",
    );
    return null;
  }
}

export function buildResponse<T extends unknown[]>(
  userId: string,
  kind: string,
  schema: z.ZodType<T>,
  merge: (payloads: T[]) => T,
  applyLiveLibrary: (merged: T) => T,
): RecommendationsResponse<T> {
  const settings = getOrCreateUserSettings(userId);
  const eligibleSources = listRegisteredSources().filter(
    (s) => s.kind === kind && s.isEligible(settings),
  );
  if (eligibleSources.length === 0) {
    return { status: "no-token" };
  }

  const rows = findRowsForUserKind(userId, kind);
  if (rows.length === 0) {
    for (const source of eligibleSources) {
      upsertWarmingRow(userId, source.id, source.kind);
    }
    return { status: "warming" };
  }

  const allWarmingNullPayload = rows.every(
    (r) => r.status === "warming" && !r.payload,
  );
  if (allWarmingNullPayload) {
    return { status: "warming" };
  }

  const withPayload = rows.filter((r) => r.payload !== null);
  const payloads = withPayload
    .map((r) => parsePayload(r, schema))
    .filter((p): p is T => p !== null);

  const merged = applyLiveLibrary(merge(payloads));

  const allError = rows.every((r) => r.status === "error");
  if (allError) {
    return { status: "error", data: merged.length ? merged : null };
  }

  return { status: "ready", data: merged };
}

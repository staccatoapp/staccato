import type { UserSettingsRow } from "../db/queries/settings.js";
import {
  deleteForUserSource,
  resetWarmingForUserSource,
  upsertWarmingRow,
} from "../db/queries/recommendation-cache.js";
import { listRegisteredSources } from "./source.js";
import "./sources/index.js";

// Single source of truth for which cache rows should exist for a user: one
// warming row per source the user is eligible for, and no rows for sources
// they are not. Reused by boot backfill and the settings route so credential
// changes for one provider never touch another provider's rows.
//
// forceRefresh: when a credential has just changed, reset eligible rows to
// warming so the next tick refetches with the new credentials (otherwise an
// existing `ready` row keeps serving stale data until its normal interval).
export function reconcileUserRows(
  settings: UserSettingsRow,
  opts: { forceRefresh?: boolean } = {},
  now: number = Date.now(),
): void {
  for (const source of listRegisteredSources()) {
    if (source.isEligible(settings)) {
      upsertWarmingRow(settings.userId, source.id, source.kind, now);
      if (opts.forceRefresh) {
        resetWarmingForUserSource(settings.userId, source.id, source.kind, now);
      }
    } else {
      deleteForUserSource(settings.userId, source.id, source.kind);
    }
  }
}

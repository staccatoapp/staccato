import type { FastifyBaseLogger } from "fastify";
import {
  createPendingScrobble,
  markScrobble,
} from "../db/queries/listen-scrobbles.js";
import { insertListenEvent } from "../db/queries/listening-history.js";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import { getTrackForScrobble } from "../db/queries/tracks.js";
import type { ListenSubmission } from "./target.js";
import { listRegisteredTargets } from "./target.js";
import "./targets/index.js";

/**
 * Returns true when a play qualifies as a listen per the ListenBrainz rule:
 * more than half the track's duration, or more than 4 minutes, whichever is less.
 * When durationSeconds is unknown, 8 minutes is assumed (480 s / 2 = 240 s threshold).
 */
export function shouldRecordListen(
  accumulatedSeconds: number,
  durationSeconds: number | null,
): boolean {
  return accumulatedSeconds > Math.min(240, (durationSeconds ?? 480) / 2);
}

/**
 * Records a single listen: always writes the local `listening_history` ledger
 * row, then fans the listen out to every eligible scrobble target. Each target
 * gets its own `listen_scrobbles` delivery record so a slow or failing target
 * never blocks the others. Intended to be called fire-and-forget.
 */
export async function recordListen(
  userId: string,
  trackId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const listen = insertListenEvent(userId, trackId);

  const settings = getOrCreateUserSettings(userId);
  const eligibleTargets = listRegisteredTargets().filter((t) =>
    t.isEligible(settings),
  );
  if (eligibleTargets.length === 0) {
    log.warn({ userId }, "listen recorded but no eligible scrobble target");
    return;
  }

  const track = getTrackForScrobble(trackId);
  if (!track?.artistName || !track?.title) {
    log.warn(
      { userId, trackId },
      "cannot scrobble - missing track or artist name",
    );
    return;
  }

  const submission: ListenSubmission = {
    artistName: track.artistName,
    trackName: track.title,
    listenedAt: listen.listenedAt,
    recordingMbid: track.musicbrainzId,
  };

  await Promise.allSettled(
    eligibleTargets.map(async (target) => {
      createPendingScrobble(listen.id, target.id);
      try {
        await target.submit(target.buildContext(settings), submission, log);
        markScrobble(listen.id, target.id, "delivered");
      } catch (err) {
        log.error(
          { err, userId, trackId, target: target.id },
          "scrobble failed",
        );
        markScrobble(listen.id, target.id, "failed", String(err));
      }
    }),
  );
}

import type { RecommendedPlaylistTrack } from "@staccato/shared";
import { Plus, RefreshCw, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  subjectFromPlaylistTrack,
  type LidarrSubject,
} from "@/components/explore/lidarr-sheet";
import { TrackRow } from "@/components/explore/track-row";
import { usePlaylistSuggestions } from "@/hooks/use-playlist-suggestions";
import { useTheme } from "@/theme";

const VISIBLE = 3;

interface SlotState {
  /** The pool these slots were seeded from (identity guards re-seeding). */
  pool: RecommendedPlaylistTrack[];
  /** Pool indices currently shown. */
  slots: number[];
  /** Next pool index to consider when rotating a slot. */
  cursor: number;
}

function seedSlots(pool: RecommendedPlaylistTrack[]): SlotState {
  const slots = Array.from(
    { length: Math.min(VISIBLE, pool.length) },
    (_, i) => i,
  );
  return { pool, slots, cursor: slots.length };
}

/**
 * Next pool index not already visible, walking forward from `cursor` and wrapping
 * around. Returns the picked index and the advanced cursor; callers thread the
 * cursor through so rotations don't repeat a still-showing track.
 */
function takeNext(
  pool: RecommendedPlaylistTrack[],
  cursor: number,
  visible: number[],
): { index: number; cursor: number } {
  let c = cursor;
  for (let k = 0; k < pool.length; k++) {
    const cand = c % pool.length;
    c += 1;
    if (!visible.includes(cand)) return { index: cand, cursor: c };
  }
  return { index: c % pool.length, cursor: c + 1 };
}

interface PlaylistSuggestionsProps {
  playlistId: string;
  /** Opens the Lidarr sheet to request a suggested (not-owned) track. */
  onRequestDownload: (subject: LidarrSubject) => void;
}

/**
 * "Suggested tracks" pinned to the bottom of an in-library playlist: three
 * ListenBrainz/Last.fm similarity picks at a time. The artwork previews a
 * 30-second clip (handled by the shared {@link TrackRow}); **+** requests the
 * track via Lidarr, **×** dismisses it, and either action pulls the next
 * candidate from the pool. The pill re-rolls all three. Hidden entirely when the
 * server has no suggestions to offer.
 */
export function PlaylistSuggestions({
  playlistId,
  onRequestDownload,
}: PlaylistSuggestionsProps) {
  const { colors, typography } = useTheme();
  const { data } = usePlaylistSuggestions(playlistId);

  const pool = useMemo<RecommendedPlaylistTrack[]>(() => {
    if (!data) return [];
    if (data.status === "ready") return data.data;
    if (data.status === "error") return data.data ?? [];
    return [];
  }, [data]);

  // `slots` are indices into `pool`; `cursor` walks the pool for the next
  // not-currently-shown candidate. Both live in one state object so a functional
  // update can read and advance the cursor atomically; `pool` is held alongside
  // so a changed pool (refetch) re-seeds via render-phase setState.
  const [state, setState] = useState<SlotState>(() => seedSlots(pool));
  if (state.pool !== pool) setState(seedSlots(pool));
  const { slots } = state;

  const replaceSlot = useCallback((i: number) => {
    setState((s) => {
      if (s.pool.length <= VISIBLE) return s; // nothing fresh to rotate in
      const { index, cursor } = takeNext(s.pool, s.cursor, s.slots);
      const next = [...s.slots];
      next[i] = index;
      return { ...s, slots: next, cursor };
    });
  }, []);

  const onAdd = useCallback(
    (track: RecommendedPlaylistTrack, i: number) => {
      const subject = subjectFromPlaylistTrack(track);
      if (subject) onRequestDownload(subject);
      replaceSlot(i);
    },
    [onRequestDownload, replaceSlot],
  );

  const refresh = useCallback(() => {
    setState((s) => {
      if (s.pool.length <= VISIBLE) return s;
      let cursor = s.cursor;
      const next: number[] = [];
      for (let i = 0; i < s.slots.length; i++) {
        const picked = takeNext(s.pool, cursor, next);
        next.push(picked.index);
        cursor = picked.cursor;
      }
      return { ...s, slots: next, cursor };
    });
  }, []);

  if (pool.length === 0) return null;

  return (
    <View style={[styles.root, { borderTopColor: colors.border }]}>
      <Text
        style={[
          styles.label,
          { color: "rgba(255,255,255,0.5)", fontFamily: typography.fontFamily },
        ]}
      >
        SUGGESTED TRACKS
      </Text>
      <Text
        style={[
          styles.caption,
          { color: colors.fgMuted, fontFamily: typography.fontFamily },
        ]}
      >
        Based on your playlist so far.
      </Text>

      {slots.map((poolIdx, i) => {
        const track = pool[poolIdx];
        if (!track) return null;
        const requestable = subjectFromPlaylistTrack(track) != null;
        return (
          <TrackRow
            key={`${track.recordingMbid ?? track.title}-${poolIdx}`}
            track={{
              recordingMbid: track.recordingMbid ?? "",
              title: track.title,
              subtitle: [track.artistName, track.albumTitle]
                .filter(Boolean)
                .join(" · "),
              coverArtUrl: track.coverArtUrl,
              inLibrary: track.inLibrary,
              localTrackId: track.localTrackId,
              artistName: track.artistName ?? "",
            }}
            trailing={
              <View style={styles.trailing}>
                {requestable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${track.title}`}
                    hitSlop={6}
                    onPress={() => onAdd(track, i)}
                    style={styles.addButton}
                  >
                    <Plus size={15} color="#fff" strokeWidth={2.4} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${track.title}`}
                  hitSlop={6}
                  onPress={() => replaceSlot(i)}
                  style={styles.dismissButton}
                >
                  <X size={15} color="rgba(255,255,255,0.55)" strokeWidth={2} />
                </Pressable>
              </View>
            }
          />
        );
      })}

      {pool.length > VISIBLE ? (
        <View style={styles.refreshWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh suggestions"
            onPress={refresh}
            style={styles.refreshPill}
          >
            <RefreshCw size={15} color="#fff" strokeWidth={2.2} />
            <Text
              style={[
                styles.refreshText,
                { fontFamily: typography.fontFamily },
              ]}
            >
              Refresh suggestions
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 30,
    marginHorizontal: 16,
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  dismissButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshWrap: {
    alignItems: "center",
    marginTop: 14,
  },
  refreshPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  refreshText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
});

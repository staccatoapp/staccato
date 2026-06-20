import { Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PlaylistListItem } from "@staccato/shared";

import { SearchField } from "@/components/ui/search-field";
import { staccatoToast } from "@/components/ui/staccato-toast";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAddTrackToPlaylist } from "@/hooks/use-add-track-to-playlist";
import { useLibraryPlaylists } from "@/hooks/use-library-playlists";
import { useTheme } from "@/theme";
import { PlaylistListItem as PlaylistRow } from "./playlist-list-item";

const SHEET_HEIGHT = 560;

interface AddToPlaylistSheetProps {
  open: boolean;
  onClose: () => void;
  /** Local id of the track to add; null when there is no current track. */
  trackId: string | null;
}

/**
 * "Add to playlist" sheet over the Now Playing view: search across the user's
 * owned playlists and tap one to append the current track. Selecting closes the
 * sheet immediately and confirms with a toast (success or failure). The library
 * query is only enabled while the sheet is open so a closed sheet costs nothing.
 */
export function AddToPlaylistSheet({
  open,
  onClose,
  trackId,
}: AddToPlaylistSheetProps) {
  const { colors, typography } = useTheme();
  const [query, setQuery] = useState("");
  const addTrack = useAddTrackToPlaylist();

  // The sheet stays mounted (BottomSheet animates rather than unmounts), so the
  // local search state survives a close. Reset it on the open→closed transition
  // (React's "adjust state when a prop changes" render-time pattern, not an
  // effect) so it reopens with the full, unfiltered list for the next track.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setQuery("");
  }

  // "createdAt" surfaces the most recently created playlists first — the ones a
  // user is most likely adding to. Only fetch while the sheet is open.
  const { items, fetchNextPage, hasNextPage, isLoading } = useLibraryPlaylists(
    "createdAt",
    open,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, query]);

  function handleSelect(playlist: PlaylistListItem) {
    if (!trackId) return;
    onClose();
    addTrack.mutate(
      { playlistId: playlist.id, trackId },
      {
        onSuccess: () => staccatoToast.success(`Added to ${playlist.name}`),
        onError: (err) => {
          console.warn("add track to playlist failed", {
            err,
            playlistId: playlist.id,
            trackId,
          });
          staccatoToast.error(`Couldn't add to ${playlist.name}`);
        },
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      testID="add-to-playlist-sheet"
      backdropTestID="add-to-playlist-backdrop"
      style={styles.sheetOverride}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.headerTitle,
            { color: colors.fg, fontFamily: typography.fontFamily },
          ]}
        >
          Add to playlist
        </Text>
      </View>

      <View style={styles.controls}>
        <SearchField
          testID="add-to-playlist-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Find a playlist"
          containerStyle={{ backgroundColor: colors.bgMuted }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New playlist"
          onPress={() => {
            /* TODO: playlist creation flow — non-functional for now. */
          }}
          style={({ pressed }) => [
            styles.newPlaylist,
            { backgroundColor: pressed ? colors.bgMuted : "transparent" },
          ]}
        >
          <View
            style={[styles.newPlaylistIcon, { borderColor: colors.border }]}
          >
            <Plus size={20} color={colors.primary} strokeWidth={2.4} />
          </View>
          <Text
            style={[
              styles.newPlaylistLabel,
              { color: colors.fg, fontFamily: typography.fontFamily },
            ]}
          >
            New Playlist
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fgMuted} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          renderItem={({ item }) => (
            <PlaylistRow playlist={item} onPress={() => handleSelect(item)} />
          )}
          ListEmptyComponent={
            <Text
              style={[
                styles.empty,
                { color: colors.fgMuted, fontFamily: typography.fontFamily },
              ]}
            >
              {query.trim()
                ? "No playlists match your search."
                : "You don't have any playlists yet."}
            </Text>
          }
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetOverride: {
    height: SHEET_HEIGHT,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  controls: {
    paddingHorizontal: 20,
    gap: 4,
  },
  newPlaylist: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    marginTop: 4,
    borderRadius: 8,
  },
  newPlaylistIcon: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  newPlaylistLabel: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontSize: 14,
    textAlign: "center",
    paddingTop: 32,
    paddingHorizontal: 24,
  },
});

import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Geometry for the persistent player UI and the native tab bar, plus the hook
 * scroll views use to keep their last items clear of both.
 *
 * The mini player is a root-level overlay (see components/player-overlay.tsx)
 * that floats above the native tab bar, so nothing in a screen's tree knows it
 * is there — every vertical scroll surface must reserve space for it explicitly.
 */

/** NativeTabs renders a native bar JS can't measure; platform standard heights. */
export const TAB_BAR_CONTENT_HEIGHT = Platform.OS === "ios" ? 49 : 56;
/** Mini player inset above the tab bar and from the screen edges. */
export const MINI_PLAYER_INSET = 8;
/** Mini player card height: 8+8 padding + 42 art row + 2 progress strip. */
export const MINI_PLAYER_HEIGHT = 60;
/** Vertical space the floating mini player occupies above the tab bar. */
export const MINI_PLAYER_CLEARANCE = MINI_PLAYER_INSET + MINI_PLAYER_HEIGHT;
/** Breathing room between the last item and the mini player. */
const BOTTOM_GAP = 16;

/**
 * Bottom padding a vertical scroll view needs so neither the mini player nor the
 * tab bar covers its last items. We assume the mini player is always present
 * (it is absent only for a brand-new account that has never played a track), so
 * its space is reserved unconditionally — no layout shift when the first track
 * starts.
 *
 * @param tabBarAutoInset `true` for tab-root scroll views that use
 *   `contentInsetAdjustmentBehavior="automatic"` — NativeTabs already insets the
 *   tab bar and bottom safe area (SDK 55+), so only the mini player needs manual
 *   clearance. `false` for nested detail screens that manage their own insets,
 *   where the tab bar + bottom safe area must be added here too.
 */
export function useContentBottomInset({
  tabBarAutoInset,
}: {
  tabBarAutoInset: boolean;
}): number {
  const insets = useSafeAreaInsets();
  const tabBar = tabBarAutoInset ? 0 : insets.bottom + TAB_BAR_CONTENT_HEIGHT;
  return tabBar + MINI_PLAYER_CLEARANCE + BOTTOM_GAP;
}

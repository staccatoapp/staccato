import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";

// Deep links into a detail route still push the tab's index first.
export const unstable_settings = { initialRouteName: "index" };

/**
 * Per-tab Stack so detail screens (album / playlist opened from the recently
 * played grid) push *within* the Home tab and the native tab bar stays visible.
 * Screens own their entrance animation (Screen's stacScreenIn), so the stack
 * itself doesn't animate.
 */
export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
        contentStyle: { backgroundColor: Colors.bg },
      }}
    />
  );
}

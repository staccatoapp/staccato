import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";

// Deep links into the album route still push the tab's index first.
export const unstable_settings = { initialRouteName: "index" };

/**
 * Per-tab Stack so detail screens (album) push *within* the Library tab and the
 * native tab bar stays visible. Screens own their entrance animation (Screen's
 * stacScreenIn), so the stack itself doesn't animate.
 */
export default function LibraryStackLayout() {
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

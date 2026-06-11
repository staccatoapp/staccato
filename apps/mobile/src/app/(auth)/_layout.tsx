import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";

export const unstable_settings = {
  initialRouteName: "connect",
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
        // Screens own their entrance animation (stacScreenIn).
        animation: "none",
      }}
    />
  );
}

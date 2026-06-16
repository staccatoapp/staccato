import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { Segmented } from "@/components/settings/segmented";
import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { memberSince, roleLabel, userInitial } from "@/lib/settings-view";
import { useTheme } from "@/theme";

export default function UserDetailScreen() {
  const { colors, typography } = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: users } = useAdminUsers();
  const user = users?.find((u) => u.id === userId);

  return (
    <SettingsDetailScreen title={user?.username ?? "User"} backLabel="Users">
      <View style={{ alignItems: "center", gap: 10, paddingBottom: 22 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.serverBlue,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 30,
              fontWeight: "600",
              color: "#ffffff",
            }}
          >
            {userInitial(user?.username ?? "")}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 20,
            fontWeight: "600",
            color: colors.fg,
          }}
        >
          {user?.username ?? "—"}
        </Text>
      </View>

      <SettingsGroup
        header="Role"
        footer="Changing a user's role isn't available from the mobile app yet."
      >
        <View style={{ padding: 12 }}>
          <Segmented
            value={user?.isAdmin ? "admin" : "user"}
            options={[
              { id: "user", label: "User" },
              { id: "admin", label: "Admin" },
            ]}
            disabled
          />
        </View>
      </SettingsGroup>

      <SettingsGroup header="Activity">
        <SettingsRow
          title="Role"
          value={user ? roleLabel(user.isAdmin) : "—"}
        />
        <SettingsRow
          title="Member since"
          value={user ? memberSince(user.createdAt) : "—"}
        />
      </SettingsGroup>

      <SettingsGroup footer="Removing users isn't available from the mobile app yet.">
        <SettingsRow center danger dim title="Remove User" />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

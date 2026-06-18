import { router } from "expo-router";
import { ShieldCheck, UserPlus } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { userInitial } from "@/lib/settings-view";
import { useTheme } from "@/theme";

const USER_TILES = [
  TILE.blue,
  TILE.pink,
  TILE.green,
  TILE.orange,
  TILE.purple,
  TILE.teal,
];

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  const { colors, typography } = useTheme();
  if (!isAdmin) {
    return (
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 13.5,
          color: colors.fgMuted,
          letterSpacing: -0.2,
        }}
      >
        User
      </Text>
    );
  }
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: colors.primaryBg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
      }}
    >
      <ShieldCheck size={11} color={colors.primaryText} strokeWidth={2.2} />
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 11.5,
          fontWeight: "600",
          letterSpacing: 0.2,
          color: colors.primaryText,
        }}
      >
        Admin
      </Text>
    </View>
  );
}

export default function AdminUsersScreen() {
  const { typography } = useTheme();
  const { data: users } = useAdminUsers();

  const adminCount = users?.filter((u) => u.isAdmin).length ?? 0;
  const header = users
    ? `${users.length} member${users.length === 1 ? "" : "s"} · ${adminCount} admin${adminCount === 1 ? "" : "s"}`
    : undefined;

  return (
    <SettingsDetailScreen title="Users" backLabel="Admin">
      <SettingsGroup>
        <SettingsRow
          icon={<UserPlus size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.orange}
          title="Add User"
          chevron
          onPress={() => router.push("/(protected)/settings/admin/users/new")}
        />
      </SettingsGroup>

      <SettingsGroup header={header}>
        {(users ?? []).map((u, i) => (
          <SettingsRow
            key={u.id}
            icon={
              <Text
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: 13,
                  fontWeight: "700",
                  color: "#ffffff",
                }}
              >
                {userInitial(u.username)}
              </Text>
            }
            iconBg={USER_TILES[i % USER_TILES.length]}
            title={u.username}
            trailing={<RoleBadge isAdmin={u.isAdmin} />}
            chevron
            onPress={() =>
              router.push({
                pathname: "/(protected)/settings/admin/users/[userId]",
                params: { userId: u.id },
              })
            }
          />
        ))}
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

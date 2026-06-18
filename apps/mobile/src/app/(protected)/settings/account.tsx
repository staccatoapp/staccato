import { Server, ShieldCheck } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useCurrentUser } from "@/hooks/use-current-user";
import { instanceHost, roleLabel, userInitial } from "@/lib/settings-view";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

export default function AccountScreen() {
  const { colors, typography } = useTheme();
  const { session, signOut } = useSession();
  const { data: user } = useCurrentUser();

  const username = user?.username ?? "";
  const isAdmin = user?.isAdmin ?? false;
  const host = session ? instanceHost(session.serverUrl) : "—";

  return (
    <SettingsDetailScreen title="Account">
      <View style={{ alignItems: "center", gap: 12, paddingBottom: 24 }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: colors.serverBlue,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 34,
              fontWeight: "600",
              color: "#ffffff",
            }}
          >
            {userInitial(username)}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 21,
            fontWeight: "600",
            letterSpacing: -0.4,
            color: colors.fg,
          }}
        >
          {username || "Account"}
        </Text>
      </View>

      <SettingsGroup header="Profile">
        <SettingsRow title="Username" value={username || "—"} />
        <SettingsRow title="Display name" value="Not set" dim />
        <SettingsRow title="Email" value="Not set" dim />
      </SettingsGroup>

      <SettingsGroup
        header="This server"
        footer="You're connected to a self-hosted Staccato instance."
      >
        <SettingsRow
          icon={<Server size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.gray}
          title="Instance"
          value={host}
        />
        <SettingsRow
          icon={<ShieldCheck size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={colors.primary}
          title="Role"
          value={roleLabel(isAdmin)}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          center
          danger
          title="Sign Out"
          onPress={() => void signOut()}
        />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

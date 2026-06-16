import { router } from "expo-router";
import { Database, Disc3, Link } from "lucide-react-native";
import React from "react";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useLidarrConnectivity, useLidarrSettings } from "@/hooks/use-lidarr";
import { useTheme } from "@/theme";

export default function AdminIntegrationsScreen() {
  const { colors } = useTheme();
  const { data: lidarr } = useLidarrSettings();
  const configured = !!lidarr?.url && lidarr.apiKeySet;
  const { data: connectivity } = useLidarrConnectivity(configured);

  const lidarrValue = !configured
    ? "Not configured"
    : connectivity?.connected
      ? "Connected"
      : "Unreachable";
  const lidarrColor = connectivity?.connected
    ? colors.successText
    : colors.fgMuted;

  return (
    <SettingsDetailScreen title="Integrations" backLabel="Admin">
      <SettingsGroup footer="External services Staccato talks to. Keys are stored server-side.">
        <SettingsRow
          icon={<Link size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.teal}
          title="Lidarr"
          value={lidarrValue}
          valueColor={lidarrColor}
          chevron
          onPress={() => router.push("/(home)/settings/admin/lidarr")}
        />
        <SettingsRow
          icon={<Database size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.blue}
          title="MusicBrainz"
          value="Connected"
          valueColor={colors.successText}
        />
        <SettingsRow
          icon={<Disc3 size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.gray}
          title="AcoustID"
          value="Coming soon"
          dim
        />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

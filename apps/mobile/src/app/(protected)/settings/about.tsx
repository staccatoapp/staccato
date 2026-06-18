import { Info } from "lucide-react-native";
import React from "react";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useServerHealth } from "@/hooks/use-server-health";

export default function AboutScreen() {
  const { data: health } = useServerHealth();

  return (
    <SettingsDetailScreen title="About">
      <SettingsGroup footer="Staccato — self-hosted music for home labs.">
        <SettingsRow
          icon={<Info size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.gray}
          title="Server version"
          value={health?.version ?? "—"}
        />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

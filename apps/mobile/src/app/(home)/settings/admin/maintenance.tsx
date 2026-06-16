import { Info } from "lucide-react-native";
import React from "react";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useServerHealth } from "@/hooks/use-server-health";

export default function AdminMaintenanceScreen() {
  const { data: health } = useServerHealth();

  return (
    <SettingsDetailScreen title="Maintenance" backLabel="Admin">
      <SettingsGroup header="Server">
        <SettingsRow title="Version" value={health?.version ?? "—"} />
        <SettingsRow title="Uptime" value="—" dim />
        <SettingsRow title="Database size" value="—" dim />
      </SettingsGroup>

      <SettingsGroup header="Logs">
        <SettingsRow
          icon={<Info size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.gray}
          title="View Server Logs"
          value="Coming soon"
          dim
        />
      </SettingsGroup>

      <SettingsGroup footer="Server restart isn't available from the mobile app yet.">
        <SettingsRow center title="Restart Server" value="Coming soon" dim />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

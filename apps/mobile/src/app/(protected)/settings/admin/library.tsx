import React from "react";
import { Text, View } from "react-native";

import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { Spinner } from "@/components/ui/spinner";
import { useScanStatus, useTriggerScan } from "@/hooks/use-scan";
import { formatLastScan } from "@/lib/settings-view";
import { useTheme } from "@/theme";

export default function AdminLibraryScreen() {
  const { colors, typography } = useTheme();
  const { data: status } = useScanStatus();
  const triggerScan = useTriggerScan();

  const running = status?.running ?? false;

  return (
    <SettingsDetailScreen title="Library" backLabel="Admin">
      <SettingsGroup header="Status">
        <SettingsRow
          title="Last scan"
          value={
            running ? "Scanning…" : formatLastScan(status?.completedAt ?? null)
          }
          valueColor={colors.fg}
        />
        <SettingsRow title="Tracks" value="—" dim />
        <SettingsRow title="Albums" value="—" dim />
        <SettingsRow title="Artists" value="—" dim />
        <SettingsRow title="Library size" value="—" dim />
      </SettingsGroup>

      <SettingsGroup footer="Scans pick up new files and remove deleted ones.">
        <SettingsRow
          center
          title={running ? "Scanning…" : "Scan Library"}
          onPress={running ? undefined : () => triggerScan.mutate()}
          trailing={
            running ? (
              <View style={{ marginRight: 8 }}>
                <Spinner size={17} />
              </View>
            ) : undefined
          }
        />
      </SettingsGroup>

      {running && status ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 12.5,
            color: colors.fgMuted,
            textAlign: "center",
            marginTop: -14,
          }}
        >
          {status.resolved} / {status.total ?? "?"} resolved
        </Text>
      ) : null}
    </SettingsDetailScreen>
  );
}

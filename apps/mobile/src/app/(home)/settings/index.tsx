import { router } from "expo-router";
import {
  Download,
  Globe,
  Info,
  Languages,
  Palette,
  ShieldCheck,
  Database,
  Server,
  Users,
  HardDrive,
  Music,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AdminBanner } from "@/components/settings/admin-banner";
import { Segmented } from "@/components/settings/segmented";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { TILE } from "@/components/settings/tiles";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useContentBottomInset } from "@/lib/player-layout";
import {
  instanceHost,
  listenBrainzStatusLabel,
  userInitial,
} from "@/lib/settings-view";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

type Segment = "personal" | "admin";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const { data: user } = useCurrentUser();
  const isAdmin = user?.isAdmin ?? false;

  const [segment, setSegment] = useState<Segment>("personal");
  // Non-admins never see the Admin surface even if state lingers from a prior
  // session, so derive the active segment rather than syncing it in an effect.
  const activeSegment: Segment = isAdmin ? segment : "personal";

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomInset }}
    >
      {isAdmin ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 22 }}>
          <Segmented<Segment>
            value={activeSegment}
            onChange={setSegment}
            options={[
              { id: "personal", label: "Personal" },
              {
                id: "admin",
                label: "Admin",
                icon: (
                  <ShieldCheck
                    size={14}
                    color={
                      activeSegment === "admin" ? colors.fg : colors.fgMuted
                    }
                    strokeWidth={2.4}
                  />
                ),
              },
            ]}
          />
        </View>
      ) : null}

      {activeSegment === "personal" ? <PersonalRoot /> : <AdminRoot />}
    </ScrollView>
  );
}

function PersonalRoot() {
  const { colors, typography } = useTheme();
  const { session } = useSession();
  const { data: user } = useCurrentUser();
  const { data: settings } = useUserSettings();

  const username = user?.username ?? "";
  const host = session ? instanceHost(session.serverUrl) : "";

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          icon={
            <Text
              style={{
                fontFamily: typography.fontFamily,
                fontSize: 14,
                fontWeight: "700",
                color: "#ffffff",
              }}
            >
              {userInitial(username)}
            </Text>
          }
          iconBg={colors.serverBlue}
          title={username || "Account"}
          subtitle={host}
          chevron
          onPress={() => router.push("/(home)/settings/account")}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon={<Globe size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.blue}
          title="Networking"
          subtitle="Server address & URL switching"
          value="Coming soon"
          dim
        />
        <SettingsRow
          icon={<Download size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.green}
          title="Downloads"
          subtitle="Quality, cellular & storage"
          value="Coming soon"
          dim
        />
        <SettingsRow
          icon={<Palette size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.purple}
          title="Appearance"
          subtitle="Theme & accent color"
          value="Coming soon"
          dim
        />
        <SettingsRow
          icon={<Music size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.pink}
          title="Services"
          subtitle="ListenBrainz scrobbling"
          value={
            settings
              ? listenBrainzStatusLabel(settings.listenbrainzTokenSet)
              : undefined
          }
          valueColor={
            settings?.listenbrainzTokenSet ? colors.successText : colors.fgMuted
          }
          chevron
          onPress={() => router.push("/(home)/settings/listenbrainz")}
        />
        <SettingsRow
          icon={<Languages size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.teal}
          title="Localization"
          subtitle="Language, region, formats"
          value="Coming soon"
          dim
        />
        <SettingsRow
          icon={<Info size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.gray}
          title="About"
          subtitle="Version & app info"
          chevron
          onPress={() => router.push("/(home)/settings/about")}
        />
      </SettingsGroup>
    </>
  );
}

function AdminRoot() {
  return (
    <>
      <AdminBanner>
        Server-wide configuration. Changes apply to everyone on this instance.
      </AdminBanner>

      <SettingsGroup>
        <SettingsRow
          icon={<Database size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.blue}
          title="Library"
          subtitle="Indexing, paths & metadata"
          chevron
          onPress={() => router.push("/(home)/settings/admin/library")}
        />
        <SettingsRow
          icon={<Server size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.teal}
          title="Integrations"
          subtitle="Lidarr, MusicBrainz & more"
          chevron
          onPress={() => router.push("/(home)/settings/admin/integrations")}
        />
        <SettingsRow
          icon={<Users size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.orange}
          title="Users"
          subtitle="Accounts & permissions"
          chevron
          onPress={() => router.push("/(home)/settings/admin/users/index")}
        />
        <SettingsRow
          icon={<HardDrive size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.red}
          title="Maintenance"
          subtitle="Logs & server health"
          chevron
          onPress={() => router.push("/(home)/settings/admin/maintenance")}
        />
      </SettingsGroup>
    </>
  );
}

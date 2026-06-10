import { HealthResponseSchema, normaliseServerUrl } from "@staccato/shared";
import { router, useFocusEffect } from "expo-router";
import { Check, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { LogoMark } from "@/components/logo-mark";
import { FieldLabel } from "@/components/ui/field-label";
import { ListGroup } from "@/components/ui/list-group";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { ServerRow } from "@/components/ui/server-row";
import { TextField } from "@/components/ui/text-field";
import { createApiClient } from "@/lib/api-client";
import { setStoredServerUrl } from "@/lib/auth-storage";
import {
  addOrUpdateRecentServer,
  getRecentServers,
  type RecentServer,
} from "@/lib/recent-servers";
import { useTheme } from "@/theme";

type Phase = "idle" | "busy" | "err" | "ok";

const OK_HOLD_MS = 750;

const ERROR_MESSAGE =
  "Couldn't reach this server. Check the address and try again.";

function formatLastUsed(lastUsedAt: number): string {
  const days = Math.floor((Date.now() - lastUsedAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return "Last used today";
  }
  if (days === 1) {
    return "Last used yesterday";
  }
  return `Last used ${days} days ago`;
}

export default function ConnectScreen() {
  const { colors, spacing, typography } = useTheme();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [serverVersion, setServerVersion] = useState("");
  const [recentServers, setRecentServers] = useState<RecentServer[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getRecentServers().then(setRecentServers);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPhase("idle");
      setServerVersion("");
    }, []),
  );

  const edit = (value: string) => {
    setUrl(value);
    if (phase === "err") {
      setPhase("idle");
    }
  };

  const submit = async () => {
    const normalised = normaliseServerUrl(url);
    if (!normalised || phase === "busy" || phase === "ok") {
      return;
    }
    setPhase("busy");
    try {
      const health = await createApiClient(normalised).get(
        "/api/health",
        HealthResponseSchema,
      );
      if (health.name !== "staccato") {
        console.warn("server did not identify as staccato", { normalised });
        setPhase("err");
        return;
      }
      setServerVersion(health.version);
      await setStoredServerUrl(normalised);
      await addOrUpdateRecentServer(normalised);
      setPhase("ok");
      timers.current.push(
        setTimeout(() => router.push("/(auth)/sign-in"), OK_HOLD_MS),
      );
    } catch (err) {
      console.warn("server handshake failed", { url: normalised, err });
      setPhase("err");
    }
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: 78, paddingHorizontal: spacing.screen }}>
        <LogoMark size={34} />
        <Text
          style={{
            marginTop: 22,
            fontFamily: typography.fontFamily,
            fontSize: 30,
            fontWeight: "700",
            letterSpacing: -0.5,
            lineHeight: 30 * 1.15,
            color: colors.fg,
          }}
        >
          Connect to your server
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: typography.fontFamily,
            fontSize: 15,
            lineHeight: 15 * 1.5,
            color: colors.fgMuted,
          }}
        >
          Enter the address of the Staccato server that hosts your library.
        </Text>

        <View style={{ marginTop: 30 }}>
          <FieldLabel>Server address</FieldLabel>
          <TextField
            value={url}
            onChangeText={edit}
            placeholder="https://music.example.com"
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={phase === "err"}
          />
        </View>

        {/* status line — fixed height so the layout never jumps */}
        <View
          style={{
            minHeight: 24,
            marginTop: 10,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 7,
          }}
        >
          {phase === "err" ? (
            <>
              <TriangleAlert
                size={15}
                color={colors.destructive}
                strokeWidth={2.2}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: typography.fontFamily,
                  fontSize: 13.5,
                  lineHeight: 13.5 * 1.45,
                  color: colors.destructive,
                }}
              >
                {ERROR_MESSAGE}
              </Text>
            </>
          ) : null}
          {phase === "ok" ? (
            <>
              <Check
                size={15}
                color={colors.successText}
                strokeWidth={2.6}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: 13.5,
                  lineHeight: 13.5 * 1.45,
                  color: colors.successText,
                }}
              >
                {`Connected · Staccato v${serverVersion}`}
              </Text>
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 14 }}>
          <PrimaryButton
            phase={phase === "busy" ? "busy" : phase === "ok" ? "ok" : "idle"}
            disabled={!url.trim()}
            onPress={submit}
            busyLabel="Checking…"
            okLabel="Connected"
          >
            Continue
          </PrimaryButton>
        </View>
      </View>

      {recentServers.length > 0 ? (
        <View style={{ marginTop: 40 }}>
          <View style={{ paddingHorizontal: spacing.screen }}>
            <FieldLabel>Recent servers</FieldLabel>
          </View>
          <View style={{ marginHorizontal: spacing.card }}>
            <ListGroup>
              {recentServers.map((server, i) => (
                <ServerRow
                  key={server.url}
                  url={server.url}
                  note={formatLastUsed(server.lastUsedAt)}
                  isLast={i === recentServers.length - 1}
                  onPress={() => edit(server.url)}
                />
              ))}
            </ListGroup>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

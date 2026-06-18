import { Disc3, Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ErrorBanner } from "@/components/ui/error-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSwitch } from "@/components/settings/settings-switch";
import { TILE } from "@/components/settings/tiles";
import {
  useSaveListenBrainzToken,
  useUserSettings,
  useValidateListenBrainzToken,
} from "@/hooks/use-user-settings";
import { listenBrainzStatusLabel } from "@/lib/settings-view";
import type { ButtonPhase } from "@/components/ui/primary-button";
import { useTheme } from "@/theme";

export default function ListenBrainzScreen() {
  const { colors, typography } = useTheme();
  const { data: settings } = useUserSettings();
  const tokenSet = settings?.listenbrainzTokenSet ?? false;

  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState<string | null>(null);
  const [savePhase, setSavePhase] = useState<ButtonPhase>("idle");

  const validate = useValidateListenBrainzToken();
  const save = useSaveListenBrainzToken();

  const trimmed = token.trim();

  const onTest = () => {
    setError(null);
    setValidated(null);
    validate.mutate(trimmed, {
      onSuccess: (res) => {
        if (res.valid) {
          setValidated(res.userName ?? "your account");
        } else {
          setError("That token isn't valid.");
        }
      },
      onError: () => setError("Couldn't reach ListenBrainz. Try again."),
    });
  };

  const onSave = () => {
    setError(null);
    save.mutate(trimmed, {
      onSuccess: () => {
        setSavePhase("ok");
        setToken("");
        setValidated(null);
        setTimeout(() => setSavePhase("idle"), 1200);
      },
      onError: () => {
        setError("That token was rejected. Check it and try again.");
      },
    });
  };

  const onClear = () => {
    setError(null);
    save.mutate(null, {
      onError: () => setError("Couldn't clear the token. Try again."),
    });
  };

  const statusConnected = tokenSet && trimmed.length === 0;

  return (
    <SettingsDetailScreen title="ListenBrainz" backLabel="Settings">
      <SettingsGroup header="Connection">
        <SettingsRow
          icon={<Disc3 size={17} color="#fff" strokeWidth={2.2} />}
          iconBg={TILE.pink}
          title="ListenBrainz"
          value={statusConnected ? listenBrainzStatusLabel(true) : "—"}
          valueColor={statusConnected ? colors.successText : colors.fgMuted}
        />
      </SettingsGroup>

      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        <TextField
          value={token}
          onChangeText={(v) => {
            setToken(v);
            setValidated(null);
            setError(null);
          }}
          placeholder={
            tokenSet ? "•••••• (saved) — enter a new token" : "User token"
          }
          secureTextEntry={!show}
          autoCapitalize="none"
          trailingSlot={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? "Hide token" : "Show token"}
              onPress={() => setShow((s) => !s)}
              hitSlop={8}
              style={{ padding: 12 }}
            >
              {show ? (
                <EyeOff size={18} color={colors.fgMuted} />
              ) : (
                <Eye size={18} color={colors.fgMuted} />
              )}
            </Pressable>
          }
        />
      </View>
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.fgMuted,
          paddingHorizontal: 32,
          marginBottom: 14,
        }}
      >
        Find your token at listenbrainz.org/profile.
      </Text>

      {validated ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 13.5,
            color: colors.successText,
            paddingHorizontal: 32,
            marginBottom: 12,
          }}
        >
          Valid — {validated}
        </Text>
      ) : null}

      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBanner message={error} minHeight={0} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 26 }}>
        <Pressable
          accessibilityRole="button"
          disabled={trimmed.length === 0 || validate.isPending}
          onPress={onTest}
          style={{
            height: 50,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.inputBorder,
            alignItems: "center",
            justifyContent: "center",
            opacity: trimmed.length === 0 || validate.isPending ? 0.4 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 16.5,
              fontWeight: "600",
              letterSpacing: -0.2,
              color: colors.fg,
            }}
          >
            {validate.isPending ? "Testing…" : "Test Connection"}
          </Text>
        </Pressable>
        <PrimaryButton
          onPress={onSave}
          phase={save.isPending ? "busy" : savePhase}
          disabled={trimmed.length === 0}
          busyLabel="Saving…"
          okLabel="Saved"
        >
          Save Token
        </PrimaryButton>
        {tokenSet ? (
          <SettingsGroup>
            <SettingsRow center danger title="Clear Token" onPress={onClear} />
          </SettingsGroup>
        ) : null}
      </View>

      <SettingsGroup
        header="Scrobbling"
        footer="Plays are submitted automatically when a token is connected."
      >
        <SettingsRow
          title="Scrobble plays"
          trailing={<SettingsSwitch value={tokenSet} disabled />}
        />
        <SettingsRow title="Import listening history" value="Coming soon" dim />
      </SettingsGroup>
    </SettingsDetailScreen>
  );
}

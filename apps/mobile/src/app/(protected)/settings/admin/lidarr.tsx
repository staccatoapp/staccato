import type { LidarrOptions } from "@staccato/shared";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CheckList } from "@/components/settings/check-list";
import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldLabel } from "@/components/ui/field-label";
import { PrimaryButton } from "@/components/ui/primary-button";
import type { ButtonPhase } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import {
  useLidarrOptions,
  useLidarrSettings,
  useSaveLidarr,
  useTestLidarr,
} from "@/hooks/use-lidarr";
import { useTheme } from "@/theme";

export default function AdminLidarrScreen() {
  const { colors, typography } = useTheme();

  const { data, isLoading } = useLidarrSettings();
  const savedUrl = data?.url ?? "";
  const apiKeySet = data?.apiKeySet ?? false;

  const [urlInput, setUrlInput] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState<string | null>(null);
  const [keyEverEdited, setKeyEverEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savePhase, setSavePhase] = useState<ButtonPhase>("idle");
  const [testStatus, setTestStatus] = useState<"ok" | "fail" | null>(null);

  const [selectedQualityId, setSelectedQualityId] = useState<number | null>(
    null,
  );
  const [selectedMetadataId, setSelectedMetadataId] = useState<number | null>(
    null,
  );
  const [selectedRootFolder, setSelectedRootFolder] = useState<string | null>(
    null,
  );
  const [testOptions, setTestOptions] = useState<LidarrOptions | null>(null);

  const currentUrl = urlInput !== null ? urlInput : savedUrl;
  const currentKey = keyInput ?? "";
  const urlDirty = urlInput !== null && urlInput !== savedUrl;
  const keyDirty = keyInput !== null && keyInput.length > 0;
  const credsDirty = urlDirty || keyDirty || keyEverEdited;

  const optionsQuery = useLidarrOptions(apiKeySet && !!savedUrl);
  const effectiveOptions: LidarrOptions | null =
    testStatus === "ok" && testOptions
      ? testOptions
      : (optionsQuery.data ?? null);

  const test = useTestLidarr();
  const save = useSaveLidarr();

  // Effective selections derive from (in order): an explicit user pick, the
  // saved setting, then the first available option — no seeding effects needed.
  const qualityId =
    selectedQualityId ??
    data?.qualityProfileId ??
    effectiveOptions?.qualityProfiles[0]?.id ??
    null;
  const metadataId =
    selectedMetadataId ??
    data?.metadataProfileId ??
    effectiveOptions?.metadataProfiles[0]?.id ??
    null;
  const rootFolder =
    selectedRootFolder ??
    data?.rootFolderPath ??
    effectiveOptions?.rootFolders[0]?.path ??
    null;

  const selectionsDiffer =
    (data?.qualityProfileId ?? null) !== qualityId ||
    (data?.metadataProfileId ?? null) !== metadataId ||
    (data?.rootFolderPath ?? null) !== rootFolder;

  const credsAvailable = !credsDirty || testStatus === "ok";
  const haveSelections =
    qualityId !== null && metadataId !== null && rootFolder !== null;
  const canSave =
    haveSelections && credsAvailable && (credsDirty || selectionsDiffer);

  const testEnabled =
    !test.isPending &&
    (urlInput ?? savedUrl).trim().length > 0 &&
    (keyInput ?? "").trim().length > 0;

  const onTest = () => {
    setError(null);
    setTestStatus(null);
    test.mutate(
      {
        url: (urlInput ?? savedUrl).trim(),
        apiKey: (keyInput ?? "").trim(),
      },
      {
        onSuccess: (result) => {
          if (result.connected && result.options) {
            setTestStatus("ok");
            setTestOptions(result.options);
            setSelectedQualityId(result.options.qualityProfiles[0]?.id ?? null);
            setSelectedMetadataId(
              result.options.metadataProfiles[0]?.id ?? null,
            );
            setSelectedRootFolder(result.options.rootFolders[0]?.path ?? null);
          } else {
            setTestStatus("fail");
          }
        },
        onError: () => {
          setTestStatus("fail");
          setError("Couldn't reach Lidarr with those details.");
        },
      },
    );
  };

  const onSave = () => {
    setError(null);
    save.mutate(
      {
        ...(urlDirty ? { url: urlInput!.trim() } : {}),
        ...(keyDirty ? { apiKey: keyInput!.trim() || null } : {}),
        qualityProfileId: qualityId,
        metadataProfileId: metadataId,
        rootFolderPath: rootFolder,
      },
      {
        onSuccess: () => {
          setSavePhase("ok");
          setUrlInput(null);
          setKeyInput(null);
          setKeyEverEdited(false);
          setTestStatus(null);
          setTestOptions(null);
          setTimeout(() => setSavePhase("idle"), 1200);
        },
        onError: () => setError("Couldn't save Lidarr settings. Try again."),
      },
    );
  };

  const qualityOptions = useMemo(
    () =>
      (effectiveOptions?.qualityProfiles ?? []).map((p) => ({
        id: String(p.id),
        label: p.name,
      })),
    [effectiveOptions],
  );
  const metadataOptions = useMemo(
    () =>
      (effectiveOptions?.metadataProfiles ?? []).map((p) => ({
        id: String(p.id),
        label: p.name,
      })),
    [effectiveOptions],
  );
  const rootFolderOptions = useMemo(
    () =>
      (effectiveOptions?.rootFolders ?? []).map((f) => ({
        id: f.path,
        label: f.path,
      })),
    [effectiveOptions],
  );

  return (
    <SettingsDetailScreen title="Lidarr" backLabel="Integrations">
      <SettingsGroup
        header="Connection"
        footer="Request downloads for songs not yet in your library."
      >
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <FieldLabel>Server URL</FieldLabel>
            <TextField
              value={currentUrl}
              onChangeText={(v) => {
                setUrlInput(v);
                setTestStatus(null);
              }}
              placeholder="http://lidarr.local:8686"
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>API key</FieldLabel>
            <TextField
              value={currentKey}
              onChangeText={(v) => {
                setKeyInput(v);
                setKeyEverEdited(true);
                setTestStatus(null);
              }}
              placeholder={apiKeySet ? "•••••• (saved)" : "Lidarr API key"}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              trailingSlot={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showKey ? "Hide API key" : "Show API key"}
                  onPress={() => setShowKey((s) => !s)}
                  hitSlop={8}
                  style={{ padding: 12 }}
                >
                  {showKey ? (
                    <EyeOff size={18} color={colors.fgMuted} />
                  ) : (
                    <Eye size={18} color={colors.fgMuted} />
                  )}
                </Pressable>
              }
            />
          </View>
        </View>
      </SettingsGroup>

      {testStatus ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 13.5,
            color:
              testStatus === "ok" ? colors.successText : colors.destructive,
            paddingHorizontal: 32,
            marginTop: -16,
            marginBottom: 14,
          }}
        >
          {testStatus === "ok" ? "Connected" : "Could not connect"}
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
          disabled={!testEnabled}
          onPress={onTest}
          style={{
            height: 50,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.inputBorder,
            alignItems: "center",
            justifyContent: "center",
            opacity: testEnabled ? 1 : 0.4,
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
            {test.isPending ? "Testing…" : "Test Connection"}
          </Text>
        </Pressable>
        <PrimaryButton
          onPress={onSave}
          phase={save.isPending ? "busy" : savePhase}
          disabled={!canSave || isLoading}
          busyLabel="Saving…"
          okLabel="Saved"
        >
          Save
        </PrimaryButton>
      </View>

      {effectiveOptions ? (
        <>
          <CheckList
            header="Quality profile"
            options={qualityOptions}
            value={qualityId !== null ? String(qualityId) : null}
            onChange={(v) => setSelectedQualityId(Number(v))}
          />
          <CheckList
            header="Metadata profile"
            options={metadataOptions}
            value={metadataId !== null ? String(metadataId) : null}
            onChange={(v) => setSelectedMetadataId(Number(v))}
          />
          <CheckList
            header="Root folder"
            options={rootFolderOptions}
            value={rootFolder}
            onChange={setSelectedRootFolder}
          />
        </>
      ) : null}
    </SettingsDetailScreen>
  );
}

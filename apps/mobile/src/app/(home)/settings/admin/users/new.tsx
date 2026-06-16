import { router } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { Segmented } from "@/components/settings/segmented";
import { SettingsDetailScreen } from "@/components/settings/settings-detail-screen";
import { SettingsGroup } from "@/components/settings/settings-group";
import { FieldLabel } from "@/components/ui/field-label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import type { ButtonPhase } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useCreateUser } from "@/hooks/use-admin-users";
import { ApiError } from "@/lib/api-client";
import { useTheme } from "@/theme";

const MIN_PASSWORD = 8;

export default function AddUserScreen() {
  const { colors, typography } = useTheme();
  const createUser = useCreateUser();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ButtonPhase>("idle");

  const valid = username.trim().length > 0 && password.length >= MIN_PASSWORD;

  const onCreate = () => {
    setError(null);
    createUser.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          setPhase("ok");
          setTimeout(() => router.back(), 700);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setError("That username is already taken.");
          } else {
            setError("Couldn't create the user. Try again.");
          }
        },
      },
    );
  };

  return (
    <SettingsDetailScreen title="Add User" backLabel="Users">
      <SettingsGroup header="New user">
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <FieldLabel>Username</FieldLabel>
            <TextField
              value={username}
              onChangeText={(v) => {
                setUsername(v);
                setError(null);
              }}
              placeholder="e.g. taylor"
              autoCapitalize="none"
            />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>Password</FieldLabel>
            <TextField
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup header="Role">
        <View style={{ padding: 12 }}>
          <Segmented
            value="user"
            options={[
              { id: "user", label: "User" },
              { id: "admin", label: "Admin" },
            ]}
            disabled
          />
        </View>
      </SettingsGroup>
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.fgMuted,
          paddingHorizontal: 32,
          marginTop: -18,
          marginBottom: 22,
        }}
      >
        New users are created as standard members. Role changes are not
        available yet.
      </Text>

      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBanner message={error} minHeight={0} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16 }}>
        <PrimaryButton
          onPress={onCreate}
          phase={createUser.isPending ? "busy" : phase}
          disabled={!valid}
          busyLabel="Creating…"
          okLabel="Created"
        >
          Create User
        </PrimaryButton>
      </View>
    </SettingsDetailScreen>
  );
}

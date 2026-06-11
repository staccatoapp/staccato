import { displayHost, TokenResponseSchema } from "@staccato/shared";
import * as Device from "expo-device";
import { router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldLabel } from "@/components/ui/field-label";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { ApiError, createApiClient } from "@/lib/api-client";
import { getStoredServerUrl, setStoredToken } from "@/lib/auth-storage";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

type Phase = "idle" | "busy" | "err" | "ok";

const OK_HOLD_MS = 750;
const SHAKE_STEP_MS = 80;

const ERROR_MESSAGE =
  "Wrong username or password. Check your details and try again.";

export default function SignInScreen() {
  const { colors, radius, spacing, typography } = useTheme();
  const { signIn } = useSession();
  const reducedMotion = useReducedMotion();
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    getStoredServerUrl().then((url) => setServerUrl(url ?? ""));
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Re-triggers on every failed attempt: -7 -> +6 -> -4 -> +2 -> 0 over 400ms.
  useEffect(() => {
    if (attempt === 0 || reducedMotion) {
      return;
    }
    shakeX.value = withSequence(
      withTiming(-7, { duration: SHAKE_STEP_MS }),
      withTiming(6, { duration: SHAKE_STEP_MS }),
      withTiming(-4, { duration: SHAKE_STEP_MS }),
      withTiming(2, { duration: SHAKE_STEP_MS }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
  }, [attempt, reducedMotion, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const host = displayHost(serverUrl);
  const canSubmit = Boolean(username.trim() && password);

  const clearErr = () => {
    if (phase === "err") {
      setPhase("idle");
    }
  };

  const submit = async () => {
    if (!canSubmit || phase === "busy" || phase === "ok") {
      return;
    }
    setPhase("busy");
    try {
      const { token } = await createApiClient(serverUrl).post(
        "/api/auth/token",
        {
          username: username.trim(),
          password,
          deviceName: Device.deviceName ?? undefined,
        },
        TokenResponseSchema,
      );
      await setStoredToken(token);
      setPhase("ok");
      timers.current.push(
        setTimeout(() => signIn({ serverUrl, token }), OK_HOLD_MS),
      );
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) {
        console.warn("sign-in request failed", { host, err });
      }
      setPhase("err");
      setAttempt((a) => a + 1);
    }
  };

  return (
    <Screen scroll>
      {/* connected-server chip */}
      <View
        style={{
          marginTop: 66,
          marginHorizontal: spacing.card,
          backgroundColor: colors.bgRaised,
          borderRadius: radius.card,
          paddingVertical: 11,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.successText,
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: typography.fontFamily,
            fontSize: 14.5,
            fontWeight: "500",
            letterSpacing: -0.2,
            color: colors.fg,
          }}
        >
          {host}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 14.5,
              fontWeight: "600",
              color: colors.primaryText,
            }}
          >
            Change
          </Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          {
            paddingTop: 28,
            paddingHorizontal: spacing.screen,
            paddingBottom: 40,
          },
          shakeStyle,
        ]}
      >
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 30,
            fontWeight: "700",
            letterSpacing: -0.5,
            lineHeight: 30 * 1.15,
            color: colors.fg,
          }}
        >
          Sign in
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
          {`Use your account on ${host}.`}
        </Text>

        <View style={{ marginTop: 28, gap: 18 }}>
          <View>
            <FieldLabel>Username</FieldLabel>
            <TextField
              value={username}
              onChangeText={(v) => {
                setUsername(v);
                clearErr();
              }}
              placeholder="Username"
              returnKeyType="next"
              onSubmitEditing={submit}
              error={phase === "err"}
            />
          </View>
          <View>
            <FieldLabel>Password</FieldLabel>
            <TextField
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearErr();
              }}
              placeholder="Password"
              secureTextEntry={!showPw}
              returnKeyType="go"
              onSubmitEditing={submit}
              error={phase === "err"}
              trailingSlot={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPw ? "Hide password" : "Show password"
                  }
                  onPress={() => setShowPw((s) => !s)}
                  style={{
                    width: spacing.minHitTarget,
                    height: spacing.minHitTarget,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showPw ? (
                    <EyeOff size={19} color={colors.fgMuted} />
                  ) : (
                    <Eye size={19} color={colors.fgMuted} />
                  )}
                </Pressable>
              }
            />
          </View>
        </View>

        {/* error banner — space reserved so the button doesn't jump */}
        <View style={{ marginTop: 14 }}>
          <ErrorBanner message={phase === "err" ? ERROR_MESSAGE : null} />
        </View>

        <PrimaryButton
          phase={phase === "busy" ? "busy" : phase === "ok" ? "ok" : "idle"}
          disabled={!canSubmit}
          onPress={submit}
          busyLabel="Signing in…"
          okLabel="Welcome back"
        >
          Sign in
        </PrimaryButton>
      </Animated.View>
    </Screen>
  );
}

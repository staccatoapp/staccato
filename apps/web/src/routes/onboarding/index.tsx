import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Disc3, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useValidateLBToken,
  useSaveLBToken,
} from "@/hooks/use-listenbrainz-token";

// TODO - a lot of functionality shared between steps. can be separated out along with each step. why do this later and not now? because i looooove leaving huge piles of tech debt behind
export const Route = createFileRoute("/onboarding/")({
  component: OnboardingPage,
});

type Phase =
  | "intro"
  | "signup"
  | "login"
  | "listenbrainz"
  | "lidarr"
  | "welcome";

const TRANSITION_MS = 350;

/* ── Shared arrow button ── */
function ArrowBtn({
  onClick,
  disabled,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "oklch(0.70 0.18 45)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "oklch(0.985 0 0)",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s, transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "oklch(0.60 0.16 45)";
          (e.currentTarget as HTMLButtonElement).style.transform =
            "scale(1.06)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 4px 16px oklch(0.70 0.18 45 / 30%)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "oklch(0.70 0.18 45)";
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      <ArrowRight size={15} strokeWidth={2.5} />
    </button>
  );
}

/* ── Skip button ── */
function SkipBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "0.8125rem",
        color: "oklch(0.45 0 0)",
        padding: "4px 0",
        marginTop: 4,
        textAlign: "left",
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.708 0 0)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.45 0 0)";
      }}
    >
      Skip for now
    </button>
  );
}

/* ── Step header ── */
function StepHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: "1.375rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "oklch(0.985 0 0)",
          lineHeight: 1.2,
          marginBottom: subtitle ? 8 : 0,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "oklch(0.708 0 0)",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

/* ── Error message ── */
function ErrMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div
      style={{
        fontSize: "0.75rem",
        color: "oklch(0.704 0.191 22.216)",
        marginTop: 2,
      }}
    >
      {msg}
    </div>
  );
}

/* ── STEP 1a: Login ── */
function LoginStep({
  username,
  setUsername,
  password,
  setPassword,
  errors,
  onSubmit,
  loading,
}: {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  errors: Record<string, string>;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <Input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className={cn(
            errors.username &&
              "border-destructive focus-visible:ring-destructive/20",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
        />
        <ErrMsg msg={errors.username} />
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              errors.password &&
                "border-destructive focus-visible:ring-destructive/20",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <ArrowBtn onClick={onSubmit} disabled={loading} title="Log in" />
        </div>
        <ErrMsg msg={errors.password} />
      </div>
    </div>
  );
}

/* ── STEP 1b: Sign Up ── */
function SignupStep({
  username,
  setUsername,
  password,
  setPassword,
  confirmPw,
  setConfirmPw,
  errors,
  onSubmit,
  loading,
}: {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  confirmPw: string;
  setConfirmPw: (v: string) => void;
  errors: Record<string, string>;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <StepHeader title="Create an admin account" />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <Input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className={cn(
              errors.username &&
                "border-destructive focus-visible:ring-destructive/20",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <ErrMsg msg={errors.username} />
        </div>
        <div>
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              errors.password &&
                "border-destructive focus-visible:ring-destructive/20",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <ErrMsg msg={errors.password} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Input
              placeholder="Confirm password"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={cn(
                errors.confirmPw &&
                  "border-destructive focus-visible:ring-destructive/20",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
            />
            <ArrowBtn onClick={onSubmit} disabled={loading} title="Continue" />
          </div>
          <ErrMsg msg={errors.confirmPw} />
        </div>
      </div>
    </div>
  );
}

/* ── STEP 2: ListenBrainz ── */
function ListenbrainzStep({
  token,
  setToken,
  errors,
  onSubmit,
  onSkip,
  loading,
}: {
  token: string;
  setToken: (v: string) => void;
  errors: Record<string, string>;
  onSubmit: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <StepHeader
        title="Connect to Listenbrainz"
        subtitle={
          <>
            Staccato uses Listenbrainz to generate recommendations.{" "}
            <a
              href="#"
              target="_blank"
              rel="noopener"
              style={{ color: "oklch(0.70 0.18 45)", textDecoration: "none" }}
            >
              See the docs
            </a>{" "}
            to find out more.
          </>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Input
              placeholder="Listenbrainz token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              className={cn(
                errors.lbToken &&
                  "border-destructive focus-visible:ring-destructive/20",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
            />
            <ArrowBtn onClick={onSubmit} disabled={loading} title="Continue" />
          </div>
          <ErrMsg msg={errors.lbToken} />
        </div>
        <SkipBtn onClick={onSkip} />
      </div>
    </div>
  );
}

/* ── STEP 3: Lidarr ── */
function LidarrStep({
  url,
  setUrl,
  apiKey,
  setApiKey,
  errors,
  onSubmit,
  onSkip,
}: {
  url: string;
  setUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  errors: Record<string, string>;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <StepHeader
        title="Connect to Lidarr"
        subtitle={
          <>
            Staccato uses Lidarr to download releases.{" "}
            <a
              href="#"
              target="_blank"
              rel="noopener"
              style={{ color: "oklch(0.70 0.18 45)", textDecoration: "none" }}
            >
              See the docs
            </a>{" "}
            to find out more.
          </>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <Input
            placeholder="Lidarr URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
            className={cn(
              errors.lidarrUrl &&
                "border-destructive focus-visible:ring-destructive/20",
            )}
          />
          <ErrMsg msg={errors.lidarrUrl} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Input
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={cn(
                errors.lidarrKey &&
                  "border-destructive focus-visible:ring-destructive/20",
              )}
            />
            <ArrowBtn onClick={onSubmit} title="Continue" />
          </div>
          <ErrMsg msg={errors.lidarrKey} />
        </div>
        <SkipBtn onClick={onSkip} />
      </div>
    </div>
  );
}

/* ── STEP 4: Welcome ── */
function WelcomeStep({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        <div
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "oklch(0.70 0.18 45)",
            marginBottom: 14,
          }}
        >
          You're all set
        </div>
        <div
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "oklch(0.985 0 0)",
            lineHeight: 1.15,
            marginBottom: 12,
          }}
        >
          Welcome to Staccato.
        </div>
        <div
          style={{
            fontSize: "0.875rem",
            color: "oklch(0.708 0 0)",
            lineHeight: 1.6,
            marginBottom: 36,
          }}
        >
          Your library is ready. Start scanning to import your music, or go
          straight to exploring.
        </div>
        <button
          onClick={onOpen}
          style={{
            background: "oklch(0.70 0.18 45)",
            color: "oklch(0.985 0 0)",
            border: "none",
            borderRadius: 9999,
            padding: "11px 28px",
            fontFamily: "inherit",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "background 0.15s, transform 0.1s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "oklch(0.60 0.16 45)";
            el.style.transform = "scale(1.03)";
            el.style.boxShadow = "0 4px 20px oklch(0.70 0.18 45 / 35%)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "oklch(0.70 0.18 45)";
            el.style.transform = "scale(1)";
            el.style.boxShadow = "none";
          }}
        >
          Open Staccato
        </button>
      </div>
    </div>
  );
}

/* ── Main page ── */
function OnboardingPage() {
  const navigate = useNavigate();
  const validateMutation = useValidateLBToken();
  const saveMutation = useSaveLBToken();

  const [phase, setPhase] = useState<Phase>("intro");
  const [logoUp, setLogoUp] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [glowWelcome, setGlowWelcome] = useState(false);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [lbToken, setLbToken] = useState("");
  const [lidarrUrl, setLidarrUrl] = useState("");
  const [lidarrKey, setLidarrKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const res = await fetch("/api/auth/status");
      const { setupComplete } = await res.json();
      if (cancelled) return;

      const targetPhase: Phase = setupComplete ? "login" : "signup";

      setTimeout(() => {
        if (cancelled) return;
        setLogoUp(true);
        setTimeout(() => {
          if (cancelled) return;
          setPhase(targetPhase);
          setTimeout(() => {
            if (!cancelled) setContentVisible(true);
          }, 60);
        }, 700);
      }, 900);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  function transitionTo(next: Phase) {
    setContentVisible(false);
    setTimeout(() => {
      setPhase(next);
      if (next === "welcome") setGlowWelcome(true);
      setTimeout(() => setContentVisible(true), 60);
    }, TRANSITION_MS + 60);
  }

  async function navigateToApp() {
    await fetch("/api/auth/complete-onboarding", { method: "POST" });
    navigate({ to: "/library" });
  }

  async function handleSetup() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "Required";
    if (password.length < 8) e.password = "At least 8 characters";
    if (password !== confirmPw) e.confirmPw = "Passwords don't match";
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors({ username: data.error ?? "Setup failed" });
        return;
      }
      transitionTo("listenbrainz");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "Required";
    if (!password.trim()) e.password = "Required";
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setErrors({ password: "Invalid credentials" });
        return;
      }
      const user = await res.json();
      if (user.onboardingComplete) {
        navigate({ to: "/library" });
      } else {
        transitionTo("listenbrainz");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleListenbrainz() {
    if (!lbToken.trim()) {
      setErrors({ lbToken: "Required" });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const result = await validateMutation.mutateAsync(lbToken);
      if (!result.valid) {
        setErrors({ lbToken: "Invalid token" });
        return;
      }
      await saveMutation.mutateAsync(lbToken);
      transitionTo("lidarr");
    } catch {
      setErrors({ lbToken: "Failed to validate token" });
    } finally {
      setLoading(false);
    }
  }

  function handleLidarr() {
    const e: Record<string, string> = {};
    if (!lidarrUrl.trim()) e.lidarrUrl = "Required";
    if (!lidarrKey.trim()) e.lidarrKey = "Required";
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    transitionTo("welcome");
  }

  const logoIconSize = logoUp ? 30 : 40;
  const logoFontSize = logoUp ? "1.375rem" : "1.875rem";
  const spacerHeight = logoUp ? "18vh" : "42vh";

  return (
    <div style={{ flex: 1, display: "flex", minHeight: "100dvh" }}>
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: glowWelcome
            ? "radial-gradient(circle, oklch(0.70 0.18 45 / 12%) 0%, transparent 65%)"
            : "radial-gradient(circle, oklch(0.70 0.18 45 / 6%) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: glowWelcome
            ? "glow-pulse 3s ease-in-out infinite"
            : undefined,
          transition: "opacity 1.2s ease",
        }}
      />

      {/* Stage */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "0 24px 64px",
          position: "relative",
        }}
      >
        {/* Spacer animates logo from centre → top */}
        <div
          style={{
            height: spacerHeight,
            transition: "height 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* Logo — persists across all steps */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            userSelect: "none",
            flexShrink: 0,
            animation: "fadeUp 0.7s ease forwards",
          }}
        >
          <Disc3
            color="oklch(0.70 0.18 45)"
            style={{
              width: logoIconSize,
              height: logoIconSize,
              flexShrink: 0,
              transition:
                "width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <span
            style={{
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "oklch(0.985 0 0)",
              fontSize: logoFontSize,
              transition: "font-size 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            Staccato
          </span>
        </div>

        {/* Content area */}
        {phase !== "intro" && (
          <div style={{ width: "100%", maxWidth: 480, marginTop: 40 }}>
            <div
              style={{
                opacity: contentVisible ? 1 : 0,
                transform: contentVisible ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 0.35s ease, transform 0.35s ease",
                pointerEvents: contentVisible ? undefined : "none",
              }}
            >
              {phase === "signup" && (
                <SignupStep
                  username={username}
                  setUsername={setUsername}
                  password={password}
                  setPassword={setPassword}
                  confirmPw={confirmPw}
                  setConfirmPw={setConfirmPw}
                  errors={errors}
                  onSubmit={handleSetup}
                  loading={loading}
                />
              )}
              {phase === "login" && (
                <LoginStep
                  username={username}
                  setUsername={setUsername}
                  password={password}
                  setPassword={setPassword}
                  errors={errors}
                  onSubmit={handleLogin}
                  loading={loading}
                />
              )}
              {phase === "listenbrainz" && (
                <ListenbrainzStep
                  token={lbToken}
                  setToken={setLbToken}
                  errors={errors}
                  onSubmit={handleListenbrainz}
                  loading={loading}
                  onSkip={() => {
                    setErrors({});
                    transitionTo("lidarr");
                  }}
                />
              )}
              {phase === "lidarr" && (
                <LidarrStep
                  url={lidarrUrl}
                  setUrl={setLidarrUrl}
                  apiKey={lidarrKey}
                  setApiKey={setLidarrKey}
                  errors={errors}
                  onSubmit={handleLidarr}
                  onSkip={() => {
                    setErrors({});
                    transitionTo("welcome");
                  }}
                />
              )}
              {phase === "welcome" && <WelcomeStep onOpen={navigateToApp} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

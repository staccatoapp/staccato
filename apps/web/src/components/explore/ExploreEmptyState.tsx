import { Link } from "@tanstack/react-router";
import { Music2, Settings, Sparkles, User } from "lucide-react";

export function ExploreEmptyState({
  reason,
}: {
  reason: "no-id" | "no-listens";
}) {
  const isNoId = reason === "no-id";

  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 max-w-sm mx-auto">
      <div
        className={[
          "w-18 h-18 rounded-full flex items-center justify-center mb-6 shrink-0",
          isNoId
            ? "bg-amber-500/10 border border-amber-500/20"
            : "bg-sky-500/10 border border-sky-500/20",
        ].join(" ")}
      >
        {isNoId ? (
          <User className="w-6.5 h-6.5 text-amber-400" />
        ) : (
          <Sparkles className="w-6.5 h-6.5 text-sky-400" />
        )}
      </div>

      <h2 className="text-base font-bold tracking-tight mb-2.5">
        {isNoId
          ? "Connect your ListenBrainz account"
          : "Not enough listens yet"}
      </h2>

      <p className="text-sm text-muted-foreground leading-relaxed mb-6 text-pretty">
        {isNoId
          ? "To generate personalised recommendations, Staccato needs your ListenBrainz user ID. Head to Settings to add it — it only takes a moment."
          : "Your recommendations will appear here once you've scrobbled more tracks. Keep listening and check back soon."}
      </p>

      {isNoId ? (
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 px-4.5 py-2 rounded-full text-[0.8125rem] font-semibold bg-amber-500/12 border border-amber-500/28 text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Go to Settings
        </Link>
      ) : (
        <div className="inline-flex items-center gap-2 px-4.5 py-2 rounded-full text-[0.8125rem] font-medium border border-border text-muted-foreground">
          <Music2 className="w-3.5 h-3.5" />
          Keep scrobbling to unlock
        </div>
      )}

      <p className="text-xs text-muted-foreground/60 mt-4 leading-relaxed">
        {isNoId
          ? 'Your ListenBrainz ID is your public username, e.g. "jane_doe"'
          : "Recommendations typically appear after ~50 listens"}
      </p>
    </div>
  );
}

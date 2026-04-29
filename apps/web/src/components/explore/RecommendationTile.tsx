import { useState } from "react";
import { Play } from "lucide-react";

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")";

export interface RecommendationPlaylist {
  id: string;
  name: string;
  description: string;
  tag: string;
  trackCount: number;
  gradient: string;
  accentColor: string;
}

export function RecommendationTile({
  rec,
  onClick,
}: {
  rec: RecommendationPlaylist;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative rounded-[10px] overflow-hidden cursor-pointer"
      style={{
        aspectRatio: "16/9",
        background: rec.gradient,
        boxShadow: hovered
          ? "0 8px 28px oklch(0 0 0 / 55%)"
          : "0 2px 10px oklch(0 0 0 / 40%)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "box-shadow 0.2s, transform 0.2s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Noise texture */}
      <div
        className="absolute inset-0"
        style={{
          background: NOISE_SVG,
          backgroundSize: "cover",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />

      {/* Bottom scrim */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, oklch(0 0 0 / 75%) 0%, oklch(0 0 0 / 10%) 60%, transparent 100%)",
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 p-[10px_14px] flex flex-col justify-between">
        {/* Tag */}
        <span
          className="self-start text-[0.62rem] font-semibold tracking-[0.08em] uppercase px-[7px] py-[2px] rounded-[4px]"
          style={{
            color: rec.accentColor,
            background: "oklch(0 0 0 / 35%)",
            backdropFilter: "blur(4px)",
            lineHeight: 1.6,
          }}
        >
          {rec.tag}
        </span>

        {/* Bottom row: text + play */}
        <div className="flex items-end justify-between">
          <div>
            <div
              className="text-[1rem] font-bold text-white tracking-[-0.02em] leading-[1.2]"
              style={{ textShadow: "0 1px 4px oklch(0 0 0 / 60%)" }}
            >
              {rec.name}
            </div>
            <div
              className="text-[0.72rem] mt-[3px] leading-[1.4]"
              style={{
                color: "oklch(1 0 0 / 70%)",
                textShadow: "0 1px 3px oklch(0 0 0 / 60%)",
              }}
            >
              {rec.description} · {rec.trackCount} tracks
            </div>
          </div>

          {/* Play button */}
          <button
            className="w-9 h-9 rounded-full bg-white shrink-0 flex items-center justify-center"
            style={{
              color: "oklch(0.15 0 0)",
              opacity: hovered ? 1 : 0,
              transform: hovered ? "scale(1)" : "scale(0.85)",
              transition: "opacity 0.18s, transform 0.18s",
              boxShadow: "0 2px 10px oklch(0 0 0 / 50%)",
              border: "none",
            }}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import Svg, { Circle } from "react-native-svg";

interface DownloadRingProps {
  /** 0–1 completion fraction. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Progress arc colour. */
  color?: string;
  /** Unfilled track colour. */
  trackColor?: string;
}

/**
 * A determinate circular progress ring for the offline-download button — fills
 * clockwise from the top as each track lands. Built on react-native-svg (already
 * present transitively via lucide); the arc is a stroked circle whose
 * `strokeDashoffset` shrinks with progress, rotated so 0% starts at 12 o'clock.
 */
export function DownloadRing({
  progress,
  size = 30,
  strokeWidth = 3,
  color = "#ffffff",
  trackColor = "rgba(255,255,255,0.25)",
}: DownloadRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}

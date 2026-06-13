import { render, screen } from "@testing-library/react-native";
import React from "react";
import type { SyncedLyricsLine } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { LyricsView } from "./lyrics-view";

const LINES: SyncedLyricsLine[] = [
  { startingTime: 0, lyrics: "Now here you go again" },
  { startingTime: 5, lyrics: "You say you want your freedom" },
  { startingTime: 12, lyrics: "" },
  { startingTime: 20, lyrics: "Well, who am I to keep you down?" },
];

function renderLyrics(position: number) {
  render(
    <StaccatoThemeProvider>
      <LyricsView lines={LINES} position={position} />
    </StaccatoThemeProvider>,
  );
}

describe("LyricsView", () => {
  it("renders every lyric line", () => {
    renderLyrics(0);
    expect(screen.getByText("Now here you go again")).toBeTruthy();
    expect(screen.getByText("You say you want your freedom")).toBeTruthy();
    expect(screen.getByText("Well, who am I to keep you down?")).toBeTruthy();
  });

  it("highlights the latest line whose timestamp has passed", () => {
    renderLyrics(6);
    expect(screen.getByTestId("lyrics-line-1")).toHaveStyle({ opacity: 1 });
  });

  it("dims other lines by distance from the active line", () => {
    renderLyrics(6);
    // distance 1 from active: max(0.32, 0.62 - 1*0.06) = 0.56
    expect(screen.getByTestId("lyrics-line-0")).toHaveStyle({ opacity: 0.56 });
  });

  it("renders instrumental gaps as invisible spacers", () => {
    renderLyrics(13);
    expect(screen.getByTestId("lyrics-line-2")).toHaveStyle({ opacity: 0 });
  });
});

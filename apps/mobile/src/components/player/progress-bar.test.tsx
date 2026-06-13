import { render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { ProgressBar } from "./progress-bar";

function renderBar(position: number, duration: number) {
  render(
    <StaccatoThemeProvider>
      <ProgressBar position={position} duration={duration} onSeek={jest.fn()} />
    </StaccatoThemeProvider>,
  );
}

describe("ProgressBar", () => {
  it("shows elapsed time and negative remaining time", () => {
    renderBar(63, 254);
    expect(screen.getByText("1:03")).toBeTruthy();
    expect(screen.getByText("-3:11")).toBeTruthy();
  });

  it("sizes the fill from position/duration", () => {
    renderBar(63.5, 254);
    expect(screen.getByTestId("progress-bar-fill")).toHaveStyle({
      width: "25%",
    });
  });

  it("renders an empty bar for an unknown duration", () => {
    renderBar(10, 0);
    expect(screen.getByTestId("progress-bar-fill")).toHaveStyle({
      width: "0%",
    });
    expect(screen.getByText("0:10")).toBeTruthy();
    expect(screen.getByText("-0:00")).toBeTruthy();
  });
});

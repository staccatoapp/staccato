import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { UtilityPills } from "./utility-pills";

function renderPills(
  props: Partial<React.ComponentProps<typeof UtilityPills>> = {},
) {
  const merged = {
    lyricsAvailable: true,
    lyricsActive: false,
    onToggleLyrics: jest.fn(),
    onOpenQueue: jest.fn(),
    onOpenDeviceSwitcher: jest.fn(),
    activeDeviceName: "This iPhone",
    ...props,
  };
  render(
    <StaccatoThemeProvider>
      <UtilityPills {...merged} />
    </StaccatoThemeProvider>,
  );
  return merged;
}

describe("UtilityPills", () => {
  it("renders the three labeled pills", () => {
    renderPills();
    expect(screen.getByText("This iPhone")).toBeTruthy();
    expect(screen.getByText("Lyrics")).toBeTruthy();
    expect(screen.getByText("Up Next")).toBeTruthy();
  });

  it("opens the device switcher from the output pill", () => {
    const props = renderPills();
    fireEvent.press(screen.getByTestId("pill-output"));
    expect(props.onOpenDeviceSwitcher).toHaveBeenCalled();
  });

  it("toggles lyrics from the lyrics pill", () => {
    const props = renderPills();
    fireEvent.press(screen.getByTestId("pill-lyrics"));
    expect(props.onToggleLyrics).toHaveBeenCalled();
  });

  it("disables the lyrics pill when no lyrics exist", () => {
    const props = renderPills({ lyricsAvailable: false });
    expect(screen.getByTestId("pill-lyrics")).toBeDisabled();
    fireEvent.press(screen.getByTestId("pill-lyrics"));
    expect(props.onToggleLyrics).not.toHaveBeenCalled();
  });

  it("opens the queue from the up-next pill", () => {
    const props = renderPills();
    fireEvent.press(screen.getByTestId("pill-up-next"));
    expect(props.onOpenQueue).toHaveBeenCalled();
  });
});

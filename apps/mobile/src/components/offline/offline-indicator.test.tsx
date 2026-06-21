import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";

import { OfflineIndicator } from "./offline-indicator";

function renderIndicator(
  status: "offline" | "reconnecting",
  onRetry = jest.fn(),
) {
  render(
    <StaccatoThemeProvider>
      <OfflineIndicator status={status} onRetry={onRetry} />
    </StaccatoThemeProvider>,
  );
  return onRetry;
}

describe("OfflineIndicator", () => {
  it("shows the offline copy and a working Try again button", () => {
    const onRetry = renderIndicator("offline");

    expect(screen.getByText("You're offline")).toBeOnTheScreen();
    expect(screen.getByText("Playing from your downloads")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows reconnecting copy and disables retry while a probe is in flight", () => {
    const onRetry = renderIndicator("reconnecting");

    expect(screen.getByText("Reconnecting…")).toBeOnTheScreen();
    expect(screen.getByText("Trying to reach Staccato")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Retrying"));
    expect(onRetry).not.toHaveBeenCalled();
  });
});

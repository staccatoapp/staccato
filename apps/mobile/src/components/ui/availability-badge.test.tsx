import { render, screen } from "@testing-library/react-native";
import React from "react";

import type { AvailabilityState } from "@/lib/availability";
import { StaccatoThemeProvider } from "@/theme";

import { AvailabilityBadge } from "./availability-badge";

function renderBadge(state: AvailabilityState) {
  return render(
    <StaccatoThemeProvider>
      <AvailabilityBadge state={state} />
    </StaccatoThemeProvider>,
  );
}

describe("AvailabilityBadge", () => {
  const cases: [AvailabilityState, string][] = [
    ["downloaded", "Downloaded to device"],
    ["inLibrary", "In your library"],
    ["partial", "Partially in your library"],
    ["recommended", "Not in your library"],
  ];

  it.each(cases)("labels the %s state as %s", (state, label) => {
    renderBadge(state);
    expect(screen.getByLabelText(label)).toBeOnTheScreen();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { PrimaryButton } from "./primary-button";

function renderButton(
  props: Partial<React.ComponentProps<typeof PrimaryButton>>,
) {
  return render(
    <StaccatoThemeProvider>
      <PrimaryButton onPress={() => {}} {...props}>
        Continue
      </PrimaryButton>
    </StaccatoThemeProvider>,
  );
}

describe("PrimaryButton", () => {
  it("shows the idle label and fires onPress", () => {
    const onPress = jest.fn();
    renderButton({ onPress });
    fireEvent.press(screen.getByText("Continue"));
    expect(onPress).toHaveBeenCalled();
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    renderButton({ onPress, disabled: true });
    fireEvent.press(screen.getByText("Continue"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows the busy label and blocks presses while busy", () => {
    const onPress = jest.fn();
    renderButton({ onPress, phase: "busy", busyLabel: "Checking…" });
    expect(screen.getByText("Checking…")).toBeOnTheScreen();
    expect(screen.queryByText("Continue")).not.toBeOnTheScreen();
    fireEvent.press(screen.getByText("Checking…"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows the ok label and blocks presses in the ok phase", () => {
    const onPress = jest.fn();
    renderButton({ onPress, phase: "ok", okLabel: "Connected" });
    expect(screen.getByText("Connected")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Connected"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

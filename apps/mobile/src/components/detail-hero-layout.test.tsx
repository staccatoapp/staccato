import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";

import { StaccatoThemeProvider } from "@/theme";
import { DetailHeroLayout } from "./detail-hero-layout";

function renderLayout(
  overrides: Partial<React.ComponentProps<typeof DetailHeroLayout>> = {},
) {
  const onBack = jest.fn();
  render(
    <StaccatoThemeProvider>
      <DetailHeroLayout
        title="Test Album"
        gradientColors={["#e63946", "#1d3557"]}
        onBack={onBack}
        hero={<View testID="hero-slot" />}
        {...overrides}
      >
        <View testID="content-slot" />
      </DetailHeroLayout>
    </StaccatoThemeProvider>,
  );
  return { onBack };
}

describe("DetailHeroLayout", () => {
  it("renders the back button", () => {
    renderLayout();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("calls onBack when the back button is pressed", () => {
    const { onBack } = renderLayout();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the persistent More button", () => {
    renderLayout();
    expect(screen.getByLabelText("More")).toBeTruthy();
  });

  it("renders the hero slot", () => {
    renderLayout();
    expect(screen.getByTestId("hero-slot")).toBeTruthy();
  });

  it("renders the children slot", () => {
    renderLayout();
    expect(screen.getByTestId("content-slot")).toBeTruthy();
  });

  it("renders the collapsed title text", () => {
    renderLayout();
    expect(screen.getByText("Test Album")).toBeTruthy();
  });
});

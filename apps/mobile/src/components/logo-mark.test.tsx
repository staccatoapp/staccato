import { render } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  it("renders statically without crashing", () => {
    const { toJSON } = render(
      <StaccatoThemeProvider>
        <LogoMark size={34} />
      </StaccatoThemeProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders with the pulse animation enabled", () => {
    const { toJSON } = render(
      <StaccatoThemeProvider>
        <LogoMark size={72} pulse />
      </StaccatoThemeProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });
});

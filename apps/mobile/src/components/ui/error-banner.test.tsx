import { render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { ErrorBanner } from "./error-banner";

describe("ErrorBanner", () => {
  it("renders the error message when present", () => {
    render(
      <StaccatoThemeProvider>
        <ErrorBanner message="Wrong username or password." />
      </StaccatoThemeProvider>,
    );
    expect(screen.getByText("Wrong username or password.")).toBeOnTheScreen();
  });

  it("renders nothing visible (but keeps the slot) when message is null", () => {
    render(
      <StaccatoThemeProvider>
        <ErrorBanner message={null} />
      </StaccatoThemeProvider>,
    );
    expect(screen.queryByText(/./)).not.toBeOnTheScreen();
  });
});

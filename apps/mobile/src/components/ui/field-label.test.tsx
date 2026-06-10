import { render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { FieldLabel } from "./field-label";

describe("FieldLabel", () => {
  it("renders the label text in the uppercase recipe", () => {
    render(
      <StaccatoThemeProvider>
        <FieldLabel>Server address</FieldLabel>
      </StaccatoThemeProvider>,
    );
    const label = screen.getByText("Server address");
    expect(label).toBeOnTheScreen();
    expect(label).toHaveStyle({ textTransform: "uppercase", fontSize: 13 });
  });
});

import { render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";

import { AlbumArt } from "./album-art";

// AlbumArt renders authed artwork via StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.example.com", token: "tok" },
  }),
}));

function renderArt(props: Partial<React.ComponentProps<typeof AlbumArt>>) {
  return render(
    <StaccatoThemeProvider>
      <AlbumArt gradientKey="sunset" {...props} />
    </StaccatoThemeProvider>,
  );
}

describe("AlbumArt", () => {
  it("renders the placeholder music glyph when there is no artwork", () => {
    renderArt({});
    expect(screen.getByTestId("album-art-glyph")).toBeOnTheScreen();
  });

  it("defaults to a 120pt square", () => {
    renderArt({});
    expect(screen.getByTestId("album-art")).toHaveStyle({
      width: 120,
      height: 120,
    });
  });

  it("applies a custom size and radius", () => {
    renderArt({ size: 48, radius: 6 });
    expect(screen.getByTestId("album-art")).toHaveStyle({
      width: 48,
      height: 48,
      borderRadius: 6,
    });
  });

  it("renders the artwork image instead of the glyph when artUrl is set", () => {
    renderArt({ artUrl: "https://example.com/cover.jpg" });
    expect(screen.getByTestId("album-art-image")).toBeOnTheScreen();
    expect(screen.queryByTestId("album-art-glyph")).not.toBeOnTheScreen();
  });
});

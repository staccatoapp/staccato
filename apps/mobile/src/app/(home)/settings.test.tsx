import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";

import SettingsScreen from "./settings";

const mockSignOut = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
    isLoading: false,
    signIn: jest.fn(),
    signOut: mockSignOut,
  }),
}));

describe("SettingsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("signs out when the Sign out button is pressed", () => {
    render(
      <StaccatoThemeProvider>
        <SettingsScreen />
      </StaccatoThemeProvider>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

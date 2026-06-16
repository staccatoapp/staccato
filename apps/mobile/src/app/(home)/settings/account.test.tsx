import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import AccountScreen from "./account";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockSignOut = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
    isLoading: false,
    signIn: jest.fn(),
    signOut: mockSignOut,
  }),
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: { username: "alex", isAdmin: true } }),
}));

function renderScreen() {
  return render(
    <StaccatoThemeProvider>
      <AccountScreen />
    </StaccatoThemeProvider>,
  );
}

describe("AccountScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("signs out when Sign Out is pressed", () => {
    renderScreen();
    fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("shows the instance host and admin role", () => {
    renderScreen();
    expect(screen.getByText("music.home.arpa")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("shows display name and email as not set (greyed)", () => {
    renderScreen();
    expect(screen.getByText("Display name")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    // Both unsupported profile fields render the same "Not set" placeholder.
    expect(screen.getAllByText("Not set")).toHaveLength(2);
  });
});

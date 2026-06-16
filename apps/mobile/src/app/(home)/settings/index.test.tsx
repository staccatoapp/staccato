import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import SettingsScreen from "./index";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
    isLoading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockUser = jest.fn();
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser(),
}));

jest.mock("@/hooks/use-user-settings", () => ({
  useUserSettings: () => ({
    data: { listenbrainzTokenSet: false, volume: 80 },
  }),
}));

function renderScreen() {
  return render(
    <StaccatoThemeProvider>
      <SettingsScreen />
    </StaccatoThemeProvider>,
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows personal categories and no Admin control for non-admins", () => {
    mockUser.mockReturnValue({ data: { username: "alex", isAdmin: false } });
    renderScreen();

    expect(screen.getByText("Services")).toBeTruthy();
    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("renders greyed categories as non-interactive", () => {
    mockUser.mockReturnValue({ data: { username: "alex", isAdmin: false } });
    renderScreen();

    // Backed category is a button; greyed placeholder is not.
    expect(screen.getByRole("button", { name: /Services/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Networking/ })).toBeNull();
    expect(screen.getByText("Networking")).toBeTruthy();
  });

  it("navigates to the ListenBrainz screen from Services", () => {
    mockUser.mockReturnValue({ data: { username: "alex", isAdmin: false } });
    renderScreen();

    fireEvent.press(screen.getByRole("button", { name: /Services/ }));
    expect(router.push).toHaveBeenCalledWith("/(home)/settings/listenbrainz");
  });

  it("exposes the Admin segment and admin categories for admins", () => {
    mockUser.mockReturnValue({ data: { username: "alex", isAdmin: true } });
    renderScreen();

    expect(screen.getByText("Admin")).toBeTruthy();

    fireEvent.press(screen.getByText("Admin"));
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("Maintenance")).toBeTruthy();
  });
});

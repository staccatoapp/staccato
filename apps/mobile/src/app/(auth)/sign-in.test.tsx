import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import { getStoredServerUrl, setStoredToken } from "@/lib/auth-storage";
import { StaccatoThemeProvider } from "@/theme";
import SignInScreen from "@/app/(auth)/sign-in";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock("expo-device", () => ({ deviceName: "Test Phone" }));
jest.mock("@/lib/auth-storage");

const mockSignIn = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: null,
    isLoading: false,
    signIn: mockSignIn,
    signOut: jest.fn(),
  }),
}));

const mockedGetServerUrl = jest.mocked(getStoredServerUrl);

const ERROR_TEXT =
  "Wrong username or password. Check your details and try again.";

function mockTokenFetch(status: number, body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderSignIn() {
  return render(
    <StaccatoThemeProvider>
      <SignInScreen />
    </StaccatoThemeProvider>,
  );
}

async function fillCredentials() {
  fireEvent.changeText(screen.getByPlaceholderText("Username"), "chris");
  fireEvent.changeText(screen.getByPlaceholderText("Password"), "hunter2");
}

function pressSignInButton() {
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetServerUrl.mockResolvedValue("https://music.home.arpa");
  });

  it("shows the connected host and routes back via Change", async () => {
    mockTokenFetch(200, {});
    renderSignIn();
    expect(await screen.findByText("music.home.arpa")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Change"));
    expect(router.back).toHaveBeenCalled();
  });

  it("does not submit while either field is empty", async () => {
    const fetchMock = mockTokenFetch(201, {});
    renderSignIn();
    fireEvent.changeText(screen.getByPlaceholderText("Username"), "chris");
    pressSignInButton();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs in, stores the token, and navigates home after the ok hold", async () => {
    jest.useFakeTimers();
    const fetchMock = mockTokenFetch(201, {
      token: "raw-token",
      user: {
        id: "u1",
        username: "chris",
        isAdmin: true,
        onboardingComplete: true,
      },
    });
    renderSignIn();
    await screen.findByText("music.home.arpa");

    await fillCredentials();
    pressSignInButton();

    await waitFor(() =>
      expect(screen.getByText("Welcome back")).toBeOnTheScreen(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://music.home.arpa/api/auth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "chris",
          password: "hunter2",
          deviceName: "Test Phone",
        }),
      }),
    );
    expect(setStoredToken).toHaveBeenCalledWith("raw-token");

    act(() => {
      jest.advanceTimersByTime(750);
    });
    expect(mockSignIn).toHaveBeenCalledWith({
      serverUrl: "https://music.home.arpa",
      token: "raw-token",
    });
    jest.useRealTimers();
  });

  it("shows the error banner on bad credentials, cleared by typing", async () => {
    mockTokenFetch(401, { error: "Invalid credentials" });
    renderSignIn();
    await screen.findByText("music.home.arpa");

    await fillCredentials();
    pressSignInButton();

    await waitFor(() => expect(screen.getByText(ERROR_TEXT)).toBeOnTheScreen());
    expect(setStoredToken).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText("Username"), "chris2");
    expect(screen.queryByText(ERROR_TEXT)).not.toBeOnTheScreen();
  });

  it("toggles password visibility via the eye control", async () => {
    mockTokenFetch(200, {});
    renderSignIn();
    const password = screen.getByPlaceholderText("Password");
    expect(password.props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText("Show password"));
    expect(screen.getByPlaceholderText("Password").props.secureTextEntry).toBe(
      false,
    );
  });
});

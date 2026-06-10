import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import { setStoredServerUrl } from "@/lib/auth-storage";
import {
  addOrUpdateRecentServer,
  getRecentServers,
} from "@/lib/recent-servers";
import { StaccatoThemeProvider } from "@/theme";
import ConnectScreen from "@/app/(auth)/connect";

let capturedFocusCallback: (() => void) | null = null;

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn((cb: () => void) => {
    capturedFocusCallback = cb;
  }),
}));
jest.mock("@/lib/auth-storage");
jest.mock("@/lib/recent-servers");

const mockedGetRecentServers = jest.mocked(getRecentServers);

function mockHealthFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderConnect() {
  return render(
    <StaccatoThemeProvider>
      <ConnectScreen />
    </StaccatoThemeProvider>,
  );
}

describe("ConnectScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetRecentServers.mockResolvedValue([]);
  });

  it("does not submit while the url is empty", () => {
    const fetchMock = mockHealthFetch({});
    renderConnect();
    fireEvent.press(screen.getByText("Continue"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connects, shows the server version, persists the server, then navigates", async () => {
    jest.useFakeTimers();
    const fetchMock = mockHealthFetch({
      status: "ok",
      name: "staccato",
      version: "1.4.0",
    });
    renderConnect();

    fireEvent.changeText(
      screen.getByPlaceholderText("https://music.example.com"),
      "music.home.arpa",
    );
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(screen.getByText("Connected · Staccato v1.4.0")).toBeOnTheScreen(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://music.home.arpa/api/health",
      expect.anything(),
    );
    expect(setStoredServerUrl).toHaveBeenCalledWith("https://music.home.arpa");
    expect(addOrUpdateRecentServer).toHaveBeenCalledWith(
      "https://music.home.arpa",
    );

    act(() => {
      jest.advanceTimersByTime(750);
    });
    expect(router.push).toHaveBeenCalledWith("/(auth)/sign-in");
    jest.useRealTimers();
  });

  it("shows an error when the server is unreachable, cleared by typing", async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("down")) as unknown as typeof fetch;
    renderConnect();

    const input = screen.getByPlaceholderText("https://music.example.com");
    fireEvent.changeText(input, "music.home.arpa");
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Couldn't reach this server. Check the address and try again.",
        ),
      ).toBeOnTheScreen(),
    );

    fireEvent.changeText(input, "music.home.arpax");
    expect(
      screen.queryByText(
        "Couldn't reach this server. Check the address and try again.",
      ),
    ).not.toBeOnTheScreen();
  });

  it("rejects servers that do not identify as staccato", async () => {
    mockHealthFetch({ status: "ok", name: "other-app", version: "9.9.9" });
    renderConnect();

    fireEvent.changeText(
      screen.getByPlaceholderText("https://music.example.com"),
      "other.example.com",
    );
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Couldn't reach this server. Check the address and try again.",
        ),
      ).toBeOnTheScreen(),
    );
    expect(setStoredServerUrl).not.toHaveBeenCalled();
  });

  it("resets phase and server version when screen regains focus", async () => {
    jest.useFakeTimers();
    mockHealthFetch({ status: "ok", name: "staccato", version: "1.4.0" });
    renderConnect();

    fireEvent.changeText(
      screen.getByPlaceholderText("https://music.example.com"),
      "music.home.arpa",
    );
    fireEvent.press(screen.getByText("Continue"));
    await waitFor(() =>
      expect(screen.getByText("Connected · Staccato v1.4.0")).toBeOnTheScreen(),
    );

    act(() => jest.advanceTimersByTime(750));
    expect(router.push).toHaveBeenCalledWith("/(auth)/sign-in");

    // user presses "Change" on the sign-in screen — simulate focus returning
    act(() => capturedFocusCallback?.());

    expect(screen.getByText("Continue")).toBeOnTheScreen();
    expect(
      screen.queryByText("Connected · Staccato v1.4.0"),
    ).not.toBeOnTheScreen();
    jest.useRealTimers();
  });

  it("fills the input from a recent server without auto-submitting", async () => {
    const fetchMock = mockHealthFetch({});
    mockedGetRecentServers.mockResolvedValue([
      { url: "https://music.home.arpa", lastUsedAt: Date.now() },
    ]);
    renderConnect();

    const row = await screen.findByText("music.home.arpa");
    fireEvent.press(row);

    expect(
      screen.getByDisplayValue("https://music.home.arpa"),
    ).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

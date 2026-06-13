import { renderHook } from "@testing-library/react-native";

import { createApiClient } from "@/lib/api-client";
import { useApiClient } from "./use-api-client";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockedCreateClient = jest.mocked(createApiClient);

beforeEach(() => jest.clearAllMocks());

describe("useApiClient", () => {
  it("builds a client from the active session", () => {
    const client = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    mockedCreateClient.mockReturnValue(client);
    mockUseSession.mockReturnValue({
      session: { serverUrl: "https://music.home.arpa", token: "tok" },
    });

    const { result } = renderHook(() => useApiClient());

    expect(mockedCreateClient).toHaveBeenCalledWith(
      "https://music.home.arpa",
      "tok",
    );
    expect(result.current).toBe(client);
  });

  it("returns null when there is no session", () => {
    mockUseSession.mockReturnValue({ session: null });

    const { result } = renderHook(() => useApiClient());

    expect(result.current).toBeNull();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("reuses the same client across rerenders while the session is unchanged", () => {
    const client = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    mockedCreateClient.mockReturnValue(client);
    mockUseSession.mockReturnValue({
      session: { serverUrl: "https://music.home.arpa", token: "tok" },
    });

    const { result, rerender } = renderHook(() => useApiClient());
    rerender({});

    expect(result.current).toBe(client);
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });
});

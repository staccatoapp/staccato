import { renderHook } from "@testing-library/react-native";

import { useExternalSearch } from "./use-external-search";

const mockUseAuthedQuery = jest.fn();
jest.mock("./use-authed-query", () => ({
  useAuthedQuery: (...args: unknown[]) => mockUseAuthedQuery(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthedQuery.mockReturnValue({ data: undefined });
});

describe("useExternalSearch", () => {
  it("encodes the query into the request path", () => {
    renderHook(() => useExternalSearch("fleetwood mac"));
    const [key, path, , options] = mockUseAuthedQuery.mock.calls[0];
    expect(key).toEqual(["external-search", "fleetwood mac"]);
    expect(path).toBe("/api/search/external?q=fleetwood%20mac");
    expect(options).toMatchObject({ enabled: true, staleTime: 60_000 });
  });

  it("is disabled below the minimum length", () => {
    renderHook(() => useExternalSearch(" a "));
    const [key, , , options] = mockUseAuthedQuery.mock.calls[0];
    expect(key).toEqual(["external-search", "a"]);
    expect(options.enabled).toBe(false);
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import AdminLibraryScreen from "./library";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockTrigger = jest.fn();
const mockStatus = jest.fn();
jest.mock("@/hooks/use-scan", () => ({
  useScanStatus: () => mockStatus(),
  useTriggerScan: () => ({ mutate: mockTrigger, isPending: false }),
}));

function renderScreen() {
  return render(
    <StaccatoThemeProvider>
      <AdminLibraryScreen />
    </StaccatoThemeProvider>,
  );
}

describe("AdminLibraryScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("triggers a scan when not already running", () => {
    mockStatus.mockReturnValue({
      data: { running: false, completedAt: null },
    });
    renderScreen();
    fireEvent.press(screen.getByRole("button", { name: "Scan Library" }));
    expect(mockTrigger).toHaveBeenCalled();
  });

  it("shows a non-interactive scanning row while a scan runs", () => {
    mockStatus.mockReturnValue({
      data: { running: true, resolved: 3, total: 10, completedAt: null },
    });
    renderScreen();
    expect(screen.queryByRole("button", { name: "Scan Library" })).toBeNull();
    expect(screen.getByText("3 / 10 resolved")).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { Device } from "@staccato/shared";

import { DeviceSwitcherSheet } from "./device-switcher-sheet";

const mockMutate = jest.fn();
jest.mock("@/hooks/use-authed-mutation", () => ({
  useAuthedMutation: () => ({ mutate: mockMutate }),
}));

const mockUseDevices = jest.fn();
jest.mock("@/hooks/use-devices", () => ({
  useDevices: () => mockUseDevices(),
}));

const DEVICES: Device[] = [
  {
    deviceId: "d1",
    deviceName: "This iPhone",
    deviceType: "mobile",
    isActive: true,
  },
  {
    deviceId: "d2",
    deviceName: "Chrome (Web)",
    deviceType: "web",
    isActive: false,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDevices.mockReturnValue({
    devices: DEVICES,
    activeDevice: DEVICES[0],
    activeDeviceName: "This iPhone",
  });
});

function renderSheet(
  props: Partial<React.ComponentProps<typeof DeviceSwitcherSheet>> = {},
) {
  const onClose = jest.fn();
  render(<DeviceSwitcherSheet open onClose={onClose} isPlaying {...props} />);
  return { onClose };
}

describe("DeviceSwitcherSheet", () => {
  it("lists every device and the active device name in the subtitle", () => {
    renderSheet();
    expect(screen.getByText("Connect to a device")).toBeTruthy();
    expect(screen.getAllByText("This iPhone").length).toBeGreaterThan(0);
    expect(screen.getByText("Chrome (Web)")).toBeTruthy();
  });

  it("switches to a tapped idle device and closes", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByTestId("device-row-d2"));
    expect(mockMutate).toHaveBeenCalledWith({ deviceId: "d2" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not re-switch when the already-active device is tapped", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByTestId("device-row-d1"));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

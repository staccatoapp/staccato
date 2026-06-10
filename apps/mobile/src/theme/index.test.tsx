import { renderHook } from "@testing-library/react-native";
import React, { type PropsWithChildren } from "react";

import { StaccatoThemeProvider, useTheme } from "./index";

const wrapper = ({ children }: PropsWithChildren) => (
  <StaccatoThemeProvider>{children}</StaccatoThemeProvider>
);

describe("useTheme", () => {
  it("exposes the shared canonical colour tokens", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colors.primary).toBe("#fd7933");
    expect(result.current.colors.bg).toBe("#0d0d0d");
    expect(result.current.colors.destructive).toBe("#ff6467");
  });

  it("exposes the handoff radius and control metrics", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.radius.input).toBe(12);
    expect(result.current.radius.card).toBe(13);
    expect(result.current.radius.banner).toBe(10);
    expect(result.current.radius.iconTile).toBe(7);
    expect(result.current.spacing.controlHeight).toBe(50);
    expect(result.current.spacing.screen).toBe(24);
    expect(result.current.spacing.minHitTarget).toBe(44);
  });

  it("exposes the Inter font family", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.typography.fontFamily).toBe("Inter");
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(/StaccatoThemeProvider/);
  });
});

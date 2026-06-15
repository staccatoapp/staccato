import { renderHook } from "@testing-library/react-native";

import {
  MINI_PLAYER_CLEARANCE,
  TAB_BAR_CONTENT_HEIGHT,
  useContentBottomInset,
} from "./player-layout";

// The global safe-area mock (jest-setup.js) reports zero insets, so the only
// platform-dependent term is the tab bar height when it must be added manually.
describe("useContentBottomInset", () => {
  it("reserves only the mini player clearance when the tab bar is auto-inset", () => {
    const { result } = renderHook(() =>
      useContentBottomInset({ tabBarAutoInset: true }),
    );
    // mini player clearance + the breathing-room gap, nothing else.
    expect(result.current).toBe(MINI_PLAYER_CLEARANCE + 16);
  });

  it("adds the tab bar height when the screen manages its own insets", () => {
    const auto = renderHook(() =>
      useContentBottomInset({ tabBarAutoInset: true }),
    ).result.current;
    const manual = renderHook(() =>
      useContentBottomInset({ tabBarAutoInset: false }),
    ).result.current;
    // With zero bottom inset, the only difference is the tab bar height.
    expect(manual - auto).toBe(TAB_BAR_CONTENT_HEIGHT);
  });
});

require("react-native-reanimated").setUpTests();
require("react-native-gesture-handler/jestSetup");

// AsyncStorage has no native module under Jest; use its official mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Safe-area insets come from a native module; expo-router provides the
// SafeAreaProvider in the app, the official mock provides it under Jest.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});

// expo-glass-effect needs the native Liquid Glass module; render plain views.
jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
  };
});

// expo-audio has no native module under Jest. Tests that assert on player
// calls can re-mock useAudioPlayer/useAudioPlayerStatus per test file.
jest.mock("expo-audio", () => ({
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    replace: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    remove: jest.fn(),
    currentTime: 0,
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    playing: false,
    currentTime: 0,
    duration: 0,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: false,
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

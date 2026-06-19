require("react-native-reanimated").setUpTests();
require("react-native-gesture-handler/jestSetup");

// AsyncStorage has no native module under Jest; use its official mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-file-system has no native module under Jest. Provide minimal File /
// Directory / Paths stubs so modules that import it load; tests that exercise
// real download/eviction logic inject their own filesystem adapter instead.
jest.mock("expo-file-system", () => {
  class File {
    constructor(...segments) {
      this.uri = `file://${segments.map((s) => (s && s.uri ? s.uri : s)).join("/")}`;
      this.exists = false;
      this.size = 0;
    }
    delete() {}
  }
  File.downloadFileAsync = jest.fn(async (_url, destination) => destination);
  class Directory {
    constructor(...segments) {
      this.uri = `file://${segments.map((s) => (s && s.uri ? s.uri : s)).join("/")}`;
    }
    create() {}
  }
  return {
    File,
    Directory,
    Paths: { cache: "CACHE", document: "DOCUMENT", bundle: "BUNDLE" },
  };
});

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

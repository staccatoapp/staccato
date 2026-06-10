/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Reanimated 4: route react-native-worklets to its JS (non-native) build
  // and install the Reanimated jest helpers.
  resolver: "react-native-worklets/jest/resolver.js",
  setupFiles: ["<rootDir>/jest-setup.js"],
  // @staccato/shared only publishes an ESM "import" condition, which Jest's
  // CJS resolver can't use — point Jest at the TS source instead.
  moduleNameMapper: {
    "^@staccato/shared$": "<rootDir>/../../packages/shared/src/index.ts",
    // The shared package uses NodeNext-style ".js" specifiers that point at
    // .ts sources; strip the extension so Jest resolves them.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native)",
  ],
};

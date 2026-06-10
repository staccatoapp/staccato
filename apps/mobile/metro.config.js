// Learn more: https://docs.expo.dev/guides/monorepos/
// Expo SDK 52+ auto-detects the monorepo root, so the default config already
// watches the workspace and resolves hoisted node_modules. Kept explicit so the
// setup is discoverable.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude test files from the native bundle — test libraries import Node
// built-ins (console, util) that don't exist in the native runtime.
config.resolver.blockList = /.*\.test\.[jt]sx?$/;

module.exports = config;

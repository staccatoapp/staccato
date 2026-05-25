import { config as baseConfig } from "@staccato/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not access process.env directly. Import config from the src/config.ts module instead.",
        },
      ],
    },
  },
  {
    files: ["**/src/config.ts"],
    rules: { "no-restricted-properties": "off" },
  },
];

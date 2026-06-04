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
            "Do not access process.env directly. Import from the src/environment/environment.ts module instead.",
        },
      ],
    },
  },
  {
    files: [
      "**/src/environment/environment.ts",
      "**/src/environment/environment.test.ts",
    ],
    rules: { "no-restricted-properties": "off" },
  },
];

import { config } from "@staccato/eslint-config/base";
import { defineConfig, globalIgnores } from 'eslint/config'
import markdown from "@eslint/markdown";

export default defineConfig([
  globalIgnores(['dist', '.vitepress/cache', '.vitepress/dist']),
  ...markdown.configs.recommended,
  {
    files: ['**/*.{ts,js}'],
    extends: [config],
  },
])

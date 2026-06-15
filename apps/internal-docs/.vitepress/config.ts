import { defineConfig } from "vitepress";

// Internal developer documentation for Staccato.
//
// This site is LOCAL-ONLY. Unlike apps/docs (the public, deployed VitePress
// site), this instance is never built into the Docker image or deployed
// anywhere. Run it with `pnpm --filter @staccato/internal-docs dev` (or via
// `turbo dev`) and read it at http://localhost:5174.
export default defineConfig({
  srcDir: "src",

  title: "Staccato — Internal Docs",
  description:
    "Developer documentation for working on Staccato. Local-only; not deployed.",

  // Surface broken internal links at build time so docs rot is caught in CI/dev.
  ignoreDeadLinks: false,

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Architecture", link: "/architecture/overview" },
      { text: "Pipelines", link: "/pipelines/import-resolution" },
    ],

    sidebar: [
      {
        text: "Architecture",
        items: [
          { text: "Overview", link: "/architecture/overview" },
          { text: "Data Model", link: "/architecture/data-model" },
          { text: "Metadata Service", link: "/architecture/metadata-service" },
          { text: "Listen Events", link: "/architecture/listen-events" },
          { text: "Preview Clips", link: "/architecture/preview" },
        ],
      },
      {
        text: "Pipelines",
        items: [
          {
            text: "Import & Resolution",
            link: "/pipelines/import-resolution",
          },
          { text: "Recommendations", link: "/pipelines/recommendations" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Environment Variables", link: "/reference/environment" },
          { text: "Debug Tools", link: "/reference/debug-tools" },
        ],
      },
    ],

    outline: { level: [2, 3] },

    socialLinks: [
      { icon: "github", link: "https://github.com/chrisanicolaou/staccato" },
    ],
  },
});

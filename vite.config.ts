import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    // React Compiler auto-memoizes components at build time. `reactCompilerPreset`
    // ships a filter that limits Babel to React/hook files and defaults to the
    // React 19 runtime (`react/compiler-runtime`), which matches this project.
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

// Vite builds the app: it bundles the TypeScript/React code into plain files
// a browser can run, and runs a live-reloading dev server while you work.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // "./" makes every link relative, so the built site works at
    // sjmaniccia.github.io/bar-tool/ (a subfolder) on GitHub Pages
    base: "./",
    // The whole app is one ~500 kB file (145 kB zipped), fine for a tool people install once
    // FIXME: split big pages into separate files with lazy() if it keeps growing
    build: { chunkSizeWarningLimit: 800 },
    test: {
        environment: "node"
    }
});

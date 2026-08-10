import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const browserPersistPath = process.env.CORINTH_BROWSER_PERSIST_PATH;

export default defineConfig({
  plugins: [
    react(),
    cloudflare(browserPersistPath ? { persistState: { path: browserPersistPath } } : undefined),
  ],
  build: {
    sourcemap: true,
  },
});

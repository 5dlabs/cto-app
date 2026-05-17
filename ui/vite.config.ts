import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Note on embedded GitLab:
// The self-hosted GitLab at gitlab.5dlabs.ai is already configured with
//   content-security-policy: frame-ancestors 'self' https://app.5dlabs.ai
//                            http://localhost:5173 tauri://localhost
//                            https://tauri.localhost
// and issues its session cookie as `Secure; HttpOnly; SameSite=None`. That
// means the iframe can load it directly — no dev proxy / cookie rewriting
// needed, and signing in once on gitlab.5dlabs.ai (or via the Sign in popup
// in the app) will be honored inside the embed.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Bind to all interfaces so the setup UI can be watched from another
    // machine on the same network. The Tauri app still loads devUrl from
    // http://localhost:5173, preserving the embedded GitLab CSP origin.
    host: "0.0.0.0",
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
  },
});

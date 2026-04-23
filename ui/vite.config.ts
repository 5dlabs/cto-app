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
    // Bind to `localhost` (not 127.0.0.1) so the app origin matches the
    // gitlab.5dlabs.ai CSP `frame-ancestors` whitelist. `127.0.0.1` and
    // `localhost` are considered different origins by browsers for CSP.
    host: "localhost",
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

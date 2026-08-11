import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pinned to port 5173 (strictPort) so the dev origin always matches the
// CORS allow-list in app/api.py. If 5173 is taken, Vite errors instead of
// silently moving to another port and breaking cross-origin requests.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});

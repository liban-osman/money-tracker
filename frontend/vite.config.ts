import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ngrok tunnels the local dev server for Plaid's OAuth (TD Bank) redirect,
    // which requires an HTTPS URL — Vite blocks unrecognized Host headers by default.
    allowedHosts: ["scolding-deforest-earthly.ngrok-free.dev"],
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});

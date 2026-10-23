import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
    server: {
        // macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
        ...(process.env.CODEX_SANDBOX === "seatbelt"
            ? { watch: { useFsEvents: false, usePolling: true } }
            : {}),
    },
    plugins: [vinext()],
    preview: {
        // Serve the static export for a production-like local preview.
        outDir: "dist/client",
    },
});

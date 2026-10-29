import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const src = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
    resolve: {
        alias: {
            "@": src("./src"),
            "server-only": src("./test/server-only-stub.js"),
        },
    },
    test: {
        environment: "node",
        include: ["src/**/__tests__/**/*.test.js"],
    },
});

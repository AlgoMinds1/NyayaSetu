import { defineConfig, devices } from "@playwright/test";

// The demo spec needs a live Supabase project seeded with `npm run seed`. Without DEMO_E2E=1 every test is skipped.
// Start the app first (npm run dev) and set PLAYWRIGHT_BASE_URL if it is not on localhost:3000.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});

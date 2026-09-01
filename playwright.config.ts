import { defineConfig, devices } from "@playwright/test";

/* Browser tests for Signal Petal.

   Kept out of `npm test` on purpose: the unit tests are half a second and run constantly,
   these start a dev server and a browser. Run them with `npm run test:ui` before a release
   or after touching anything in app/page.tsx.

   One-time setup on a new machine: `npx playwright install chromium`. */

const PORT = Number(process.env.PETAL_TEST_PORT ?? 3123);

export default defineConfig({
  testDir: "./tests/ui",
  /* Every spec seeds its own localStorage, so nothing is shared and order does not matter. */
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    /* A trace only for a failure that survives its retry — enough to see what happened,
       without filling the disk on a green run. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /* Normally Playwright uses the browser it downloaded. PETAL_CHROMIUM points it at one
       already on the machine instead — useful in a container or CI image that ships its own. */
    launchOptions: process.env.PETAL_CHROMIUM ? { executablePath: process.env.PETAL_CHROMIUM } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

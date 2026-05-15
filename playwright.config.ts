import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const serverUrl = new URL(baseURL);
const serverPort =
  serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80");
const localNoProxyHosts = ["127.0.0.1", "localhost", "::1"];
const noProxy = new Set(
  (process.env.NO_PROXY ?? process.env.no_proxy ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
);
for (const host of localNoProxyHosts) noProxy.add(host);
process.env.NO_PROXY = Array.from(noProxy).join(",");
process.env.no_proxy = process.env.NO_PROXY;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname ${serverUrl.hostname} --port ${serverPort}`,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
  },
});

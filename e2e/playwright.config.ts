import fs from "node:fs";
import { defineConfig } from "@playwright/test";

// A Chromium already on this machine can be used instead of downloading one.
const chromium = process.env.JANUS_E2E_CHROMIUM;

export default defineConfig({
  testDir: "./journeys",
  // The journeys are one continuous story, told in file order by people working on shared data.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300000,
  expect: { timeout: 15000 },
  globalSetup: require.resolve("./global-setup"),
  outputDir: "./.state/artifacts",
  reporter: [["list"], ["json", { outputFile: "./.state/results.json" }]],
  use: {
    baseURL: process.env.JANUS_E2E_WEB ?? "http://localhost:3011",
    screenshot: "only-on-failure",
    // A control that never becomes usable fails the step quickly, rather than using up the whole test.
    actionTimeout: 30000,
    launchOptions: chromium && fs.existsSync(chromium) ? { executablePath: chromium } : {},
  },
});

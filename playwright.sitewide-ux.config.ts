import base from "./playwright.mobile-ux.config";
import { defineConfig } from "@playwright/test";

export default defineConfig(base, {
  testMatch: "sitewide-task-journey.spec.ts",
  outputDir: ".qa/sitewide-ux-wave2/browser-artifacts",
  reporter: [["list"], ["json", { outputFile: ".qa/sitewide-ux-wave2/browser-results.json" }]],
  projects: [
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 834, height: 1000 }, hasTouch: true } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
});

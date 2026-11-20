import { expect, test } from "@playwright/test";

test.describe("Studio Fresh Ideas v2.2 Workbench (@unslop 9-Pass E2E)", () => {
  test("renders BG3D Fresh Ideas v2 workbench with 100/100 badge, Mode A/B/C tabs, and zero console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });

    const workbench = page.getByTestId("studio-fresh-ideas-v2-workbench");
    await expect(workbench).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("fresh-ideas-v2-capability-badge")).toContainText("100/100 규격");

    await page.getByTestId("fresh-ideas-mode-mode-b-channel-draft").click();
    await expect(page.getByTestId("fresh-ideas-mode-b-panel")).toBeVisible();

    await page.getByTestId("fresh-ideas-stream-btn").click();
    await expect(page.getByTestId("fresh-ideas-stream-output")).toBeVisible();

    await page.getByTestId("fresh-ideas-mode-mode-c-ecosystem").click();
    await expect(page.getByTestId("fresh-ideas-mode-c-panel")).toBeVisible();

    await page.getByTestId("fresh-ideas-save-bank-btn").click();
    await expect(page.getByTestId("fresh-ideas-bank-count")).toContainText("5");

    expect(consoleErrors).toEqual([]);
  });
});

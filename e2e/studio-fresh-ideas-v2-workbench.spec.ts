import { expect, test } from "@playwright/test";

test.describe("Studio Fresh Ideas v2.2 Workbench (@unslop 9-Pass E2E)", () => {
  test("renders Creator Growth IP Fresh Ideas v2 workbench with 100/100 badge, Mode A/B/C tabs, and zero console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/studio/growth-ip#share", { waitUntil: "domcontentloaded" });

    const workbench = page.getByTestId("studio-fresh-ideas-v2-workbench");
    await expect(workbench).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("fresh-ideas-v2-capability-badge")).toContainText("100/100 규격");

    await page.getByTestId("fresh-ideas-mode-mode-b-channel-draft").click();
    await expect(page.getByTestId("fresh-ideas-mode-b-panel")).toBeVisible();

    await page.getByTestId("fresh-ideas-stream-btn").click();
    await expect(page.getByTestId("fresh-ideas-stream-output")).toBeVisible();

    const legacy = JSON.stringify([{
      id: "synthetic-legacy-idea",
      savedAtIso: "2026-11-20T12:00:00Z",
      dateIso: "2026-11-20",
      lensId: "synthetic-legacy-lens",
      sourceTitleAndUrl: "테스트 소재",
      headlineKo: "이전 브라우저 초안",
      targetPersonaAndChannel: "테스트 독자",
      effortTagKo: "낮음",
      draftStatus: "Seed",
    }]);
    const legacyKey = "toonstudio:fresh-ideas:idea-bank:v2";
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value: legacy });
    await page.getByTestId("fresh-ideas-mode-mode-c-ecosystem").click();
    await expect(page.getByTestId("fresh-ideas-mode-c-panel")).toBeVisible();

    await page.getByTestId("fresh-ideas-save-bank-btn").click();
    await expect(page.getByTestId("fresh-ideas-bank-count")).toContainText("5건");
    await page.getByRole("button", { name: "이전 브라우저 기록 가져오기" }).click();
    await expect(page.getByTestId("fresh-ideas-bank-count")).toContainText("6건");
    expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBe(legacy);

    const firstStatus = workbench.getByLabel(/진행 상태/u).first();
    await firstStatus.selectOption("Published");
    await expect(page.getByTestId("fresh-ideas-export-notice")).toContainText("상태 변경: Published");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("fresh-ideas-mode-mode-c-ecosystem").click();
    await expect(page.getByTestId("fresh-ideas-bank-count")).toContainText("6건");
    await expect(firstStatus).toHaveValue("Published");
    await page.getByRole("button", { name: "이전 브라우저 기록 가져오기" }).click();
    await expect(page.getByTestId("fresh-ideas-export-notice")).toContainText("가져올 새 브라우저 기록이 없습니다");
    expect(consoleErrors).toEqual([]);
  });
});

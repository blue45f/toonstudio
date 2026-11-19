import { expect, test } from "@playwright/test";

import { openStudioAllTools } from "../scripts/lib/studio-bg3d-ui-interactions";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ko-KR" });

test("휴대폰 장면 도우미에서 소품 이름으로 배경을 찾아 원고 바닥에 놓는다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/studio/draft/simple-environment-search?workspace=draw", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-drawing-clarity-mobile-header]")).toBeVisible({ timeout: 60_000 });
  const catalog = await openStudioAllTools(page);
  await catalog.getByRole("searchbox").fill("bg3d");
  await catalog.locator('[data-studio-catalog-tool-id="bg3d"]').tap();
  const dialog = page.getByRole("dialog", { name: "장면 도우미", exact: true });
  const search = dialog.getByRole("searchbox", { name: "배경 모델 검색" });
  await expect(search).toBeVisible({ timeout: 90_000 });
  const grid = dialog.getByTestId("scene-assistant-env-asset-grid");
  await expect(grid.getByRole("button")).toHaveCount(8);
  await dialog.getByRole("button", { name: /배경 더 보기/ }).tap();
  await expect(grid.getByRole("button")).toHaveCount(16);
  await search.fill("해당 없음");
  await expect(dialog.getByText("검색한 배경이 없습니다.")).toBeVisible();
  await search.fill("물뿌리개");
  const greenhouse = grid.getByRole("button", { name: /햇살 드는 유리온실/ });
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().endsWith("/botanical_glasshouse.glb")),
    greenhouse.tap(),
  ]);
  expect(response.ok()).toBe(true);
  const viewport = dialog.getByTestId("studio-bg3d-viewport");
  await expect(dialog.locator('[data-testid="studio-bg3d-scene-assistant"]')).toHaveAttribute("data-step", "arrange");
  await expect(dialog.getByRole("button", { name: "3D 모델 배치 취소" })).toBeVisible({ timeout: 60_000 });
  const canvas = viewport.locator("canvas:visible").first();
  const size = await canvas.boundingBox();
  if (!size) throw new Error("3D 뷰포트 캔버스가 열리지 않았습니다.");
  await viewport.tap({ position: { x: Math.round(size.width * .5), y: Math.round(size.height * .58) } });
  await expect(viewport).toHaveAttribute("data-studio-bg3d-viewport-selected-ids", /.+/u, { timeout: 60_000 });
  await expect(dialog.getByRole("button", { name: "세부 구도 적용 · 모종 작업대" })).toBeVisible();
});

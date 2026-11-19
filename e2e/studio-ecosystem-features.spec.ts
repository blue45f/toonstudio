import { expect, test } from "@playwright/test";

test.describe("ToonStudio 신규 에코시스템 기능 E2E", () => {
  test("/cafes 에서 작품·팀·스튜디오·프로젝트별 카페 허브가 동작한다", async ({ page }) => {
    await page.goto("/cafes");
    const hub = page.getByRole("region", { name: "작품·팀·스튜디오·프로젝트별 카페 허브" });
    await expect(hub).toBeVisible();

    await hub.getByRole("tab", { name: "스튜디오별 카페" }).click();
    await hub.getByPlaceholder("게시글 제목을 입력하세요").fill("E2E 스튜디오 공지");
    await hub
      .getByPlaceholder("원고 피드백, 레퍼런스, 공지 내용을 작성하고 이미지를 첨부해 보세요")
      .fill("이미지 첨부 및 스코프 카페 테스트");
    await hub.getByRole("button", { name: "게시하기" }).click();
    await expect(hub.getByText("E2E 스튜디오 공지")).toBeVisible();
  });

  test("/collaborate 에서 MMORPG 구인 광장 파티 개설·매칭과 RBAC 역할 변경이 동작한다", async ({ page }) => {
    await page.goto("/collaborate");
    const plaza = page.getByRole("region", { name: "MMORPG 구인 광장 실시간 매칭" });
    await expect(plaza).toBeVisible();

    await plaza.getByPlaceholder("새 구인 파티 제목 (예: 로판 원꾸 긴급 모집)").fill("E2E 로판 원꾸 파티");
    await plaza.getByRole("button", { name: "파티 개설" }).click();
    await expect(plaza.getByText(/새 파티 \[E2E 로판 원꾸 파티\]/u)).toBeVisible();

    const rbac = page.getByRole("region", { name: "보안 역할별 롤 및 권한 관리 패널" });
    await expect(rbac).toBeVisible();
    await rbac.getByLabel("보안 역할 선택").selectOption("main_author");
    await expect(rbac.getByText(/role\.changed:line_assistant->main_author/u)).toBeVisible();
  });

  test("/studio/mcp 에서 MCP·CLI 연동 안내 페이지와 브라우저 즉시 실행 테스트가 동작한다", async ({ page }) => {
    await page.goto("/studio/mcp");
    await expect(page.getByRole("heading", { name: /MCP · CLI 연동 안내/u })).toBeVisible();

    await page.getByRole("tab", { name: "터미널 CLI" }).click();
    await expect(page.getByText(/pnpm run studio:cli -- draw-demo/u)).toBeVisible();

    await page.getByRole("button", { name: "브라우저 즉시 실행 테스트" }).click();
    await expect(page.getByRole("status").filter({ hasText: /"ok": true/u })).toBeVisible();
  });
});

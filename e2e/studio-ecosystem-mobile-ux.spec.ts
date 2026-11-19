import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test.describe("ToonStudio 신규 에코시스템 모바일(375px) UI/UX 검증", () => {
  test("/cafes 에서 가로 넘침이 없고 카페 허브 CTA가 44px 이상이다", async ({ page }) => {
    await page.goto("/cafes");
    const hub = page.getByRole("region", { name: "작품·팀·스튜디오·프로젝트별 카페 허브" });
    await expect(hub).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const submitBox = await hub.getByRole("button", { name: "게시하기" }).boundingBox();
    expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("/collaborate 에서 구인 광장·RBAC 패널이 가로 넘침 없이 44px 터치 타겟을 충족한다", async ({ page }) => {
    await page.goto("/collaborate");
    const plaza = page.getByRole("region", { name: "MMORPG 구인 광장 실시간 매칭" });
    await expect(plaza).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const createPartyBox = await plaza.getByRole("button", { name: "파티 개설" }).boundingBox();
    expect(createPartyBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const rbac = page.getByRole("region", { name: "보안 역할별 롤 및 권한 관리 패널" });
    await expect(rbac).toBeVisible();
    const roleSelectBox = await rbac.getByLabel("보안 역할 선택").boundingBox();
    expect(roleSelectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("/studio/engines 에서 MCP·CLI 브릿지가 375px에서 가로 넘침 없이 표시된다", async ({ page }) => {
    await page.goto("/studio/engines");
    const bridge = page.getByRole("region", { name: "ToonStudio MCP 및 CLI 통합 제어 브릿지" });
    await expect(bridge).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

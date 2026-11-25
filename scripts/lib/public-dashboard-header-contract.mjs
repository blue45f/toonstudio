import { expect } from "@playwright/test";

/** 홈의 단일 헤더를 검증하며 다른 페이지의 작업/여정 내비게이션 계약은 유지한다. */
export async function assertPublicDashboardHeader(page) {
  const header = page.locator('[data-site-chrome="header"][data-site-home="true"]');
  await expect(page.locator('.public-site-journey, [data-workspace-surface="task"]')).toHaveCount(0);
  await expect(header).toHaveCount(1);
  await expect(header).toBeVisible();
  // 작품 시작의 정문은 /create 시작 시트 하나다(site-header.tsx CANONICAL_CREATE_HREF). /studio/new 는 시트 다음 2단계 양식이라 헤더가 직접 가리키지 않는다.
  await expect(header.locator('.site-header__create')).toHaveAttribute("href", "/create");
  // 화면 연출은 머리글 버튼 대신 전체 메뉴의 실제 설정 진입점에서 제공한다.
  await expect(header.locator(".site-header__appearance")).toHaveCount(0);
  const trigger = header.getByRole("button", { name: /^전체 메뉴/u });
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(dialog).toBeVisible();
  const settings = dialog.getByRole("link", { name: /화면·언어 설정/u });
  await expect(settings).toHaveCount(1);
  await expect(settings).toHaveAttribute("href", "/settings");
  await settings.scrollIntoViewIfNeeded();
  await expect(settings).toBeVisible();
  await settings.click({ trial: true });
  await settings.focus();
  await expect(settings).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  if (page.viewportSize().width >= 768) {
    // 헤더 주 메뉴에는 홈 항목이 없다(홈은 로고가 맡는다). 그래서 홈에서는 어떤 주 메뉴 항목도 현재 위치로 표시되면 안 된다.
    await expect(header.locator('a[data-navigation-entry="home"]')).toHaveCount(0);
    await expect(header.locator(".site-header__primary-link[aria-current]")).toHaveCount(0);
  }
}

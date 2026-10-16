import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** 아래쪽 섹션은 스크롤해야 그려진다(RevealOnScroll). 나타날 때까지 조금씩 내려 본다. */
async function revealByScrolling(page, locator) {
  for (let step = 0; step < 20 && (await locator.count()) === 0; step += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(250);
  }
  await expect(locator).toHaveCount(1);
}

/**
 * /about/studio 의 작업실 둘러보기는 번호 버튼 묶음이다(StudioAnnotatedTour). 키보드로 영역을 고르면
 * 눌림 상태·설명·바로가기가 함께 바뀌어야 하고, 소개 화면에는 영상이 없어야 한다.
 */
export async function assertAboutStudioTour(page) {
  const picker = page.getByRole("group", { name: "작업실 영역 고르기" });
  await revealByScrolling(page, picker);
  const buttons = picker.getByRole("button");
  const total = await buttons.count();
  assert(total >= 3, `작업실 영역 버튼이 ${total}개뿐입니다`);
  await buttons.first().scrollIntoViewIfNeeded();
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("article[aria-live='polite']");
  await expect(panel).toHaveCount(1);
  const firstTitle = await panel.locator("h3").innerText();
  const firstHref = await panel.locator("a").first().getAttribute("href");
  await buttons.nth(1).focus();
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "false");
  await expect(panel.locator("h3")).not.toHaveText(firstTitle);
  assert.notEqual(await panel.locator("a").first().getAttribute("href"), firstHref, "영역을 바꾸면 바로가기도 그 영역의 작업공간으로 바뀝니다");
  await expect(page.locator("#creator-support-title")).toBeAttached();
  await expect(page.locator("video")).toHaveCount(0);
}

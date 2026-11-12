import { expect, type Locator, type Page } from "@playwright/test";

const STEP_HEADINGS = {
  목표: "이번에 만들 결과",
  "한 과제": "직접 만들어 보세요",
  "자가 확인": "내가 만든 결과 확인",
} as const;

/** 단계 선택은 선택 표시와 실제 보이는 영역을 함께 확인한다. */
export async function selectLessonStep(page: Page, name: keyof typeof STEP_HEADINGS): Promise<Locator> {
  const button = page.getByRole("navigation", { name: "수업 단계", exact: true }).getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "step");
  const region = page.getByRole("region", { name: STEP_HEADINGS[name], exact: true });
  await expect(region).toBeVisible();
  return region;
}

/** 숨긴 DOM을 조작하지 않고 사용자가 보는 summary로 선택 자료를 펼친다. */
export async function openLessonDisclosure(page: Page, name: string | RegExp): Promise<Locator> {
  const disclosure = page.locator(".learn-stepped-lesson details").filter({
    has: page.locator("summary").filter({ hasText: name }),
  });
  await expect(disclosure).toHaveCount(1);
  const summary = disclosure.locator(":scope > summary");
  await expect(summary).toBeVisible();
  if (await disclosure.getAttribute("open") === null) await summary.click();
  await expect(disclosure).toHaveAttribute("open", "");
  return disclosure;
}

export async function openLessonLab(page: Page): Promise<Locator> {
  const practice = await selectLessonStep(page, "한 과제");
  await openLessonDisclosure(page, /^예제 움직여 보며 이해하기$/u);
  // 목표 화면의 정적 도식과 현재 조작하는 실습 도식을 구분한다.
  const lab = practice.locator(".learn-lab");
  await expect(lab).toBeVisible();
  return lab;
}

export async function openLessonNotes(page: Page): Promise<Locator> {
  const disclosure = await openLessonDisclosure(page, /^실습 메모(?: · 작성한 메모 있음)?$/u);
  const notes = disclosure.getByRole("textbox", { name: "나의 실습 메모", exact: true });
  await expect(notes).toBeVisible();
  return notes;
}

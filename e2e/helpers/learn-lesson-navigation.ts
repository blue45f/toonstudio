import { expect } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const LESSON_STEPS = {
  goal: { button: "목표", heading: "이번에 만들 결과" },
  practice: { button: "한 과제", heading: "직접 만들어 보세요" },
  check: { button: "자가 확인", heading: "내가 만든 결과 확인" },
} as const;

/** 숨겨진 단계를 직접 조작하지 않고 실제 단계 버튼으로 이동한다. */
export async function selectLessonStep(page: Page, step: keyof typeof LESSON_STEPS): Promise<Locator> {
  const target = LESSON_STEPS[step];
  const button = page.getByRole("navigation", { name: "수업 단계", exact: true })
    .getByRole("button", { name: target.button, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "step");
  const section = page.getByRole("region", { name: target.heading, exact: true });
  await expect(section).toBeVisible();
  return section;
}

async function openDisclosure(scope: Locator, name: RegExp): Promise<Locator> {
  const summary = scope.locator("summary").filter({ hasText: name });
  await expect(summary).toHaveCount(1);
  await expect(summary).toBeVisible();
  const details = summary.locator("xpath=..");
  if (await details.getAttribute("open") === null) await summary.click();
  await expect(details).toHaveAttribute("open", "");
  return details;
}

export async function openLessonExample(page: Page): Promise<Locator> {
  const practice = await selectLessonStep(page, "practice");
  const details = await openDisclosure(practice, /^예제 움직여 보며 이해하기$/u);
  const lab = details.locator(".learn-lab");
  await expect(lab).toBeVisible();
  return lab;
}

export async function openLessonNotes(page: Page): Promise<Locator> {
  const details = await openDisclosure(page.locator(".learn-stepped-lesson"), /^실습 메모(?: · 작성한 메모 있음)?$/u);
  const notes = details.getByRole("textbox", { name: "나의 실습 메모", exact: true });
  await expect(notes).toBeVisible();
  return notes;
}

export async function openLessonRecordDetails(page: Page): Promise<Locator> {
  return openDisclosure(page.locator(".learn-stepped-lesson"), /^강좌 정보와 이 기기 기록$/u);
}

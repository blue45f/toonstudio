import { LESSONS } from "../apps/web/src/domains/learn/learning-content";
import { LEARNING_PATHS, getLessonMeta, getPathLessons } from "../apps/web/src/domains/learn/learning-paths";
import { learningProgressStorageKey } from "../apps/web/src/domains/learn/learning-storage";

import { expect, test } from "./fixtures/non-studio-test";
import { openLessonDisclosure, openLessonLab, openLessonNotes, selectLessonStep } from "./helpers/learning-lesson-steps";

// 로그인하지 않은 학습자의 진도는 게스트 파티션 키에 저장된다(learning-storage의 소유자별 키).
const GUEST_STORAGE_KEY = learningProgressStorageKey("guest");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("toonstudio-compat-dismissed", "true"));
});

test("lesson detail exposes an outcome, stage navigation, progress requirements and adjacent lessons", async ({ page }) => {
  const lesson = LESSONS[1];
  await page.goto(`/learn/lessons/${lesson.id}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
  const goal = page.getByRole("region", { name: "이번에 만들 결과", exact: true });
  await expect(goal.getByRole("heading", { name: "이번에 만들 결과", exact: true })).toBeVisible();
  await expect(goal.getByText(getLessonMeta(lesson.id).outcome, { exact: true })).toBeVisible();
  await expect(goal.getByText(lesson.task, { exact: true })).toBeVisible();

  const steps = page.getByRole("navigation", { name: "수업 단계", exact: true });
  await expect(steps).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(3);
  await expect(steps.getByRole("button", { name: "목표", exact: true })).toHaveAttribute("aria-current", "step");
  await goal.getByRole("button", { name: "한 과제 시작 →", exact: true }).click();
  await expect(steps.getByRole("button", { name: "한 과제", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: "직접 만들어 보세요", exact: true })).toBeFocused();
  await expect(page.locator(`[id="${lesson.id}-practice"]`)).toBeVisible();
  const lab = await openLessonLab(page);
  await expect(page).toHaveURL(/lesson-step=practice/u);
  await expect(page.locator(`[id="${lesson.id}-lab"]`)).toBeVisible();
  await expect(lab.getByRole("slider")).toHaveCount(2);

  const check = await selectLessonStep(page, "자가 확인");
  await expect(page).toHaveURL(/lesson-step=check/u);
  await expect(check.getByRole("heading", { name: "확인 퀴즈", exact: true })).toBeVisible();
  await expect(page.locator(`[id="${lesson.id}-quiz"]`)).toBeVisible();
  await expect(check.getByRole("checkbox")).toHaveCount(lesson.checks.length);
  for (const checkbox of await check.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
  await expect(check.getByRole("radio")).toHaveCount(lesson.quiz.options.length);
  for (const option of await check.getByRole("radio").all()) await expect(option).not.toBeChecked();
  await expect(check.getByRole("button", { name: "이 강좌 학습 완료", exact: true })).toBeDisabled();
  const records = await openLessonDisclosure(page, /^강좌 정보와 이 기기 기록$/u);
  await expect(records.getByRole("progressbar", { name: `${lesson.title} 자가 점검 진행률`, exact: true })).toHaveAttribute("value", "0");

  // 종전 목차의 모든 개념·실습·퀴즈는 단계와 선택 자료를 통해 여전히 접근할 수 있다.
  await page.getByRole("button", { name: "개념·용어·출처 선택 자료", exact: true }).click();
  const reference = page.getByRole("region", { name: "개념·용어·출처", exact: true });
  await expect(reference).toBeVisible();
  await expect(reference.locator(".learn-prose")).toHaveCount(lesson.sections.length);
  for (const [index, section] of lesson.sections.entries()) {
    const concept = reference.locator(`[id="${lesson.id}-concept-${index + 1}"]`);
    await expect(concept.getByRole("heading", { name: section.title, exact: true })).toBeVisible();
    await expect(concept.getByText(section.text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "이전·다음 강좌" }).getByRole("link")).toHaveCount(2);
  await page.goBack();
  await expect(steps.getByRole("button", { name: "자가 확인", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "개념·용어·출처 선택 자료", exact: true })).toBeFocused();
  await expect(check).toBeVisible();
});

test("lesson requirements update immediately and completion remains explicitly gated", async ({ page }) => {
  const lesson = LESSONS[0];
  await page.goto(`/learn/lessons/${lesson.id}`);
  const check = await selectLessonStep(page, "자가 확인");
  const finish = check.getByRole("button", { name: "이 강좌 학습 완료", exact: true });
  const records = await openLessonDisclosure(page, /^강좌 정보와 이 기기 기록$/u);
  const requirementProgress = records.getByRole("progressbar", { name: `${lesson.title} 자가 점검 진행률`, exact: true });
  const checks = check.getByRole("checkbox");
  const answer = check.getByRole("radio").nth(lesson.quiz.answer);

  // 이전 요약 배지의 세 조건(체크·정답·명시 완료)을 실제 입력과 완료 상태로 검증한다.
  await expect(finish).toBeDisabled();
  await expect(requirementProgress).toHaveAttribute("value", "0");
  await expect(checks).toHaveCount(lesson.checks.length);
  for (const checkbox of await checks.all()) await expect(checkbox).not.toBeChecked();
  await expect(answer).not.toBeChecked();
  await expect(check.getByRole("button", { name: "학습 완료됨", exact: true })).toHaveCount(0);

  for (const checkbox of await checks.all()) await checkbox.check();
  await expect(requirementProgress).toHaveAttribute("value", String(Math.round(lesson.checks.length / (lesson.checks.length + 1) * 100)));
  await expect(finish).toBeDisabled();
  await answer.check();

  await expect(requirementProgress).toHaveAttribute("value", "100");
  for (const checkbox of await checks.all()) await expect(checkbox).toBeChecked();
  await expect(answer).toBeChecked();
  await expect(check.getByRole("button", { name: "학습 완료됨", exact: true })).toHaveCount(0);
  await expect(finish).toBeEnabled();

  await finish.click();
  await expect(check.getByRole("button", { name: "학습 완료됨", exact: true })).toBeDisabled();
  await expect(requirementProgress).toHaveAttribute("value", "100");
  for (const checkbox of await checks.all()) await expect(checkbox).toBeChecked();
  await expect(answer).toBeChecked();
  await expect(page.getByRole("heading", { name: "수업을 완료했습니다", exact: true })).toBeVisible();
});

test("the learning hub resumes a later active lesson before untouched earlier steps", async ({ page }) => {
  const path = LEARNING_PATHS[0];
  const lessons = getPathLessons(path);
  const active = lessons[1];

  await page.addInitScript(({ key, lessonId }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      lessons: {
        [lessonId]: {
          checks: [0],
          answer: null,
          notes: "여기서 멈춘 수업",
          completed: false,
        },
      },
      bookmarks: [],
    }));
  }, { key: GUEST_STORAGE_KEY, lessonId: active.id });

  await page.goto("/learn");
  // 진행 중 수업은 별도 요약/목록 대신 첫 실습 카드에서 바로 이어 간다.
  const nextPractice = page.locator(".learn-classroom-feature");
  await expect(nextPractice.getByRole("heading", { level: 2 })).toHaveText(active.title);
  await expect(nextPractice).toContainText("학습 중");
  const resume = nextPractice.getByRole("link", { name: "계속하기", exact: true });
  await expect(resume).toBeVisible();
  await expect(resume).toHaveAttribute("href", `/learn/lessons/${encodeURIComponent(active.id)}?from=${encodeURIComponent(path.id)}`);
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/learn/lessons/${active.id}\\?from=${path.id}$`, "u"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(active.title);
  await expect(await openLessonNotes(page)).toHaveValue("여기서 멈춘 수업");
});

test("guided lesson layout keeps its landmarks and document width on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/learn/lessons/${LESSONS[0].id}`);

  await expect(page.getByRole("main")).toBeVisible();
  const steps = page.getByRole("navigation", { name: "수업 단계", exact: true });
  await expect(steps).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(3);
  for (const step of ["목표", "한 과제", "자가 확인"] as const) {
    await selectLessonStep(page, step);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "개념·용어·출처 선택 자료", exact: true }).click();
  await expect(page.getByRole("region", { name: "개념·용어·출처", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "공식 참고 자료", exact: true })).toBeVisible();
  await expect(await openLessonNotes(page)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "이전·다음 강좌" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

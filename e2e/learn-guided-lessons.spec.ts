import { LESSONS } from "../apps/web/src/domains/learn/learning-content";
import { LEARNING_PATHS, getLessonMeta, getPathLessons } from "../apps/web/src/domains/learn/learning-paths";
import { learningProgressStorageKey } from "../apps/web/src/domains/learn/learning-storage";

import { expect, test } from "./fixtures/non-studio-test";
import { openLessonExample, openLessonNotes, openLessonRecordDetails, selectLessonStep } from "./helpers/learn-lesson-navigation";

// 로그인하지 않은 학습자의 진도는 게스트 파티션 키에 저장된다(learning-storage의 소유자별 키).
const GUEST_STORAGE_KEY = learningProgressStorageKey("guest");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("toonstudio-compat-dismissed", "true"));
});

test("lesson detail exposes an outcome, jump navigation, progress requirements and adjacent lessons", async ({ page }) => {
  const lesson = LESSONS[1];
  await page.goto(`/learn/lessons/${lesson.id}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
  const goal = page.getByRole("region", { name: "이번에 만들 결과", exact: true });
  await expect(goal).toBeVisible();
  await expect(goal.locator(".learn-step-outcome strong")).toHaveText(getLessonMeta(lesson.id).outcome);
  await expect(goal.locator(".learn-step-task")).toHaveText(lesson.task);

  // 목차 대신 실제 단계 버튼과 선택 자료가 같은 학습 내용을 노출한다.
  const steps = page.getByRole("navigation", { name: "수업 단계", exact: true });
  await expect(steps.getByRole("button")).toHaveCount(3);
  await expect(steps.getByRole("button", { name: "목표", exact: true })).toHaveAttribute("aria-current", "step");
  const lab = await openLessonExample(page);
  await expect(page).toHaveURL(/lesson-step=practice/u);
  await expect(lab.getByRole("slider")).toHaveCount(2);
  const check = await selectLessonStep(page, "check");
  await expect(page).toHaveURL(/lesson-step=check/u);
  await expect(check.getByRole("heading", { name: "확인 퀴즈", exact: true })).toBeVisible();
  await expect(check.getByRole("checkbox")).toHaveCount(lesson.checks.length);
  await expect(check.getByRole("button", { name: "이 강좌 학습 완료", exact: true })).toBeDisabled();
  const records = await openLessonRecordDetails(page);
  await expect(records.getByRole("progressbar", { name: `${lesson.title} 자가 점검 진행률`, exact: true })).toHaveAttribute("value", "0");
  await page.getByRole("button", { name: "개념·용어·출처 선택 자료", exact: true }).click();
  const reference = page.getByRole("region", { name: "개념·용어·출처", exact: true });
  await expect(reference).toBeVisible();
  for (const section of lesson.sections) await expect(reference.getByRole("heading", { name: section.title, exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "이전·다음 강좌" }).getByRole("link")).toHaveCount(2);
});

test("lesson requirements update immediately and completion remains explicitly gated", async ({ page }) => {
  const lesson = LESSONS[0];
  await page.goto(`/learn/lessons/${lesson.id}`);
  const check = await selectLessonStep(page, "check");

  const finish = page.getByRole("button", { name: "이 강좌 학습 완료", exact: true });
  const records = await openLessonRecordDetails(page);
  const requirementProgress = records.getByRole("progressbar", { name: `${lesson.title} 자가 점검 진행률`, exact: true });
  const checks = check.getByRole("checkbox");

  await expect(finish).toBeDisabled();
  await expect(requirementProgress).toHaveAttribute("value", "0");
  await expect(checks).toHaveCount(lesson.checks.length);
  for (const checkbox of await checks.all()) await expect(checkbox).not.toBeChecked();
  await expect(check.getByRole("radio", { checked: true })).toHaveCount(0);

  for (const checkbox of await checks.all()) await checkbox.check();
  await expect(requirementProgress).toHaveAttribute("value", String(Math.round(lesson.checks.length / (lesson.checks.length + 1) * 100)));
  await expect(finish).toBeDisabled();
  const answer = check.getByRole("radio").nth(lesson.quiz.answer);
  await answer.check();

  await expect(requirementProgress).toHaveAttribute("value", "100");
  for (const checkbox of await checks.all()) await expect(checkbox).toBeChecked();
  await expect(answer).toBeChecked();
  await expect(page.getByRole("button", { name: "학습 완료됨", exact: true })).toHaveCount(0);
  await expect(finish).toBeEnabled();

  await finish.click();
  await expect(page.getByRole("button", { name: "학습 완료됨", exact: true })).toBeDisabled();
  await expect(requirementProgress).toHaveAttribute("value", "100");
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
  await openLessonExample(page);
  await expect(steps.getByRole("button", { name: "한 과제", exact: true })).toHaveAttribute("aria-current", "step");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

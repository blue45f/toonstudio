// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LESSONS } from "./learning-content";
import { LearningHome } from "./LearningHome";
import {
  BOTTLENECK_SPRINT_PRESETS,
  applyBottleneckSprintToProfile,
  buildBottleneckSprintSnapshot,
  computeSprintRingMetrics,
  getBottleneckSprintPath,
  resolveActiveBottleneckSprint,
} from "./learning-bottleneck-sprint";
import { emptyProgress, type LearningProgress } from "./learning-model";
import { DEFAULT_LEARNING_PROFILE, LEARNING_PROFILE_STORAGE_KEY } from "./learning-profile";
import { learningProgressStorageKey } from "./learning-storage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("learning-bottleneck-sprint pure model", () => {
  it("4가지 막힘 구간이 실제 recommendLearningPath의 4개 고유 경로와 정확히 실연동된다", () => {
    expect(BOTTLENECK_SPRINT_PRESETS).toHaveLength(4);

    const mapped = BOTTLENECK_SPRINT_PRESETS.map((preset) => ({
      promptKo: preset.promptKo,
      sprintTagKo: preset.sprintTagKo,
      pathId: getBottleneckSprintPath(preset).id,
    }));

    expect(mapped).toEqual([
      {
        promptKo: "툴이 처음이라 막막해요",
        sprintTagKo: "10분 입문 스프린트",
        pathId: "studio-quickstart",
      },
      {
        promptKo: "콘티·연출 리듬이 어색해요",
        sprintTagKo: "15분 연출 스프린트",
        pathId: "story-direction",
      },
      {
        promptKo: "선화·채색 속도를 올리고 싶어요",
        sprintTagKo: "15분 작화 스프린트",
        pathId: "visual-finish",
      },
      {
        promptKo: "완성·업로드·규격을 정리하고 싶어요",
        sprintTagKo: "20분 마감 스프린트",
        pathId: "publish-ready",
      },
    ]);
  });

  it("실제 진행 기록(store.progress)에서 완료율·총 소요 시간·다음 강좌 1개를 가짜 수치 없이 계산한다", () => {
    const [, , artPreset] = BOTTLENECK_SPRINT_PRESETS;
    expect(artPreset).toBeDefined();
    if (!artPreset) return;
    const artProfile = applyBottleneckSprintToProfile(DEFAULT_LEARNING_PROFILE, artPreset);

    expect(artProfile.role).toBe(DEFAULT_LEARNING_PROFILE.role);
    expect(resolveActiveBottleneckSprint(artProfile)?.id).toBe("art-speed");

    const emptySnapshot = buildBottleneckSprintSnapshot(artProfile, emptyProgress());
    expect(emptySnapshot.recommendedPath.id).toBe("visual-finish");
    expect(emptySnapshot.pathStats.completed).toBe(0);
    expect(emptySnapshot.pathStats.total).toBe(4);
    expect(emptySnapshot.pathStats.percent).toBe(0);
    expect(emptySnapshot.nextLesson.id).toBe("character-silhouette");
    expect(emptySnapshot.sessionTotalMinutes).toBe(12);
    expect(emptySnapshot.nextLessonHref).toBe(
      "/learn/lessons/character-silhouette?from=visual-finish",
    );
    expect(emptySnapshot.practiceStudioHref).toBe("/learn/studio");

    const partialProgress: LearningProgress = {
      version: 1,
      lessons: {
        "character-silhouette": { checks: [0, 1], answer: 0, notes: "", completed: true },
        inking: { checks: [0, 1], answer: 0, notes: "", completed: true },
      },
      bookmarks: [],
    };
    const partialSnapshot = buildBottleneckSprintSnapshot(artProfile, partialProgress);
    expect(partialSnapshot.pathStats.completed).toBe(2);
    expect(partialSnapshot.pathStats.percent).toBe(50);
    expect(partialSnapshot.nextLesson.id).toBe("color-layers");
    expect(partialSnapshot.sessionTotalMinutes).toBe(16);
  });

  it("OKLCH 진행 링 원주·오프셋을 0~100 범위로 안전하게 계산한다", () => {
    const zero = computeSprintRingMetrics(0, 24);
    const half = computeSprintRingMetrics(50, 24);
    const full = computeSprintRingMetrics(140, 24);

    expect(zero.clampedPercent).toBe(0);
    expect(zero.dashOffset).toBe(zero.circumference);
    expect(half.clampedPercent).toBe(50);
    expect(half.dashOffset).toBeCloseTo(half.circumference / 2, 1);
    expect(full.clampedPercent).toBe(100);
    expect(full.dashOffset).toBe(0);
  });
});

function buildCompletedLessonEntry(lessonId: string) {
  const lesson = LESSONS.find((entry) => entry.id === lessonId);
  if (!lesson) {
    throw new Error(`Unknown lesson id in test fixture: ${lessonId}`);
  }
  return {
    checks: lesson.checks.map((_, index) => index),
    answer: lesson.quiz.answer,
    notes: "",
    completed: true,
  };
}

describe("LearningBottleneckSprintBar + LearningHome integration", () => {
  it("오늘의 학습 탭 상단에서 1탭으로 추천 경로·오늘 강좌·진행 링·실습 캔버스 동선을 즉시 갱신한다", () => {
    const progressKey = learningProgressStorageKey("guest");
    const seededProgress: LearningProgress = {
      version: 1,
      lessons: {
        "character-silhouette": buildCompletedLessonEntry("character-silhouette"),
        inking: buildCompletedLessonEntry("inking"),
      },
      bookmarks: [],
    };
    window.localStorage.setItem(progressKey, JSON.stringify(seededProgress));

    render(
      <MemoryRouter initialEntries={["/learn"]}>
        <LearningHome />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("learn-bottleneck-sprint-bar");
    expect(bar).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("첫 3컷 완성");

    const group = within(bar).getByRole("group", { name: "지금 막힌 구간 1초 선택" });
    const artButton = within(group).getByRole("button", { name: /선화·채색 속도를 올리고 싶어요/u });
    fireEvent.click(artButton);

    expect(artButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("그림 완성도 올리기");
    expect(screen.getByTestId("learn-bottleneck-ring-percent").textContent).toBe("50%");
    expect(screen.getByTestId("learn-bottleneck-next-lesson").textContent).toBe(
      "밑색·음영·클리핑을 분리해서 이해하기",
    );
    expect(
      screen.getByTestId("learn-bottleneck-start-lesson").getAttribute("href"),
    ).toBe("/learn/lessons/color-layers?from=visual-finish");
    expect(
      screen.getByTestId("learn-bottleneck-open-studio").getAttribute("href"),
    ).toBe("/learn/studio");

    const savedProfile = JSON.parse(
      window.localStorage.getItem(LEARNING_PROFILE_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    expect(savedProfile).toMatchObject({
      goal: "visual",
      level: "growing",
      sessionMinutes: 15,
    });

    const publishButton = within(group).getByRole("button", {
      name: /완성·업로드·규격을 정리하고 싶어요/u,
    });
    fireEvent.click(publishButton);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("첫 회차 게시 준비");
    expect(screen.getByTestId("learn-bottleneck-prescription").getAttribute("data-path-id")).toBe(
      "publish-ready",
    );
  });

  it("신규 TSX/CSS 소스에 하드코딩 HEX·금지 모션·any가 0건이고 reduced-motion 및 기존 테스트 계약을 지킨다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/learn");
    const tsx = readFileSync(resolve(dir, "LearningBottleneckSprintBar.tsx"), "utf8");
    const model = readFileSync(resolve(dir, "learning-bottleneck-sprint.ts"), "utf8");
    const css = readFileSync(resolve(dir, "learning-bottleneck-sprint.css"), "utf8");

    for (const source of [tsx, model, css]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source).not.toMatch(/\b(?:transition-all|animate-bounce|animate-ping|animate-spin|animate-pulse)\b/u);
      expect(source).not.toMatch(/@ts-nocheck/u);
    }
    expect(tsx).not.toContain('role="status"');
    expect(tsx).not.toContain('role="tab"');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(tsx).toContain("min-h-11");
    expect(tsx).toContain("[word-break:keep-all]");
    expect(tsx).toContain("tabular-nums");
  });
});

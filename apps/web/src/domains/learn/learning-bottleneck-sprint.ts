import { LESSONS } from "./learning-content";
import type { LearningProgress, Lesson } from "./learning-model";
import {
  buildSessionPlan,
  getLessonMeta,
  getLessonState,
  getPathStats,
  recommendLearningPath,
  type LearningPath,
  type LessonState,
  type PathStats,
} from "./learning-paths";
import type { LearningProfile } from "./learning-profile";

export type BottleneckSprintId =
  | "tool-beginner"
  | "story-rhythm"
  | "art-speed"
  | "publish-finish";

export type BottleneckSprintTone = "good" | "cool" | "accent" | "warn";

export interface BottleneckSprintPreset {
  readonly id: BottleneckSprintId;
  readonly tone: BottleneckSprintTone;
  readonly promptKo: string;
  readonly promptEn: string;
  readonly sprintTagKo: string;
  readonly sprintTagEn: string;
  readonly prescriptionKo: string;
  readonly prescriptionEn: string;
  readonly profilePatch: Pick<LearningProfile, "goal" | "level" | "sessionMinutes">;
}

export interface BottleneckSprintSnapshot {
  readonly activePreset: BottleneckSprintPreset | null;
  readonly recommendedPath: LearningPath;
  readonly pathStats: PathStats;
  readonly sessionLessons: readonly Lesson[];
  readonly sessionTotalMinutes: number;
  readonly nextLesson: Lesson;
  readonly nextLessonState: LessonState;
  readonly nextLessonOutcome: string;
  readonly nextLessonHref: string;
  readonly practiceStudioHref: "/learn/studio";
}

export interface SprintRingMetrics {
  readonly clampedPercent: number;
  readonly radius: number;
  readonly circumference: number;
  readonly dashOffset: number;
}

export const BOTTLENECK_SPRINT_PRESETS: readonly BottleneckSprintPreset[] =
  Object.freeze([
    {
      id: "tool-beginner",
      tone: "good",
      promptKo: "툴이 처음이라 막막해요",
      promptEn: "New to the tool and stuck",
      sprintTagKo: "10분 입문 스프린트",
      sprintTagEn: "10-min starter sprint",
      prescriptionKo: "원고 손상 없는 안전한 순서로 툰스튜디오 핵심 흐름부터 익힙니다.",
      prescriptionEn: "Learn the safe ToonStudio basics first without risking your canvas.",
      profilePatch: {
        goal: "studio",
        level: "starter",
        sessionMinutes: 15,
      },
    },
    {
      id: "story-rhythm",
      tone: "cool",
      promptKo: "콘티·연출 리듬이 어색해요",
      promptEn: "Storyboard & scroll pacing feel stiff",
      sprintTagKo: "15분 연출 스프린트",
      sprintTagEn: "15-min pacing sprint",
      prescriptionKo: "장면 목표, 세로 스크롤 여백, 카메라 시선 흐름을 차례로 바로잡습니다.",
      prescriptionEn: "Fix scene beats, vertical scroll breathing room, and camera flow.",
      profilePatch: {
        goal: "story",
        level: "growing",
        sessionMinutes: 15,
      },
    },
    {
      id: "art-speed",
      tone: "accent",
      promptKo: "선화·채색 속도를 올리고 싶어요",
      promptEn: "Want faster line art & coloring",
      sprintTagKo: "15분 작화 스프린트",
      sprintTagEn: "15-min art sprint",
      prescriptionKo: "실루엣·필압·밑색 클리핑 분리 구조로 수정 시간을 줄입니다.",
      prescriptionEn: "Cut rework with clean silhouettes, intentional ink weight, and flat layers.",
      profilePatch: {
        goal: "visual",
        level: "growing",
        sessionMinutes: 15,
      },
    },
    {
      id: "publish-finish",
      tone: "warn",
      promptKo: "완성·업로드·규격을 정리하고 싶어요",
      promptEn: "Need export & upload polish",
      sprintTagKo: "20분 마감 스프린트",
      sprintTagEn: "20-min finish sprint",
      prescriptionKo: "말풍선 가독성, 원본·게시본 분리, 최종 업로드 검수 기준을 점검합니다.",
      prescriptionEn: "Verify lettering clarity, master vs. export separation, and upload checks.",
      profilePatch: {
        goal: "publish",
        level: "advanced",
        sessionMinutes: 30,
      },
    },
  ]);

/**
 * 현재 학습 프로필이 어느 막힘 구간 프리셋과 일치하는지 판별한다.
 * 기본 프로필(`first-episode`) 등 별도 맞춤 설정이면 `null`을 반환한다.
 */
export function resolveActiveBottleneckSprint(
  profile: Pick<LearningProfile, "goal" | "level">,
): BottleneckSprintPreset | null {
  return (
    BOTTLENECK_SPRINT_PRESETS.find(
      (preset) =>
        preset.profilePatch.goal === profile.goal &&
        preset.profilePatch.level === profile.level,
    ) ?? null
  );
}

/**
 * 선택한 막힘 구간 프리셋을 현재 프로필에 합친다. 사용자의 역할(`role`)과 버전은 보존한다.
 */
export function applyBottleneckSprintToProfile(
  profile: LearningProfile,
  preset: BottleneckSprintPreset,
): LearningProfile {
  return {
    ...profile,
    goal: preset.profilePatch.goal,
    level: preset.profilePatch.level,
    sessionMinutes: preset.profilePatch.sessionMinutes,
  };
}

/** 각 프리셋이 실제 `recommendLearningPath`에서 어떤 경로와 연결되는지 조회한다. */
export function getBottleneckSprintPath(
  preset: BottleneckSprintPreset,
): LearningPath {
  return recommendLearningPath(
    preset.profilePatch.goal,
    preset.profilePatch.level,
  );
}

/**
 * 실제 `recommendLearningPath`, `getPathStats`, `buildSessionPlan`, `progress`에서만
 * 스프린트 처방 스냅샷을 계산한다(임의·가짜 수치 0건).
 */
export function buildBottleneckSprintSnapshot(
  profile: LearningProfile,
  progress: LearningProgress,
): BottleneckSprintSnapshot {
  const activePreset = resolveActiveBottleneckSprint(profile);
  const recommendedPath = recommendLearningPath(profile.goal, profile.level);
  const pathStats = getPathStats(recommendedPath, progress);
  const sessionLessons = buildSessionPlan(
    recommendedPath,
    progress,
    profile.sessionMinutes,
  );
  const fallbackLesson = LESSONS[0];
  const nextLesson = sessionLessons[0] ?? fallbackLesson;
  if (!nextLesson) {
    throw new Error("Learning lessons catalog must contain at least one lesson.");
  }

  const sessionTotalMinutes = sessionLessons.reduce(
    (sum, lesson) => sum + lesson.minutes,
    0,
  );
  const nextLessonState = getLessonState(progress, nextLesson.id);
  const nextLessonOutcome = getLessonMeta(nextLesson.id).outcome;
  const nextLessonHref = `/learn/lessons/${encodeURIComponent(nextLesson.id)}?from=${encodeURIComponent(recommendedPath.id)}`;

  return {
    activePreset,
    recommendedPath,
    pathStats,
    sessionLessons,
    sessionTotalMinutes,
    nextLesson,
    nextLessonState,
    nextLessonOutcome,
    nextLessonHref,
    practiceStudioHref: "/learn/studio",
  };
}

/** OKLCH SVG 진행 링의 원주와 오프셋을 결정론적으로 계산한다. */
export function computeSprintRingMetrics(
  percent: number,
  radius = 24,
): SprintRingMetrics {
  const clampedPercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : 0;
  const circumference = Number((2 * Math.PI * radius).toFixed(2));
  const dashOffset = Number(
    (circumference * (1 - clampedPercent / 100)).toFixed(2),
  );
  return {
    clampedPercent,
    radius,
    circumference,
    dashOffset,
  };
}

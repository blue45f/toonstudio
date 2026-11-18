import type { LearningGoal, LearningLevel } from "./learning-paths";

export const LEVEL_LABELS: Readonly<Record<LearningLevel, string>> = {
  starter: "처음 시작",
  growing: "기초를 익힌 뒤",
  advanced: "완성·게시 단계",
};

export const GOAL_OPTIONS: readonly { value: LearningGoal; label: string }[] = [
  { value: "first-episode", label: "첫 3컷·첫 회차를 완성하고 싶어요" },
  { value: "story", label: "이야기와 컷 연출을 강화하고 싶어요" },
  { value: "visual", label: "그림과 채색 완성도를 높이고 싶어요" },
  { value: "studio", label: "툰스튜디오를 빠르게 익히고 싶어요" },
  { value: "publish", label: "게시 전 원고를 제대로 검수하고 싶어요" },
];

export const STATUS_LABELS = {
  "not-started": "시작 전",
  "in-progress": "학습 중",
  completed: "완료",
} as const;

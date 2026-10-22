import type { CSSProperties } from "react";

/**
 * 학습 경로 틴트 (BLUEPRINT §6.3 학습 행, S3-18).
 *
 * §6.2 (1) 규칙대로 표면은 자기 색을 발명하지 않고 `--domain-tint` 하나만
 * 덮어쓴다. 경로는 테마와 무관한 정체성을 가지므로(탐색의 장르 틴트와 같은
 * 결) 틴트 값은 경로 id 기준으로 이 파일 한곳에서만 선언하고, CSS는
 * `--domain-tint`만 소비한다. 틴트는 강조·경계·진행 표시에만 쓰고 본문
 * 텍스트 색으로는 쓰지 않는다(§6.4 경계 1·2).
 */
export const LEARNING_PATH_TINTS: Readonly<Record<string, string>> = {
  "first-three-panels": "oklch(0.62 0.17 255)",
  "story-direction": "oklch(0.60 0.18 305)",
  "visual-finish": "oklch(0.62 0.17 25)",
  "studio-quickstart": "oklch(0.64 0.15 165)",
  "publish-ready": "oklch(0.66 0.16 75)",  "episode-production": "oklch(0.61 0.16 195)",
  "character-consistency-path": "oklch(0.63 0.17 330)",
  "review-and-finish": "oklch(0.62 0.15 140)",
  "serial-operations": "oklch(0.60 0.17 280)",
  "collaboration-production": "oklch(0.64 0.16 45)",
  "classroom-teaching": "oklch(0.62 0.14 100)",
  "advanced-craft": "oklch(0.59 0.18 10)",
};

export function learningPathTint(pathId: string): string | undefined {
  return LEARNING_PATH_TINTS[pathId];
}

/** 경로 표면(경로 카드·경로 상세 루트)에 `--domain-tint`만 얹는 인라인 스타일. */
export function learningPathTintStyle(pathId: string): CSSProperties | undefined {
  const tint = learningPathTint(pathId);
  return tint ? ({ "--domain-tint": tint } as CSSProperties) : undefined;
}

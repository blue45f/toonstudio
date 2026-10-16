import { studioBg3dLineNeedsDepth, type StudioBg3dLineOutputSettings } from "./studio-bg3d-scene-document-types";

/** Lightweight pass catalog shared by the editor controls and the deferred production runtime. */
export const STUDIO_BG3D_SHOT_BATCH_PASSES = Object.freeze([
  "beauty",
  "lt-composite",
  "color",
  "tone",
  "texture-line",
  "main-line",
  "depth",
  "normal",
] as const);

export type StudioBg3dShotBatchPass = (typeof STUDIO_BG3D_SHOT_BATCH_PASSES)[number];

export const STUDIO_BG3D_SHOT_BATCH_PASS_LABELS: Readonly<
  Record<StudioBg3dShotBatchPass, string>
> = Object.freeze({
  beauty: "원본 렌더",
  "lt-composite": "LT 합성",
  color: "컬러",
  tone: "톤",
  "texture-line": "질감선",
  "main-line": "주선",
  depth: "깊이",
  normal: "법선",
});

/**
 * 컷 하나를 캡처할 때 깊이를 함께 받아야 하는지. 깊이·법선 패스를 내보내거나, 선 설정이 깊이를 요구할 때
 * (깊이선 검출, 내부선 억제) 그렇다. 배치 계획을 만들 때와 계획을 검증할 때 같은 판정을 쓰도록 한곳에 둔다.
 */
export function studioBg3dShotBatchNeedsDepth(
  line: Pick<
    StudioBg3dLineOutputSettings,
    "depthEnabled" | "interiorSuppressionEnabled" | "interiorSuppressionStrength"
  >,
  passes: readonly StudioBg3dShotBatchPass[],
): boolean {
  return studioBg3dLineNeedsDepth(line) || passes.includes("depth") || passes.includes("normal");
}

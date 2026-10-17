import { resolveStudioBg3dProductionBatchPreset } from "./studio-bg3d-production-multipass";

import type { StudioBg3dProductionBatchPreset } from "./studio-bg3d-production-multipass";
import type {
  StudioBg3dOutputSettings,
  StudioBg3dToneMode,
  StudioBg3dToneOutputType,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";

export interface StudioBg3dProductionLookState {
  readonly lineEnabled: boolean;
  readonly lineStrength: number;
  readonly textureLineEnabled: boolean;
  readonly textureLineStrength: number;
  /**
   * 내부선 억제가 켜져 있고 강도가 100% 라서 질감선이 전부 지워지는 상태(렌더러는 이때 질감선 레이어를 만들지
   * 않는다). 선택 필드이며 없으면 해당하지 않는다.
   */
  readonly textureLineSuppressed?: boolean;
  readonly toneMode: StudioBg3dToneMode;
  readonly toneType: StudioBg3dToneOutputType;
  readonly toneOpacity: number;
}

export interface StudioBg3dProductionPassIssue {
  readonly pass: StudioBg3dShotBatchPass;
  readonly reason: string;
}

export interface StudioBg3dProductionPassReadiness {
  readonly readyPasses: readonly StudioBg3dShotBatchPass[];
  readonly issues: readonly StudioBg3dProductionPassIssue[];
  readonly blockingReason: string | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 내부선 억제가 켜져 있고 강도가 최대(1 이상)이면 재질선이 모두 사라진다.
 *
 * 판정 규칙의 원본은 `studio-bg3d-line-output-rules.ts`(`resolveStudioBg3dInteriorSuppression`)이고 같은 결과를 낸다.
 * 이 모듈은 편집기 활성화 번들과 따로 로드되는 생산 청크에 속한다. 원본 모듈을 import 하면 번들러가 그 잎 모듈을
 * 생산 청크로 묶고, 편집기 활성화 정적 그래프가 생산 청크 전체를 끌어와 청크 수 상한(93)을 넘는다. 그래서 같은 판정을
 * 여기에 적는다. 두 판정이 어긋나지 않음은 `studio-bg3d-production-pass-readiness.test.ts` 의 표 시험이 지킨다.
 */
function suppressesAllTextureLines(line: StudioBg3dOutputSettings["line"]): boolean {
  const strength = line.interiorSuppressionStrength ?? 0.6;
  return line.interiorSuppressionEnabled === true && strength >= 1;
}

export function summarizeStudioBg3dProductionLook(
  output: StudioBg3dOutputSettings,
): StudioBg3dProductionLookState {
  return Object.freeze({
    lineEnabled: output.line.enabled,
    lineStrength: finiteNonNegative(output.line.strength),
    textureLineEnabled: output.line.textureLineEnabled,
    textureLineStrength: finiteNonNegative(output.line.textureLineStrength),
    ...(suppressesAllTextureLines(output.line) ? { textureLineSuppressed: true } : {}),
    toneMode: output.tone.mode,
    toneType: output.tone.type,
    toneOpacity: finiteNonNegative(output.tone.opacity),
  });
}

function resolvePassIssue(
  pass: StudioBg3dShotBatchPass,
  look: StudioBg3dProductionLookState,
): string | null {
  const mainLineReady = look.lineEnabled && look.lineStrength > 0;
  const textureLineRequested =
    mainLineReady && look.textureLineEnabled && look.textureLineStrength > 0;
  const textureLineSuppressed = textureLineRequested && look.textureLineSuppressed === true;
  const textureLineReady = textureLineRequested && !textureLineSuppressed;
  const toneLayerReady = look.toneMode !== "none" && look.toneOpacity > 0;
  const colorReady = toneLayerReady && look.toneType === "color";
  const toneReady = toneLayerReady && look.toneType !== "color";
  const ltCompositeReady = mainLineReady || textureLineReady || toneLayerReady;

  switch (pass) {
    case "beauty":
    case "depth":
    case "normal":
      return null;
    case "lt-composite":
      return ltCompositeReady
        ? null
        : "선화와 톤이 모두 꺼져 있어 LT 합성 레이어가 생성되지 않습니다.";
    case "main-line":
      return mainLineReady
        ? null
        : "주선 출력이 꺼져 있거나 선 강도가 0입니다.";
    case "texture-line":
      if (textureLineReady) return null;
      return textureLineSuppressed
        ? "내부선 억제 강도가 100%라 질감선이 모두 지워져 질감선 패스가 생성되지 않습니다."
        : "주선 또는 질감선 출력이 꺼져 있거나 질감선 강도가 0입니다.";
    case "color":
      return colorReady
        ? null
        : look.toneType === "color"
          ? "컬러 톤 모드가 꺼져 있거나 불투명도가 0입니다."
          : "현재 톤 출력 형식이 컬러가 아니므로 컬러 패스가 생성되지 않습니다.";
    case "tone":
      return toneReady
        ? null
        : look.toneType === "color"
          ? "현재 톤 출력 형식이 컬러이므로 별도 톤 패스가 생성되지 않습니다."
          : "톤 모드가 꺼져 있거나 불투명도가 0입니다.";
  }
}

export function evaluateStudioBg3dProductionPassReadiness(
  selectedPasses: readonly StudioBg3dShotBatchPass[],
  look: StudioBg3dProductionLookState,
): StudioBg3dProductionPassReadiness {
  const readyPasses: StudioBg3dShotBatchPass[] = [];
  const issues: StudioBg3dProductionPassIssue[] = [];
  const seen = new Set<StudioBg3dShotBatchPass>();

  for (const pass of selectedPasses) {
    if (seen.has(pass)) continue;
    seen.add(pass);
    const reason = resolvePassIssue(pass, look);
    if (reason) {
      issues.push(Object.freeze({ pass, reason }));
    } else {
      readyPasses.push(pass);
    }
  }

  return Object.freeze({
    readyPasses: Object.freeze(readyPasses),
    issues: Object.freeze(issues),
    blockingReason: issues.length > 0
      ? `${issues.length}개 선택 패스가 현재 LT 설정과 맞지 않습니다. 패스 선택을 정리하거나 LT 설정을 조정하세요.`
      : null,
  });
}

/**
 * Resolves a purpose preset against both the renderer pass catalog and the active LT output state.
 * Color and non-color tone are mutually exclusive, so a manuscript preset never promises both.
 */
export function resolveStudioBg3dProductionBatchPresetForLook(
  availablePasses: readonly StudioBg3dShotBatchPass[],
  preset: StudioBg3dProductionBatchPreset,
  look: StudioBg3dProductionLookState,
): readonly StudioBg3dShotBatchPass[] {
  const requested = resolveStudioBg3dProductionBatchPreset(availablePasses, preset);
  return evaluateStudioBg3dProductionPassReadiness(requested, look).readyPasses;
}

export function detectStudioBg3dProductionBatchPresetForLook(
  availablePasses: readonly StudioBg3dShotBatchPass[],
  selectedPasses: readonly StudioBg3dShotBatchPass[],
  look: StudioBg3dProductionLookState,
): StudioBg3dProductionBatchPreset | "custom" {
  const selectedSet = new Set(selectedPasses);
  if (selectedSet.size !== selectedPasses.length) return "custom";

  for (const preset of ["review", "manuscript", "ai-reference", "all"] as const) {
    const expected = resolveStudioBg3dProductionBatchPresetForLook(
      availablePasses,
      preset,
      look,
    );
    if (
      expected.length === selectedSet.size &&
      expected.every((pass) => selectedSet.has(pass))
    ) {
      return preset;
    }
  }
  return "custom";
}

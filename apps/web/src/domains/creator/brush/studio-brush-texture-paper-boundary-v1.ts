/**
 * Studio Brush Texture × Paper Deposit Boundary v1 — 텍스처 height와 종이 침착의 역할 경계.
 *
 * 배경 (brush-textures 설계 판단). 텍스처 결합의 height 모드와 W7 종이 침착(deposit scale)은
 * "높이 필드를 보고 닿는 만큼만 잉크를 남긴다"는 점에서 닮았지만 **층이 다르다**.
 * 닮았다는 이유로 하나로 합치면 브러시를 바꿀 때 종이까지 따라 바뀌거나, 문서를 바꿀 때
 * 브러시 질감까지 흔들린다. 그래서 둘을 합치지 않고 공존시키며, 이 모듈이 그 경계와
 * 합성 순서를 명문화한다 — 구현의 단일 진실이 아니라 **계약의 단일 진실**이다.
 *
 * 경계.
 * - 텍스처 결합(height 포함)은 **브러시 층**이다. 브러시가 고른 "패턴"에 작용하고, 패턴
 *   좌표계는 그레인 설정의 space(canvas-fixed/stroke-fixed)를 따르며 깊이는 dab마다
 *   달라질 수 있다(depth jitter). 권위: `studio-brush-texture-combine-v1`.
 * - 종이 침착은 **문서 층**이다. 문서가 고른 "종이 기질"의 높이에 작용하고, 문서 좌표에
 *   고정되며(종이는 캔버스 속성이지 획 속성이 아니다 — 브러시 스냅샷에 들어가지 않는다),
 *   매체 극성(건식 peak-catch / 수채 valley-settle / 유화 weave-reveal)과 필압이 정한다.
 *   권위: `studio-paper-media-profile-v1`의 deposit scale (W7). 종이 결 강도는
 *   `studio-paper-granulation-runtime`의 granulation 축이 따로 소유한다.
 * - 프리셋은 종이를 소유하지 않는다. 프리셋이 할 수 있는 것은 텍스처 층을 켜는 것뿐이고,
 *   종이 침착은 어떤 프리셋을 골라도 문서 종이가 그대로 마지막에 합성된다.
 *
 * 합성 순서 (렌더러 실측과 일치 — `studio-dynamic-brush-coverage-renderer`의
 * `grainAt = 브러시 그레인 × 종이 이득`, 맵 경로는 팁 맵 → 그레인/R8 합성 →
 * `composeStudioPaperTipAlphaMap` 종이 합성).
 *   1. 팁 커버리지 (브러시 층)
 *   2. 텍스처 결합 — 레벨 조정 → dab 깊이 → 결합. height는 이 단계에서만 일어난다.
 *   3. 종이 침착 — 문서 좌표에서 텍셀당 deposit 배수를 곱하고 0..1로 클램프.
 * 순서는 교환 가능해 보이지만(곱셈) 그렇지 않다: height는 곱셈이 아니라 커버리지에
 * 의존하는 도달 모델이라, 종이 배수를 먼저 곱하면 닿는 높이가 종이 때문에 달라진다.
 * 종이는 언제나 **텍스처가 남긴 결과**에만 곱해진다.
 *
 * 불변식.
 * - 종이는 잉크를 만들지 않는다: 텍스처까지의 결과가 0인 텍셀은 종이 배수가 최대
 *   (depositScale 상한 1.5)여도 0이다. (`composeStudioPaperTipAlphaMap`이 알파 0
 *   텍셀을 건너뛰는 것과 같은 계약.)
 * - 둘 다 항등이면 전체가 항등이다: 텍스처 없음 + 종이 배수 1 = 입력 커버리지 그대로.
 * - 종이 배수의 범위·극성 수학은 이 모듈이 다시 정의하지 않는다. 입력 배수는 종이
 *   권위들이 이미 산출한 최종값이어야 하고, 여기서는 순서와 클램프만 보장한다.
 */

import {
  applyStudioBrushTextureV1,
  type NormalizedStudioBrushTextureSettingsV1,
} from "./studio-brush-texture-combine-v1";
import {
  STUDIO_PAPER_MEDIA_MODULATION_BOUNDS_V1,
  STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1,
} from "./studio-paper-media-profile-v1";

export const STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_VERSION_V1 = 1 as const;

/** 합성 순서의 단계 하나. `layer`가 경계다 — "brush"는 브러시 소유, "document"는 문서 소유. */
export interface StudioBrushTexturePaperCompositionStepV1 {
  readonly step: "tip-coverage" | "texture-combine" | "paper-deposit";
  readonly layer: "brush" | "document";
  /** 이 단계의 수학을 소유하는 모듈. 다른 모듈이 같은 수학을 복제하면 경계 위반이다. */
  readonly authority: string;
  /** 값이 평가되는 좌표계. 텍스처는 dab/획, 종이는 문서에 고정된다. */
  readonly coordinates: "dab" | "document";
}

/** 명문화된 합성 순서 — 앞 단계의 출력이 다음 단계의 입력이다. 순서를 바꾸는 변경은 경계 위반. */
export const STUDIO_BRUSH_TEXTURE_PAPER_COMPOSITION_ORDER_V1:
  readonly StudioBrushTexturePaperCompositionStepV1[] = Object.freeze([
    Object.freeze({
      step: "tip-coverage",
      layer: "brush",
      authority: "studio-brush-tip-stamp",
      coordinates: "dab",
    }),
    Object.freeze({
      step: "texture-combine",
      layer: "brush",
      authority: "studio-brush-texture-combine-v1",
      coordinates: "dab",
    }),
    Object.freeze({
      step: "paper-deposit",
      layer: "document",
      authority: "studio-paper-media-profile-v1",
      coordinates: "document",
    }),
  ]);

/**
 * 프리셋 도움말에 그대로 표시되는 경계 설명 (사용자 문구).
 *
 * 프리셋 `description`이 도움말 표면이라, 두 효과를 동시에 켜는 프리셋은 이 문장을
 * 설명에 포함해야 한다 — 도움말이 없는 프리셋은 경계를 어긴 것이 아니라 설명을
 * 빠뜨린 것이지만, 사용자는 구분할 방법이 없으므로 문구 자체를 상수로 고정한다.
 */
export const STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_HELP_V1 =
  "질감 경계: 브러시 텍스처(높이)는 이 브러시가 고른 패턴에만 적용되고, 종이 침착은 문서가 고른 종이에만 적용됩니다. " +
  "합성은 텍스처 먼저, 종이 침착 나중 순서이며, 종이는 잉크가 없는 곳에 새로 만들지 않습니다.";

/**
 * 두 효과를 동시에 켜는 프리셋의 기준 기본값.
 *
 * 텍스처 쪽 수치는 결합 모듈의 실측 기준값이다: height depth 0.05는 1/255 양자화로
 * 13/255가 되어 도달 높이 `12 × 13/255 ≈ 0.61` — 전면 커버리지에서도 패턴의 어두운
 * 골에만 닿는 시작점이다. 텍스처 섹션 기본값(depth 1)으로는 도달 높이가 12까지 가서
 * height가 사실상 무력화되므로, height 프리셋은 반드시 낮은 depth를 명시해야 한다.
 * grain amount 0.18은 dry-media 프리셋의 기존 값이며, 텍스처 섹션이 depth를 생략하면
 * amount가 depth로 주입되는 규약(`studio-brush-material-dynamics`)과 함께 읽는다.
 *
 * 종이 쪽은 "프리셋 기본값"이 아니라 **항등 기준선**이다: 프리셋은 종이를 소유하지
 * 않으므로, 프리셋이 종이에 대해 보장할 수 있는 값은 항등(depositScale 1 ·
 * granulation 0)뿐이고 실제 침착량은 문서 종이와 매체가 정한다.
 */
export const STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1 = Object.freeze({
  texture: Object.freeze({
    mode: "height",
    depth: 0.05,
    depthJitter: 0,
    minimumDepth: 0,
    brightness: 0,
    contrast: 0,
    invert: false,
  }),
  grainAmount: 0.18,
  paperIdentity: Object.freeze({
    depositScale: STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1.depositScale,
    depositScaleMax: STUDIO_PAPER_MEDIA_MODULATION_BOUNDS_V1.depositScale.max,
    granulation: 0,
    staining: 0,
  }),
});

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function finiteOr(value: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface StudioBrushTextureThenPaperInputV1 {
  /** 1단계 출력 — 팁 커버리지 0..1. */
  readonly coverage: number;
  /** 브러시 패턴 원값 0..1 (레벨 조정 전). 텍스처가 없으면 무시된다. */
  readonly rawPatternValue: number;
  /** 2단계 설정. null이면 텍스처 층을 건너뛴다(끄기는 "호출하지 않음"으로 표현하는 규약과 동일). */
  readonly texture: NormalizedStudioBrushTextureSettingsV1 | null;
  readonly strokeSeed: number;
  readonly dabIndex: number;
  /**
   * 3단계 배수 — 종이 권위(deposit scale × granulation 강도 혼합)가 이미 산출한 최종값.
   * 1이 항등. 비유한 값은 항등 1로 fail-closed 한다 (종이 권위들의 fail-closed와 같은 규율).
   */
  readonly paperDepositMultiplier: number;
}

/**
 * 경계 순서대로 합성한 최종 알파: 텍스처 결합 결과를 입력으로 종이 침착을 마지막에 곱한다.
 *
 * 렌더러의 맵/스칼라 경로가 이미 이 순서로 합성하고 있어 이 함수는 새 렌더 경로가 아니라
 * **순서를 고정하는 기준 구현**이다 — 프리셋 미리보기·테스트·후속 배선이 "의도한 순서"를
 * 검증할 때 이 함수와 대조한다. 종이 배수는 텍스처가 0으로 만든 텍셀을 되살릴 수 없다.
 */
export function composeStudioBrushTextureThenPaperAlphaV1(
  input: StudioBrushTextureThenPaperInputV1,
): number {
  const afterTexture = input.texture
    ? applyStudioBrushTextureV1(
        input.texture,
        input.coverage,
        input.rawPatternValue,
        input.strokeSeed,
        input.dabIndex,
      )
    : clamp01(finiteOr(input.coverage, 0));
  if (afterTexture <= 0) return 0;
  const paperMultiplier = finiteOr(input.paperDepositMultiplier, 1);
  if (paperMultiplier <= 0) return 0;
  return clamp01(afterTexture * paperMultiplier);
}

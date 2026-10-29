/**
 * @file xcf-layer-modes.ts
 * @description GIMP XCF `PROP_MODE` 레이어 모드와 합성 속성 열거값 표.
 *
 * 값과 도입 버전은 공개 포맷 명세(https://developer.gimp.org/core/standards/xcf/)가 열거하는 사실만
 * 자체 표현으로 옮긴 것이다. 명세 문서는 GPL-2.0-or-later라 문구를 복사하지 않았고 GIMP 소스는 읽지 않았다
 * (ADR-0008 §4). 합성 공식은 이 파일의 범위가 아니다.
 *
 * 근거 수준: 열거값 자체는 명세 기준이며, 실제 파일에서는 명세 열거에 없는 값(예: `PROP_BLEND_SPACE = 0`)이
 * 관측되었다. 알 수 없는 값은 `describeXcfLayerMode`가 null을 돌려주므로 호출자는 원래 숫자를 보존해야 한다.
 */

export interface XcfLayerModeInfo {
  readonly id: number;
  readonly name: string;
  /** 구형 모드 집합(0~22) 여부. 신형(28~61)은 같은 이름을 새 번호로 다시 정의한다. */
  readonly legacy: boolean;
  /** 이 모드 번호가 도입된 XCF 버전. */
  readonly introducedInVersion: number;
}

/** [id, 이름, legacy, 도입 버전] */
type ModeRow = readonly [number, string, boolean, number];

const MODE_ROWS: readonly ModeRow[] = [
  [0, "Normal", true, 0],
  [1, "Dissolve", true, 0],
  [2, "Behind", true, 0],
  [3, "Multiply", true, 0],
  [4, "Screen", true, 0],
  [5, "Overlay (old, broken)", true, 0],
  [6, "Difference", true, 0],
  [7, "Addition", true, 0],
  [8, "Subtract", true, 0],
  [9, "Darken only", true, 0],
  [10, "Lighten only", true, 0],
  [11, "Hue (HSV)", true, 0],
  [12, "Saturation (HSV)", true, 0],
  [13, "Color (HSL)", true, 0],
  [14, "Value (HSV)", true, 0],
  [15, "Divide", true, 0],
  [16, "Dodge", true, 0],
  [17, "Burn", true, 0],
  [18, "Hard light", true, 0],
  [19, "Soft light", true, 2],
  [20, "Grain extract", true, 2],
  [21, "Grain merge", true, 2],
  [22, "Color erase", true, 2],
  [23, "Overlay", false, 9],
  [24, "Hue (LCH)", false, 9],
  [25, "Chroma (LCH)", false, 9],
  [26, "Color (LCH)", false, 9],
  [27, "Lightness (LCH)", false, 9],
  [28, "Normal", false, 10],
  [29, "Behind", false, 10],
  [30, "Multiply", false, 10],
  [31, "Screen", false, 10],
  [32, "Difference", false, 10],
  [33, "Addition", false, 10],
  [34, "Subtract", false, 10],
  [35, "Darken only", false, 10],
  [36, "Lighten only", false, 10],
  [37, "Hue (HSV)", false, 10],
  [38, "Saturation (HSV)", false, 10],
  [39, "Color (HSL)", false, 10],
  [40, "Value (HSV)", false, 10],
  [41, "Divide", false, 10],
  [42, "Dodge", false, 10],
  [43, "Burn", false, 10],
  [44, "Hard light", false, 10],
  [45, "Soft light", false, 10],
  [46, "Grain extract", false, 10],
  [47, "Grain merge", false, 10],
  [48, "Vivid light", false, 10],
  [49, "Pin light", false, 10],
  [50, "Linear light", false, 10],
  [51, "Hard mix", false, 10],
  [52, "Exclusion", false, 10],
  [53, "Linear burn", false, 10],
  [54, "Luma/Luminance darken only", false, 10],
  [55, "Luma/Luminance lighten only", false, 10],
  [56, "Luminance", false, 10],
  [57, "Color erase", false, 10],
  [58, "Erase", false, 10],
  [59, "Merge", false, 10],
  [60, "Split", false, 10],
  [61, "Pass through", false, 10],
];

export const XCF_LAYER_MODES: readonly XcfLayerModeInfo[] = Object.freeze(
  MODE_ROWS.map(([id, name, legacy, introducedInVersion]) =>
    Object.freeze({ id, name, legacy, introducedInVersion }),
  ),
);

const MODE_BY_ID: ReadonlyMap<number, XcfLayerModeInfo> = new Map(
  XCF_LAYER_MODES.map((mode) => [mode.id, mode]),
);

/** 알려진 모드면 정보를, 아니면 null을 돌려준다. */
export function describeXcfLayerMode(id: number): XcfLayerModeInfo | null {
  return MODE_BY_ID.get(id) ?? null;
}

/** `PROP_COMPOSITE_MODE` 값. 음수는 "자동이었고 저장 시점의 매핑이 절댓값"이라는 뜻이므로 절댓값을 쓴다. */
export const XCF_COMPOSITE_MODES: ReadonlyMap<number, string> = new Map([
  [1, "union"],
  [2, "clip-to-backdrop"],
  [3, "clip-to-layer"],
  [4, "intersection"],
]);

/** `PROP_COMPOSITE_SPACE`, `PROP_BLEND_SPACE` 값. 음수는 위와 같이 절댓값을 쓴다. */
export const XCF_COLOR_SPACES: ReadonlyMap<number, string> = new Map([
  [1, "rgb-linear"],
  [2, "rgb-from-color-profile"],
  [3, "lab"],
  [4, "rgb-perceptual"],
]);

/** 부호 있는 합성 속성 값의 절댓값. 자동(음수) 표기를 걷어낸다. */
export function absoluteXcfCompositeValue(value: number): number {
  return Math.abs(value);
}

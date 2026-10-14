/**
 * Studio Bubble Irregular Text Flow — lettering 렌더 연결 어댑터 (v2).
 *
 * IR 코어(`@toonstudio/studio-project-model`의 balloon-text-layout v2)가
 * 구름·스파이크·커스텀 폴리곤 형상 내부 흐름 배치를 제공하므로, 이 파일은
 * BubbleEl의 variant/customShapePoints를 코어의 형상 옵션으로 번역하는
 * 얇은 어댑터만 담당한다. 측정기는 기존 렌더 경로와 같은 캔버스 측정기를
 * 호출자가 주입한다(타이포그래피 단일 소스 규약 — studio-bubble-text-fit).
 *
 * 매핑 근거:
 * - `customShapePoints`가 있으면 variant보다 우선한다 — 렌더가 폴리곤을
 *   그리는 동안(studio-bubble-custom-shape) 텍스트도 같은 폴리곤 안에서
 *   흘러야 모양과 대사가 어긋나지 않는다.
 * - cloud-soft → cloud, shout/angry/explosive → spike(별형 외곽 — 코어의
 *   스파이크 폴리곤 근사), box → rect, 그 외(speech/thought/whisper/double
 *   등 타원 계열) → ellipse.
 * - heart/scared 등 전용 실루엣은 아직 코어 근사가 없어 ellipse로 폴백한다
 *   (기존 v1 동작과 동일 — 회귀 없음). 실루엣별 외곽 샘플러가 생기면
 *   `shape: "polygon"` + outline으로 교체할 자리다.
 */
import {
  fitBalloonText,
  type BalloonShape,
  type FitBalloonTextOptions,
  type FitBalloonTextResult,
} from "@toonstudio/studio-project-model";

import type { BubbleEl } from "../studio-element-model";

/** BubbleEl → IR 코어 형상 옵션 번역 결과. */
export interface BubbleIrregularFlowShape {
  shape: BalloonShape;
  outline?: { x: number; y: number }[];
  spikeCount?: number;
}

/**
 * 렌더가 실제로 그리는 외곽과 텍스트 흐름 영역을 일치시키는 단일 번역.
 * customShapePoints는 [x0,y0,x1,y1,...] 평면 배열(요소 로컬 좌표)이다.
 */
export function bubbleElementFlowShape(
  el: Pick<BubbleEl, "variant" | "customShapePoints" | "starPoints">,
): BubbleIrregularFlowShape {
  const flat = el.customShapePoints;
  if (flat !== undefined && flat.length >= 6) {
    const outline: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      outline.push({ x: flat[i], y: flat[i + 1] });
    }
    if (outline.length >= 3) return { shape: "polygon", outline };
  }
  switch (el.variant) {
    case "cloud-soft":
      return { shape: "cloud" };
    case "shout":
    case "angry":
    case "explosive":
      return {
        shape: "spike",
        ...(el.starPoints !== undefined ? { spikeCount: el.starPoints } : {}),
      };
    case "box":
      return { shape: "rect" };
    default:
      return { shape: "ellipse" };
  }
}

export interface FitBubbleElementTextOptions {
  /** 렌더 경로와 동일한 측정기 (예: BUBBLE_TEXT_MEASURER 기반 폭 측정). */
  measure: (text: string) => number;
  lineHeightPx: number;
  /** 형상 경계 안쪽 안전 여백(px). 렌더 패딩과 같은 값을 넘긴다. */
  insetPx?: number;
  ellipsis?: string;
}

/**
 * BubbleEl의 대사를 그 외곽 형상 안에서 흐름 배치한다.
 * 결과의 lines는 요소 로컬 좌표(0,0~width,height) 기준이라 Konva/SVG
 * 렌더가 그대로 배치할 수 있다.
 */
export function fitBubbleElementText(
  el: Pick<
    BubbleEl,
    "variant" | "customShapePoints" | "starPoints" | "text" | "width" | "height" | "align"
  >,
  options: FitBubbleElementTextOptions,
): FitBalloonTextResult {
  const flowShape = bubbleElementFlowShape(el);
  const fitOptions: FitBalloonTextOptions = {
    shape: flowShape.shape,
    width: el.width,
    height: el.height,
    lineHeightPx: options.lineHeightPx,
    align: el.align ?? "center",
    measure: options.measure,
    ...(flowShape.outline !== undefined ? { outline: flowShape.outline } : {}),
    ...(flowShape.spikeCount !== undefined
      ? { spikeCount: flowShape.spikeCount }
      : {}),
    ...(options.insetPx !== undefined ? { insetPx: options.insetPx } : {}),
    ...(options.ellipsis !== undefined ? { ellipsis: options.ellipsis } : {}),
  };
  return fitBalloonText(el.text, fitOptions);
}

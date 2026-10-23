/**
 * 생산자 구조화 에러 해석 모듈 — sketch 구간: studio-sketch-asset-recommend
 * guidance 4상태(headline 4키 + tips 7키) · reason 3 · 요약 부품 4 · 모양
 * 라벨 11 = 29키 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.22).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고(모양 라벨은 내부 라벨 코드와
 * 기능을 유지 — 조사 처리 문구까지 생산자에서 합성해 params에 싣는다),
 * 표시는 이 모듈의 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자
 * 단위 동일하고, en은 신규 번역이다. noMatch tips의 텍스트 검색 팁은
 * params.label 유무로 분기하던 구 동작을 리졸버가 그대로 재현한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioSketchFeatureSummary,
  StudioSketchRecommendationReason,
  StudioSketchSearchGuidance as StudioSketchGuidance,
  StudioSketchShapeKind,
} from "../studio-sketch-asset-recommend";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.sketch.guidance.empty.headline": "그리고 싶은 모양을 그어 보세요",
  "studio.producerError.sketch.guidance.tooSmall.headline": "조금 더 크게 그어 주세요",
  "studio.producerError.sketch.guidance.noMatch.headline": "닮은 소재를 찾지 못했어요",
  "studio.producerError.sketch.guidance.matched.headline": "{labelWithParticle} 닮은 소재예요",
  "studio.producerError.sketch.guidance.matched.headlinePlain": "닮은 소재예요",
  "studio.producerError.sketch.guidance.empty.tip1": "원·사각형·별처럼 한 획으로 크게 그리면 더 잘 찾아요.",
  "studio.producerError.sketch.guidance.empty.tip2": "텍스트로 찾기 어렵던 모양도 스케치로 찾을 수 있어요.",
  "studio.producerError.sketch.guidance.tooSmall.tip1": "획이 너무 짧으면 모양을 판정할 수 없어요.",
  "studio.producerError.sketch.guidance.tooSmall.tip2": "패드 가운데에 크게, 한 획으로 이어 그어 보세요.",
  "studio.producerError.sketch.guidance.noMatch.tip1": "시작점과 끝점을 이어 닫힌 모양으로 그어 보세요.",
  "studio.producerError.sketch.guidance.noMatch.tip2": "획을 나눠 그렸다면 한 획으로 이어 그어 보세요.",
  "studio.producerError.sketch.guidance.noMatch.tipTextSearch": "모양 이름 “{label}”로 텍스트 검색도 해 보세요.",
  "studio.producerError.sketch.guidance.noMatch.tipTextSearchPlain": "모양 이름으로 텍스트 검색도 해 보세요.",
  "studio.producerError.sketch.reason.matchedShape": "그린 {label} 모양과 닮았어요",
  "studio.producerError.sketch.reason.aspect": "가로·세로 비율이 비슷해요",
  "studio.producerError.sketch.reason.closedShape": "닫힌 도형이라 크기를 바꿔 쓰기 좋아요",
  "studio.producerError.sketch.summary.closed": "닫힌 모양",
  "studio.producerError.sketch.summary.open": "열린 획",
  "studio.producerError.sketch.summary.corners": "모서리 {cornerCount}개",
  "studio.producerError.sketch.summary.nearest": "{label}에 가까워요",
  "studio.producerError.sketch.label.circle": "원",
  "studio.producerError.sketch.label.ellipse": "타원",
  "studio.producerError.sketch.label.rectangle": "사각형",
  "studio.producerError.sketch.label.triangle": "삼각형",
  "studio.producerError.sketch.label.diamond": "마름모",
  "studio.producerError.sketch.label.star": "별",
  "studio.producerError.sketch.label.heart": "하트",
  "studio.producerError.sketch.label.line": "선",
  "studio.producerError.sketch.label.closedShape": "닫힌 모양",
  "studio.producerError.sketch.label.curve": "곡선",
  "studio.producerError.sketch.label.scribble": "자유 낙서",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.sketch.guidance.empty.headline": "Draw the shape you want",
  "studio.producerError.sketch.guidance.tooSmall.headline": "Draw it a little bigger",
  "studio.producerError.sketch.guidance.noMatch.headline": "No similar assets found",
  "studio.producerError.sketch.guidance.matched.headline": "Assets resembling {labelWithParticle}",
  "studio.producerError.sketch.guidance.matched.headlinePlain": "Similar assets",
  "studio.producerError.sketch.guidance.empty.tip1": "Draw big in a single stroke, like a circle, rectangle, or star, for better matches.",
  "studio.producerError.sketch.guidance.empty.tip2": "Shapes that are hard to find by text can be found by sketch.",
  "studio.producerError.sketch.guidance.tooSmall.tip1": "If the stroke is too short, the shape cannot be judged.",
  "studio.producerError.sketch.guidance.tooSmall.tip2": "Draw big in the center of the pad, in one continuous stroke.",
  "studio.producerError.sketch.guidance.noMatch.tip1": "Connect the start and end points to draw a closed shape.",
  "studio.producerError.sketch.guidance.noMatch.tip2": "If you drew in several strokes, try drawing in one continuous stroke.",
  "studio.producerError.sketch.guidance.noMatch.tipTextSearch": "You can also search by the shape name “{label}”.",
  "studio.producerError.sketch.guidance.noMatch.tipTextSearchPlain": "You can also search by shape name.",
  "studio.producerError.sketch.reason.matchedShape": "Looks like the {label} shape you drew",
  "studio.producerError.sketch.reason.aspect": "The aspect ratio is similar",
  "studio.producerError.sketch.reason.closedShape": "It is a closed shape, so it is easy to resize",
  "studio.producerError.sketch.summary.closed": "Closed shape",
  "studio.producerError.sketch.summary.open": "Open stroke",
  "studio.producerError.sketch.summary.corners": "{cornerCount} corners",
  "studio.producerError.sketch.summary.nearest": "Close to {label}",
  "studio.producerError.sketch.label.circle": "Circle",
  "studio.producerError.sketch.label.ellipse": "Ellipse",
  "studio.producerError.sketch.label.rectangle": "Rectangle",
  "studio.producerError.sketch.label.triangle": "Triangle",
  "studio.producerError.sketch.label.diamond": "Diamond",
  "studio.producerError.sketch.label.star": "Star",
  "studio.producerError.sketch.label.heart": "Heart",
  "studio.producerError.sketch.label.line": "Line",
  "studio.producerError.sketch.label.closedShape": "Closed shape",
  "studio.producerError.sketch.label.curve": "Curve",
  "studio.producerError.sketch.label.scribble": "Free scribble",
});

const LABEL_KEYS: Readonly<Record<StudioSketchShapeKind, string>> = {
  circle: "studio.producerError.sketch.label.circle",
  ellipse: "studio.producerError.sketch.label.ellipse",
  rectangle: "studio.producerError.sketch.label.rectangle",
  triangle: "studio.producerError.sketch.label.triangle",
  diamond: "studio.producerError.sketch.label.diamond",
  star: "studio.producerError.sketch.label.star",
  heart: "studio.producerError.sketch.label.heart",
  line: "studio.producerError.sketch.label.line",
  blob: "studio.producerError.sketch.label.closedShape",
  "open-curve": "studio.producerError.sketch.label.curve",
  scribble: "studio.producerError.sketch.label.scribble",
};

const LABEL_KO: Readonly<Record<StudioSketchShapeKind, string>> = {
  circle: "원",
  ellipse: "타원",
  rectangle: "사각형",
  triangle: "삼각형",
  diamond: "마름모",
  star: "별",
  heart: "하트",
  line: "선",
  blob: "닫힌 모양",
  "open-curve": "곡선",
  scribble: "자유 낙서",
};

/**
 * 표시 지점 전용 해석 (모양 라벨 코드): 생산자 params.labelCode는 로케일
 * 라벨로 해석해 표시하고, label(ko 원문)은 패스스루 값으로 남는다.
 */
export function resolveStudioSketchShapeLabel(kind: StudioSketchShapeKind): string {
  return resolveProducerError(LABEL_KEYS[kind], LABEL_KO[kind]);
}

/** params.label이 라벨 코드가 아닌 영역(조사 처리 등)의 표시 label 재해석. */
function withResolvedLabel(
  params: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!params || !Object.hasOwn(params, "labelCode")) return params;
  const kind = params.labelCode as StudioSketchShapeKind;
  if (!Object.hasOwn(LABEL_KEYS, kind)) return params;
  return { ...params, label: resolveStudioSketchShapeLabel(kind) };
}

/** 표시 지점 전용 해석 (sketch 인식 요약): 구 "A · B · C" 문자열을 합성한다. */
export function resolveStudioSketchFeatureSummary(summary: StudioSketchFeatureSummary): string {
  const params = summary.params;
  const openness =
    params.openness === "closed"
      ? resolveProducerError("studio.producerError.sketch.summary.closed", "닫힌 모양")
      : resolveProducerError("studio.producerError.sketch.summary.open", "열린 획");
  const parts = [
    openness,
    resolveProducerError("studio.producerError.sketch.summary.corners", "모서리 {cornerCount}개", params),
  ];
  const label = withResolvedLabel(params)?.label;
  if (label) {
    parts.push(
      resolveProducerError("studio.producerError.sketch.summary.nearest", "{label}에 가까워요", { label }),
    );
  }
  return parts.join(" · ");
}

/** 표시 지점 전용 해석 (추천 사유): 패널 칩이 부른다. */
export function resolveStudioSketchRecommendationReason(
  reason: StudioSketchRecommendationReason,
): string {
  if (reason.code === "matchedShape") {
    return resolveProducerError(
      "studio.producerError.sketch.reason.matchedShape",
      "그린 {label} 모양과 닮았어요",
      withResolvedLabel(reason.params),
    );
  }
  if (reason.code === "aspect") {
    return resolveProducerError("studio.producerError.sketch.reason.aspect", "가로·세로 비율이 비슷해요");
  }
  return resolveProducerError(
    "studio.producerError.sketch.reason.closedShape",
    "닫힌 도형이라 크기를 바꿔 쓰기 좋아요",
  );
}

/** 표시 지점 전용 해석 (guidance): 헤드라인 + 팁 목록을 한 번에 해석한다. */
export function resolveStudioSketchGuidance(guidance: StudioSketchGuidance): {
  headline: string;
  tips: readonly string[];
} {
  const params = guidance.params;
  switch (guidance.code) {
    case "guidanceEmpty":
      return {
        headline: resolveProducerError(
          "studio.producerError.sketch.guidance.empty.headline",
          "그리고 싶은 모양을 그어 보세요",
        ),
        tips: [
          resolveProducerError(
            "studio.producerError.sketch.guidance.empty.tip1",
            "원·사각형·별처럼 한 획으로 크게 그리면 더 잘 찾아요.",
          ),
          resolveProducerError(
            "studio.producerError.sketch.guidance.empty.tip2",
            "텍스트로 찾기 어렵던 모양도 스케치로 찾을 수 있어요.",
          ),
        ],
      };
    case "guidanceTooSmall":
      return {
        headline: resolveProducerError(
          "studio.producerError.sketch.guidance.tooSmall.headline",
          "조금 더 크게 그어 주세요",
        ),
        tips: [
          resolveProducerError(
            "studio.producerError.sketch.guidance.tooSmall.tip1",
            "획이 너무 짧으면 모양을 판정할 수 없어요.",
          ),
          resolveProducerError(
            "studio.producerError.sketch.guidance.tooSmall.tip2",
            "패드 가운데에 크게, 한 획으로 이어 그어 보세요.",
          ),
        ],
      };
    case "guidanceNoMatch": {
      const label = withResolvedLabel(params)?.label;
      const textTip = label
        ? resolveProducerError(
            "studio.producerError.sketch.guidance.noMatch.tipTextSearch",
            "모양 이름 “{label}”로 텍스트 검색도 해 보세요.",
            { label },
          )
        : resolveProducerError(
            "studio.producerError.sketch.guidance.noMatch.tipTextSearchPlain",
            "모양 이름으로 텍스트 검색도 해 보세요.",
          );
      return {
        headline: resolveProducerError(
          "studio.producerError.sketch.guidance.noMatch.headline",
          "닮은 소재를 찾지 못했어요",
        ),
        tips: [
          resolveProducerError(
            "studio.producerError.sketch.guidance.noMatch.tip1",
            "시작점과 끝점을 이어 닫힌 모양으로 그어 보세요.",
          ),
          resolveProducerError(
            "studio.producerError.sketch.guidance.noMatch.tip2",
            "획을 나눠 그렸다면 한 획으로 이어 그어 보세요.",
          ),
          textTip,
        ],
      };
    }
    case "guidanceMatched": {
      // labelWithParticle은 생산자가 라벨 코드의 ko 원문으로 조사 처리까지
      // 끝낸 값이라 패스스루한다(설계 §2.22: 조사 처리는 생산자 내 유지).
      const labelWithParticle = params?.labelWithParticle;
      return {
        headline: labelWithParticle
          ? resolveProducerError(
              "studio.producerError.sketch.guidance.matched.headline",
              "{labelWithParticle} 닮은 소재예요",
              { labelWithParticle },
            )
          : resolveProducerError(
              "studio.producerError.sketch.guidance.matched.headlinePlain",
              "닮은 소재예요",
            ),
        tips: [],
      };
    }
  }
}

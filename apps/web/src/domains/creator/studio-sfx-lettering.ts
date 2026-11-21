/**
 * Studio SFX Lettering — 효과음 글리프를 어떤 표면 위에서도 읽히게 만드는 인라인 스타일.
 *
 * SFX 데이터의 `recommendedColor` 는 레터링 데이터지 UI 색이 아니다(토큰으로 치환하면 안 된다).
 * 문제는 그 값이 `#ffffff` 인 항목이 실제로 존재한다는 것 — `퍽`, `슈욱` 은 흰 글자에 각각
 * `#dc2626` / `#0284c7` 외곽선을 두르는 전제로 만들어졌다. 외곽선 없이 `bg-card` 위에 칠하면
 * 라이트 테마에서 글자가 그대로 사라진다.
 *
 * 그래서 색과 외곽선은 항상 함께 간다. 이 헬퍼가 그 쌍을 한 곳에 묶어 둔다.
 * (컴패니언 사본과 `StudioWebtoonAssistantModal` 이 같은 식을 각자 들고 있었다. 모달 쪽은
 *  파일 소유자가 다음 회차에 이 헬퍼로 갈아끼우면 된다.)
 */
import type { CSSProperties } from "react";

/** `SfxLexiconItem` 중 레터링에 필요한 두 필드만. 엔진 타입에 결합하지 않는다. */
export interface StudioSfxLetteringSource {
  readonly recommendedColor: string;
  readonly strokeColor: string;
}

/** 상하좌우 4방향 + 대각 4방향 = 완전 8방향 외곽선 오프셋(단위 px 배수). */
export const SFX_OUTLINE_DIRECTION_OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]);

/**
 * 글리프 색 + 완전 8방향(상하좌우 + 대각) 외곽선.
 * `text-stroke` 는 브라우저별 렌더링 편차가 커서, 밝은 배경에서도 상좌측 테두리가 끊어지지
 * 않도록 상하좌우·대각 8방향 `textShadow` 외곽선으로 감싼다.
 */
export function studioSfxLetteringStyle(
  item: StudioSfxLetteringSource,
  strokeWidthPx = 1,
): CSSProperties {
  const width =
    typeof strokeWidthPx === "number" && Number.isFinite(strokeWidthPx) && strokeWidthPx > 0
      ? Math.round(strokeWidthPx * 100) / 100
      : 1;
  const stroke = item.strokeColor;
  const textShadow = SFX_OUTLINE_DIRECTION_OFFSETS.map(
    ([dx, dy]) => `${dx * width}px ${dy * width}px 0 ${stroke}`,
  ).join(", ");
  return {
    color: item.recommendedColor,
    textShadow,
  };
}

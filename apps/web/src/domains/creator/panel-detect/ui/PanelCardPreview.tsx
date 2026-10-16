"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { regionBackgroundStyle } from "../panel-canvas-geometry";
import { cardContentOffset } from "../panel-card-render";

import { bi } from "./panel-import-copy";

import type { ReactElement } from "react";
import type { CardAlignment, CardSlice, CardSlicePlan } from "../panel-card-slice-types";

interface PanelCardPreviewProps {
  readonly plan: CardSlicePlan;
  readonly card: CardSlice;
  readonly imageUrl: string;
  readonly alignment: CardAlignment;
}

/**
 * 카드 한 장 미리보기 — 4:5 상자에 바탕색을 깔고, 원본의 해당 행 범위를 CSS 배경으로 잘라 실제 결과와 같은 위치에 놓는다.
 * 캔버스를 쓰지 않으므로 카드 수가 많아도 가볍다.
 */
export function PanelCardPreview({ plan, card, imageUrl, alignment }: PanelCardPreviewProps): ReactElement {
  const offset = cardContentOffset(plan, card, alignment);
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-line"
      style={{ aspectRatio: `${plan.cardWidth} / ${plan.cardHeight}`, backgroundColor: plan.background }}
      role="img"
      aria-label={bi(
        `카드 ${card.index + 1} 미리보기 (원본 ${card.y0}~${card.y1}행)`,
        `Card ${card.index + 1} preview (source rows ${card.y0}–${card.y1})`,
      )}
    >
      <div
        className="absolute inset-x-0"
        data-card-slice={card.index + 1}
        style={{
          top: `${(offset / plan.cardHeight) * 100}%`,
          height: `${(card.outputHeight / plan.cardHeight) * 100}%`,
          ...regionBackgroundStyle(
            imageUrl,
            { width: plan.sourceWidth, height: plan.sourceHeight },
            { x: 0, y: card.y0, width: plan.sourceWidth, height: card.y1 - card.y0 },
          ),
        }}
      />
    </div>
  );
}

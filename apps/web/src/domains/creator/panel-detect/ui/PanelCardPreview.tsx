"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t("…")
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { regionBackgroundStyle } from "../panel-canvas-geometry";
import { cardContentOffset } from "../panel-card-render";

import { usePanelT } from "./use-panel-t";

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
  const t = usePanelT();
  const offset = cardContentOffset(plan, card, alignment);
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-line"
      style={{ aspectRatio: `${plan.cardWidth} / ${plan.cardHeight}`, backgroundColor: plan.background }}
      role="img"
      aria-label={t("panelImport.cards.previewAria", { number: card.index + 1, from: card.y0, to: card.y1 })}
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

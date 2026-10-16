"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { percentRectStyle, regionBackgroundStyle, type ImageSize } from "../panel-canvas-geometry";

import { bi } from "./panel-import-copy";

import type { ReactElement } from "react";
import type { PanelReflowPlan } from "../panel-reflow-plan";

interface PanelReflowPreviewProps {
  readonly plan: PanelReflowPlan;
  readonly imageUrl: string;
  readonly image: ImageSize;
  /** 페이지 바탕(컷 사이 여백)으로 보이는 색. */
  readonly background: string;
}

/**
 * 재배열 결과 미리보기 — 캔버스를 쓰지 않고 원본 이미지를 CSS 배경으로 잘라 컷 위치에 놓는다.
 * 페이지(분할 단위)마다 한 상자이며, 컷 사이 간격과 가운데 정렬이 실제 결과와 같은 비율로 보인다.
 */
export function PanelReflowPreview({ plan, imageUrl, image, background }: PanelReflowPreviewProps): ReactElement {
  const width = plan.options.targetWidth;
  return (
    <div className="max-h-[70dvh] overflow-auto rounded-xl border border-line bg-canvas p-2" data-panel-reflow-preview="true">
      <ol className="mx-auto grid max-w-sm gap-3" aria-label={bi("재배열 미리보기 페이지", "Rearranged preview pages")}>
        {plan.pages.map((page) => (
          <li key={page.index}>
            <p className="mb-1 text-[0.7rem] font-bold tabular-nums text-fg-3">
              {bi(`페이지 ${page.index + 1} · ${width}×${page.height}px`, `Page ${page.index + 1} · ${width}×${page.height} px`)}
            </p>
            <div
              className="relative w-full overflow-hidden border border-line"
              style={{ aspectRatio: `${width} / ${page.height}`, backgroundColor: background }}
              role="img"
              aria-label={bi(
                `페이지 ${page.index + 1}: 컷 ${page.placements.map((placement) => placement.order).join(", ")}`,
                `Page ${page.index + 1}: panels ${page.placements.map((placement) => placement.order).join(", ")}`,
              )}
            >
              {page.placements.map((placement) => (
                <div
                  key={placement.panelId}
                  className="absolute"
                  data-reflow-order={placement.order}
                  style={{
                    ...percentRectStyle(placement.dest, { width, height: page.height }),
                    ...regionBackgroundStyle(imageUrl, image, placement.source),
                  }}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

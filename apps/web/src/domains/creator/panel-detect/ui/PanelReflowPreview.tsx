"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { cn } from "@/shared/lib/utils";

import { percentRectStyle, regionBackgroundStyle, type ImageSize } from "../panel-canvas-geometry";

import { PANEL_FOCUS_RING } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

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
  const t = usePanelT();
  const width = plan.options.targetWidth;
  return (
    <div
      className={cn("max-h-[70dvh] overflow-auto rounded-xl border border-line bg-canvas p-2", PANEL_FOCUS_RING)}
      data-panel-reflow-preview="true"
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 안쪽에 포커스를 받는 것이 없는 스크롤 영역이라, 키보드만 쓰는 사람이 스크롤하려면 영역 자체가 포커스를 받아야 한다(WCAG 2.1.1).
      tabIndex={0}
      aria-label={t("panelImport.preview.region")}
    >
      <ol className="mx-auto grid max-w-sm gap-3" aria-label={t("panelImport.preview.pages")}>
        {plan.pages.map((page) => (
          <li key={page.index}>
            <p className="mb-1 text-[0.7rem] font-bold tabular-nums text-fg-3">
              {t("panelImport.preview.pageLabel", { page: page.index + 1, width, height: page.height })}
            </p>
            <div
              className="relative w-full overflow-hidden border border-line"
              style={{ aspectRatio: `${width} / ${page.height}`, backgroundColor: background }}
              role="img"
              aria-label={t("panelImport.preview.pageAria", { page: page.index + 1, panels: page.placements.map((placement) => placement.order).join(", ") })}
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

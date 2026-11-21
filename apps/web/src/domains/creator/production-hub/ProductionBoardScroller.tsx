import { useCallback, useState, type ReactNode } from "react";

import { HorizontalScrollRail } from "@/shared/components/HorizontalScrollRail";
import type { HorizontalScrollMetrics } from "@/shared/lib/horizontal-scroll-ergonomics";

import { productionText, useProductionCopy } from "./production-workboard-copy";

/**
 * 제작 칸반·공정 보드용 가로 스크롤 컨테이너.
 * 일반 휠 마우스 세로 휠 가로 전환, 빈 영역 드래그 팬(카드 드래그와 충돌 없음),
 * 44×44px 좌/우 이동 버튼, 동적 페이드 마스크, 클릭 가능한 진행 바, 모바일 터치 관성을 제공한다.
 */
export function ProductionBoardScroller({ children }: { readonly children: ReactNode }) {
  useProductionCopy();
  const [canScroll, setCanScroll] = useState(false);

  const handleMetricsChange = useCallback((metrics: HorizontalScrollMetrics) => {
    setCanScroll(metrics.canScroll);
  }, []);

  return (
    <div className="min-w-0">
      <HorizontalScrollRail
        ariaLabel={productionText("제작 칸반 보드 · 좌우로 스크롤")}
        prevLabel={productionText("보드 이전 공정 보기")}
        nextLabel={productionText("보드 다음 공정 보기")}
        hintText={productionText("마우스 휠·빈 영역 드래그 또는 버튼으로 좌우 이동")}
        progressLabel={productionText("제작 보드 가로 스크롤 위치")}
        controlsPlacement="header"
        showProgress
        showHint
        stepRatio={0.75}
        trackTestId="production-board-scroll-region"
        trackClassName="max-w-full rounded-2xl pb-4"
        onMetricsChange={handleMetricsChange}
        headerSlot={
          canScroll ? (
            <p className="text-xs text-fg-3">
              {productionText("모든 단계를 보려면 좌우로 이동하세요")}
            </p>
          ) : null
        }
      >
        {children}
      </HorizontalScrollRail>
    </div>
  );
}

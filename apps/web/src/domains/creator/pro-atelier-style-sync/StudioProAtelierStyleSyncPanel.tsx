import "./pro-atelier-style-sync.css";

import { Layers, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { ProAtelierDrawing8Workbench } from "./ProAtelierDrawing8Workbench";
import { ProAtelierStyleSyncWorkbench } from "./ProAtelierStyleSyncWorkbench";

type WorkbenchTabId = "drawing-8" | "style-sync";

/**
 * 전문가 드로잉 핵심 8선 + 실시간 컷-대-컷 화풍 일체화 엔진 통합 워크벤치.
 * 100% 무과금(₩0) · 클라이언트 결정론적 TypeScript 연산으로 동작한다.
 */
export function StudioProAtelierStyleSyncPanel() {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>("drawing-8");

  return (
    <section
      className="pas-shell"
      data-testid="studio-pro-atelier-style-sync-panel"
      aria-label="전문가 드로잉 8선 및 실시간 화풍 일체화 워크벤치"
    >
      <div className="pas-body">
        <header className="pas-header">
          <div>
            <p className="pas-kicker">
              <SlidersHorizontal size={14} aria-hidden="true" />
              무과금 ₩0 · 결정론적 프로 드로잉 &amp; 화풍 동기화
            </p>
            <h2 className="pas-title">전문가 드로잉 8선 · 실시간 컷-대-컷 화풍 일체화</h2>
            <p className="pas-subtitle">
              선화 안쪽 0px 채우기·벡터 선폭 사후 보정·Kubelka-Munk 감산 혼색·핀 퍼펫/4×4 메쉬·
              명도/반전 서브뷰·1획 컷 분할·팀 브러시 코드·특수 스냅 자와 어시스턴트 전 컷 실시간 화풍 일체화를 한 화면에서 검증합니다.
            </p>
          </div>
          <div role="tablist" aria-label="워크벤치 전환" className="pas-tablist">
            <button
              type="button"
              role="tab"
              id={`${baseId}-tab-drawing8`}
              aria-selected={activeTab === "drawing-8"}
              aria-controls={`${baseId}-panel-drawing8`}
              data-testid="pas-tab-drawing8"
              className="pas-tab"
              onClick={() => setActiveTab("drawing-8")}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              전문가 드로잉 8선
            </button>
            <button
              type="button"
              role="tab"
              id={`${baseId}-tab-stylesync`}
              aria-selected={activeTab === "style-sync"}
              aria-controls={`${baseId}-panel-stylesync`}
              data-testid="pas-tab-style-sync"
              className="pas-tab"
              onClick={() => setActiveTab("style-sync")}
            >
              <Layers size={15} aria-hidden="true" />
              실시간 화풍 일체화 엔진
            </button>
          </div>
        </header>

        {activeTab === "drawing-8" ? (
          <div
            role="tabpanel"
            id={`${baseId}-panel-drawing8`}
            aria-labelledby={`${baseId}-tab-drawing8`}
            data-testid="pas-panel-drawing8"
          >
            <ProAtelierDrawing8Workbench />
          </div>
        ) : (
          <div
            role="tabpanel"
            id={`${baseId}-panel-stylesync`}
            aria-labelledby={`${baseId}-tab-stylesync`}
            data-testid="pas-panel-style-sync"
          >
            <ProAtelierStyleSyncWorkbench />
          </div>
        )}
      </div>
    </section>
  );
}

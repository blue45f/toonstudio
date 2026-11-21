import { Compass, LayoutGrid, Presentation, Shapes } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import {
  CompetitorShapeFillEraserTab,
  CompetitorTileSymmetryRulerTab,
} from "./CompetitorDrawingWorkbenchTab";
import {
  PptLayoutBooleanTab,
  PptPresentationSlideTab,
} from "./PptPrecisionWorkbenchTab";
import "./pro-drawing-ppt-suite.css";

export type PptProDrawingTabId = "layout" | "present" | "shape" | "ruler";

interface SuiteTabDescriptor {
  readonly id: PptProDrawingTabId;
  readonly label: string;
  readonly description: string;
}

const SUITE_TABS: readonly SuiteTabDescriptor[] = [
  {
    id: "layout",
    label: "PPT 정렬·불리언·커넥터",
    description: "6종 정렬, 등간격 배분, 1px 자석 가이드, 5종 도형 불리언, 커넥터 자동 재라우팅, 그룹·Z-Order 제어",
  },
  {
    id: "present",
    label: "PPT 마스터 슬라이드·발표",
    description: "웹툰 콘티 슬라이드 전환, 자동 페이드 레이저 포인터, 형광펜 주석, 발표자 노트 관리",
  },
  {
    id: "shape",
    label: "QuickShape·ColorDrop·벡터 지우개",
    description: "손그림 도형 자동 보정, 0~16px 틈새 닫기 채우기, 교차점 정확 절단 벡터 지우개",
  },
  {
    id: "ruler",
    label: "Wrap-Around·그리드·만화경·투시 자",
    description: "9-타일 토러스 심리스 패턴, 1클릭 반복 그리드, 2~12축 만화경, 집중선, 1~3점 투시 자석 자",
  },
];

function SuiteTabIcon({ id }: { readonly id: PptProDrawingTabId }) {
  if (id === "layout") return <LayoutGrid size={16} aria-hidden="true" />;
  if (id === "present") return <Presentation size={16} aria-hidden="true" />;
  if (id === "shape") return <Shapes size={16} aria-hidden="true" />;
  return <Compass size={16} aria-hidden="true" />;
}

export interface StudioPptProDrawingPanelProps {
  readonly projectId?: string;
  readonly initialTab?: PptProDrawingTabId;
}

export function StudioPptProDrawingPanel({
  projectId,
  initialTab = "layout",
}: StudioPptProDrawingPanelProps) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<PptProDrawingTabId>(initialTab);
  const currentTab = SUITE_TABS.find((tab) => tab.id === activeTab) ?? SUITE_TABS[0];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    let nextIdx: number;
    if (event.key === "ArrowRight") nextIdx = (index + 1) % SUITE_TABS.length;
    else if (event.key === "ArrowLeft") nextIdx = (index - 1 + SUITE_TABS.length) % SUITE_TABS.length;
    else if (event.key === "Home") nextIdx = 0;
    else nextIdx = SUITE_TABS.length - 1;
    setActiveTab(SUITE_TABS[nextIdx].id);
  };

  return (
    <section
      className="ppt-pro-suite"
      aria-label="PPT 정밀 정렬·불리언·발표 및 특수 드로잉 6종 워크벤치"
      data-testid="studio-ppt-pro-drawing-panel"
    >
      <header className="ppt-pro-header">
        <div className="ppt-pro-heading-group">
          <h3 className="ppt-pro-title">
            PPT 정밀 레이아웃 · 특수 드로잉 6종 스위트{projectId ? ` · ${projectId}` : ""}
          </h3>
          <p className="ppt-pro-subtitle">{currentTab.description}</p>
        </div>
        <span className="ppt-pro-badge">클린룸 로컬 연산 · 지연 로드</span>
      </header>

      <div role="tablist" aria-label="PPT 및 특수 드로잉 도구 탭" className="ppt-pro-tablist">
        {SUITE_TABS.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-tone={tab.id}
              className="ppt-pro-tab"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <SuiteTabIcon id={tab.id} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeTab}`}
      >
        {activeTab === "layout" ? <PptLayoutBooleanTab /> : null}
        {activeTab === "present" ? <PptPresentationSlideTab /> : null}
        {activeTab === "shape" ? <CompetitorShapeFillEraserTab /> : null}
        {activeTab === "ruler" ? <CompetitorTileSymmetryRulerTab /> : null}
      </div>
    </section>
  );
}

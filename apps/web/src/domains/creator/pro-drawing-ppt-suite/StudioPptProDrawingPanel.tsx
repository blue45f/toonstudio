import {
  Box,
  Compass,
  FileSpreadsheet,
  LayoutGrid,
  LayoutTemplate,
  Mic,
  Palette,
  Presentation,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { lazy, Suspense, useId, useState, type KeyboardEvent } from "react";

import {
  CompetitorShapeFillEraserTab,
  CompetitorTileSymmetryRulerTab,
} from "./CompetitorDrawingWorkbenchTab";
import {
  PptLayoutBooleanTab,
  PptPresentationSlideTab,
} from "./PptPrecisionWorkbenchTab";
import "./pro-drawing-ppt-suite.css";

const LazyPptxDeckStudioTab = lazy(() =>
  import("./pptx-ooxml/PptxDeckStudioTab").then((m) => ({ default: m.PptxDeckStudioTab })),
);
const LazyDesignEditorWorkbenchPanel = lazy(() =>
  import("../design-editor-suite/DesignEditorWorkbenchPanel").then((m) => ({
    default: m.DesignEditorWorkbenchPanel,
  })),
);
const LazyGlobalMasterBrushGalleryPanel = lazy(() =>
  import("../brush/global-master-collection/GlobalMasterBrushGalleryPanel").then((m) => ({
    default: m.GlobalMasterBrushGalleryPanel,
  })),
);
const LazyMasterFilterLutGalleryPanel = lazy(() =>
  import("../filter/master-lut-fx/MasterFilterLutGalleryPanel").then((m) => ({
    default: m.MasterFilterLutGalleryPanel,
  })),
);
const LazyHologramWebtoonStagePanel = lazy(() =>
  import("../hologram-webtoon/HologramWebtoonStagePanel").then((m) => ({
    default: m.HologramWebtoonStagePanel,
  })),
);
const LazyIdeaToWebtoonPipelinePanel = lazy(() =>
  import("../idea-to-webtoon-engine/IdeaToWebtoonPipelinePanel").then((m) => ({
    default: m.IdeaToWebtoonPipelinePanel,
  })),
);
const LazyStudioVoiceCoachPanel = lazy(() =>
  import("../voice-coach/StudioVoiceCoachPanel").then((m) => ({
    default: m.StudioVoiceCoachPanel,
  })),
);
const LazyProCraftEnginesPanel = lazy(() =>
  import("../pro-craft-engines/ProCraftEnginesPanel").then((m) => ({
    default: m.ProCraftEnginesPanel,
  })),
);

export type PptProDrawingTabId =
  | "layout"
  | "present"
  | "shape"
  | "ruler"
  | "pptx"
  | "design"
  | "brushes"
  | "filters"
  | "hologram"
  | "idea"
  | "voice"
  | "craft";

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
  {
    id: "pptx",
    label: ".pptx 내보내기·SmartArt·차트",
    description: "PowerPoint·Keynote 호환 진짜 .pptx OOXML 생성·가져오기, SmartArt 6종, 네이티브 차트 4종, 스타일 표",
  },
  {
    id: "design",
    label: "미리캔버스·Canva·Figma 디자인",
    description: "14종 1클릭 매직 리사이즈, Figma Auto-Layout, 브랜드 키트 8팔레트, 16종 템플릿, Excalidraw 손그림",
  },
  {
    id: "brushes",
    label: "무료 기본 브러시 502종",
    description: "Core+Pro 246 · MyPaint CC0 196 · 글로벌 시그니처 60종 100% 무료 브러시 라이브 테스트 패드",
  },
  {
    id: "filters",
    label: "3D LUT·픽셀 필터 183종",
    description: "스튜디오 86 · Photoshop-Web 61 · 웹툰 분위기/3D LUT/리소그래프/선화 추출 36종 실시간 RGBA 엔진",
  },
  {
    id: "hologram",
    label: "홀로그램 WebXR 5-평면",
    description: "5-평면 Z-깊이 오프액시스 투영, WebXR 양안 스테레오(IPD 63mm), 애너글리프 3D, 32-뷰 라이트필드",
  },
  {
    id: "idea",
    label: "아이디어→웹툰 6단계",
    description: "1줄 아이디어 → 3막 비트·캐릭터 DNA 락·컷 분할·연속성 자동 교정·감정 OST 큐·프로젝트 JSON",
  },
  {
    id: "voice",
    label: "감정·어쿠스틱 음성 코치",
    description: "한국어 호흡 절 운율 분할 + 5음계 어쿠스틱 이어콘 + 100% 옵트인 방해 금지 쿨다운 + 실시간 자막",
  },
  {
    id: "craft",
    label: "2D→3D 라이팅·칼선·필압·8K",
    description: "2D 컷→3D 3점 조명 동기화, 아크릴/스티커 칼선 SVG·CMYK, 10초 필압 보정, 4K~8K 엣지 햅틱 그리드",
  },
];

function SuiteTabIcon({ id }: { readonly id: PptProDrawingTabId }) {
  switch (id) {
    case "layout":
      return <LayoutGrid size={16} aria-hidden="true" />;
    case "present":
      return <Presentation size={16} aria-hidden="true" />;
    case "shape":
      return <Shapes size={16} aria-hidden="true" />;
    case "ruler":
      return <Compass size={16} aria-hidden="true" />;
    case "pptx":
      return <FileSpreadsheet size={16} aria-hidden="true" />;
    case "design":
      return <LayoutTemplate size={16} aria-hidden="true" />;
    case "brushes":
      return <Palette size={16} aria-hidden="true" />;
    case "filters":
      return <SlidersHorizontal size={16} aria-hidden="true" />;
    case "hologram":
      return <Box size={16} aria-hidden="true" />;
    case "idea":
      return <Sparkles size={16} aria-hidden="true" />;
    case "voice":
      return <Mic size={16} aria-hidden="true" />;
    case "craft":
      return <Wrench size={16} aria-hidden="true" />;
  }
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
  const currentTab = SUITE_TABS.find((tab) => tab.id === activeTab) ?? SUITE_TABS[0]!;

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
    setActiveTab(SUITE_TABS[nextIdx]!.id);
  };

  return (
    <section
      className="ppt-pro-suite"
      aria-label="올인원 PPTX · 웹 디자인 · 502 브러시 · 183 필터 · 차세대 크리에이터 스위트"
      data-testid="studio-ppt-pro-drawing-panel"
    >
      <header className="ppt-pro-header">
        <div className="ppt-pro-heading-group">
          <h3 className="ppt-pro-title">
            올인원 크리에이터 프로 스위트 (PPTX · 웹 디자인 · 브러시 502 · 필터 183 · 차세대 4엔진)
            {projectId ? ` · ${projectId}` : ""}
          </h3>
          <p className="ppt-pro-subtitle">{currentTab.description}</p>
        </div>
        <span className="ppt-pro-badge">클린룸 로컬 연산 · 지연 로드</span>
      </header>

      <div role="tablist" aria-label="PPT 및 차세대 크리에이터 도구 탭" className="ppt-pro-tablist">
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
        <Suspense fallback={<p className="ppt-pro-subtitle">도구 엔진을 불러오는 중입니다…</p>}>
          {activeTab === "pptx" ? <LazyPptxDeckStudioTab /> : null}
          {activeTab === "design" ? <LazyDesignEditorWorkbenchPanel /> : null}
          {activeTab === "brushes" ? <LazyGlobalMasterBrushGalleryPanel /> : null}
          {activeTab === "filters" ? <LazyMasterFilterLutGalleryPanel /> : null}
          {activeTab === "hologram" ? <LazyHologramWebtoonStagePanel /> : null}
          {activeTab === "idea" ? <LazyIdeaToWebtoonPipelinePanel /> : null}
          {activeTab === "voice" ? <LazyStudioVoiceCoachPanel /> : null}
          {activeTab === "craft" ? <LazyProCraftEnginesPanel /> : null}
        </Suspense>
      </div>
    </section>
  );
}

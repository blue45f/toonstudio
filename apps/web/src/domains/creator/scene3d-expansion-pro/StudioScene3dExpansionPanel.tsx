import "./scene3d-expansion-pro.css";

import { useState, type CSSProperties } from "react";

import {
  Scene3dExtractLensTabs,
  type ExtractLensTabId,
} from "./Scene3dExtractLensTabs";
import {
  Scene3dInteractiveDecalPoseTabs,
  type InteractiveDecalPoseTabId,
} from "./Scene3dInteractiveDecalPoseTabs";

type Scene3dExpansionTabId = ExtractLensTabId | InteractiveDecalPoseTabId;

const TAB_ITEMS: readonly {
  readonly id: Scene3dExpansionTabId;
  readonly index: number;
  readonly labelKo: string;
  readonly accentVar: string;
}[] = [
  { id: "webtoon-3layer", index: 1, labelKo: "3계층 선화·톤 추출", accentVar: "var(--s3e-t1)" },
  { id: "hero-lens", index: 2, labelKo: "히어로 원근 렌즈", accentVar: "var(--s3e-t2)" },
  { id: "couple-snap", index: 3, labelKo: "2~4인 자석 포즈", accentVar: "var(--s3e-t3)" },
  { id: "face-sdf-lookat", index: 4, labelKo: "얼굴 SDF·시선 추적", accentVar: "var(--s3e-t4)" },
  { id: "scene-props-season", index: 5, labelKo: "소품·계절 1클릭", accentVar: "var(--s3e-t5)" },
  { id: "wall-decal-2d", index: 6, labelKo: "벽면 2D 데칼 투영", accentVar: "var(--s3e-t6)" },
  { id: "photo-pose-clone", index: 7, labelKo: "사진 포즈·카메라 복제", accentVar: "var(--s3e-t7)" },
];

function isExtractLensTab(tab: Scene3dExpansionTabId): tab is ExtractLensTabId {
  return (
    tab === "webtoon-3layer" ||
    tab === "hero-lens" ||
    tab === "couple-snap" ||
    tab === "face-sdf-lookat"
  );
}

/**
 * 웹툰 3D 기능 확장 7선 통합 제어판.
 * 100% 무과금(₩0)·브라우저 로컬 결정론 연산. OKLCH 스펙트럼 · >= 44x44px 터치 타겟 준수.
 */
export function StudioScene3dExpansionPanel() {
  const [activeTab, setActiveTab] = useState<Scene3dExpansionTabId>("webtoon-3layer");

  return (
    <section
      className="s3e-shell"
      data-testid="studio-scene3d-expansion-panel"
      aria-label="웹툰 3D 기능 확장 7선 제어판"
    >
      <div className="s3e-stack">
        <header className="s3e-header">
          <div className="s3e-header-top">
            <span className="s3e-kicker">WEBTOON 3D EXPANSION · 7대 핵심 엔진</span>
            <span className="s3e-free-badge">100% 무과금 ₩0 · 브라우저 로컬 연산</span>
          </div>
          <h2 className="s3e-title">3D 웹툰 기능 확장 7선 작업실</h2>
          <p className="s3e-subtitle">
            3계층 선화·셀 명암 추출, 히어로 원근 렌즈, 커플·액션 자석 포즈, 미형 얼굴 그림자·시선
            추적, 소품·계절 전환, 벽면 데칼 투영, 사진 포즈 복제를 한곳에서 바로 적용합니다.
          </p>
        </header>

        <div
          className="s3e-tablist"
          role="tablist"
          aria-label="웹툰 3D 확장 기능 7선 탭"
        >
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`s3e-tab-btn-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`s3e-tabpanel-${tab.id}`}
              className="s3e-tab"
              style={{ "--s3e-tab-accent": tab.accentVar } as CSSProperties}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="s3e-tab-num">{tab.index}</span>
              <span>{tab.labelKo}</span>
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`s3e-tabpanel-${activeTab}`}
          aria-labelledby={`s3e-tab-btn-${activeTab}`}
        >
          {isExtractLensTab(activeTab) ? (
            <Scene3dExtractLensTabs activeTab={activeTab} />
          ) : (
            <Scene3dInteractiveDecalPoseTabs activeTab={activeTab} />
          )}
        </div>
      </div>
    </section>
  );
}

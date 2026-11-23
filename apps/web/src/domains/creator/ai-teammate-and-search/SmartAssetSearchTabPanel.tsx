import { CheckCircle2, Layers, RotateCcw, ShieldCheck } from "lucide-react";

import {
  CAMERA_ANGLE_OPTIONS,
  PALETTE_MOOD_OPTIONS,
  SKETCH_STROKE_HINTS,
  type CameraAngleFilter,
  type ContextualCutRecommendationResult,
  type PaletteMoodId,
  type RecommendedAssetBundle,
  type SketchStrokeHint,
  type SmartAssetSearchResult,
  type StudioSmartAssetItem,
} from "./visual-asset-smart-search-engine";

const SAMPLE_SEARCH_PROMPTS = [
  "비 오는 밤 옥상 고백씬",
  "액션 속도선",
  "방과후 노을 교실",
  "정오 온실 숲 햇살",
] as const;

export interface SmartAssetSearchTabPanelProps {
  readonly panelId: string;
  readonly labelledById: string;
  readonly searchInputId: string;
  readonly query: string;
  readonly sketchStrokeHint: SketchStrokeHint | null;
  readonly paletteMood: PaletteMoodId | null;
  readonly cameraAngle: CameraAngleFilter | null;
  readonly commercialSafeOnly: boolean;
  readonly searchResult: SmartAssetSearchResult;
  readonly contextualRecommendation: ContextualCutRecommendationResult;
  readonly onQueryChange: (next: string) => void;
  readonly onToggleSketchHint: (hint: SketchStrokeHint) => void;
  readonly onTogglePaletteMood: (mood: PaletteMoodId) => void;
  readonly onToggleCameraAngle: (angle: CameraAngleFilter) => void;
  readonly onToggleCommercialSafe: () => void;
  readonly onResetFilters: () => void;
  readonly onInsertAsset: (asset: StudioSmartAssetItem) => void;
  readonly onApplyBundle: (bundle: RecommendedAssetBundle) => void;
}

export function SmartAssetSearchTabPanel({
  panelId,
  labelledById,
  searchInputId,
  query,
  sketchStrokeHint,
  paletteMood,
  cameraAngle,
  commercialSafeOnly,
  searchResult,
  contextualRecommendation,
  onQueryChange,
  onToggleSketchHint,
  onTogglePaletteMood,
  onToggleCameraAngle,
  onToggleCommercialSafe,
  onResetFilters,
  onInsertAsset,
  onApplyBundle,
}: SmartAssetSearchTabPanelProps) {
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledById}
      className="ats-section"
    >
      <div className="ats-panel-block">
        <div className="ats-search-bar">
          <label htmlFor={searchInputId} className="sr-only">
            자연어·감정·상황 스마트 소재 검색
          </label>
          <input
            id={searchInputId}
            type="search"
            value={query}
            placeholder="예: 비 오는 밤 옥상 고백씬, 액션 속도선, 방과후 노을 교실"
            className="ats-search-input"
            onChange={(event) => onQueryChange(event.target.value.slice(0, 120))}
          />
          <button
            type="button"
            className="ats-chip"
            aria-pressed={commercialSafeOnly}
            onClick={onToggleCommercialSafe}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>상업 안전 BOM만</span>
          </button>
          <button type="button" className="ats-btn" onClick={onResetFilters}>
            <RotateCcw className="size-4" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>

        <div className="ats-chip-row" aria-label="추천 자연어 검색 예시">
          {SAMPLE_SEARCH_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              className="ats-chip"
              aria-pressed={query === sample}
              onClick={() => onQueryChange(sample)}
            >
              {sample}
            </button>
          ))}
        </div>

        <div>
          <h3 className="ats-block-title">3획 낙서 실루엣 힌트 (6종)</h3>
          <div className="ats-chip-row mt-2" role="group" aria-label="실루엣 획 힌트 필터">
            {SKETCH_STROKE_HINTS.map((hint) => (
              <button
                key={hint.id}
                type="button"
                className="ats-chip"
                aria-pressed={sketchStrokeHint === hint.id}
                onClick={() => onToggleSketchHint(hint.id)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={hint.svgPath} />
                </svg>
                <span>{hint.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="ats-block-title">현재 캔버스 색감 무드 (5종)</h3>
          <div className="ats-chip-row mt-2" role="group" aria-label="색감 무드 필터">
            {PALETTE_MOOD_OPTIONS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                className="ats-chip"
                aria-pressed={paletteMood === mood.id}
                onClick={() => onTogglePaletteMood(mood.id)}
              >
                <span className="ats-mood-dot" data-palette-mood={mood.id} aria-hidden="true" />
                <span>{mood.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="ats-block-title">카메라 앵글 · 투시 (5종)</h3>
          <div className="ats-chip-row mt-2" role="group" aria-label="카메라 앵글 필터">
            {CAMERA_ANGLE_OPTIONS.map((angle) => (
              <button
                key={angle.id}
                type="button"
                className="ats-chip"
                aria-pressed={cameraAngle === angle.id}
                onClick={() => onToggleCameraAngle(angle.id)}
              >
                <span>{angle.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ats-context-strip" aria-label="현재 컷 맥락 기반 자동 추천">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="ats-block-title">현재 컷 맥락 자동 추천</h3>
            <p className="ats-block-caption">
              기준 장면: &ldquo;{contextualRecommendation.sceneText}&rdquo;
            </p>
          </div>
          <div className="ats-chip-row">
            {searchResult.blockedByRightsBomCount > 0 ? (
              <span className="ats-badge" data-tone="warn">
                BOM 차단 <span className="ats-num">{searchResult.blockedByRightsBomCount}</span>건
              </span>
            ) : null}
            <span className="ats-badge ats-num">
              검색 결과 {searchResult.hits.length} / {searchResult.totalCatalogCount}
            </span>
          </div>
        </div>
        <div className="ats-chip-row">
          {contextualRecommendation.hits.map((hit) => (
            <button
              key={`ctx-${hit.asset.id}`}
              type="button"
              className="ats-chip"
              onClick={() => onInsertAsset(hit.asset)}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>{hit.asset.title}</span>
            </button>
          ))}
        </div>
      </div>

      {searchResult.hits.length === 0 ? (
        <div className="ats-panel-block">
          <p className="ats-block-title">조건에 맞는 소재를 찾지 못했습니다</p>
          <p className="ats-block-caption">
            실루엣·색감·앵글 조건을 일부 해제하거나 필터를 초기화해 다시 탐색해 보세요.
          </p>
          <div>
            <button type="button" className="ats-btn" onClick={onResetFilters}>
              전체 필터 초기화
            </button>
          </div>
        </div>
      ) : (
        <div className="ats-card-grid" data-testid="smart-asset-search-results">
          {searchResult.hits.map((hit) => (
            <article key={hit.asset.id} className="ats-asset-card" data-asset-id={hit.asset.id}>
              <div className="ats-asset-top">
                <div className="ats-sprite-frame">
                  <img
                    src={hit.asset.spritePath}
                    alt=""
                    aria-hidden="true"
                    width={40}
                    height={40}
                    className="ats-sprite-img"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ats-badge">{hit.asset.categoryLabel}</span>
                    <span
                      className="ats-badge"
                      data-tone={hit.asset.rightsBom.commercialSafe ? "good" : "bad"}
                    >
                      {hit.asset.rightsBom.commercialSafe ? "상업 안전 BOM" : "출고 확인 필요"}
                    </span>
                    <span className="ats-badge ats-num">{hit.matchScore}%</span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-extrabold text-fg">{hit.asset.title}</h4>
                  <p className="mt-1 text-xs text-fg-2">{hit.asset.summary}</p>
                </div>
              </div>

              <div className="ats-reason-list">
                <span className="ats-badge">
                  <Layers className="size-3.5" aria-hidden="true" />
                  {hit.asset.layerOutputSummary}
                </span>
                {hit.matchReasons.map((reason) => (
                  <span key={reason} className="ats-badge" data-tone="accent">
                    {reason}
                  </span>
                ))}
              </div>

              <div className="ats-card-actions">
                <button
                  type="button"
                  className="ats-btn ats-btn-primary w-full"
                  aria-label={`${hit.asset.title} 캔버스에 즉시 삽입`}
                  onClick={() => onInsertAsset(hit.asset)}
                >
                  캔버스에 즉시 삽입
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {searchResult.recommendedBundles.length > 0 ? (
        <div className="ats-panel-block" aria-label="연관 세트 번들 추천">
          <h3 className="ats-block-title">연관 세트 번들 추천</h3>
          <div className="ats-bundle-grid">
            {searchResult.recommendedBundles.map((bundle) => (
              <article key={bundle.bundleId} className="ats-bundle-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="m-0 text-sm font-extrabold text-fg">{bundle.bundleName}</h4>
                  <span
                    className="ats-badge ats-num"
                    data-tone={bundle.commercialSafe ? "good" : "warn"}
                  >
                    {bundle.items.length}종 세트
                  </span>
                </div>
                <p className="ats-block-caption">{bundle.reason}</p>
                <div>
                  <button
                    type="button"
                    className="ats-btn"
                    aria-label={`${bundle.bundleName} 세트 일괄 삽입`}
                    onClick={() => onApplyBundle(bundle)}
                  >
                    세트 일괄 삽입
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

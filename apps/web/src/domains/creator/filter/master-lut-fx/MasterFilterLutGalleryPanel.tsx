import "./master-filter-lut-gallery.css";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  MASTER_FILTER_CATEGORIES,
  MASTER_FILTER_COUNT_BREAKDOWN,
  MASTER_FILTER_GALLERY_COPY,
  MASTER_FILTER_LUT_CATALOG,
  getMasterFilterById,
  searchMasterFilters,
  type MasterFilterCategoryFilter,
  type MasterFilterId,
  type MasterFilterLocale,
  type MasterFilterSpec,
} from "./master-filter-lut-catalog";
import {
  applyMasterFilterToRgba,
  createMasterFilterPreviewArtwork,
  measureRgbaFilterDiff,
} from "./master-filter-pixel-engine";

export interface MasterFilterPreviewSource {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface MasterFilterApplyPayload {
  readonly filter: MasterFilterSpec;
  readonly intensity: number;
  readonly seed: number;
}

export interface MasterFilterLutGalleryPanelProps {
  readonly initialFilterId?: MasterFilterId;
  readonly initialCategory?: MasterFilterCategoryFilter;
  readonly locale?: MasterFilterLocale;
  readonly seed?: number;
  readonly sourceImage?: MasterFilterPreviewSource;
  readonly onApplyFilter?: (payload: MasterFilterApplyPayload) => void;
}

type MasterFilterCssVars = CSSProperties & Readonly<Record<`--mfl-${string}`, string>>;

const DEFAULT_PREVIEW_WIDTH = 168;
const DEFAULT_PREVIEW_HEIGHT = 112;
const DEFAULT_SEED = 1337;

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas || width <= 0 || height <= 0 || typeof ImageData === "undefined") return;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const frame = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(frame, 0, 0);
  } catch {
    // Headless jsdom 환경에서 2D 캔버스 미지원 예외를 안전하게 무시한다.
  }
}

function resolveFilterLocale(
  explicitLocale: MasterFilterLocale | undefined,
  storeLang: string,
): MasterFilterLocale {
  if (explicitLocale) return explicitLocale;
  return storeLang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

/**
 * 글로벌 3D LUT · 웹툰 분위기 · 리소그래프 · 광학 · 레트로 · 종이질감/선화추출 36종 갤러리 패널.
 *
 * 실제 RGBA `Uint8ClampedArray` 픽셀 엔진을 테스트 일러스트(또는 전달된 레이어 버퍼)에 실시간 실행해
 * Before/After 분할 슬라이더로 즉시 비교·적용할 수 있다.
 */
export function MasterFilterLutGalleryPanel({
  initialFilterId = "golden-sunset",
  initialCategory = "all",
  locale,
  seed = DEFAULT_SEED,
  sourceImage,
  onApplyFilter,
}: MasterFilterLutGalleryPanelProps) {
  const storeLang = useI18n((state) => state.lang);
  const resolvedLocale = resolveFilterLocale(locale, storeLang);
  const copy = MASTER_FILTER_GALLERY_COPY[resolvedLocale];

  const baseId = useId();
  const splitSliderId = `${baseId}-split`;
  const intensitySliderId = `${baseId}-intensity`;
  const searchInputId = `${baseId}-search`;

  const fallbackFilter = MASTER_FILTER_LUT_CATALOG[0];
  const resolvedInitial = getMasterFilterById(initialFilterId) ?? fallbackFilter;

  const [selectedCategory, setSelectedCategory] = useState<MasterFilterCategoryFilter>(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterId, setSelectedFilterId] = useState<MasterFilterId>(
    resolvedInitial ? resolvedInitial.id : "golden-sunset",
  );
  const [splitPct, setSplitPct] = useState(50);
  const [intensityPct, setIntensityPct] = useState(() =>
    Math.round((resolvedInitial ? resolvedInitial.defaultIntensity : 0.88) * 100),
  );
  const [appliedRecord, setAppliedRecord] = useState<{
    readonly filterId: MasterFilterId;
    readonly pct: number;
  } | null>(null);

  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedFilter = useMemo<MasterFilterSpec>(() => {
    const found = getMasterFilterById(selectedFilterId);
    if (found) return found;
    return MASTER_FILTER_LUT_CATALOG[0] as MasterFilterSpec;
  }, [selectedFilterId]);

  const visibleFilters = useMemo(
    () => searchMasterFilters(selectedCategory, searchQuery),
    [selectedCategory, searchQuery],
  );

  const defaultPreviewArtwork = useMemo<MasterFilterPreviewSource>(() => {
    const rgba = createMasterFilterPreviewArtwork(DEFAULT_PREVIEW_WIDTH, DEFAULT_PREVIEW_HEIGHT);
    return {
      rgba,
      width: DEFAULT_PREVIEW_WIDTH,
      height: DEFAULT_PREVIEW_HEIGHT,
    };
  }, []);

  const previewSource = sourceImage ?? defaultPreviewArtwork;

  const afterRgba = useMemo(
    () =>
      applyMasterFilterToRgba(
        previewSource.rgba,
        previewSource.width,
        previewSource.height,
        selectedFilter.id,
        {
          intensity: intensityPct / 100,
          seed,
        },
      ),
    [previewSource.rgba, previewSource.width, previewSource.height, selectedFilter.id, intensityPct, seed],
  );

  const diffMetrics = useMemo(
    () => measureRgbaFilterDiff(previewSource.rgba, afterRgba),
    [previewSource.rgba, afterRgba],
  );

  useEffect(() => {
    paintRgbaToCanvas(
      beforeCanvasRef.current,
      previewSource.rgba,
      previewSource.width,
      previewSource.height,
    );
  }, [previewSource.rgba, previewSource.width, previewSource.height]);

  useEffect(() => {
    paintRgbaToCanvas(afterCanvasRef.current, afterRgba, previewSource.width, previewSource.height);
  }, [afterRgba, previewSource.width, previewSource.height]);

  const activeName = resolvedLocale === "ko" ? selectedFilter.nameKo : selectedFilter.nameEn;
  const activeDesc =
    resolvedLocale === "ko" ? selectedFilter.descriptionKo : selectedFilter.descriptionEn;
  const activeAlgo =
    resolvedLocale === "ko" ? selectedFilter.algorithmTagKo : selectedFilter.algorithmTagEn;
  const changedPctText = `${Math.round(diffMetrics.changedPixelRatio * 100)}%`;

  const appliedFilterSpec = appliedRecord ? getMasterFilterById(appliedRecord.filterId) : undefined;
  const appliedBannerText =
    appliedRecord && appliedFilterSpec
      ? copy.appliedBanner(
          resolvedLocale === "ko" ? appliedFilterSpec.nameKo : appliedFilterSpec.nameEn,
          appliedRecord.pct,
        )
      : null;

  const panelToneStyle: MasterFilterCssVars = {
    "--mfl-active-tone": selectedFilter.accentToken,
  };
  const stageSplitStyle: MasterFilterCssVars = {
    "--mfl-split": `${splitPct}%`,
  };

  function handleApplyClick() {
    setAppliedRecord({ filterId: selectedFilter.id, pct: intensityPct });
    onApplyFilter?.({
      filter: selectedFilter,
      intensity: intensityPct / 100,
      seed,
    });
  }

  return (
    <section
      className="mfl-panel"
      style={panelToneStyle}
      aria-label={copy.title}
      data-testid="master-filter-lut-gallery"
      data-locale={resolvedLocale}
    >
      <header className="mfl-header">
        <div>
          <p className="mfl-kicker">{copy.kicker}</p>
          <h2 className="mfl-title">{copy.title}</h2>
          <p className="mfl-subtitle">{copy.subtitle}</p>
        </div>
        <div className="mfl-badges">
          <span className="mfl-badge mfl-badge-total mfl-num" data-testid="master-filter-total-badge">
            {copy.totalBadge}
          </span>
          <span className="mfl-badge mfl-num">{copy.freeBadge}</span>
        </div>
      </header>

      <div className="mfl-workspace">
        <div className="mfl-preview-card">
          <div className="mfl-stage-header">
            <h3 className="mfl-active-name" data-testid="master-filter-active-name">
              {activeName}
            </h3>
            <span className="mfl-algo-chip">{activeAlgo}</span>
          </div>
          <p className="mfl-active-desc">{activeDesc}</p>

          <div
            className="mfl-compare-stage"
            style={stageSplitStyle}
            role="group"
            aria-label={copy.previewAriaLabel(activeName, splitPct, intensityPct)}
            data-testid="master-filter-compare-stage"
            data-filter-id={selectedFilter.id}
            data-split-pct={splitPct}
            data-intensity-pct={intensityPct}
            data-changed-pixels={diffMetrics.changedPixelCount}
          >
            <canvas
              ref={afterCanvasRef}
              className="mfl-canvas"
              width={previewSource.width}
              height={previewSource.height}
              aria-hidden="true"
            />
            <canvas
              ref={beforeCanvasRef}
              className="mfl-canvas mfl-canvas-before"
              width={previewSource.width}
              height={previewSource.height}
              aria-hidden="true"
            />
            <span className="mfl-stage-pill mfl-stage-pill-before">{copy.beforeLabel}</span>
            <span className="mfl-stage-pill mfl-stage-pill-after">{copy.afterLabel}</span>
            <input
              id={splitSliderId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={splitPct}
              onChange={(event) => setSplitPct(Number(event.target.value))}
              className="mfl-stage-range"
              aria-label={copy.splitLabel}
              data-testid="master-filter-split-slider"
            />
            <div className="mfl-divider-line" aria-hidden="true">
              <span className="mfl-divider-knob">↔</span>
            </div>
          </div>

          <div className="mfl-sliders">
            <div className="mfl-slider-row">
              <div className="mfl-slider-head">
                <label htmlFor={splitSliderId}>{copy.splitLabel}</label>
                <span className="mfl-num" data-testid="master-filter-split-value">
                  {splitPct}%
                </span>
              </div>
            </div>

            <div className="mfl-slider-row">
              <div className="mfl-slider-head">
                <label htmlFor={intensitySliderId}>{copy.intensityLabel}</label>
                <span className="mfl-num" data-testid="master-filter-intensity-value">
                  {intensityPct}%
                </span>
              </div>
              <input
                id={intensitySliderId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={intensityPct}
                onChange={(event) => setIntensityPct(Number(event.target.value))}
                className="mfl-range-input"
                data-testid="master-filter-intensity-slider"
              />
            </div>
          </div>

          <div className="mfl-telemetry">
            <span className="mfl-num">
              {copy.pixelDiffLabel}: <strong>{changedPctText}</strong>
            </span>
            {selectedFilter.modifiesAlpha ? (
              <span className="mfl-alpha-hint">{copy.alphaKeyHint}</span>
            ) : null}
          </div>

          <button
            type="button"
            className="mfl-apply-btn"
            onClick={handleApplyClick}
            data-testid="master-filter-apply-btn"
          >
            {copy.applyButton}
          </button>

          {appliedBannerText ? (
            <p className="mfl-status-note" role="status" data-testid="master-filter-status-note">
              {appliedBannerText}
            </p>
          ) : null}
        </div>

        <div className="mfl-catalog-pane">
          <div className="mfl-search-row">
            <label htmlFor={searchInputId} className="mfl-search-label">
              {copy.searchLabel}
            </label>
            <input
              id={searchInputId}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="mfl-search-input"
              data-testid="master-filter-search-input"
            />
          </div>

          <div className="mfl-tablist" role="tablist" aria-label={copy.title}>
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "all"}
              className="mfl-tab"
              onClick={() => setSelectedCategory("all")}
              data-testid="master-filter-tab-all"
            >
              <span>{copy.allCategoryLabel}</span>
              <span className="mfl-tab-count mfl-num">
                {copy.filterCountUnit(MASTER_FILTER_COUNT_BREAKDOWN.masterLut)}
              </span>
            </button>

            {MASTER_FILTER_CATEGORIES.map((category) => {
              const tabTone: MasterFilterCssVars = {
                "--mfl-tab-tone": category.accentToken,
              };
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === category.id}
                  className="mfl-tab"
                  style={tabTone}
                  onClick={() => setSelectedCategory(category.id)}
                  data-testid={`master-filter-tab-${category.id}`}
                >
                  <span>{resolvedLocale === "ko" ? category.labelKo : category.labelEn}</span>
                  <span className="mfl-tab-count mfl-num">
                    {copy.filterCountUnit(category.expectedCount)}
                  </span>
                </button>
              );
            })}
          </div>

          {visibleFilters.length === 0 ? (
            <div className="mfl-empty-state">
              <span>{copy.emptySearch}</span>
              <button
                type="button"
                className="mfl-tab"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
              >
                {copy.resetSearch}
              </button>
            </div>
          ) : (
            <div className="mfl-grid" data-testid="master-filter-grid">
              {visibleFilters.map((filter) => {
                const isSelected = filter.id === selectedFilter.id;
                const cardTone: MasterFilterCssVars = {
                  "--mfl-card-tone": filter.accentToken,
                };
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={isSelected}
                    className="mfl-filter-card"
                    style={cardTone}
                    onClick={() => setSelectedFilterId(filter.id)}
                    data-testid={`master-filter-card-${filter.id}`}
                  >
                    <span className="mfl-card-title">
                      {resolvedLocale === "ko" ? filter.nameKo : filter.nameEn}
                    </span>
                    <span className="mfl-card-tag">
                      {resolvedLocale === "ko" ? filter.algorithmTagKo : filter.algorithmTagEn}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default MasterFilterLutGalleryPanel;

/**
 * 글로벌 마스터 100% 무료 기본 브러시 60종 인터랙티브 갤러리 및 라이브 테스트 드로잉 패드.
 *
 * Calm Atelier 시맨틱 토큰 기반, 12카테고리 필터 · 글로벌 경쟁사 별칭 검색 ·
 * 실시간 2D Canvas 스트로크 프리뷰 · 포인터 라이브 드로잉 패드 · KO/EN 완전 지원.
 */
import {
  Check,
  Eraser,
  Moon,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  GLOBAL_MASTER_BRUSH_CATALOG,
  GLOBAL_MASTER_BRUSH_CATEGORIES,
  GLOBAL_MASTER_COMPETITOR_SOURCES,
  filterGlobalMasterBrushes,
  formatGlobalMasterCountBadge,
  getGlobalMasterBrushById,
  getGlobalMasterCategoryMeta,
} from "./global-master-brush-catalog";
import {
  renderMasterBrushStrokeSample,
  renderMasterBrushUserStroke,
} from "./global-master-brush-renderer";
import type {
  GlobalMasterBrushCategory,
  GlobalMasterBrushLocale,
  GlobalMasterBrushPreset,
  GlobalMasterCompetitorSource,
  GlobalMasterStrokePoint,
} from "./global-master-brush-types";

import "./global-master-brush-gallery.css";

const CARD_PREVIEW_W = 200;
const CARD_PREVIEW_H = 54;
const LIVE_PAD_W = 420;
const LIVE_PAD_H = 188;

export interface GlobalMasterBrushGalleryPanelProps {
  readonly locale?: GlobalMasterBrushLocale;
  readonly selectedPresetId?: string;
  readonly onSelectPreset?: (preset: GlobalMasterBrushPreset) => void;
  readonly className?: string;
  readonly initialCategory?: GlobalMasterBrushCategory | "all";
}

interface GalleryCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly clearSearch: string;
  readonly allCategories: string;
  readonly allCompetitors: string;
  readonly freeBadge: string;
  readonly emptyResult: string;
  readonly resetFilters: string;
  readonly livePadTitle: string;
  readonly livePadHint: string;
  readonly livePadAria: string;
  readonly replaySample: string;
  readonly clearPad: string;
  readonly darkPaper: string;
  readonly lightPaper: string;
  readonly sizeScaleLabel: string;
  readonly equivalentsLabel: string;
  readonly applyBrush: string;
  readonly metricSize: string;
  readonly metricOpacity: string;
  readonly metricWetness: string;
  readonly metricImpasto: string;
  readonly metricKm7: string;
  readonly metricDualTip: string;
  readonly dualTipOn: string;
  readonly dualTipOff: string;
  readonly sampleReady: string;
}

function getGalleryCopy(locale: GlobalMasterBrushLocale): GalleryCopy {
  if (locale === "en") {
    return {
      title: "Global Master Free Brush Collection",
      subtitle:
        "60 signature built-in brushes tuned from global comic, watercolor, oil, and illustration workflows.",
      searchLabel: "Search brushes and competitor equivalents",
      searchPlaceholder: "Search CSP, Procreate, Rebelle, ibisPaint, G-Pen, Rofan...",
      clearSearch: "Clear search",
      allCategories: "All",
      allCompetitors: "All Apps",
      freeBadge: "100% Free",
      emptyResult: "No brushes match your filter. Try another keyword or reset filters.",
      resetFilters: "Reset Filters",
      livePadTitle: "Live Test Drawing Pad",
      livePadHint: "Draw directly with stylus or mouse",
      livePadAria: "Interactive brush test drawing canvas",
      replaySample: "Sample",
      clearPad: "Clear",
      darkPaper: "Dark Paper",
      lightPaper: "Light Paper",
      sizeScaleLabel: "Test Size",
      equivalentsLabel: "Global Equivalents",
      applyBrush: "Apply Selected Brush",
      metricSize: "Default Size",
      metricOpacity: "Opacity",
      metricWetness: "Wetness",
      metricImpasto: "Impasto",
      metricKm7: "KM7 Mix",
      metricDualTip: "Dual Tip",
      dualTipOn: "Active",
      dualTipOff: "Single",
      sampleReady: "Sample rendered",
    };
  }
  return {
    title: "글로벌 마스터 무료 기본 브러시 60종",
    subtitle:
      "클튜·프로크리에이트·리벨·아이비스 등 글로벌 대표 브러시 질감을 100% 무료 내장 엔진으로 구현했습니다.",
    searchLabel: "브러시 및 경쟁사 별칭 검색",
    searchPlaceholder: "CSP, Procreate, Rebelle, ibisPaint, 로판, G펜 검색...",
    clearSearch: "검색어 지우기",
    allCategories: "전체",
    allCompetitors: "전체 앱",
    freeBadge: "100% 무료",
    emptyResult: "조건에 맞는 브러시가 없습니다. 검색어를 바꾸거나 필터를 초기화해 보세요.",
    resetFilters: "필터 초기화",
    livePadTitle: "라이브 테스트 드로잉 패드",
    livePadHint: "펜이나 마우스로 바로 그려 보세요",
    livePadAria: "브러시 스트로크 테스트 드로잉 캔버스",
    replaySample: "예시 복원",
    clearPad: "지우기",
    darkPaper: "어두운 종이",
    lightPaper: "밝은 종이",
    sizeScaleLabel: "테스트 배율",
    equivalentsLabel: "글로벌 대응 브러시",
    applyBrush: "이 브러시 적용",
    metricSize: "기본 크기",
    metricOpacity: "불투명도",
    metricWetness: "습도·번짐",
    metricImpasto: "임파스토",
    metricKm7: "KM7 혼색",
    metricDualTip: "듀얼 팁",
    dualTipOn: "활성",
    dualTipOff: "단일",
    sampleReady: "샘플 표시됨",
  };
}

interface BrushStrokePreviewCanvasProps {
  readonly preset: GlobalMasterBrushPreset;
  readonly locale: GlobalMasterBrushLocale;
}

const BrushStrokePreviewCanvas = memo(function BrushStrokePreviewCanvas({
  preset,
  locale,
}: BrushStrokePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderMasterBrushStrokeSample(ctx, preset, CARD_PREVIEW_W, CARD_PREVIEW_H);
  }, [preset]);

  const ariaLabel =
    locale === "en"
      ? `${preset.nameEn} stroke preview`
      : `${preset.nameKo} 스트로크 미리보기`;

  return (
    <canvas
      ref={canvasRef}
      width={CARD_PREVIEW_W}
      height={CARD_PREVIEW_H}
      className="gm-brush-preview-canvas"
      aria-label={ariaLabel}
    />
  );
});

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getCardStandoutTag(
  preset: GlobalMasterBrushPreset,
  locale: GlobalMasterBrushLocale,
): string {
  if (preset.impastoHeight >= 0.45) {
    return locale === "en"
      ? `Impasto ${formatPercent(preset.impastoHeight)}`
      : `임파스토 ${formatPercent(preset.impastoHeight)}`;
  }
  if (preset.wetness >= 0.65) {
    return locale === "en"
      ? `Wet ${formatPercent(preset.wetness)}`
      : `습도 ${formatPercent(preset.wetness)}`;
  }
  if (preset.km7PigmentMix >= 0.6) {
    return locale === "en"
      ? `KM7 ${formatPercent(preset.km7PigmentMix)}`
      : `KM7 ${formatPercent(preset.km7PigmentMix)}`;
  }
  if (preset.dualTipProfile?.enabled) {
    return locale === "en" ? "Dual Tip" : "듀얼 팁";
  }
  return locale === "en"
    ? `Spacing ${Math.round(preset.spacing * 100)}%`
    : `간격 ${Math.round(preset.spacing * 100)}%`;
}

export function GlobalMasterBrushGalleryPanel({
  locale = "ko",
  selectedPresetId,
  onSelectPreset,
  className,
  initialCategory = "all",
}: GlobalMasterBrushGalleryPanelProps) {
  const searchInputId = useId();
  const sizeSliderId = useId();
  const copy = useMemo(() => getGalleryCopy(locale), [locale]);
  const countBadge = useMemo(() => formatGlobalMasterCountBadge(locale), [locale]);

  const [category, setCategory] = useState<GlobalMasterBrushCategory | "all">(initialCategory);
  const [competitor, setCompetitor] = useState<GlobalMasterCompetitorSource | "all">("all");
  const [query, setQuery] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<string>(
    selectedPresetId ?? GLOBAL_MASTER_BRUSH_CATALOG[0]!.id,
  );
  const [sizeScale, setSizeScale] = useState<number>(1);
  const [darkPaperOverride, setDarkPaperOverride] = useState<boolean | null>(null);
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [lastDabCount, setLastDabCount] = useState<number>(0);

  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeStrokePointsRef = useRef<GlobalMasterStrokePoint[]>([]);
  const userStrokesRef = useRef<readonly GlobalMasterStrokePoint[][]>([]);

  const filteredPresets = useMemo(
    () => filterGlobalMasterBrushes({ category, query, competitor }),
    [category, query, competitor],
  );

  const resolvedSelectedId = selectedPresetId ?? internalSelectedId;
  const activePreset = useMemo(
    () =>
      getGlobalMasterBrushById(resolvedSelectedId) ??
      filteredPresets[0] ??
      GLOBAL_MASTER_BRUSH_CATALOG[0]!,
    [resolvedSelectedId, filteredPresets],
  );

  const isDarkPaper =
    darkPaperOverride !== null
      ? darkPaperOverride
      : activePreset.category === "light-fx-glitter";

  const drawSampleOnLivePad = useCallback(
    (preset: GlobalMasterBrushPreset, scale: number, darkPaper: boolean) => {
      const canvas = liveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      userStrokesRef.current = [];
      const result = renderMasterBrushStrokeSample(ctx, preset, LIVE_PAD_W, LIVE_PAD_H, {
        sizeScale: scale,
        darkPaper,
        clearCanvas: true,
      });
      setStrokeCount(0);
      setLastDabCount(result.dabCount);
    },
    [],
  );

  useEffect(() => {
    drawSampleOnLivePad(activePreset, sizeScale, isDarkPaper);
  }, [activePreset, sizeScale, isDarkPaper, drawSampleOnLivePad]);

  const handleSelectCard = useCallback(
    (preset: GlobalMasterBrushPreset) => {
      setInternalSelectedId(preset.id);
      setDarkPaperOverride(null);
      onSelectPreset?.(preset);
    },
    [onSelectPreset],
  );

  const handleClearPad = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, LIVE_PAD_W, LIVE_PAD_H);
    }
    userStrokesRef.current = [];
    activeStrokePointsRef.current = [];
    setStrokeCount(0);
    setLastDabCount(0);
  }, []);

  const toCanvasPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): GlobalMasterStrokePoint => {
      const canvas = liveCanvasRef.current;
      if (!canvas) {
        return { x: LIVE_PAD_W * 0.5, y: LIVE_PAD_H * 0.5, pressure: 0.72 };
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? LIVE_PAD_W / rect.width : 1;
      const scaleY = rect.height > 0 ? LIVE_PAD_H / rect.height : 1;
      const rawPressure =
        typeof event.pressure === "number" && event.pressure > 0 ? event.pressure : 0.72;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
        pressure: Math.min(1, Math.max(0.08, rawPressure)),
        tiltX: event.tiltX ?? 0,
        tiltY: event.tiltY ?? 0,
        timestampMs: event.timeStamp,
      };
    },
    [],
  );

  const redrawUserStrokes = useCallback(
    (allStrokes: readonly (readonly GlobalMasterStrokePoint[])[]) => {
      const canvas = liveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (typeof ctx.clearRect === "function") {
        ctx.clearRect(0, 0, LIVE_PAD_W, LIVE_PAD_H);
      }
      let totalDabs = 0;
      for (const stroke of allStrokes) {
        const res = renderMasterBrushUserStroke(ctx, activePreset, stroke, {
          sizeScale,
          darkPaper: isDarkPaper,
          clearCanvas: false,
        });
        totalDabs += res.dabCount;
      }
      setLastDabCount(totalDabs);
    },
    [activePreset, sizeScale, isDarkPaper],
  );

  const handlePadPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      activePointerIdRef.current = event.pointerId;
      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // 일부 가상 포인터 환경에서는 캡처를 지원하지 않을 수 있다.
        }
      }
      const pt = toCanvasPoint(event);
      activeStrokePointsRef.current = [pt];
      const nextStrokes = [...userStrokesRef.current, activeStrokePointsRef.current];
      redrawUserStrokes(nextStrokes);
    },
    [toCanvasPoint, redrawUserStrokes],
  );

  const handlePadPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      const pt = toCanvasPoint(event);
      const current = activeStrokePointsRef.current;
      const last = current[current.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) return;
      activeStrokePointsRef.current = [...current, pt];
      const nextStrokes = [...userStrokesRef.current, activeStrokePointsRef.current];
      redrawUserStrokes(nextStrokes);
    },
    [toCanvasPoint, redrawUserStrokes],
  );

  const finishPadStroke = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (activeStrokePointsRef.current.length > 0) {
      userStrokesRef.current = [...userStrokesRef.current, activeStrokePointsRef.current];
      activeStrokePointsRef.current = [];
      setStrokeCount(userStrokesRef.current.length);
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setCategory("all");
    setCompetitor("all");
    setQuery("");
  }, []);

  const activeCategoryMeta = getGlobalMasterCategoryMeta(activePreset.category);
  const resultCountText =
    locale === "en"
      ? `${filteredPresets.length} / ${GLOBAL_MASTER_BRUSH_CATALOG.length} brushes`
      : `${filteredPresets.length} / ${GLOBAL_MASTER_BRUSH_CATALOG.length}종 표시`;

  const padStatusText =
    strokeCount > 0
      ? locale === "en"
        ? `${strokeCount} stroke${strokeCount > 1 ? "s" : ""} · ${lastDabCount} dabs`
        : `직접 드로잉 ${strokeCount}획 · 댑 ${lastDabCount}개`
      : locale === "en"
        ? `${copy.sampleReady} · ${lastDabCount} dabs`
        : `${copy.sampleReady} · 댑 ${lastDabCount}개`;

  const rootClassName = className ? `gm-brush-gallery ${className}` : "gm-brush-gallery";

  return (
    <section
      className={rootClassName}
      data-testid="global-master-brush-gallery-panel"
      data-locale={locale}
      aria-label={copy.title}
    >
      <header className="gm-brush-header">
        <div className="gm-brush-title-group">
          <h2 className="gm-brush-title">{copy.title}</h2>
          <p className="gm-brush-subtitle">{copy.subtitle}</p>
        </div>
        <div className="gm-brush-count-badge" data-testid="gm-brush-count-badge">
          <Sparkles size={14} aria-hidden="true" />
          <span>{countBadge}</span>
        </div>
      </header>

      <div className="gm-brush-controls">
        <div className="gm-brush-search-row">
          <div className="gm-brush-search-field">
            <Search size={15} className="gm-brush-search-icon" aria-hidden="true" />
            <label htmlFor={searchInputId} className="sr-only">
              {copy.searchLabel}
            </label>
            <input
              id={searchInputId}
              type="search"
              className="gm-brush-search-input"
              data-testid="gm-brush-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="gm-brush-clear-btn"
                onClick={() => setQuery("")}
                aria-label={copy.clearSearch}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <span className="gm-brush-result-counter" data-testid="gm-brush-result-counter">
            {resultCountText}
          </span>
        </div>

        <div
          className="gm-brush-competitor-bar"
          role="group"
          aria-label={copy.equivalentsLabel}
        >
          <button
            type="button"
            className="gm-brush-chip"
            data-active={competitor === "all" ? "true" : "false"}
            aria-pressed={competitor === "all"}
            onClick={() => setCompetitor("all")}
          >
            {copy.allCompetitors}
          </button>
          {GLOBAL_MASTER_COMPETITOR_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              className="gm-brush-chip"
              data-testid={`gm-brush-competitor-${source}`}
              data-active={competitor === source ? "true" : "false"}
              aria-pressed={competitor === source}
              onClick={() => setCompetitor(competitor === source ? "all" : source)}
            >
              {source}
            </button>
          ))}
        </div>

        <div className="gm-brush-category-rail" role="tablist" aria-label={copy.title}>
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className="gm-brush-chip"
            data-testid="gm-brush-category-all"
            data-active={category === "all" ? "true" : "false"}
            onClick={() => setCategory("all")}
          >
            <span>{copy.allCategories}</span>
            <span className="gm-brush-chip-count">{GLOBAL_MASTER_BRUSH_CATALOG.length}</span>
          </button>
          {GLOBAL_MASTER_BRUSH_CATEGORIES.map((meta) => (
            <button
              key={meta.id}
              type="button"
              role="tab"
              aria-selected={category === meta.id}
              className="gm-brush-chip"
              data-testid={`gm-brush-category-${meta.id}`}
              data-active={category === meta.id ? "true" : "false"}
              onClick={() => setCategory(meta.id)}
            >
              <span>{locale === "en" ? meta.labelEn : meta.labelKo}</span>
              <span className="gm-brush-chip-count">{meta.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gm-brush-body">
        <div className="gm-brush-grid" data-testid="gm-brush-grid">
          {filteredPresets.length === 0 ? (
            <div className="gm-brush-empty" data-testid="gm-brush-empty">
              <p>{copy.emptyResult}</p>
              <button
                type="button"
                className="gm-brush-action-btn"
                onClick={handleResetFilters}
              >
                {copy.resetFilters}
              </button>
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const selected = preset.id === activePreset.id;
              const title = locale === "en" ? preset.nameEn : preset.nameKo;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="gm-brush-card"
                  data-testid={`gm-brush-card-${preset.id}`}
                  data-selected={selected ? "true" : "false"}
                  aria-pressed={selected}
                  onClick={() => handleSelectCard(preset)}
                >
                  <BrushStrokePreviewCanvas preset={preset} locale={locale} />
                  <div className="gm-brush-card-top">
                    <span className="gm-brush-card-name">{title}</span>
                    <span className="gm-brush-free-pill">{copy.freeBadge}</span>
                  </div>
                  <div className="gm-brush-card-equiv">
                    {preset.competitorEquivalents[0]}
                  </div>
                  <div className="gm-brush-card-meta">
                    <span className="gm-brush-spec-tag">{preset.defaultSizePx}px</span>
                    <span className="gm-brush-spec-tag">
                      {formatPercent(preset.defaultOpacity)}
                    </span>
                    <span className="gm-brush-spec-tag">
                      {getCardStandoutTag(preset, locale)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <aside className="gm-brush-inspector" data-testid="gm-brush-inspector">
          <div className="gm-brush-inspector-head">
            <div>
              <h3 className="gm-brush-inspector-title" data-testid="gm-brush-active-name">
                {locale === "en" ? activePreset.nameEn : activePreset.nameKo}
              </h3>
              <p className="gm-brush-inspector-feel">
                {locale === "en"
                  ? activePreset.signatureFeelEn
                  : activePreset.signatureFeelKo}
              </p>
            </div>
            <span className="gm-brush-free-pill">
              {locale === "en" ? activeCategoryMeta.labelEn : activeCategoryMeta.labelKo}
            </span>
          </div>

          <div className="gm-brush-pad-shell">
            <div className="gm-brush-pad-toolbar">
              <span className="gm-brush-metric-label">{copy.livePadTitle}</span>
              <div className="gm-brush-pad-actions">
                <button
                  type="button"
                  className="gm-brush-action-btn"
                  data-testid="gm-brush-paper-toggle"
                  onClick={() => setDarkPaperOverride(!isDarkPaper)}
                >
                  {isDarkPaper ? (
                    <Sun size={13} aria-hidden="true" />
                  ) : (
                    <Moon size={13} aria-hidden="true" />
                  )}
                  <span>{isDarkPaper ? copy.lightPaper : copy.darkPaper}</span>
                </button>
                <button
                  type="button"
                  className="gm-brush-action-btn"
                  data-testid="gm-brush-pad-replay"
                  onClick={() => drawSampleOnLivePad(activePreset, sizeScale, isDarkPaper)}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>{copy.replaySample}</span>
                </button>
                <button
                  type="button"
                  className="gm-brush-action-btn"
                  data-testid="gm-brush-pad-clear"
                  onClick={handleClearPad}
                >
                  <Eraser size={13} aria-hidden="true" />
                  <span>{copy.clearPad}</span>
                </button>
              </div>
            </div>

            <canvas
              ref={liveCanvasRef}
              width={LIVE_PAD_W}
              height={LIVE_PAD_H}
              className="gm-brush-live-canvas"
              data-testid="gm-brush-live-pad-canvas"
              data-dark-paper={isDarkPaper ? "true" : "false"}
              aria-label={copy.livePadAria}
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={finishPadStroke}
              onPointerCancel={finishPadStroke}
            />

            <div className="gm-brush-pad-status">
              <span>{copy.livePadHint}</span>
              <span data-testid="gm-brush-live-pad-status">{padStatusText}</span>
            </div>

            <div className="gm-brush-slider-row">
              <label htmlFor={sizeSliderId}>{copy.sizeScaleLabel}</label>
              <input
                id={sizeSliderId}
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={sizeScale}
                onChange={(event) => setSizeScale(Number(event.target.value))}
                className="gm-brush-slider"
              />
              <span>{sizeScale.toFixed(1)}×</span>
            </div>
          </div>

          <div className="gm-brush-equiv-list" aria-label={copy.equivalentsLabel}>
            {activePreset.competitorEquivalents.map((equivalent) => (
              <span key={equivalent} className="gm-brush-equiv-badge">
                {equivalent}
              </span>
            ))}
          </div>

          <div className="gm-brush-metrics-grid">
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricSize}</span>
              <span className="gm-brush-metric-value">{activePreset.defaultSizePx}px</span>
            </div>
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricOpacity}</span>
              <span className="gm-brush-metric-value">
                {formatPercent(activePreset.defaultOpacity)}
              </span>
            </div>
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricWetness}</span>
              <span className="gm-brush-metric-value">
                {formatPercent(activePreset.wetness)}
              </span>
            </div>
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricImpasto}</span>
              <span className="gm-brush-metric-value">
                {formatPercent(activePreset.impastoHeight)}
              </span>
            </div>
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricKm7}</span>
              <span className="gm-brush-metric-value">
                {formatPercent(activePreset.km7PigmentMix)}
              </span>
            </div>
            <div className="gm-brush-metric-cell">
              <span className="gm-brush-metric-label">{copy.metricDualTip}</span>
              <span className="gm-brush-metric-value">
                {activePreset.dualTipProfile?.enabled ? copy.dualTipOn : copy.dualTipOff}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="gm-brush-apply-btn"
            data-testid="gm-brush-apply-btn"
            onClick={() => onSelectPreset?.(activePreset)}
          >
            <Check size={16} aria-hidden="true" />
            <span>{copy.applyBrush}</span>
          </button>
        </aside>
      </div>
    </section>
  );
}

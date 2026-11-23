import "./csp-brush-atelier.css";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  CSP_ALL_36_BRUSH_CATALOG,
  CSP_BRUSH_CATEGORIES,
  CSP_BRUSH_CATEGORY_IDS,
  type CspBrushCategoryFilter,
  type CspBrushCategoryId,
  type CspBrushId,
  type CspProBrushSpec,
  filterCspBrushes,
  getCspBrushById,
} from "./csp-all-categories-brush-catalog";
import {
  type CspStroke10kBudgetResult,
  renderCspBrushStrokePreviewStrip,
  runCspStroke10kBudgetCheck,
  samplePaperSubstrateHeight,
  synthesizeCspBrushPhysicalStamp,
} from "./csp-procedural-texture-synthesizer";
import {
  STUDIO_FOLEY_PRESETS,
  STUDIO_VIBRANT_THEMES,
  StudioVibrantSpriteIcon,
  createStudioFoleyAudioEngine,
  getStudioVibrantSprite,
  resolveStudioToolSpriteId,
  triggerTactileHapticDetent,
  type StudioFoleyAudioEngine,
  type StudioFoleyPresetId,
  type StudioVibrantThemeId,
} from "../vibrant-studio-fx";

export interface StudioCspFullBrushAtelierPanelProps {
  readonly initialBrushId?: CspBrushId;
  readonly onApplyBrush?: (brush: CspProBrushSpec) => void;
}

const CATEGORY_LABEL_MAP: ReadonlyMap<CspBrushCategoryId, string> = new Map(
  CSP_BRUSH_CATEGORIES.map((category) => [category.id, category.labelKo]),
);

const OPERATION_LABELS: Readonly<Record<CspProBrushSpec["operationMode"], string>> = Object.freeze({
  paint: "채색·선화",
  erase: "부드러운 지우개",
  "vector-erase": "벡터 교차 삭제",
  blend: "실시간 혼색",
});

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas || typeof ImageData === "undefined") return;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const frame = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(frame, 0, 0);
  } catch {
    // Headless jsdom 환경에서는 2D 컨텍스트 미구현 예외를 안전하게 무시한다.
  }
}

function buildBrushTraitChips(brush: CspProBrushSpec): readonly string[] {
  const chips: string[] = [brush.paperGrainLabelKo];
  if (brush.wetEdgeDarkening01 >= 0.45) chips.push("물 번짐 엣지");
  if (brush.impastoRidge01 >= 0.5) chips.push("임파스토 리지");
  if (brush.bristleCount >= 18) chips.push(`브리슬 ${brush.bristleCount}모`);
  if (brush.ribbonRepeatMode !== "none") chips.push("연속 패턴 리본");
  if (brush.operationMode !== "paint") chips.push(OPERATION_LABELS[brush.operationMode]);
  return chips.slice(0, 3);
}

/**
 * 클립스튜디오 전 9대 카테고리 × 36종 풀 프로 브러시 아틀리에.
 * 모든 질감 스탬프·스트로크 프리뷰·10,000점 O(1) 무지연 예산 검증을 클라이언트에서 결정론적으로 실행한다.
 */
export function StudioCspFullBrushAtelierPanel({
  initialBrushId = "csp-wax-crayon",
  onApplyBrush,
}: StudioCspFullBrushAtelierPanelProps) {
  const baseId = useId();
  const [selectedCategory, setSelectedCategory] = useState<CspBrushCategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedBrushId, setSelectedBrushId] = useState<CspBrushId>(initialBrushId);
  const [pressurePct, setPressurePct] = useState(68);
  const [paperToothPct, setPaperToothPct] = useState<number | null>(null);
  const [colorMixPct, setColorMixPct] = useState<number | null>(null);
  const [tiltPct, setTiltPct] = useState(22);
  const [appliedBrushId, setAppliedBrushId] = useState<CspBrushId | null>(null);
  const [soakResult, setSoakResult] = useState<CspStroke10kBudgetResult | null>(null);
  const [vibrantTheme, setVibrantTheme] = useState<StudioVibrantThemeId>("sunlight-atelier");
  const [foleyPreset, setFoleyPreset] = useState<StudioFoleyPresetId>("quiet-atelier");

  const strokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stampCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foleyEngineRef = useRef<StudioFoleyAudioEngine | null>(null);

  const selectedBrush = useMemo<CspProBrushSpec>(
    () => getCspBrushById(selectedBrushId) ?? CSP_ALL_36_BRUSH_CATALOG[0]!,
    [selectedBrushId],
  );
  const selectedSpriteId = useMemo(
    () => resolveStudioToolSpriteId(selectedBrush.id, resolveStudioToolSpriteId(selectedBrush.category)),
    [selectedBrush.id, selectedBrush.category],
  );

  const effectivePaperToothPct = paperToothPct ?? Math.round(selectedBrush.paperToothStrength01 * 100);
  const effectiveColorMixPct = colorMixPct ?? Math.round(selectedBrush.colorMixStrength01 * 100);

  const visibleBrushes = useMemo(
    () => filterCspBrushes(selectedCategory, query),
    [selectedCategory, query],
  );

  const activeCategoryMeta = useMemo(
    () =>
      selectedCategory === "all"
        ? null
        : (CSP_BRUSH_CATEGORIES.find((cat) => cat.id === selectedCategory) ?? null),
    [selectedCategory],
  );

  const stampPreview = useMemo(
    () =>
      synthesizeCspBrushPhysicalStamp({
        brush: selectedBrush,
        size: 64,
        pressure01: pressurePct / 100,
        tilt01: tiltPct / 100,
        paperToothOverride01: effectivePaperToothPct / 100,
        colorMixOverride01: effectiveColorMixPct / 100,
      }),
    [selectedBrush, pressurePct, tiltPct, effectivePaperToothPct, effectiveColorMixPct],
  );

  const strokePreview = useMemo(
    () =>
      renderCspBrushStrokePreviewStrip({
        brush: selectedBrush,
        width: 240,
        height: 68,
        pressure01: pressurePct / 100,
        tilt01: tiltPct / 100,
        paperToothOverride01: effectivePaperToothPct / 100,
        colorMixOverride01: effectiveColorMixPct / 100,
      }),
    [selectedBrush, pressurePct, tiltPct, effectivePaperToothPct, effectiveColorMixPct],
  );

  const paperPeakSample = useMemo(
    () => samplePaperSubstrateHeight(selectedBrush.paperGrain, 18.4, 24.2, 0x25d0),
    [selectedBrush.paperGrain],
  );

  useEffect(() => {
    paintRgbaToCanvas(
      strokeCanvasRef.current,
      strokePreview.rgba,
      strokePreview.width,
      strokePreview.height,
    );
    paintRgbaToCanvas(
      stampCanvasRef.current,
      stampPreview.rgba,
      stampPreview.size,
      stampPreview.size,
    );
  }, [strokePreview, stampPreview]);

  useEffect(() => {
    return () => {
      foleyEngineRef.current?.dispose();
      foleyEngineRef.current = null;
    };
  }, []);

  const ensureFoleyEngine = (): StudioFoleyAudioEngine => {
    if (!foleyEngineRef.current) {
      foleyEngineRef.current = createStudioFoleyAudioEngine({ initialPreset: foleyPreset });
    }
    return foleyEngineRef.current;
  };

  const handleSelectVibrantTheme = (nextTheme: StudioVibrantThemeId) => {
    setVibrantTheme(nextTheme);
    ensureFoleyEngine().triggerSound("magnetic-detent", { pressure01: 0.45 });
    triggerTactileHapticDetent("detent-tick");
  };

  const handleSelectFoleyPreset = (nextPreset: StudioFoleyPresetId) => {
    setFoleyPreset(nextPreset);
    const engine = ensureFoleyEngine();
    engine.applyPreset(nextPreset);
    if (nextPreset !== "silent-focus") {
      engine.triggerSound(getStudioVibrantSprite(selectedSpriteId).foleySoundId, {
        pressure01: pressurePct / 100,
        tilt01: tiltPct / 100,
      });
    }
    triggerTactileHapticDetent("detent-tick");
  };

  const handleSelectBrush = (brush: CspProBrushSpec) => {
    setSelectedBrushId(brush.id);
    setPaperToothPct(null);
    setColorMixPct(null);
    setSoakResult(null);
    const nextSpriteId = resolveStudioToolSpriteId(brush.id, resolveStudioToolSpriteId(brush.category));
    ensureFoleyEngine().triggerSound(getStudioVibrantSprite(nextSpriteId).foleySoundId, {
      pressure01: pressurePct / 100,
      tilt01: tiltPct / 100,
    });
    triggerTactileHapticDetent("brush-grain");
  };

  const handleResetTuning = () => {
    setPressurePct(68);
    setPaperToothPct(null);
    setColorMixPct(null);
    setTiltPct(22);
  };

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setQuery("");
  };

  const handleApplyCurrentBrush = () => {
    setAppliedBrushId(selectedBrush.id);
    ensureFoleyEngine().triggerSound("panel-snap", { pressure01: 0.72 });
    triggerTactileHapticDetent("ink-bloom");
    onApplyBrush?.(selectedBrush);
  };

  const handleRunSoakCheck = () => {
    setSoakResult(runCspStroke10kBudgetCheck(selectedBrush, 10_000));
  };

  return (
    <section
      className="cba-shell"
      data-testid="studio-csp-full-brush-atelier-panel"
      data-studio-vibrant-theme={vibrantTheme}
      aria-label="클립스튜디오 9대 카테고리 36종 풀 브러시 아틀리에"
    >
      <div className="cba-body">
        <header className="cba-header">
          <div>
            <p className="cba-kicker">
              물리 질감 합성 엔진 · {CSP_BRUSH_CATEGORY_IDS.length}대 카테고리 ×{" "}
              {CSP_ALL_36_BRUSH_CATALOG.length}종 브러시
            </p>
            <h2 className="cba-title">클립스튜디오 9대 카테고리 36종 풀 브러시 아틀리에</h2>
            <p className="cba-subtitle">
              펜·연필·파스텔/크레용·수채·유화·먹붓·에어브러시·데코레이션·지우개/혼색 전 9대
              카테고리의 종이 요철·브리슬 갈라짐·물 번짐 엣지·임파스토 리지를 실시간 픽셀로
              확인하고 조절합니다.
            </p>
          </div>
          <div className="cba-summary-badges">
            <span className="cba-badge cba-num">
              {CSP_BRUSH_CATEGORIES.length}대 카테고리 · {CSP_ALL_36_BRUSH_CATALOG.length}종 완비
            </span>
            <span className="cba-badge cba-badge-good">10,000점 O(1) 무지연 예산</span>
          </div>
        </header>

        <div
          className="ts-vibrant-atelier-strip"
          data-testid="csp-vibrant-sensory-strip"
          aria-label="아틀리에 OKLCH 컬러 테마 및 물리 Foley 음향 설정"
        >
          <div className="ts-vibrant-chip-group" role="group" aria-label="4종 아틀리에 컬러 테마">
            {STUDIO_VIBRANT_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={vibrantTheme === theme.id}
                className="ts-vibrant-chip ts-vibrant-pressable"
                onClick={() => handleSelectVibrantTheme(theme.id)}
              >
                <span className={`ts-theme-swatch ${theme.swatchClass}`} aria-hidden="true" />
                {theme.labelKo}
              </button>
            ))}
          </div>
          <div className="ts-vibrant-chip-group" role="group" aria-label="물리 Foley 오디오 프리셋">
            {(["quiet-atelier", "lively-asmr", "silent-focus"] as const).map((presetId) => (
              <button
                key={presetId}
                type="button"
                aria-pressed={foleyPreset === presetId}
                className="ts-vibrant-chip ts-vibrant-pressable"
                onClick={() => handleSelectFoleyPreset(presetId)}
              >
                {STUDIO_FOLEY_PRESETS[presetId].labelKo}
              </button>
            ))}
          </div>
        </div>

        <div className="cba-toolbar">
          <div className="cba-search-row">
            <label htmlFor={`${baseId}-search`} className="cba-field-label">
              36종 브러시 검색
              <input
                id={`${baseId}-search`}
                data-testid="csp-brush-search-input"
                type="search"
                maxLength={120}
                value={query}
                placeholder="브러시 이름·종이 결·영문 ID 검색 (예: 왁스, 갈필, 로판, g-pen)"
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                className="cba-input"
              />
            </label>
            {selectedCategory !== "all" || query.trim().length > 0 ? (
              <button
                type="button"
                data-testid="csp-filter-reset-btn"
                className="cba-action-btn"
                onClick={handleResetFilters}
              >
                필터 초기화
              </button>
            ) : null}
          </div>

          <div
            role="group"
            aria-label="클립스튜디오 9대 브러시 카테고리 필터"
            className="cba-category-strip"
            data-testid="csp-category-filter-bar"
          >
            <button
              type="button"
              data-testid="csp-category-btn-all"
              aria-pressed={selectedCategory === "all"}
              className="cba-cat-btn"
              onClick={() => setSelectedCategory("all")}
            >
              전체 <span className="cba-num">({CSP_ALL_36_BRUSH_CATALOG.length})</span>
            </button>
            {CSP_BRUSH_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                data-testid={`csp-category-btn-${category.id}`}
                aria-pressed={selectedCategory === category.id}
                className="cba-cat-btn"
                onClick={() => setSelectedCategory(category.id)}
              >
                <span
                  className="cba-cat-dot"
                  style={{ backgroundColor: category.accentOklch }}
                  aria-hidden="true"
                />
                {category.labelKo} <span className="cba-num">({category.expectedCount})</span>
              </button>
            ))}
          </div>

          <p
            role="status"
            aria-live="polite"
            className="cba-status-line cba-num"
            data-testid="csp-visible-count-status"
          >
            표시 브러시 {visibleBrushes.length} / {CSP_ALL_36_BRUSH_CATALOG.length}종
            {activeCategoryMeta ? ` · ${activeCategoryMeta.descriptionKo}` : ""}
          </p>
        </div>

        <div className="cba-workspace">
          <div>
            {visibleBrushes.length === 0 ? (
              <div className="cba-empty" data-testid="csp-brush-empty-state">
                <p className="cba-card-summary">
                  조건에 맞는 브러시가 없습니다. 검색어나 카테고리를 초기화해 전체 36종을 확인해
                  주세요.
                </p>
                <button
                  type="button"
                  className="cba-action-btn"
                  onClick={handleResetFilters}
                >
                  전체 36종 다시 보기
                </button>
              </div>
            ) : (
              <div className="cba-brush-grid" data-testid="csp-brush-grid">
                {visibleBrushes.map((brush) => {
                  const selected = brush.id === selectedBrush.id;
                  return (
                    <button
                      key={brush.id}
                      type="button"
                      data-testid={`csp-brush-card-${brush.id}`}
                      aria-pressed={selected}
                      className="cba-brush-card"
                      onClick={() => handleSelectBrush(brush)}
                    >
                      <span className="cba-card-top">
                        <span className="cba-card-name-wrap">
                          <span
                            className="cba-ink-swatch"
                            style={{ backgroundColor: brush.previewInkOklch }}
                            aria-hidden="true"
                          />
                          <span className="cba-card-title">{brush.nameKo}</span>
                        </span>
                        <span className="cba-card-cat">
                          {CATEGORY_LABEL_MAP.get(brush.category) ?? brush.category}
                        </span>
                      </span>
                      <p className="cba-card-summary">{brush.summaryKo}</p>
                      <span className="cba-card-meta">
                        {buildBrushTraitChips(brush).map((chip) => (
                          <span key={chip} className="cba-mini-chip">
                            {chip}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside
            className="cba-inspector"
            data-testid="csp-brush-inspector"
            aria-label="선택 브러시 실시간 물리 질감 프리뷰 및 조절기"
          >
            <div className="cba-inspector-head">
              <div className="cba-card-top">
                <span className="cba-card-name-wrap">
                  <StudioVibrantSpriteIcon
                    spriteId={selectedSpriteId}
                    size="md"
                    active
                    animated
                    ariaLabel={`${selectedBrush.nameKo} 주얼 스프라이트`}
                  />
                  <h3 className="cba-inspector-title" data-testid="csp-inspector-brush-name">
                    {selectedBrush.nameKo}
                  </h3>
                </span>
                <span className="cba-badge">
                  {CATEGORY_LABEL_MAP.get(selectedBrush.category) ?? selectedBrush.category}
                </span>
              </div>
              <span className="cba-inspector-en">
                {selectedBrush.nameEn} · {selectedBrush.id} · 기본 {selectedBrush.defaultSizePx}px
              </span>
              <p className="cba-card-summary">{selectedBrush.summaryKo}</p>
            </div>

            <div className="cba-preview-stage">
              <div className="cba-canvas-frame">
                <canvas
                  ref={strokeCanvasRef}
                  width={strokePreview.width}
                  height={strokePreview.height}
                  className="cba-canvas-stroke"
                  data-testid="csp-live-stroke-preview"
                  data-brush-id={selectedBrush.id}
                  data-non-empty-pixels={strokePreview.nonEmptyPixels}
                  aria-label={`${selectedBrush.nameKo} 실시간 스트로크 질감 프리뷰`}
                />
              </div>
              <div className="cba-canvas-frame">
                <canvas
                  ref={stampCanvasRef}
                  width={stampPreview.size}
                  height={stampPreview.size}
                  className="cba-canvas-stamp"
                  data-testid="csp-live-stamp-preview"
                  data-entropy-bits={stampPreview.metrics.entropyBits}
                  aria-label={`${selectedBrush.nameKo} 64픽셀 물리 스탬프 확대`}
                />
              </div>
            </div>

            <dl className="cba-metrics-grid" data-testid="csp-physical-metrics">
              <div className="cba-metric-box">
                <dt>질감 엔트로피</dt>
                <dd className="cba-num" data-testid="csp-metric-entropy">
                  {stampPreview.metrics.entropyBits.toFixed(2)} bits
                </dd>
              </div>
              <div className="cba-metric-box">
                <dt>종이 골 스킵률</dt>
                <dd className="cba-num" data-testid="csp-metric-valley-skip">
                  {Math.round(stampPreview.metrics.paperValleySkipRatio * 100)}%
                </dd>
              </div>
              <div className="cba-metric-box">
                <dt>수채 엣지 다크닝</dt>
                <dd className="cba-num" data-testid="csp-metric-edge-darkening">
                  {stampPreview.metrics.edgeDarkeningRatio.toFixed(2)}×
                </dd>
              </div>
              <div className="cba-metric-box">
                <dt>브리슬 비등방성</dt>
                <dd className="cba-num" data-testid="csp-metric-anisotropy">
                  {stampPreview.metrics.bristleAnisotropyIndex.toFixed(2)}×
                </dd>
              </div>
              <div className="cba-metric-box">
                <dt>임파스토 부조 깊이</dt>
                <dd className="cba-num" data-testid="csp-metric-impasto">
                  {Math.round(stampPreview.metrics.impastoReliefPeak * 100)}%
                </dd>
              </div>
              <div className="cba-metric-box">
                <dt>바탕 종이 결 높이</dt>
                <dd className="cba-num" data-testid="csp-metric-paper-height">
                  {selectedBrush.paperGrainLabelKo} ({Math.round(paperPeakSample * 100)}%)
                </dd>
              </div>
            </dl>

            <div className="cba-sliders">
              <div className="cba-slider-row">
                <div className="cba-slider-top">
                  <label htmlFor={`${baseId}-pressure`}>필압 강도</label>
                  <span className="cba-num">{pressurePct}%</span>
                </div>
                <input
                  id={`${baseId}-pressure`}
                  data-testid="csp-slider-pressure"
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={pressurePct}
                  onChange={(event) => setPressurePct(Number(event.currentTarget.value))}
                  className="cba-range"
                />
              </div>

              <div className="cba-slider-row">
                <div className="cba-slider-top">
                  <label htmlFor={`${baseId}-paper`}>종이 요철 씹힘</label>
                  <span className="cba-num">{effectivePaperToothPct}%</span>
                </div>
                <input
                  id={`${baseId}-paper`}
                  data-testid="csp-slider-paper-tooth"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={effectivePaperToothPct}
                  onChange={(event) => setPaperToothPct(Number(event.currentTarget.value))}
                  className="cba-range"
                />
              </div>

              <div className="cba-slider-row">
                <div className="cba-slider-top">
                  <label htmlFor={`${baseId}-mix`}>혼색 · 물감 끌림</label>
                  <span className="cba-num">{effectiveColorMixPct}%</span>
                </div>
                <input
                  id={`${baseId}-mix`}
                  data-testid="csp-slider-color-mix"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={effectiveColorMixPct}
                  onChange={(event) => setColorMixPct(Number(event.currentTarget.value))}
                  className="cba-range"
                />
              </div>

              <div className="cba-slider-row">
                <div className="cba-slider-top">
                  <label htmlFor={`${baseId}-tilt`}>펜 기울기 (틸트)</label>
                  <span className="cba-num">{tiltPct}%</span>
                </div>
                <input
                  id={`${baseId}-tilt`}
                  data-testid="csp-slider-tilt"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={tiltPct}
                  onChange={(event) => setTiltPct(Number(event.currentTarget.value))}
                  className="cba-range"
                />
              </div>
            </div>

            <div className="cba-inspector-actions">
              <button
                type="button"
                data-testid="csp-apply-brush-btn"
                className="cba-action-btn cba-action-btn-primary"
                onClick={handleApplyCurrentBrush}
              >
                {appliedBrushId === selectedBrush.id ? "현재 작업에 적용됨" : "이 브러시 작업 적용"}
              </button>
              <button
                type="button"
                data-testid="csp-reset-tuning-btn"
                className="cba-action-btn"
                onClick={handleResetTuning}
              >
                기본 물리값 복원
              </button>
              <button
                type="button"
                data-testid="csp-run-10k-soak-btn"
                className="cba-action-btn"
                onClick={handleRunSoakCheck}
              >
                10,000점 O(1) 무지연 검증
              </button>
            </div>

            {soakResult ? (
              <div
                className="cba-soak-box cba-num"
                data-testid="csp-soak-result-box"
                role="status"
                aria-live="polite"
              >
                <strong>
                  {soakResult.within60FpsBudget ? "10,000점 O(1) 무지연 통과" : "예산 초과 감지"}
                </strong>
                <div>
                  처리 포인트 {soakResult.processedPoints.toLocaleString()}점 · 생성 스탬프{" "}
                  {soakResult.emittedDabs.toLocaleString()}개 · 누락 {soakResult.droppedStrokeCount}
                  건 · NaN {soakResult.nanOutputCount}건
                </div>
                <div>
                  평균 스텝 {soakResult.avgStepMs.toFixed(4)}ms · 고정 링버퍼{" "}
                  {soakResult.peakRetainedBytes}B · 후반/초반 배율{" "}
                  {soakResult.tailToHeadRatio.toFixed(2)}×
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}

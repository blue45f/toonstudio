/**
 * 커스텀 브러시 제작 랩 패널 (`StudioBrushCustomLabPanel`).
 *
 * - props 없이 단독 렌더 가능하며 Calm Atelier / Studio 시맨틱 토큰만 사용한다.
 * - 원시 색상 코드, 전속성 전환, 브라우저 영속 키-값 저장소를 일절 사용하지 않는다.
 * - 194종 카탈로그 · 8종 실물 128×128 팁 · 5종 용지 · 갈필 · 16파장 Kubelka-Munk 혼색 실시간 `<canvas>` 프리뷰 및
 *   `.tsbrush.json` + SHA-256 핑거프린트 내보내기/검증 불러오기를 제공한다.
 */

import {
  CheckCircle2,
  Download,
  FileJson2,
  Layers,
  Palette,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  CUSTOM_LAB_PIGMENT_PAIRS,
  CUSTOM_LAB_TIP_CATALOG,
  DEFAULT_PREVIEW_HEIGHT,
  DEFAULT_PREVIEW_WIDTH,
  PAPER_TOOTH_PROFILES,
  STUDIO_PAPER_TEXTURE_IDS,
  createDefaultCustomBrushRecipe,
  createRecipeFromCatalogBrush,
  exportCustomBrushToTsBrushJson,
  filterCustomLabCatalogBrushes,
  getCustomLabCatalogBrushes,
  getCustomLabCatalogSummary,
  importCustomBrushFromTsBrushJson,
  normalizeCustomBrushRecipe,
  renderCustomBrushStrokePreview,
  rgbToCssOklch,
  type CustomBrushRecipe,
  type RealMediaTipId,
  type StudioPaperTextureId,
} from "./brush-custom-lab-engine";

export interface StudioBrushCustomLabPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialCatalogBrushUid?: string;
  readonly initialRecipe?: CustomBrushRecipe;
  readonly className?: string;
  readonly onRecipeChange?: (recipe: CustomBrushRecipe, fingerprintSha256: string) => void;
  readonly onApplyRecipe?: (recipe: CustomBrushRecipe, fingerprintSha256: string) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const CHIP_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent text-on-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_BTN = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent [word-break:keep-all] transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const SECONDARY_BTN = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised ${FOCUS_RING}`;

const PAPER_LABELS_EN: Readonly<Record<StudioPaperTextureId, string>> = Object.freeze({
  "smooth-bristol": "Smooth Bristol",
  "cold-press-watercolor": "Cold-Press Watercolor",
  "rough-cotton": "Rough Cotton 300g",
  "manga-kent": "Manga Kent 135kg",
  "linen-canvas": "Linen Oil Canvas",
});

const DRYOUT_PHASE_LABELS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  saturated: ["포화", "Saturated"],
  balanced: ["균형", "Balanced"],
  "dry-split": ["갈필 분리", "Dry Split"],
  starved: ["고갈 갈필", "Starved"],
});

interface RangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly displayValue: string;
  readonly testId: string;
  readonly onChange: (next: number) => void;
}

function LabRangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  testId,
  onChange,
}: RangeControlProps): ReactElement {
  return (
    <label htmlFor={id} className="grid gap-1 rounded-lg border border-line bg-canvas px-3 py-2">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <strong className="font-semibold text-fg tabular-nums">{displayValue}</strong>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={displayValue}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </label>
  );
}

function resolveInitialRecipe(
  initialRecipe?: CustomBrushRecipe,
  initialCatalogBrushUid?: string,
): CustomBrushRecipe {
  if (initialRecipe) return normalizeCustomBrushRecipe(initialRecipe);
  if (initialCatalogBrushUid) {
    const found = getCustomLabCatalogBrushes().find((item) => item.uid === initialCatalogBrushUid);
    if (found) return createRecipeFromCatalogBrush(found);
  }
  return createDefaultCustomBrushRecipe();
}

/**
 * 실시간 128×128 팁·5종 용지·갈필·16파장 Kubelka-Munk 혼색 프리뷰와 `.tsbrush.json` SHA-256 직렬화를 제공하는 커스텀 브러시 랩.
 */
export function StudioBrushCustomLabPanel({
  locale,
  initialCatalogBrushUid,
  initialRecipe,
  className,
  onRecipeChange,
  onApplyRecipe,
}: StudioBrushCustomLabPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const catalogSummary = useMemo(() => getCustomLabCatalogSummary(), []);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [recipe, setRecipe] = useState<CustomBrushRecipe>(() =>
    resolveInitialRecipe(initialRecipe, initialCatalogBrushUid),
  );
  const [jsonBuffer, setJsonBuffer] = useState<string>(
    () => exportCustomBrushToTsBrushJson(resolveInitialRecipe(initialRecipe, initialCatalogBrushUid)).json,
  );
  const [ioStatus, setIoStatus] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const filteredCatalog = useMemo(
    () => filterCustomLabCatalogBrushes({ query: catalogQuery }),
    [catalogQuery],
  );
  const exportBundle = useMemo(() => exportCustomBrushToTsBrushJson(recipe), [recipe]);
  const preview = useMemo(
    () => renderCustomBrushStrokePreview(recipe, { width: DEFAULT_PREVIEW_WIDTH, height: DEFAULT_PREVIEW_HEIGHT }),
    [recipe],
  );

  useEffect(() => {
    onRecipeChange?.(recipe, exportBundle.fingerprintSha256);
  }, [exportBundle.fingerprintSha256, onRecipeChange, recipe]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.putImageData !== "function") return;
    const pixels = new Uint8ClampedArray(preview.rgba);
    ctx.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
  }, [preview]);

  const updateRecipe = (patch: Partial<CustomBrushRecipe>): void => {
    setRecipe((prev) => normalizeCustomBrushRecipe({ ...prev, ...patch }));
  };

  const handleSelectCatalogBrush = (brushUid: string): void => {
    const found = getCustomLabCatalogBrushes().find((item) => item.uid === brushUid);
    if (!found) return;
    const next = createRecipeFromCatalogBrush(found);
    setRecipe(next);
    setJsonBuffer(exportCustomBrushToTsBrushJson(next).json);
    setIoStatus({
      kind: "ok",
      text: pick(
        `카탈로그 브러시 "${found.nameKo}" 물리 프로필을 불러왔습니다.`,
        `Loaded catalog brush "${found.nameEn}" physical profile.`,
      ),
    });
  };

  const handleSelectTip = (tipId: RealMediaTipId): void => {
    const meta = CUSTOM_LAB_TIP_CATALOG.find((item) => item.id === tipId);
    updateRecipe({
      tipId,
      mediaCategory: meta?.defaultMediaCategory ?? recipe.mediaCategory,
    });
  };

  const handleSelectPaper = (paperTextureId: StudioPaperTextureId): void => {
    updateRecipe({ paperTextureId });
  };

  const handleExportTsBrush = (): void => {
    const exported = exportCustomBrushToTsBrushJson(recipe);
    setJsonBuffer(exported.json);
    if (
      typeof document !== "undefined" &&
      typeof window !== "undefined" &&
      !/jsdom/iu.test(window.navigator?.userAgent ?? "") &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof Blob !== "undefined"
    ) {
      try {
        const blob = new Blob([exported.json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.fileName;
        anchor.click();
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      } catch {
        // 헤드리스/테스트 환경에서는 텍스트 버퍼 출력으로 안전하게 폴백한다.
      }
    }
    setIoStatus({
      kind: "ok",
      text: pick(
        `${exported.fileName} 생성 완료 · SHA-256 ${exported.fingerprintSha256.slice(0, 12)}…`,
        `Exported ${exported.fileName} · SHA-256 ${exported.fingerprintSha256.slice(0, 12)}…`,
      ),
    });
  };

  const handleImportRawJson = (rawText: string): void => {
    const result = importCustomBrushFromTsBrushJson(rawText);
    if (!result.ok) {
      setIoStatus({ kind: "error", text: isKo ? result.messageKo : result.messageEn });
      return;
    }
    setRecipe(result.recipe);
    setJsonBuffer(exportCustomBrushToTsBrushJson(result.recipe).json);
    setIoStatus({
      kind: "ok",
      text: pick(
        `SHA-256 무결성 검증 통과 · "${result.recipe.nameKo}" 레시피를 복원했습니다.`,
        `SHA-256 verified · Restored "${result.recipe.nameEn}" recipe.`,
      ),
    });
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => {
        setJsonBuffer(text);
        handleImportRawJson(text);
      })
      .catch(() => {
        setIoStatus({
          kind: "error",
          text: pick(".tsbrush.json 파일을 읽지 못했습니다.", "Failed to read .tsbrush.json file."),
        });
      });
    event.currentTarget.value = "";
  };

  const handleReset = (): void => {
    const defaults = createDefaultCustomBrushRecipe();
    setRecipe(defaults);
    setJsonBuffer(exportCustomBrushToTsBrushJson(defaults).json);
    setIoStatus(null);
  };

  const dryoutPhasePair = DRYOUT_PHASE_LABELS[preview.dryoutEnd.phase] ?? ["균형", "Balanced"];
  const kmMixOklch = rgbToCssOklch(preview.kmMixSummary.color);
  const srgbMixOklch = rgbToCssOklch(preview.kmMixSummary.srgbLerp);

  return (
    <section
      aria-label={pick("커스텀 브러시 제작 랩", "Custom Brush Lab")}
      data-studio-brush-custom-lab="true"
      data-tsbrush-sha256={exportBundle.fingerprintSha256}
      className={`grid gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <SlidersHorizontal size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{pick("커스텀 브러시 제작 랩", "Custom Brush Lab")}</span>
          </h2>
          <p className="mt-1 text-xs text-fg-2 tabular-nums">
            {pick(
              `${catalogSummary.totalBrushes}종 카탈로그 · ${catalogSummary.tipCount}종 128×128 팁 · ${catalogSummary.paperCount}종 용지 · ${catalogSummary.kmWavelengthBands}파장 Kubelka-Munk`,
              `${catalogSummary.totalBrushes} catalog brushes · ${catalogSummary.tipCount} 128×128 tips · ${catalogSummary.paperCount} papers · ${catalogSummary.kmWavelengthBands}-band Kubelka-Munk`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="tsbrush-sha-badge"
            title={`SHA-256: ${exportBundle.fingerprintSha256}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-canvas px-3 text-xs font-medium text-fg-2 tabular-nums"
          >
            SHA-256 · {exportBundle.fingerprintSha256.slice(0, 12)}
          </span>
          <button type="button" onClick={handleReset} className={SECONDARY_BTN}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>{pick("기본값 복원", "Reset")}</span>
          </button>
          {onApplyRecipe ? (
            <button
              type="button"
              onClick={() => onApplyRecipe(recipe, exportBundle.fingerprintSha256)}
              className={PRIMARY_BTN}
            >
              <span>{pick("브러시 적용", "Apply Brush")}</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* 실시간 RGBA 스트로크 프리뷰 캔버스 및 물리 계측 */}
      <div className="grid gap-3 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">
            {pick("실시간 물리 스트로크 프리뷰 (좌: 순색 · 우: 16파장 KM 교차 혼색)", "Live Physical Stroke Preview (Left: Primary · Right: 16-Band KM Cross-Mix)")}
          </span>
          <span className="text-xs text-fg-3 tabular-nums">
            {preview.width}×{preview.height} · {preview.dabCount} dabs · {preview.renderElapsedMs.toFixed(1)}ms
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={preview.width}
          height={preview.height}
          data-testid="brush-custom-lab-preview-canvas"
          aria-label={pick("커스텀 브러시 실시간 스트로크 미리보기", "Live custom brush stroke preview")}
          className="h-28 w-full rounded-lg border border-line-strong bg-canvas object-contain"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-line bg-canvas p-2 text-xs tabular-nums">
            <span className="block text-fg-3">{pick("유효 피복률", "Stroke Coverage")}</span>
            <strong data-testid="lab-coverage-metric" className="text-fg">
              {(preview.coverageRatio01 * 100).toFixed(1)}% ({preview.activePixels.toLocaleString()}px)
            </strong>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-2 text-xs tabular-nums">
            <span className="block text-fg-3">{pick("갈필 잔량 · 단계", "Dry-Out Load · Phase")}</span>
            <strong data-testid="lab-dryout-metric" className="text-fg">
              {Math.round(preview.dryoutStart.paintRemaining01 * 100)}% → {Math.round(preview.dryoutEnd.paintRemaining01 * 100)}% · {isKo ? dryoutPhasePair[0] : dryoutPhasePair[1]}
            </strong>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-2 text-xs tabular-nums">
            <span className="block text-fg-3">{pick("16파장 KM 채도 vs sRGB", "16-Band KM vs sRGB")}</span>
            <strong data-testid="lab-km-metric" className="text-good">
              {(preview.kmMixSummary.kmSaturation * 100).toFixed(0)}% / {(preview.kmMixSummary.lerpSaturation * 100).toFixed(0)}%
            </strong>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-2 text-xs tabular-nums">
            <span className="block text-fg-3">{pick("용지 마찰 · 요철", "Paper Drag · Tooth")}</span>
            <strong data-testid="lab-paper-metric" className="text-fg">
              {(preview.paperResistance.dragForce01 * 100).toFixed(0)}% · {(preview.paperProfile.toothDepth01 * 100).toFixed(0)}%
            </strong>
          </div>
        </div>
      </div>

      {/* 194종 카탈로그 베이스 브러시 선택 */}
      <div className="grid gap-2 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${uid}-catalog-select`} className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Layers size={15} className="text-accent" aria-hidden="true" />
            <span>{pick("베이스 카탈로그 브러시 (194종)", "Base Catalog Brush (194 Presets)")}</span>
          </label>
          <span data-testid="lab-catalog-count" className="text-xs text-fg-3 tabular-nums">
            {pick(
              `${filteredCatalog.length} / ${catalogSummary.totalBrushes}종 표시`,
              `${filteredCatalog.length} / ${catalogSummary.totalBrushes} shown`,
            )}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="search"
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.currentTarget.value)}
            placeholder={pick("카탈로그 검색 (예: 수채, G펜, 유화, 연필)", "Search catalog (e.g. watercolor, gpen, oil)")}
            aria-label={pick("카탈로그 브러시 검색", "Search catalog brushes")}
            className={`min-h-11 rounded-lg border border-line-strong bg-canvas px-3 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
          <select
            id={`${uid}-catalog-select`}
            value={recipe.baseCatalogUid ?? ""}
            onChange={(event) => handleSelectCatalogBrush(event.currentTarget.value)}
            aria-label={pick("베이스 카탈로그 브러시 선택", "Select base catalog brush")}
            data-testid="lab-catalog-select"
            className={`min-h-11 rounded-lg border border-line-strong bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`}
          >
            <option value="">{pick("사용자 정의 레시피", "Custom Recipe")}</option>
            {filteredCatalog.map((item) => (
              <option key={item.uid} value={item.uid}>
                {isKo ? `${item.nameKo} (${item.sourceCatalog})` : `${item.nameEn} (${item.sourceCatalog})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 8종 실물 128×128 팁 + 5종 용지 선택 */}
      <div className="grid gap-3 md:grid-cols-2">
        <fieldset className="grid gap-2 rounded-xl border border-line bg-card p-3">
          <legend className="px-1 text-xs font-semibold text-fg">
            {pick("실물 128×128 팁 아틀라스 (8종)", "Real-Media 128×128 Tip Atlas (8)")}
          </legend>
          <div className="grid grid-cols-2 gap-1.5">
            {CUSTOM_LAB_TIP_CATALOG.map((tip) => {
              const active = recipe.tipId === tip.id;
              return (
                <button
                  key={tip.id}
                  type="button"
                  aria-pressed={active}
                  data-lab-tip-id={tip.id}
                  onClick={() => handleSelectTip(tip.id)}
                  title={isKo ? tip.summaryKo : tip.summaryEn}
                  className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  <span>{isKo ? tip.labelKo : tip.labelEn}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-2 rounded-xl border border-line bg-card p-3">
          <legend className="px-1 text-xs font-semibold text-fg">
            {pick("종이 물리 프로필 (5종)", "Paper Tooth Physics (5)")}
          </legend>
          <div className="grid gap-1.5">
            {STUDIO_PAPER_TEXTURE_IDS.map((paperId) => {
              const profile = PAPER_TOOTH_PROFILES[paperId];
              const active = recipe.paperTextureId === paperId;
              return (
                <button
                  key={paperId}
                  type="button"
                  aria-pressed={active}
                  data-lab-paper-id={paperId}
                  onClick={() => handleSelectPaper(paperId)}
                  title={profile.descriptionKo}
                  className={`${CHIP_BASE} justify-between ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  <span>{isKo ? profile.labelKo : PAPER_LABELS_EN[paperId]}</span>
                  <span className="tabular-nums opacity-85">
                    {Math.round(profile.toothDepth01 * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* 팁 · 용지 · 갈필 · 16파장 광학 혼색 슬라이더 */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <LabRangeControl
          id={`${uid}-radius`}
          label={pick("팁 반경", "Tip Radius")}
          value={recipe.radiusPx}
          min={4}
          max={28}
          step={1}
          displayValue={`${recipe.radiusPx}px`}
          testId="slider-radius"
          onChange={(radiusPx) => updateRecipe({ radiusPx })}
        />
        <LabRangeControl
          id={`${uid}-spacing`}
          label={pick("스탬프 간격", "Stamp Spacing")}
          value={recipe.spacingRatio}
          min={0.06}
          max={0.45}
          step={0.01}
          displayValue={`${Math.round(recipe.spacingRatio * 100)}%`}
          testId="slider-spacing"
          onChange={(spacingRatio) => updateRecipe({ spacingRatio })}
        />
        <LabRangeControl
          id={`${uid}-flow`}
          label={pick("안료 유량", "Pigment Flow")}
          value={recipe.flow01}
          min={0.1}
          max={1}
          step={0.02}
          displayValue={`${Math.round(recipe.flow01 * 100)}%`}
          testId="slider-flow"
          onChange={(flow01) => updateRecipe({ flow01 })}
        />
        <LabRangeControl
          id={`${uid}-grain`}
          label={pick("용지 결 포착", "Paper Grain Catch")}
          value={recipe.paperGrainStrength01}
          min={0}
          max={1}
          step={0.02}
          displayValue={`${Math.round(recipe.paperGrainStrength01 * 100)}%`}
          testId="slider-grain"
          onChange={(paperGrainStrength01) => updateRecipe({ paperGrainStrength01 })}
        />
        <LabRangeControl
          id={`${uid}-dryout`}
          label={pick("갈필 고갈 속도 (Dry-Out)", "Dry-Out Depletion")}
          value={recipe.dryOutRate01}
          min={0}
          max={1}
          step={0.02}
          displayValue={`${Math.round(recipe.dryOutRate01 * 100)}%`}
          testId="slider-dryout"
          onChange={(dryOutRate01) => updateRecipe({ dryOutRate01 })}
        />
        <LabRangeControl
          id={`${uid}-km`}
          label={pick("16파장 KM 광학 혼색", "16-Band KM Optical Mix")}
          value={recipe.kmMixStrength01}
          min={0}
          max={1}
          step={0.02}
          displayValue={`${Math.round(recipe.kmMixStrength01 * 100)}%`}
          testId="slider-km-mix"
          onChange={(kmMixStrength01) => updateRecipe({ kmMixStrength01 })}
        />
        <LabRangeControl
          id={`${uid}-wet-edge`}
          label={pick("웨트 엣지 번짐", "Wet Edge Bloom")}
          value={recipe.wetEdgeBloom01}
          min={0}
          max={1}
          step={0.02}
          displayValue={`${Math.round(recipe.wetEdgeBloom01 * 100)}%`}
          testId="slider-wet-edge"
          onChange={(wetEdgeBloom01) => updateRecipe({ wetEdgeBloom01 })}
        />
      </div>

      {/* 16파장 안료 쌍 선택 (OKLCH 스와치 — 원시 hex/rgb 0건) */}
      <div className="grid gap-2 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Palette size={15} className="text-accent" aria-hidden="true" />
            <span>{pick("안료 교차 혼색 스와치 (KM vs sRGB)", "Pigment Cross-Mix Swatch (KM vs sRGB)")}</span>
          </span>
          <div className="flex items-center gap-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-full border border-line-strong"
                style={{ backgroundColor: kmMixOklch }}
              />
              <span>KM</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-full border border-line-strong"
                style={{ backgroundColor: srgbMixOklch }}
              />
              <span>sRGB</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_LAB_PIGMENT_PAIRS.map((pair) => {
            const active =
              recipe.primaryColor.r === pair.primary.r &&
              recipe.primaryColor.g === pair.primary.g &&
              recipe.primaryColor.b === pair.primary.b &&
              recipe.underlayerColor.r === pair.underlayer.r;
            return (
              <button
                key={pair.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateRecipe({ primaryColor: pair.primary, underlayerColor: pair.underlayer })}
                className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-3.5 rounded-full border border-line-strong"
                  style={{ backgroundColor: rgbToCssOklch(pair.primary) }}
                />
                <span
                  aria-hidden="true"
                  className="inline-block size-3.5 rounded-full border border-line-strong"
                  style={{ backgroundColor: rgbToCssOklch(pair.underlayer) }}
                />
                <span>{isKo ? pair.labelKo : pair.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 결정론적 `.tsbrush.json` 내보내기 및 SHA-256 무결성 검증 불러오기 */}
      <div className="grid gap-2.5 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${uid}-tsbrush-json`} className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <FileJson2 size={15} className="text-accent" aria-hidden="true" />
            <span>{pick(".tsbrush.json 결정론적 내보내기 · SHA-256 불러오기", "Deterministic .tsbrush.json Export & SHA-256 Import")}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="tsbrush-export-btn"
              onClick={handleExportTsBrush}
              className={PRIMARY_BTN}
            >
              <Download size={15} aria-hidden="true" />
              <span>{pick(".tsbrush.json 내보내기", "Export .tsbrush.json")}</span>
            </button>
            <button
              type="button"
              data-testid="tsbrush-import-btn"
              onClick={() => handleImportRawJson(jsonBuffer)}
              className={SECONDARY_BTN}
            >
              <Upload size={15} aria-hidden="true" />
              <span>{pick("SHA-256 검증 불러오기", "Verify & Import")}</span>
            </button>
            <label className={SECONDARY_BTN}>
              <Upload size={15} aria-hidden="true" />
              <span>{pick("파일 열기", "Open File")}</span>
              <input
                type="file"
                accept=".json,.tsbrush.json,application/json"
                onChange={handleFileUpload}
                aria-label={pick(".tsbrush.json 파일 선택", "Choose .tsbrush.json file")}
                className="sr-only"
              />
            </label>
          </div>
        </div>
        <textarea
          id={`${uid}-tsbrush-json`}
          rows={6}
          value={jsonBuffer}
          onChange={(event) => setJsonBuffer(event.currentTarget.value)}
          spellCheck={false}
          data-testid="tsbrush-json-textarea"
          aria-label={pick(".tsbrush.json 직렬화 본문", ".tsbrush.json payload")}
          className={`w-full rounded-lg border border-line-strong bg-canvas p-2.5 font-mono text-xs text-fg tabular-nums ${FOCUS_RING}`}
        />
        {ioStatus ? (
          <p
            role={ioStatus.kind === "error" ? "alert" : "status"}
            data-testid="tsbrush-io-status"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              ioStatus.kind === "error"
                ? "border-bad bg-canvas text-bad"
                : "border-good bg-canvas text-good"
            }`}
          >
            {ioStatus.kind === "error" ? (
              <ShieldAlert size={15} className="shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
            )}
            <span>{ioStatus.text}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

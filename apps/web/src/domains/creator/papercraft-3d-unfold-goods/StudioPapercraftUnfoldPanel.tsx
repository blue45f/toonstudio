/**
 * Wave 54B — 종이로 만드는 3D 페이퍼크래프트 전개도 & 웹툰 굿즈 디오라마 스튜디오 패널.
 *
 * - 5종 웹툰 굿즈·배경 3D 로우폴리 프리셋 선택 및 용지 규격(A4/A3/Letter)·평량(180/250/300gsm)·배율·접힘(0%~100%) 제어
 * - 순수 시맨틱 SVG 2단 프리뷰:
 *   좌: 재단 실선·산접기 파선·골접기 일점쇄선·페어 번호 풀칠 탭 2D 전개도 도면
 *   우: 0°→90° 실시간 강체 접힘·종이 두께 림·바닥 그림자 입체 디오라마 프리뷰
 * - 1:1 mm 인쇄용 SVG 도면 및 JSON 매니페스트 복사/미리보기 (OKLCH·currentColor 전용, 원시 색·바이올렛 0%)
 */

import {
  Box, CheckCircle2, Code2, Copy, FileCode2, Layers, Printer, RotateCcw, Ruler, Scissors, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  MOUNTAIN_FOLD_DASH, PAPERCRAFT_MODEL_PRESETS, PAPER_SIZE_SPECS, PAPER_WEIGHT_SPECS, VALLEY_FOLD_DASH,
  evaluatePaperFoldPreview, exportPapercraftDielineSvg, exportPapercraftManifestJson, formatOklch,
  getPapercraftPreset, unfoldPapercraftDieline,
  type AssemblyDifficulty, type PaperFoldPreviewResult, type PaperSizeId, type PaperWeightGsm,
  type PapercraftDielineResult, type PapercraftPresetId, type Vec2,
} from "./papercraft-unfold-engine";

export interface StudioPapercraftUnfoldPanelProps {
  readonly initialPresetId?: PapercraftPresetId;
  readonly initialPaperSize?: PaperSizeId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onExportSvg?: (svg: string, dieline: PapercraftDielineResult) => void;
  readonly onExportJson?: (json: string, dieline: PapercraftDielineResult, preview: PaperFoldPreviewResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_PAPER_BG = formatOklch({ l: 0.98, c: 0.006, h: 92 });
const SVG_MARGIN_GUIDE = formatOklch({ l: 0.68, c: 0.014, h: 230 }, 0.55);
const SVG_TAB_FILL = formatOklch({ l: 0.91, c: 0.028, h: 82 }, 0.92);
const SVG_CUT_INK = formatOklch({ l: 0.2, c: 0.015, h: 240 });
const SVG_MOUNTAIN_INK = formatOklch({ l: 0.55, c: 0.18, h: 28 });
const SVG_VALLEY_INK = formatOklch({ l: 0.5, c: 0.145, h: 226 });
const SVG_MAT_BG = formatOklch({ l: 0.94, c: 0.012, h: 165 });
const SVG_MAT_GRID = formatOklch({ l: 0.78, c: 0.024, h: 168 }, 0.45);
const SVG_SHADOW_FILL = formatOklch({ l: 0.28, c: 0.018, h: 235 }, 0.2);
const SVG_HUD_BG = formatOklch({ l: 0.18, c: 0.014, h: 238 }, 0.84);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.005, h: 90 });

function toPointsAttr(pts: readonly Vec2[], origin: Vec2 = { x: 0, y: 0 }): string {
  return pts.map((p) => `${Math.round((p.x - origin.x) * 100) / 100},${Math.round((p.y - origin.y) * 100) / 100}`).join(" ");
}

function difficultyBadgeClass(diff: AssemblyDifficulty): string {
  if (diff === "beginner") return "border-good bg-good-soft text-good";
  if (diff === "intermediate") return "border-accent bg-accent-soft text-accent";
  return "border-warn bg-warning-soft text-warn";
}

function DielineBlueprintSvg(props: {
  readonly dieline: PapercraftDielineResult;
  readonly activePageIndex: number;
  readonly isEn: boolean;
}): ReactElement {
  const { dieline, activePageIndex, isEn } = props;
  const pageIdx = Math.min(Math.max(0, activePageIndex), dieline.totalPages - 1);
  const origin = dieline.pages[pageIdx]?.sheetOriginMm ?? { x: 0, y: 0 };
  const { widthMm, heightMm, printableMarginMm } = dieline.paperSpec;

  const faces = dieline.faces.filter((f) => f.pageIndex === pageIdx);
  const tabs = dieline.glueTabs.filter((t) => t.pageIndex === pageIdx);
  const targetTabs = dieline.glueTabs.filter((t) => t.targetPageIndex === pageIdx);
  const cuts = dieline.cutEdges.filter((e) => e.pageIndex === pageIdx);
  const mountains = dieline.mountainFoldEdges.filter((e) => e.pageIndex === pageIdx);
  const valleys = dieline.valleyFoldEdges.filter((e) => e.pageIndex === pageIdx);

  return (
    <svg
      data-testid="papercraft-dieline-svg" data-preset-id={dieline.preset.id} data-paper-size={dieline.paperSpec.id}
      data-paper-gsm={dieline.paperCompensation.gsm} data-total-pages={dieline.totalPages} data-active-page={pageIdx + 1}
      data-cut-count={dieline.cutEdges.length} data-mountain-count={dieline.mountainFoldEdges.length}
      data-valley-count={dieline.valleyFoldEdges.length} data-tab-count={dieline.glueTabs.length}
      data-pairs-matched={String(dieline.pairIntegrity.allPairsMatched)} data-violet-free="true"
      viewBox={`0 0 ${widthMm} ${heightMm}`} role="img"
      aria-label={isEn ? `2D printable papercraft dieline for ${dieline.preset.nameEn} on ${dieline.paperSpec.id}` : `${dieline.preset.nameKo} ${dieline.paperSpec.id} 2D 페이퍼크래프트 전개도 칼선 도면`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width={widthMm} height={heightMm} fill={SVG_PAPER_BG} stroke={SVG_MARGIN_GUIDE} strokeWidth="0.6" />
      <rect x={printableMarginMm} y={printableMarginMm} width={widthMm - printableMarginMm * 2} height={heightMm - printableMarginMm * 2} fill="none" stroke={SVG_MARGIN_GUIDE} strokeWidth="0.5" strokeDasharray="3 3" />
      <g>
        {faces.map((f) => <polygon key={f.faceId} points={toPointsAttr(f.polygonMm, origin)} fill={formatOklch(f.colorOklch, 0.36)} stroke="none" />)}
      </g>
      <g>
        {tabs.map((t) => <polygon key={t.tabId} points={toPointsAttr(t.polygonMm, origin)} fill={SVG_TAB_FILL} stroke={SVG_CUT_INK} strokeWidth="0.55" />)}
      </g>
      <g fill="none" stroke={SVG_MOUNTAIN_INK} strokeWidth="0.85" strokeDasharray={MOUNTAIN_FOLD_DASH}>
        {mountains.map((e) => <line key={e.id} x1={e.startMm.x - origin.x} y1={e.startMm.y - origin.y} x2={e.endMm.x - origin.x} y2={e.endMm.y - origin.y} />)}
      </g>
      <g fill="none" stroke={SVG_VALLEY_INK} strokeWidth="0.85" strokeDasharray={VALLEY_FOLD_DASH}>
        {valleys.map((e) => <line key={e.id} x1={e.startMm.x - origin.x} y1={e.startMm.y - origin.y} x2={e.endMm.x - origin.x} y2={e.endMm.y - origin.y} />)}
      </g>
      <g fill="none" stroke={SVG_CUT_INK} strokeWidth="1.05" strokeLinecap="round">
        {cuts.map((e) => <line key={e.id} x1={e.startMm.x - origin.x} y1={e.startMm.y - origin.y} x2={e.endMm.x - origin.x} y2={e.endMm.y - origin.y} />)}
      </g>
      <g fill={SVG_CUT_INK} fontFamily="monospace" fontSize="4.6" fontWeight="700" textAnchor="middle" dominantBaseline="central">
        {tabs.map((t) => <text key={`lbl-${t.tabId}`} x={t.labelPosMm.x - origin.x} y={t.labelPosMm.y - origin.y}>{t.pairNumber}</text>)}
        {targetTabs.map((t) => <text key={`tgt-${t.tabId}`} x={t.targetLabelPosMm.x - origin.x} y={t.targetLabelPosMm.y - origin.y} fillOpacity={0.72}>{t.pairNumber}</text>)}
      </g>
      <rect x={printableMarginMm} y={heightMm - 15} width={widthMm - printableMarginMm * 2} height="11" rx="2.2" fill={SVG_HUD_BG} />
      <text x={printableMarginMm + 4} y={heightMm - 8.2} fill={SVG_HUD_TEXT} fontSize="4.6" fontFamily="monospace" fontWeight="700">
        {`${dieline.paperSpec.id} (${pageIdx + 1}/${dieline.totalPages}) · ${dieline.paperCompensation.gsm}gsm · ${isEn ? "CUT / MTN / VAL" : "재단·산접기·골접기"} · TAB ${dieline.glueTabs.length}`}
      </text>
    </svg>
  );
}

function PaperFoldPreviewSvg(props: {
  readonly preview: PaperFoldPreviewResult; readonly presetName: string; readonly thicknessMm: number; readonly isEn: boolean;
}): ReactElement {
  const { preview, presetName, thicknessMm, isEn } = props;
  const uid = useId();
  const matPatternId = `${uid}-mat-grid`;
  const foldPct = Math.round(preview.foldProgress * 100);
  const shadowOpacity = preview.foldProgress > 0.02 ? Math.min(0.32, 0.08 + preview.foldProgress * 0.22) : 0.06;

  return (
    <svg
      data-testid="papercraft-fold-preview-svg" data-preset-id={preview.presetId} data-fold-progress={preview.foldProgress.toFixed(2)}
      data-fold-angle-deg={preview.foldAngleDeg.toFixed(1)} data-max-elevation-mm={preview.maxElevationMm.toFixed(1)}
      data-paper-thickness-px={preview.paperThicknessPx.toFixed(2)} data-face-count={preview.faces.length} data-violet-free="true"
      viewBox={`0 0 ${preview.viewportWidth} ${preview.viewportHeight}`} role="img"
      aria-label={isEn ? `3D paper fold preview for ${presetName} at ${foldPct}% fold progress` : `${presetName} ${foldPct}% 접힘 진행 실시간 입체 페이퍼 디오라마 프리뷰`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <pattern id={matPatternId} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke={SVG_MAT_GRID} strokeWidth="0.65" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={preview.viewportWidth} height={preview.viewportHeight} fill={SVG_MAT_BG} />
      <rect x="0" y="0" width={preview.viewportWidth} height={preview.viewportHeight} fill={`url(#${matPatternId})`} />
      <g fill={SVG_SHADOW_FILL} fillOpacity={shadowOpacity}>
        {preview.faces.map((f) => <polygon key={`shd-${f.faceId}`} points={toPointsAttr(f.shadowPoints)} />)}
      </g>
      <g>
        {preview.faces.map((f) => (
          <g key={`fold-${f.faceId}`}>
            <polygon points={toPointsAttr(f.rimOffsetPoints)} fill={f.rimOklch} fillOpacity={0.78} stroke="none" />
            <polygon points={toPointsAttr(f.screenPoints)} fill={f.fillOklch} stroke={f.strokeOklch} strokeWidth="1.05" strokeLinejoin="round" />
          </g>
        ))}
      </g>
      <rect x="10" y="10" width="164" height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y="24" fill={SVG_HUD_TEXT} fontSize="9.5" fontWeight="700">{isEn ? `FOLD ${foldPct}% (${preview.foldAngleDeg}°)` : `접힘 ${foldPct}% (${preview.foldAngleDeg}°)`}</text>
      <rect x="10" y={preview.viewportHeight - 32} width={preview.viewportWidth - 20} height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y={preview.viewportHeight - 18} fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">{`H ${preview.maxElevationMm}mm · ${preview.paperWeightGsm}gsm (${thicknessMm}mm) · YAW ${preview.cameraYawDeg}°`}</text>
    </svg>
  );
}

/** 3D 페이퍼크래프트 전개도 생성 & 실시간 접힘 웹툰 굿즈 디오라마 스튜디오 패널. */
export function StudioPapercraftUnfoldPanel(props: StudioPapercraftUnfoldPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const initialPreset = getPapercraftPreset(props.initialPresetId ?? "chibi-hero-cube");
  const initialPaperSize: PaperSizeId = props.initialPaperSize ?? "A4";

  const [presetId, setPresetId] = useState<PapercraftPresetId>(initialPreset.id);
  const [paperSize, setPaperSize] = useState<PaperSizeId>(initialPaperSize);
  const [paperWeightGsm, setPaperWeightGsm] = useState<PaperWeightGsm>(initialPreset.recommendedPaperWeight);
  const [scale, setScale] = useState<number>(1.0);
  const [foldProgress, setFoldProgress] = useState<number>(0.72);
  const [cameraYawDeg, setCameraYawDeg] = useState<number>(initialPreset.defaultCameraYawDeg);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [sourceDrawer, setSourceDrawer] = useState<"closed" | "svg" | "json">("closed");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const activePreset = getPapercraftPreset(presetId);

  const dieline = useMemo(
    () => unfoldPapercraftDieline({ presetId, paperSize, paperWeightGsm, scale }),
    [presetId, paperSize, paperWeightGsm, scale],
  );
  const foldPreview = useMemo(
    () => evaluatePaperFoldPreview({ presetId, foldProgress, paperWeightGsm, scale, cameraYawDeg }),
    [presetId, foldProgress, paperWeightGsm, scale, cameraYawDeg],
  );
  const dielineSvgText = useMemo(() => exportPapercraftDielineSvg(dieline), [dieline]);
  const manifestJsonText = useMemo(() => exportPapercraftManifestJson(dieline, foldPreview), [dieline, foldPreview]);

  const safePageIndex = Math.min(activePageIndex, Math.max(0, dieline.totalPages - 1));

  const copyToClipboard = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleSelectPreset = (nextId: PapercraftPresetId): void => {
    const next = getPapercraftPreset(nextId);
    setPresetId(next.id);
    setPaperWeightGsm(next.recommendedPaperWeight);
    setCameraYawDeg(next.defaultCameraYawDeg);
    setActivePageIndex(0);
    setStatusMessage(
      pick(
        `'${next.nameKo}' 전개도를 생성했습니다(권장 ${next.recommendedPaperWeight}gsm).`,
        `Unfolded '${next.nameEn}' dieline (recommended ${next.recommendedPaperWeight}gsm).`,
      ),
    );
  };

  const handleSelectPaperSize = (nextSize: PaperSizeId): void => {
    setPaperSize(nextSize);
    setActivePageIndex(0);
    setStatusMessage(pick(`용지 규격을 ${nextSize}로 전환했습니다.`, `Switched sheet size to ${nextSize}.`));
  };

  const handleSelectWeight = (gsm: PaperWeightGsm): void => {
    setPaperWeightGsm(gsm);
    setStatusMessage(
      pick(
        `종이 평량을 ${gsm}gsm으로 변경해 접힘 공차와 풀칠 탭 폭을 자동 보정했습니다.`,
        `Adjusted bend allowance and glue tab width for ${gsm}gsm cardstock.`,
      ),
    );
  };

  const handleExportSvg = (): void => {
    copyToClipboard(dielineSvgText);
    setSourceDrawer("svg");
    props.onExportSvg?.(dielineSvgText, dieline);
    setStatusMessage(
      pick(
        `1:1 mm 인쇄용 SVG 도면(${dieline.paperSpec.id} · ${dieline.totalPages}쪽)을 복사했습니다.`,
        `Copied 1:1 mm printable SVG dieline (${dieline.paperSpec.id} · ${dieline.totalPages}p).`,
      ),
    );
  };

  const handleExportJson = (): void => {
    copyToClipboard(manifestJsonText);
    setSourceDrawer("json");
    props.onExportJson?.(manifestJsonText, dieline, foldPreview);
    setStatusMessage(
      pick("전개도·접힘 JSON 매니페스트를 복사했습니다.", "Copied papercraft dieline & fold JSON manifest."),
    );
  };

  const handleReset = (): void => {
    setPresetId(initialPreset.id);
    setPaperSize(initialPaperSize);
    setPaperWeightGsm(initialPreset.recommendedPaperWeight);
    setScale(1.0);
    setFoldProgress(0.72);
    setCameraYawDeg(initialPreset.defaultCameraYawDeg);
    setActivePageIndex(0);
    setSourceDrawer("closed");
    setStatusMessage(pick("초기 프리셋과 기본 종이 설정으로 되돌렸습니다.", "Reset preset and cardstock settings to defaults."));
  };

  return (
    <section
      data-testid="papercraft-unfold-panel"
      aria-label={pick("3D 페이퍼크래프트 전개도 및 웹툰 굿즈 디오라마 스튜디오", "3D Papercraft Dieline & Webtoon Goods Studio")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("3D→2D 칼선 전개도", "3D-to-2D Dieline Unfold")}
            </span>
            <span
              data-testid="papercraft-pair-integrity-badge"
              className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(
                `풀칠 탭 ${dieline.pairIntegrity.verifiedPairs}/${dieline.pairIntegrity.totalPairs}쌍 일치`,
                `${dieline.pairIntegrity.verifiedPairs}/${dieline.pairIntegrity.totalPairs} Tab Pairs Verified`,
              )}
            </span>
            <span
              data-testid="papercraft-difficulty-badge"
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${difficultyBadgeClass(dieline.assemblyDifficulty)}`}
            >
              {`${isEn ? dieline.assemblyDifficultyLabelEn : dieline.assemblyDifficultyLabelKo} · ${pick(`약 ${dieline.estimatedAssemblyMinutes}분`, `~${dieline.estimatedAssemblyMinutes} min`)}`}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("종이로 만드는 3D 페이퍼크래프트 전개도 & 웹툰 굿즈 스튜디오", "3D Papercraft Unfold & Webtoon Goods Diorama Studio")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "웹툰 캐릭터·배경 3D 로우폴리를 실제 인쇄해 오리고 접는 재단선·산접기·골접기·풀칠 탭 전개도로 펼치고 0°→90° 입체 접힘을 실시간으로 검증합니다.",
              "Unfold low-poly webtoon goods into 1:1 mm printable cut, mountain/valley fold, and numbered glue-tab dielines with live 0°→90° rigid folding preview.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="papercraft-export-svg-btn" onClick={handleExportSvg} className={BTN_SOLID}>
            <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("인쇄용 SVG 복사", "Copy Printable SVG")}
          </button>
          <button type="button" data-testid="papercraft-export-json-btn" onClick={handleExportJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("매니페스트 JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="papercraft-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div
        role="status"
        aria-live="polite"
        data-testid="papercraft-status-banner"
        className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
      >
        {statusMessage ||
          pick(
            `${activePreset.nameKo} · ${dieline.paperSpec.id} · ${paperWeightGsm}gsm 기준 전개도입니다. 접힘 슬라이더로 조립 순서를 미리 확인하세요.`,
            `Showing ${activePreset.nameEn} on ${dieline.paperSpec.id} (${paperWeightGsm}gsm). Scrub the fold slider to verify 3D assembly.`,
          )}
      </div>

      {/* 5종 웹툰 굿즈·배경 3D 로우폴리 프리셋 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5종 웹툰 굿즈 · 배경 3D 로우폴리 프리셋", "5 Webtoon Goods & Diorama Low-Poly Presets")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {isEn ? activePreset.goodsUseEn : activePreset.goodsUseKo}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" role="group" aria-label={pick("페이퍼크래프트 프리셋 선택", "Select papercraft preset")}>
          {PAPERCRAFT_MODEL_PRESETS.map((preset) => {
            const isActive = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`papercraft-preset-${preset.id}`}
                aria-pressed={isActive}
                onClick={() => handleSelectPreset(preset.id)}
                className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  isActive ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="text-[10px] font-semibold text-fg-3">{isEn ? preset.categoryEn : preset.categoryKo}</span>
                  <span className="font-mono text-[10px] font-semibold text-fg-2 tabular-nums">{`${preset.recommendedPaperWeight}gsm`}</span>
                </div>
                <span className="text-xs font-bold text-fg">{isEn ? preset.nameEn : preset.nameKo}</span>
                <span className="text-[11px] leading-snug text-fg-2">{isEn ? preset.taglineEn : preset.taglineKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 용지 규격 · 종이 평량 · 스케일 · 접힘 컨트롤 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-6">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Ruler className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("용지 규격 (인쇄 시트)", "Sheet Size (Print Stock)")}
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={pick("용지 규격 선택", "Select paper size")}>
              {PAPER_SIZE_SPECS.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  data-testid={`papercraft-paper-${spec.id}`}
                  aria-pressed={paperSize === spec.id}
                  onClick={() => handleSelectPaperSize(spec.id)}
                  className={paperSize === spec.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {spec.id}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("종이 평량 (접힘 공차 · 탭 너비 자동 보정)", "Cardstock Weight (Auto Bend & Tab Compensation)")}
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={pick("종이 평량 선택", "Select cardstock gsm")}>
              {PAPER_WEIGHT_SPECS.map((w) => (
                <button
                  key={w.gsm}
                  type="button"
                  data-testid={`papercraft-gsm-${w.gsm}`}
                  aria-pressed={paperWeightGsm === w.gsm}
                  onClick={() => handleSelectWeight(w.gsm)}
                  className={paperWeightGsm === w.gsm ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {`${w.gsm}gsm`}
                </button>
              ))}
            </div>
            <p data-testid="papercraft-compensation-note" className="text-[11px] text-fg-2 [word-break:keep-all]">
              {`${pick("접힘 공차", "Allowance")} +${dieline.paperCompensation.foldAllowanceMm}mm · ${pick("풀칠 탭", "Tab")} ${dieline.paperCompensation.tabWidthMm}mm · ${
                isEn ? dieline.paperCompensation.scoringNoteEn : dieline.paperCompensation.scoringNoteKo
              }`}
            </p>
          </div>
        </div>

        <div className="space-y-2.5 xl:col-span-6">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${uid}-fold`} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("실시간 접힘 진행률 (0° 평면 → 90° 완성)", "Live Fold Progress (0° Flat → 90° Assembled)")}
            </label>
            <span data-testid="papercraft-fold-readout" className="font-mono text-xs font-bold text-accent tabular-nums">
              {`${Math.round(foldProgress * 100)}% · ${foldPreview.foldAngleDeg}°`}
            </span>
          </div>
          <input
            id={`${uid}-fold`}
            data-testid="papercraft-fold-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(foldProgress * 100)}
            onChange={(e) => setFoldProgress(Number(e.target.value) / 100)}
            className="min-h-11 w-full cursor-pointer accent-accent"
          />
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { pct: 0, ko: "0% 평면 전개", en: "0% Flat Net" },
              { pct: 50, ko: "50% 반접힘", en: "50% Mid Fold" },
              { pct: 100, ko: "100% 입체 완성", en: "100% Assembled" },
            ] as const).map((step) => (
              <button
                key={step.pct}
                type="button"
                data-testid={`papercraft-fold-preset-${step.pct}`}
                aria-pressed={Math.round(foldProgress * 100) === step.pct}
                onClick={() => setFoldProgress(step.pct / 100)}
                className={Math.round(foldProgress * 100) === step.pct ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {pick(step.ko, step.en)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-scale`} className="flex items-center justify-between text-[11px] font-medium text-fg-2 [word-break:keep-all]">
                <span>{pick("출력 스케일 배율", "Print Scale")}</span>
                <span data-testid="papercraft-scale-readout" className="font-mono font-bold text-fg tabular-nums">{`${scale.toFixed(2)}x`}</span>
              </label>
              <input
                id={`${uid}-scale`}
                data-testid="papercraft-scale-slider"
                type="range"
                min={0.6}
                max={1.8}
                step={0.1}
                value={scale}
                onChange={(e) => { setScale(Number(e.target.value)); setActivePageIndex(0); }}
                className="min-h-11 w-full cursor-pointer accent-accent"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-yaw`} className="flex items-center justify-between text-[11px] font-medium text-fg-2 [word-break:keep-all]">
                <span>{pick("입체 시점 회전 (Yaw)", "Preview Orbit Yaw")}</span>
                <span data-testid="papercraft-yaw-readout" className="font-mono font-bold text-fg tabular-nums">{`${cameraYawDeg}°`}</span>
              </label>
              <input
                id={`${uid}-yaw`}
                data-testid="papercraft-yaw-slider"
                type="range"
                min={-180}
                max={180}
                step={5}
                value={cameraYawDeg}
                onChange={(e) => setCameraYawDeg(Number(e.target.value))}
                className="min-h-11 w-full cursor-pointer accent-accent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 프리뷰 (좌: 2D 전개도 칼선 도면 · 우: 입체 접힘 프리뷰) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("2D 인쇄 전개도 도면 (재단 · 산접기 · 골접기 · 풀칠 탭)", "2D Printable Dieline (Cut · Mountain · Valley · Tabs)")}
            </h3>
            {dieline.totalPages > 1 ? (
              <div className="flex items-center gap-1" role="group" aria-label={pick("전개도 시트 페이지 선택", "Select dieline page")}>
                {dieline.pages.map((pg) => (
                  <button
                    key={pg.pageIndex}
                    type="button"
                    data-testid={`papercraft-page-btn-${pg.pageIndex + 1}`}
                    aria-pressed={safePageIndex === pg.pageIndex}
                    onClick={() => setActivePageIndex(pg.pageIndex)}
                    className={safePageIndex === pg.pageIndex ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {pick(`${pg.pageIndex + 1}쪽`, `P${pg.pageIndex + 1}`)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${dieline.paperSpec.widthMm}×${dieline.paperSpec.heightMm}mm`}</span>
            )}
          </div>
          <DielineBlueprintSvg dieline={dieline} activePageIndex={safePageIndex} isEn={isEn} />
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("0°→90° 실시간 접힘 입체 페이퍼 디오라마 프리뷰", "Live 0°→90° Rigid Paper Diorama Preview")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {`${pick("조립 높이", "Height")} ${foldPreview.maxElevationMm}mm`}
            </span>
          </div>
          <PaperFoldPreviewSvg
            preview={foldPreview}
            presetName={isEn ? activePreset.nameEn : activePreset.nameKo}
            thicknessMm={dieline.paperCompensation.thicknessMm}
            isEn={isEn}
          />
        </div>
      </div>

      {/* 전개도 핵심 지표 & 풀칠 탭 페어 번호 매칭 표 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("용지 장수 · 활용률", "Sheets · Utilization")}</div>
          <div data-testid="papercraft-metric-pages" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {`${dieline.totalPages}${pick("쪽", "p")} · ${dieline.paperUtilizationPercent}%`}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("재단선 · 산/골접기", "Cut · Mtn / Val")}</div>
          <div data-testid="papercraft-metric-edges" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {`${dieline.cutEdges.length} · ${dieline.mountainFoldEdges.length}/${dieline.valleyFoldEdges.length}`}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("풀칠 탭 · 공차 보정", "Tabs · Bend Comp")}</div>
          <div data-testid="papercraft-metric-tabs" className="mt-1 font-mono text-sm font-bold text-accent tabular-nums">
            {`${dieline.glueTabs.length}${pick("쌍", "pr")} · +${dieline.paperCompensation.foldAllowanceMm}mm`}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("재단 / 접선 총 길이", "Cut / Fold Length")}</div>
          <div data-testid="papercraft-metric-lengths" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {`${Math.round(dieline.totalCutLengthMm)} / ${Math.round(dieline.totalFoldLengthMm)}mm`}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("풀칠 탭 번호 페어 매칭 & 인쇄·매니페스트 소스", "Glue Tab Pair Map & Printable SVG / JSON Source")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="papercraft-toggle-svg-btn"
              aria-expanded={sourceDrawer === "svg"}
              onClick={() => setSourceDrawer((prev) => (prev === "svg" ? "closed" : "svg"))}
              className={sourceDrawer === "svg" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "svg" ? pick("SVG 닫기", "Hide SVG") : pick("SVG 칼선 보기", "View SVG")}
            </button>
            <button
              type="button"
              data-testid="papercraft-toggle-json-btn"
              aria-expanded={sourceDrawer === "json"}
              onClick={() => setSourceDrawer((prev) => (prev === "json" ? "closed" : "json"))}
              className={sourceDrawer === "json" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "json" ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "View JSON")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" data-testid="papercraft-tab-pair-list">
          {dieline.glueTabs.slice(0, 12).map((tab) => (
            <span
              key={tab.tabId}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-mono text-[11px] text-fg-2 tabular-nums"
            >
              <strong className="text-accent">{`#${tab.pairNumber}`}</strong>
              <span>{`${tab.hostFaceId}↔${tab.targetFaceId} (${tab.edgeLengthMm}mm)`}</span>
            </span>
          ))}
        </div>

        {sourceDrawer !== "closed" ? (
          <pre
            data-testid={sourceDrawer === "svg" ? "papercraft-svg-preview" : "papercraft-json-preview"}
            className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums"
          >
            {sourceDrawer === "svg" ? dielineSvgText : manifestJsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}

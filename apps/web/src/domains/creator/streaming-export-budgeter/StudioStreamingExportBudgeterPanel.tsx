/**
 * 동적 리소스 예산 관리자 & 60fps 비침범 초고속 스트리밍 출고 패널.
 *
 * - props 없이 단독 렌더링 가능하며 웹툰(800/1600px sRGB·P3)·단행본(300/600DPI B5·신국판 CMYK 블리드)·
 *   방송/4K(3840×2160 Rec.709·Rec.2020) 3대 매체 예산을 실시간 비교한다.
 * - 60fps 편집 프레임 예산(<= 16.7ms)을 지키는 백그라운드 타일 스트리밍 시뮬레이터(시작·프레임 진행·일시정지·재개·취소)와
 *   매체별 색역 이탈(Out-of-Gamut) 경고를 제공한다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 브라우저 스토리지 비의존 · 명시적 transition 속성만 사용 · KO/EN).
 */

import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  Film,
  Layers,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Square,
  StepForward,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_RESOURCE_BUDGET_POLICY,
  DEFAULT_SOURCE_DOCUMENT,
  DEFAULT_WORK_COLOR_SAMPLES,
  EXPORT_MEDIUM_PRESETS,
  FRAME_BUDGET_60FPS_MS,
  NEON_STRESS_COLOR_SAMPLES,
  PRINT_SAFE_COLOR_SAMPLES,
  cancelStreamingPipeline,
  compareThreeMediaBudgets,
  createStreamingPipelineState,
  pauseStreamingPipeline,
  resumeStreamingPipeline,
  startStreamingPipeline,
  stepStreamingFrame,
  stepStreamingFramesBatch,
  type ColorSampleInput,
  type ExportMediumCategory,
  type ExportPresetId,
  type GamutWarningSeverity,
  type MediumResourceBudget,
  type ResourceBudgetPolicy,
  type ResourcePressureStatus,
  type SourceDocumentSpec,
  type StreamingPipelineState,
  type StreamingPipelineStatus,
} from "./dynamic-resource-budgeter";

export type SamplePaletteId = "default-p3" | "neon-stress" | "print-safe";

export interface StudioStreamingExportBudgeterPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialDocument?: Partial<SourceDocumentSpec>;
  readonly initialPolicy?: Partial<ResourceBudgetPolicy>;
  readonly initialActiveMedium?: ExportMediumCategory;
  readonly className?: string;
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ON = `inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_OFF = `inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg ${FOCUS_RING} [word-break:keep-all]`;

const TILE_SIZE_OPTIONS: readonly number[] = [256, 512, 1024];

const PALETTE_PRESETS: Readonly<Record<SamplePaletteId, { readonly ko: string; readonly en: string; readonly samples: readonly ColorSampleInput[] }>> = {
  "default-p3": { ko: "기본 P3 웹툰 팔레트", en: "Default P3 Webtoon Palette", samples: DEFAULT_WORK_COLOR_SAMPLES },
  "neon-stress": { ko: "고채도 네온·형광 점검", en: "High-Chroma Neon Stress", samples: NEON_STRESS_COLOR_SAMPLES },
  "print-safe": { ko: "단행본 안전 차분 팔레트", en: "Print-Safe Muted Palette", samples: PRINT_SAFE_COLOR_SAMPLES },
};

const WEBTOON_PRESETS = EXPORT_MEDIUM_PRESETS.filter((p) => p.category === "webtoon");
const PRINT_PRESETS = EXPORT_MEDIUM_PRESETS.filter((p) => p.category === "print");
const BROADCAST_PRESETS = EXPORT_MEDIUM_PRESETS.filter((p) => p.category === "broadcast");

function pressureBadgeClass(status: ResourcePressureStatus): string {
  if (status === "exceeded") return "bg-bad-soft text-bad";
  if (status === "tight") return "bg-warning-soft text-warn";
  return "bg-good-soft text-good";
}

function gamutBadgeClass(severity: GamutWarningSeverity): string {
  if (severity === "critical") return "bg-bad-soft text-bad";
  if (severity === "warn") return "bg-warning-soft text-warn";
  return "bg-good-soft text-good";
}

function pipelineStatusMeta(status: StreamingPipelineStatus, isEn: boolean): { readonly label: string; readonly tone: string } {
  const map: Readonly<Record<StreamingPipelineStatus, readonly [string, string, string]>> = {
    idle: ["대기 중", "Idle", "bg-raised text-fg-2"],
    running: ["스트리밍 진행 중", "Streaming", "bg-accent-soft text-accent"],
    paused: ["일시정지됨", "Paused", "bg-warning-soft text-warn"],
    throttled: ["워터마크 스로틀링", "Throttled", "bg-bad-soft text-bad"],
    cancelled: ["취소됨", "Cancelled", "bg-bad-soft text-bad"],
    completed: ["출고 완료", "Completed", "bg-good-soft text-good"],
  };
  const [ko, en, tone] = map[status];
  return { label: isEn ? en : ko, tone };
}

export function StudioStreamingExportBudgeterPanel({
  locale,
  initialDocument,
  initialPolicy,
  initialActiveMedium = "print",
  className = "",
}: StudioStreamingExportBudgeterPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? storeLang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [docWidthPx, setDocWidthPx] = useState(initialDocument?.widthPx ?? DEFAULT_SOURCE_DOCUMENT.widthPx);
  const [docHeightPx, setDocHeightPx] = useState(initialDocument?.heightPx ?? DEFAULT_SOURCE_DOCUMENT.heightPx);
  const [layerCount, setLayerCount] = useState(initialDocument?.layerCount ?? DEFAULT_SOURCE_DOCUMENT.layerCount);
  const [pageCount, setPageCount] = useState(initialDocument?.pageCount ?? DEFAULT_SOURCE_DOCUMENT.pageCount);
  const [bitDepth, setBitDepth] = useState<8 | 16>(initialDocument?.bitDepth ?? DEFAULT_SOURCE_DOCUMENT.bitDepth);
  const [tileSizePx, setTileSizePx] = useState(initialDocument?.tileSizePx ?? DEFAULT_SOURCE_DOCUMENT.tileSizePx ?? 512);
  const [paletteId, setPaletteId] = useState<SamplePaletteId>("default-p3");

  const [webtoonPresetId, setWebtoonPresetId] = useState<ExportPresetId>("webtoon-scroll-1600-p3");
  const [printPresetId, setPrintPresetId] = useState<ExportPresetId>("print-b5-300dpi-cmyk");
  const [broadcastPresetId, setBroadcastPresetId] = useState<ExportPresetId>("broadcast-4k-rec709");
  const [activeMedium, setActiveMedium] = useState<ExportMediumCategory>(initialActiveMedium);

  const [editorWorkMs, setEditorWorkMs] = useState(initialPolicy?.editorFrameReserveMs ?? DEFAULT_RESOURCE_BUDGET_POLICY.editorFrameReserveMs);
  const [maxChunkDurationMs, setMaxChunkDurationMs] = useState(initialPolicy?.maxChunkDurationMs ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxChunkDurationMs);
  const [maxVramWatermarkMb, setMaxVramWatermarkMb] = useState(initialPolicy?.maxVramWatermarkMb ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxVramWatermarkMb);
  const [maxRamWatermarkMb, setMaxRamWatermarkMb] = useState(initialPolicy?.maxRamWatermarkMb ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxRamWatermarkMb);

  const sourceDoc = useMemo<SourceDocumentSpec>(
    () => ({
      widthPx: docWidthPx,
      heightPx: docHeightPx,
      layerCount,
      bitDepth,
      sourceGamut: paletteId === "print-safe" ? "srgb" : "display-p3",
      pageCount,
      tileSizePx,
      colorSamples: PALETTE_PRESETS[paletteId].samples,
    }),
    [bitDepth, docHeightPx, docWidthPx, layerCount, pageCount, paletteId, tileSizePx],
  );

  const policy = useMemo<ResourceBudgetPolicy>(
    () => ({
      frameBudgetMs: FRAME_BUDGET_60FPS_MS,
      editorFrameReserveMs: editorWorkMs,
      maxChunkDurationMs,
      maxVramWatermarkMb,
      maxRamWatermarkMb,
      chunkBatchLimitPerFrame: initialPolicy?.chunkBatchLimitPerFrame ?? DEFAULT_RESOURCE_BUDGET_POLICY.chunkBatchLimitPerFrame,
    }),
    [editorWorkMs, initialPolicy?.chunkBatchLimitPerFrame, maxChunkDurationMs, maxRamWatermarkMb, maxVramWatermarkMb],
  );

  const comparison = useMemo(
    () =>
      compareThreeMediaBudgets(
        sourceDoc,
        { webtoon: webtoonPresetId, print: printPresetId, broadcast: broadcastPresetId },
        policy,
      ),
    [broadcastPresetId, policy, printPresetId, sourceDoc, webtoonPresetId],
  );

  const activeBudget: MediumResourceBudget =
    activeMedium === "webtoon" ? comparison.webtoon : activeMedium === "print" ? comparison.print : comparison.broadcast;

  const [pipeline, setPipeline] = useState<StreamingPipelineState>(() => createStreamingPipelineState(activeBudget, policy));
  const [statusNotice, setStatusNotice] = useState("");

  const syncPipelineToBudget = (budget: MediumResourceBudget, noticeKo: string, noticeEn: string): void => {
    setPipeline(createStreamingPipelineState(budget, policy));
    setStatusNotice(pick(noticeKo, noticeEn));
  };

  const handleSelectMedium = (category: ExportMediumCategory): void => {
    setActiveMedium(category);
    const nextBudget = category === "webtoon" ? comparison.webtoon : category === "print" ? comparison.print : comparison.broadcast;
    syncPipelineToBudget(
      nextBudget,
      `${nextBudget.preset.labelKo} 기준으로 스트리밍 대기열(${nextBudget.totalTileChunks}타일)을 갱신했습니다.`,
      `Loaded streaming queue (${nextBudget.totalTileChunks} tiles) for ${nextBudget.preset.labelEn}.`,
    );
  };

  const handleStart = (): void => {
    const isFreshStart =
      pipeline.status === "idle" ||
      pipeline.status === "cancelled" ||
      pipeline.status === "completed" ||
      pipeline.presetId !== activeBudget.preset.id;
    const base = isFreshStart ? createStreamingPipelineState(activeBudget, policy) : pipeline;
    const started = startStreamingPipeline(base);
    setPipeline(started);
    setStatusNotice(
      pick(
        `${activeBudget.preset.shortLabelKo} 스트리밍 출고를 시작했습니다(총 ${started.totalChunks}타일 · 60fps 예산 보호).`,
        `Started streaming export for ${activeBudget.preset.shortLabelEn} (${started.totalChunks} tiles, 60fps protected).`,
      ),
    );
  };

  const handleStep = (frames: number): void => {
    setPipeline((prev) => {
      const prepared =
        prev.status === "idle"
          ? startStreamingPipeline(createStreamingPipelineState(activeBudget, policy))
          : prev;
      return frames === 1
        ? stepStreamingFrame(prepared, { editorWorkMs })
        : stepStreamingFramesBatch(prepared, frames, { editorWorkMs });
    });
    setStatusNotice(
      pick(
        `편집 부하 ${editorWorkMs.toFixed(1)}ms 조건에서 ${frames}프레임 스트리밍 슬라이스를 실행했습니다.`,
        `Executed ${frames} streaming frame slice(s) under ${editorWorkMs.toFixed(1)}ms editor load.`,
      ),
    );
  };

  const handlePauseOrResume = (): void => {
    if (pipeline.status === "paused" || pipeline.status === "throttled") {
      setPipeline((prev) => resumeStreamingPipeline(prev));
      setStatusNotice(pick("일시정지된 지점부터 스트리밍 출고를 재개했습니다.", "Resumed streaming export from saved tile cursor."));
      return;
    }
    setPipeline((prev) => pauseStreamingPipeline(prev));
    setStatusNotice(pick("진행률을 유지한 채 스트리밍 출고를 일시정지했습니다.", "Paused streaming export while preserving progress."));
  };

  const handleCancel = (): void => {
    setPipeline((prev) => cancelStreamingPipeline(prev, pick("사용자가 스트리밍 출고를 취소함", "Cancelled by user")));
    setStatusNotice(pick("스트리밍 출고를 취소하고 임시 타일 메모리를 즉시 해제했습니다.", "Cancelled export and released active tile buffers."));
  };

  const handleReset = (): void => {
    syncPipelineToBudget(
      activeBudget,
      "현재 매체 규격과 워터마크 정책으로 스트리밍 파이프라인을 초기화했습니다.",
      "Reset streaming pipeline with current medium spec and watermark policy.",
    );
  };

  const mediaCards: readonly {
    readonly category: ExportMediumCategory;
    readonly titleKo: string;
    readonly titleEn: string;
    readonly icon: ReactElement;
    readonly budget: MediumResourceBudget;
    readonly presets: readonly typeof EXPORT_MEDIUM_PRESETS[number][];
    readonly selectedPresetId: ExportPresetId;
    readonly onPresetChange: (id: ExportPresetId) => void;
  }[] = [
    {
      category: "webtoon",
      titleKo: "웹툰 세로 스크롤",
      titleEn: "Webtoon Scroll",
      icon: <Smartphone className="h-4 w-4 text-accent" aria-hidden="true" />,
      budget: comparison.webtoon,
      presets: WEBTOON_PRESETS,
      selectedPresetId: webtoonPresetId,
      onPresetChange: (id) => setWebtoonPresetId(id),
    },
    {
      category: "print",
      titleKo: "단행본 인쇄 (CMYK)",
      titleEn: "Print Book (CMYK)",
      icon: <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />,
      budget: comparison.print,
      presets: PRINT_PRESETS,
      selectedPresetId: printPresetId,
      onPresetChange: (id) => setPrintPresetId(id),
    },
    {
      category: "broadcast",
      titleKo: "방송 · 4K 영상",
      titleEn: "Broadcast / 4K",
      icon: <Film className="h-4 w-4 text-accent" aria-hidden="true" />,
      budget: comparison.broadcast,
      presets: BROADCAST_PRESETS,
      selectedPresetId: broadcastPresetId,
      onPresetChange: (id) => setBroadcastPresetId(id),
    },
  ];

  const statusMeta = pipelineStatusMeta(pipeline.status, isEn);

  return (
    <section
      aria-label={pick("동적 리소스 예산 관리자 및 스트리밍 출고 패널", "Dynamic Resource Budgeter & Streaming Export Panel")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all] ${className}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">
              {pick("동적 리소스 예산 관리자 · 초고속 스트리밍 출고 엔진", "Dynamic Resource Budgeter & Streaming Export Engine")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "작업 중에도 웹툰·단행본·방송 4K 규격의 해상도·색역·VRAM/RAM·타일 청크 수를 실시간 계산하고 60fps(≤16.7ms)를 지키며 백그라운드 스트리밍 출고를 수행합니다.",
              "Continuously computes resolution, color gamut, VRAM/RAM, and tile counts across Webtoon, Print CMYK, and 4K Broadcast while keeping edits inside the 60fps (≤16.7ms) frame budget.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(
              `60fps 보호 ≤${FRAME_BUDGET_60FPS_MS}ms · 위반 ${pipeline.frameBudgetViolationCount}건`,
              `60fps Guard ≤${FRAME_BUDGET_60FPS_MS}ms · ${pipeline.frameBudgetViolationCount} violations`,
            )}
          </span>
          <span
            data-testid="total-gamut-warning-badge"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${comparison.totalOutOfGamutWarnings > 0 ? "bg-warning-soft text-warn" : "bg-good-soft text-good"}`}
          >
            {comparison.totalOutOfGamutWarnings > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pick(`색역 이탈 경고 ${comparison.totalOutOfGamutWarnings}건`, `${comparison.totalOutOfGamutWarnings} Out-of-Gamut Warnings`)}
          </span>
        </div>
      </header>

      {/* 작업 캔버스 리소스 조건 */}
      <div className="grid gap-3 rounded-xl border border-line bg-card p-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1 text-xs">
          <label htmlFor={`${uid}-doc-w`} className="font-semibold text-fg-2">{pick("작업 폭 × 높이 (px)", "Work Width × Height (px)")}</label>
          <div className="flex items-center gap-1.5">
            <input id={`${uid}-doc-w`} type="number" min={400} max={16000} step={200} value={docWidthPx} onChange={(e) => setDocWidthPx(Number(e.target.value))} aria-label={pick("작업 캔버스 폭", "Work canvas width")} className={`min-h-10 w-full rounded-lg border border-line bg-canvas px-2 text-xs text-fg tabular-nums ${FOCUS_RING}`} />
            <span className="text-fg-3">×</span>
            <input id={`${uid}-doc-h`} type="number" min={600} max={80000} step={800} value={docHeightPx} onChange={(e) => setDocHeightPx(Number(e.target.value))} aria-label={pick("작업 캔버스 높이", "Work canvas height")} className={`min-h-10 w-full rounded-lg border border-line bg-canvas px-2 text-xs text-fg tabular-nums ${FOCUS_RING}`} />
          </div>
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <label htmlFor={`${uid}-layers`} className="flex justify-between font-semibold text-fg-2"><span>{pick("레이어 수", "Layers")}</span><span className="text-fg tabular-nums">{`${layerCount}`}</span></label>
          <input id={`${uid}-layers`} type="range" min={1} max={120} step={1} value={layerCount} onChange={(e) => setLayerCount(Number(e.target.value))} className="min-h-10 w-full accent-accent" />
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <label htmlFor={`${uid}-pages`} className="flex justify-between font-semibold text-fg-2"><span>{pick("단행본 페이지 / 4K 씬", "Print Pages / 4K Scenes")}</span><span className="text-fg tabular-nums">{`${pageCount}`}</span></label>
          <input id={`${uid}-pages`} type="range" min={1} max={32} step={1} value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} className="min-h-10 w-full accent-accent" />
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-fg-2">{pick("타일 청크 크기", "Tile Chunk Size")}</span>
          <div className="flex flex-wrap gap-1">
            {TILE_SIZE_OPTIONS.map((size) => (
              <button key={size} type="button" aria-pressed={tileSizePx === size} onClick={() => setTileSizePx(size)} className={tileSizePx === size ? BTN_CHIP_ON : BTN_CHIP_OFF}>{`${size}px`}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-fg-2">{pick("작업 비트 깊이", "Source Bit Depth")}</span>
          <div className="flex gap-1">
            {([8, 16] as const).map((depth) => (
              <button key={depth} type="button" aria-pressed={bitDepth === depth} onClick={() => setBitDepth(depth)} className={bitDepth === depth ? BTN_CHIP_ON : BTN_CHIP_OFF}>{`${depth}-bit`}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 3대 매체 동시 예산 비교 그리드 */}
      <div className="grid gap-3 lg:grid-cols-3" role="region" aria-label={pick("3대 출고 매체 동시 예산 비교", "Three-Media Live Budget Comparison")}>
        {mediaCards.map((card) => {
          const isSelected = activeMedium === card.category;
          const b = card.budget;
          return (
            <article
              key={card.category}
              data-testid={`medium-card-${card.category}`}
              className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
                isSelected ? "border-accent bg-card" : "border-line bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {card.icon}
                  <h3 className="text-sm font-bold text-fg">{pick(card.titleKo, card.titleEn)}</h3>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${gamutBadgeClass(b.gamutReport.severity)}`}>
                  {b.gamutReport.outOfGamutCount === 0
                    ? pick("색역 안전", "Gamut OK")
                    : pick(`이탈 ${b.gamutReport.outOfGamutCount}건`, `${b.gamutReport.outOfGamutCount} OOG`)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1" role="group" aria-label={pick(`${card.titleKo} 규격 프리셋`, `${card.titleEn} presets`)}>
                {card.presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={card.selectedPresetId === preset.id}
                    onClick={() => card.onPresetChange(preset.id)}
                    className={card.selectedPresetId === preset.id ? BTN_CHIP_ON : BTN_CHIP_OFF}
                  >
                    {pick(preset.shortLabelKo, preset.shortLabelEn)}
                  </button>
                ))}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <dt className="text-fg-3">{pick("출력 해상도", "Output Size")}</dt>
                  <dd className="font-bold text-fg">{`${b.outputWidthPx}×${b.outputHeightPx}px`}</dd>
                  <dd className="text-[11px] text-fg-2">
                    {b.bleedMm > 0
                      ? pick(`블리드 ${b.bleedMm}mm · ${b.unitCount}p`, `${b.bleedMm}mm bleed · ${b.unitCount}p`)
                      : b.stripSliceCount
                        ? pick(`스트립 ${b.stripSliceCount}분할`, `${b.stripSliceCount} strips`)
                        : pick(`${b.unitCount}씬 · ${b.totalMegapixels}MP`, `${b.unitCount} scenes · ${b.totalMegapixels}MP`)}
                  </dd>
                </div>
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <dt className="text-fg-3">{pick("색역 · 포맷", "Gamut & Depth")}</dt>
                  <dd className="font-bold text-fg">{`${b.preset.gamut.toUpperCase()}`}</dd>
                  <dd className="text-[11px] text-fg-2">{`${b.preset.colorModel} · ${b.effectiveBitDepth}-bit`}</dd>
                </div>
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <dt className="text-fg-3">{pick("스트리밍 VRAM / RAM", "Peak VRAM / RAM")}</dt>
                  <dd className="font-bold text-fg">{`${b.streamingPeakVramMb} / ${b.streamingPeakRamMb}MB`}</dd>
                  <dd className="mt-0.5 flex items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${pressureBadgeClass(b.ramStatus)}`}>
                      {pick(`절감 ${b.memorySavingPct}%`, `-${b.memorySavingPct}% RAM`)}
                    </span>
                  </dd>
                </div>
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <dt className="text-fg-3">{pick("타일 청크 · 예상 시간", "Tile Chunks & ETA")}</dt>
                  <dd className="font-bold text-fg">{pick(`${b.totalTileChunks}청크`, `${b.totalTileChunks} chunks`)}</dd>
                  <dd className="text-[11px] text-fg-2">{`${b.tileCols}×${b.tileRows} · ${b.estimatedMsPerTile}ms/타일 · ~${b.estimatedTotalSeconds}s`}</dd>
                </div>
              </dl>

              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectMedium(card.category)}
                className={isSelected ? BTN_SOLID : BTN_OUTLINE}
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                {isSelected
                  ? pick("스트리밍 시뮬레이터 선택됨", "Selected for Streaming")
                  : pick("이 매체로 스트리밍 검증", "Load into Simulator")}
              </button>
            </article>
          );
        })}
      </div>

      {/* 60fps 비침범 스트리밍 출고 시뮬레이터 + 색역 이탈 경고 */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-bold text-fg">
                {pick("60fps 비침범 백그라운드 스트리밍 시뮬레이터", "60fps-Safe Background Streaming Simulator")}
              </h3>
            </div>
            <span data-testid="pipeline-status-badge" className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusMeta.tone}`}>
              {statusMeta.label}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-editor-load`} className="flex justify-between font-semibold text-fg-2">
                <span>{pick("편집 프레임 부하", "Editor Load")}</span>
                <span className="text-fg tabular-nums">{`${editorWorkMs.toFixed(1)}ms`}</span>
              </label>
              <input
                id={`${uid}-editor-load`}
                type="range"
                min={4}
                max={16.5}
                step={0.5}
                value={editorWorkMs}
                onChange={(e) => setEditorWorkMs(Number(e.target.value))}
                className="min-h-8 w-full accent-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-chunk-cap`} className="flex justify-between font-semibold text-fg-2">
                <span>{pick("청크 소요 상한", "Chunk Slice Cap")}</span>
                <span className="text-fg tabular-nums">{`${maxChunkDurationMs.toFixed(1)}ms`}</span>
              </label>
              <input
                id={`${uid}-chunk-cap`}
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={maxChunkDurationMs}
                onChange={(e) => setMaxChunkDurationMs(Number(e.target.value))}
                className="min-h-8 w-full accent-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-ram-cap`} className="flex justify-between font-semibold text-fg-2">
                <span>{pick("VRAM / RAM 상한", "VRAM / RAM Cap")}</span>
                <span className="text-fg tabular-nums">{`${maxVramWatermarkMb}/${maxRamWatermarkMb}MB`}</span>
              </label>
              <input
                id={`${uid}-ram-cap`}
                type="range"
                min={128}
                max={2048}
                step={64}
                value={maxRamWatermarkMb}
                onChange={(e) => {
                  const ram = Number(e.target.value);
                  setMaxRamWatermarkMb(ram);
                  setMaxVramWatermarkMb(Math.max(128, Math.round(ram * 0.5)));
                }}
                className="min-h-8 w-full accent-accent"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleStart} disabled={pipeline.status === "running"} className={BTN_SOLID}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("스트리밍 시작", "Start Streaming")}
            </button>
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={pipeline.status === "cancelled" || pipeline.status === "completed"}
              className={BTN_OUTLINE}
            >
              <StepForward className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("1프레임 진행", "Step 1 Frame")}
            </button>
            <button
              type="button"
              onClick={() => handleStep(15)}
              disabled={pipeline.status === "cancelled" || pipeline.status === "completed"}
              className={BTN_OUTLINE}
            >
              <StepForward className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("15프레임 진행", "Step 15 Frames")}
            </button>
            <button
              type="button"
              onClick={handlePauseOrResume}
              disabled={pipeline.status === "idle" || pipeline.status === "cancelled" || pipeline.status === "completed"}
              className={BTN_OUTLINE}
            >
              {pipeline.status === "paused" || pipeline.status === "throttled" ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pipeline.status === "paused" || pipeline.status === "throttled" ? pick("재개", "Resume") : pick("일시정지", "Pause")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={pipeline.status === "idle" || pipeline.status === "cancelled" || pipeline.status === "completed"}
              className={BTN_OUTLINE}
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("취소", "Cancel")}
            </button>
            <button type="button" onClick={handleReset} className={BTN_OUTLINE}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("초기화", "Reset")}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="font-semibold text-fg-2">
                {pick(
                  `진행률 ${pipeline.progressPct.toFixed(1)}% · 완료 ${pipeline.completedChunks}/${pipeline.totalChunks}타일 (플러시 ${pipeline.flushedChunks})`,
                  `Progress ${pipeline.progressPct.toFixed(1)}% · ${pipeline.completedChunks}/${pipeline.totalChunks} tiles (flushed ${pipeline.flushedChunks})`,
                )}
              </span>
              <span className="font-semibold text-fg">
                {pick(`최대 프레임 ${pipeline.maxObservedTotalFrameMs.toFixed(2)}ms`, `Max Frame ${pipeline.maxObservedTotalFrameMs.toFixed(2)}ms`)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={pick("스트리밍 출고 진행률", "Streaming export progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pipeline.progressPct)}
              className="h-2.5 w-full overflow-hidden rounded-full bg-canvas"
            >
              <div
                className="h-full rounded-full bg-accent transition-transform motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(0, pipeline.progressPct))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <span className="block text-fg-3">{pick("활성 RAM / 피크", "Active / Peak RAM")}</span>
              <strong className="text-fg">{`${pipeline.activeRamMb.toFixed(1)} / ${pipeline.peakObservedRamMb.toFixed(1)}MB`}</strong>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <span className="block text-fg-3">{pick("활성 VRAM / 피크", "Active / Peak VRAM")}</span>
              <strong className="text-fg">{`${pipeline.activeVramMb.toFixed(1)} / ${pipeline.peakObservedVramMb.toFixed(1)}MB`}</strong>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <span className="block text-fg-3">{pick("실행 프레임 · 워터마크 위반", "Frames · Watermark Err")}</span>
              <strong className="text-fg">{`${pipeline.totalFramesRun}f · ${pipeline.watermarkViolationCount}`}</strong>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-canvas p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
              <span>{pick("최근 프레임 예산 점유 (파랑=편집 · 주홍=백그라운드 타일)", "Recent Frame Budget (Blue=Editor · Accent=Background Tiles)")}</span>
              <span>{`16.67ms Cap`}</span>
            </div>
            {pipeline.recentFrames.length === 0 ? (
              <p className="py-3 text-center text-xs text-fg-3">
                {pick("스트리밍 시작 또는 프레임 진행을 눌러 60fps 슬라이스 점유를 확인하세요.", "Press Start or Step Frame to inspect 60fps frame slice timing.")}
              </p>
            ) : (
              <div className="flex h-16 items-end gap-1" aria-label={pick("프레임 예산 타임라인", "Frame budget timeline")}>
                {pipeline.recentFrames.slice(-16).map((frame) => {
                  const editorPct = Math.min(100, (frame.editorWorkMs / FRAME_BUDGET_60FPS_MS) * 100);
                  const bgPct = Math.min(100 - editorPct, (frame.backgroundWorkMs / FRAME_BUDGET_60FPS_MS) * 100);
                  return (
                    <div
                      key={frame.frameIndex}
                      title={`#${frame.frameIndex}: ${frame.editorWorkMs}ms + ${frame.backgroundWorkMs}ms = ${frame.totalFrameMs}ms`}
                      className="flex h-full flex-1 flex-col justify-end overflow-hidden rounded-sm bg-raised"
                    >
                      <div className="w-full bg-accent" style={{ height: `${bgPct}%` }} />
                      <div className="w-full bg-cool" style={{ height: `${editorPct}%` }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {statusNotice ? (
            <div role="status" aria-live="polite" className="rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
              {statusNotice}
            </div>
          ) : null}
        </article>

        {/* 매체별 색역 이탈 경고 패널 */}
        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />
              <h3 className="text-sm font-bold text-fg">{pick("매체별 색역 이탈(Out-of-Gamut) 경고", "Per-Medium Out-of-Gamut Warnings")}</h3>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${gamutBadgeClass(activeBudget.gamutReport.severity)}`}>
              {activeBudget.preset.gamut.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("샘플 팔레트 프리셋", "Sample palette presets")}>
            {(Object.keys(PALETTE_PRESETS) as SamplePaletteId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={paletteId === id}
                onClick={() => setPaletteId(id)}
                className={paletteId === id ? BTN_CHIP_ON : BTN_CHIP_OFF}
              >
                {pick(PALETTE_PRESETS[id].ko, PALETTE_PRESETS[id].en)}
              </button>
            ))}
          </div>

          <p className="rounded-lg bg-canvas px-3 py-2 text-xs font-medium text-fg-2">
            {pick(activeBudget.gamutReport.summaryKo, activeBudget.gamutReport.summaryEn)}
          </p>

          <ul className="flex flex-col gap-2 text-xs" aria-label={pick("색상 샘플별 색역 검사 결과", "Per-sample gamut evaluations")}>
            {activeBudget.gamutReport.samples.map((sample) => (
              <li key={sample.id} className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-fg">{pick(sample.labelKo, sample.labelEn)}</strong>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      sample.isOutOfGamut ? "bg-bad-soft text-bad" : "bg-good-soft text-good"
                    }`}
                  >
                    {sample.isOutOfGamut
                      ? `ΔE ${sample.deltaE.toFixed(1)}${sample.estimatedTacPercent !== null ? ` · TAC ${sample.estimatedTacPercent}%` : ""}`
                      : pick("안전", "In-Gamut")}
                  </span>
                </div>
                <p className="text-[11px] text-fg-2">
                  {sample.isOutOfGamut
                    ? pick(sample.reasonKo ?? "색역 이탈 감지", sample.reasonEn ?? "Out of gamut detected")
                    : pick(
                        `${sample.sourceSpace.toUpperCase()} → ${sample.targetGamut.toUpperCase()} 손실 없이 재현 가능`,
                        `${sample.sourceSpace.toUpperCase()} → ${sample.targetGamut.toUpperCase()} reproduces cleanly`,
                      )}
                </p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

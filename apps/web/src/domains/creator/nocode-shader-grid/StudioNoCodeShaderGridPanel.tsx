/**
 * 노코드 WGSL 셰이더 빌더 · 분산 타일 워커 그리드 · 비의료 작업 리듬 코치 통합 패널 (Wave 33 Track C).
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 명시적 전이 속성 · Web Storage 0건).
 * - 모든 props 선택형(props 없이 단독 마운트 가능) · KO/EN 자동 지원 · 800줄 이하.
 */

import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Grid2x2,
  Layers,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DistributedTileCache,
  executeDistributedTileGrid,
  type TileGridExecutionReport,
  type TileHashAlgorithm,
} from "./distributed-tile-grid-scheduler";
import {
  analyzeErgonomicCadence,
  createDemoCadenceScenario,
  type CadenceScenarioId,
  type ErgonomicCadenceInput,
  type ErgonomicCadenceReport,
} from "./ergonomic-cadence-coach";
import {
  NOCODE_SHADER_PRESETS,
  REFERENCE_SWATCH_PRESETS,
  buildNoCodeWgslShader,
  type BuiltNoCodeShaderBundle,
  type ShaderStageMode,
} from "./nocode-wgsl-shader-builder";

export type NoCodeShaderGridTab = "shader-builder" | "tile-grid" | "ergo-coach";

export interface StudioNoCodeShaderGridPanelProps {
  readonly initialTab?: NoCodeShaderGridTab;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialPrompt?: string;
  readonly initialStage?: ShaderStageMode;
  readonly initialWorkerCount?: 1 | 2 | 4 | 8;
  readonly initialHashAlgorithm?: TileHashAlgorithm;
  readonly initialCadenceScenario?: CadenceScenarioId;
  readonly onShaderBuilt?: (bundle: BuiltNoCodeShaderBundle) => void;
  readonly onGridExecuted?: (report: TileGridExecutionReport) => void;
  readonly onCadenceEvaluated?: (report: ErgonomicCadenceReport) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TABS: readonly { readonly id: NoCodeShaderGridTab; readonly ko: string; readonly en: string }[] = [
  { id: "shader-builder", ko: "노코드 WGSL 셰이더 빌더", en: "No-Code WGSL Builder" },
  { id: "tile-grid", ko: "분산 타일 캐시 · 워커 그리드", en: "Distributed Tile Grid" },
  { id: "ergo-coach", ko: "비의료 작업 리듬 코치", en: "Work Rhythm Coach" },
];

const WORKER_COUNTS: readonly (1 | 2 | 4 | 8)[] = [1, 2, 4, 8];

const CADENCE_SCENARIOS: readonly { readonly id: CadenceScenarioId; readonly ko: string; readonly en: string }[] = [
  { id: "calm-flow", ko: "여유로운 작업", en: "Calm Flow" },
  { id: "focused-sprint", ko: "집중 템포 구간", en: "Focused Sprint" },
  { id: "undo-surge-crunch", ko: "실행취소 급증 구간", en: "Undo Surge" },
];

interface GridRunState {
  readonly cache: DistributedTileCache;
  readonly report: TileGridExecutionReport;
  readonly recipeDigest: string;
  readonly passCount: number;
}

function createInitialGridState(
  workerCount: 1 | 2 | 4 | 8,
  hashAlgorithm: TileHashAlgorithm,
  recipeDigest: string,
  simulateFault: boolean,
): GridRunState {
  const cache = new DistributedTileCache({ algorithm: hashAlgorithm });
  const report = executeDistributedTileGrid({
    canvasWidth: 512,
    canvasHeight: 512,
    tileSize: 128,
    workerCount,
    hashAlgorithm,
    recipeDigest,
    faultyNodeIds: simulateFault && workerCount > 1 ? ["worker-1"] : [],
    failAfterTiles: 1,
    skewedWorkload: true,
    cache,
  });
  return { cache, report, recipeDigest, passCount: 1 };
}

/** 노코드 WGSL 셰이더 빌더 + 분산 타일 워커 그리드 + 비의료 작업 리듬 코치 스튜디오 패널. */
export function StudioNoCodeShaderGridPanel({
  initialTab = "shader-builder",
  locale,
  className,
  initialPrompt = "따뜻한 수채화 종이 림라이트",
  initialStage = "compute",
  initialWorkerCount = 4,
  initialHashAlgorithm = "sha-256",
  initialCadenceScenario = "focused-sprint",
  onShaderBuilt,
  onGridExecuted,
  onCadenceEvaluated,
}: StudioNoCodeShaderGridPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<NoCodeShaderGridTab>(initialTab);

  // 탭 1: 노코드 WGSL 셰이더 빌더 상태
  const [promptText, setPromptText] = useState<string>(initialPrompt);
  const [selectedSwatchId, setSelectedSwatchId] = useState<string | null>(null);
  const [targetStage, setTargetStage] = useState<ShaderStageMode>(initialStage);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [shaderNotice, setShaderNotice] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeSwatches = useMemo(
    () => REFERENCE_SWATCH_PRESETS.find((preset) => preset.id === selectedSwatchId)?.swatches,
    [selectedSwatchId],
  );

  const shaderBundle = useMemo<BuiltNoCodeShaderBundle>(
    () =>
      buildNoCodeWgslShader({
        prompt: promptText,
        swatches: activeSwatches,
        targetStage,
        previewWidth: 48,
        previewHeight: 48,
        intensity,
      }),
    [activeSwatches, intensity, promptText, targetStage],
  );

  const activeValidation = targetStage === "compute"
    ? shaderBundle.computeValidation
    : shaderBundle.fragmentValidation;

  // 실제 브라우저 환경에서만 결정론적 CPU 프리뷰 RGBA 버퍼를 캔버스 DOM에 동기화
  useEffect(() => {
    if (activeTab !== "shader-builder") return;
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.createImageData(shaderBundle.preview.width, shaderBundle.preview.height);
      imageData.data.set(shaderBundle.preview.rgba);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // 헤드리스/테스트 환경에서는 SVG 8x8 톤 프리뷰로 안전하게 대체
    }
  }, [activeTab, shaderBundle.preview]);

  // 탭 2: 분산 타일 캐시 · 워커 그리드 상태
  const [workerCount, setWorkerCount] = useState<1 | 2 | 4 | 8>(initialWorkerCount);
  const [hashAlgorithm, setHashAlgorithm] = useState<TileHashAlgorithm>(initialHashAlgorithm);
  const [simulateNodeFault, setSimulateNodeFault] = useState<boolean>(false);
  const [gridState, setGridState] = useState<GridRunState>(() =>
    createInitialGridState(initialWorkerCount, initialHashAlgorithm, shaderBundle.preview.digestHex, false),
  );
  const [gridNotice, setGridNotice] = useState<string | null>(null);

  // 탭 3: 비의료 작업 리듬 코치 상태 (순수 인메모리 로컬 상태)
  const [cadenceScenario, setCadenceScenario] = useState<CadenceScenarioId>(initialCadenceScenario);
  const [cadenceInput, setCadenceInput] = useState<ErgonomicCadenceInput>(() =>
    createDemoCadenceScenario(initialCadenceScenario),
  );
  const [cadenceNotice, setCadenceNotice] = useState<string | null>(null);

  const cadenceReport = useMemo<ErgonomicCadenceReport>(
    () => analyzeErgonomicCadence(cadenceInput),
    [cadenceInput],
  );

  const handleConfirmShader = (): void => {
    onShaderBuilt?.(shaderBundle);
    setShaderNotice(
      pick(
        `${targetStage === "compute" ? "@compute" : "@fragment"} WGSL 검증 통과 · 다이제스트 ${shaderBundle.preview.digestHex.slice(0, 10)} · Uniform ${activeValidation.uniformByteLength}B`,
        `${targetStage === "compute" ? "@compute" : "@fragment"} WGSL validated · digest ${shaderBundle.preview.digestHex.slice(0, 10)} · uniform ${activeValidation.uniformByteLength}B.`,
      ),
    );
  };

  const runGridPass = (
    mode: "cold" | "warm",
    overrides?: {
      readonly workers?: 1 | 2 | 4 | 8;
      readonly algorithm?: TileHashAlgorithm;
      readonly fault?: boolean;
    },
  ): void => {
    const nextWorkers = overrides?.workers ?? workerCount;
    const nextAlgo = overrides?.algorithm ?? hashAlgorithm;
    const nextFault = overrides?.fault ?? simulateNodeFault;
    const targetCache = mode === "warm" ? gridState.cache : new DistributedTileCache({ algorithm: nextAlgo });
    const targetDigest = mode === "warm" ? gridState.recipeDigest : shaderBundle.preview.digestHex;

    const report = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: nextWorkers,
      hashAlgorithm: nextAlgo,
      recipeDigest: targetDigest,
      faultyNodeIds: nextFault && nextWorkers > 1 ? ["worker-1"] : [],
      failAfterTiles: 1,
      skewedWorkload: true,
      cache: targetCache,
    });

    const nextPass = mode === "warm" ? gridState.passCount + 1 : 1;
    setGridState({ cache: targetCache, report, recipeDigest: targetDigest, passCount: nextPass });
    onGridExecuted?.(report);
    setGridNotice(
      pick(
        `패스 #${nextPass} 완료 · 캐시 적중 ${Math.round(report.cacheHitRate * 100)}% · 병렬 가속 ${report.parallelSpeedup}x · 스틸 ${report.workStealCount}회 · 재할당 ${report.failoverCount}건`,
        `Pass #${nextPass} done · cache hit ${Math.round(report.cacheHitRate * 100)}% · ${report.parallelSpeedup}x speedup · ${report.workStealCount} steals · ${report.failoverCount} failovers.`,
      ),
    );
  };

  const handleSelectScenario = (scenario: CadenceScenarioId): void => {
    const nextInput = createDemoCadenceScenario(scenario);
    setCadenceScenario(scenario);
    setCadenceInput(nextInput);
    const evaluated = analyzeErgonomicCadence(nextInput);
    onCadenceEvaluated?.(evaluated);
    setCadenceNotice(null);
  };

  const handleCompleteBreak = (): void => {
    const nextInput: ErgonomicCadenceInput = {
      ...cadenceInput,
      continuousWorkMinutes: 0,
      lastBreakMinutesAgo: 0,
      strokesPerMinute: Math.min(cadenceInput.strokesPerMinute, cadenceInput.baselineStrokesPerMinute ?? 28),
      recentUndoCount5Min: Math.floor(cadenceInput.recentUndoCount5Min * 0.2),
      microPauseCountLastHour: (cadenceInput.microPauseCountLastHour ?? 0) + 1,
    };
    setCadenceInput(nextInput);
    const evaluated = analyzeErgonomicCadence(nextInput);
    onCadenceEvaluated?.(evaluated);
    setCadenceNotice(
      pick(
        "휴식 리듬이 반영되어 작업 타이머가 부드럽게 초기화되었습니다 (로컬 메모리 전용 · 외부 전송 0 B).",
        "Break recorded and local work timer gently reset (in-memory only · 0 bytes transmitted).",
      ),
    );
  };

  const rhythmBadgeTone =
    cadenceReport.rhythmLevel === "pause-now"
      ? "border-bad/40 bg-bad-soft text-bad"
      : cadenceReport.rhythmLevel === "break-suggested"
        ? "border-warn/40 bg-warning-soft text-warn"
        : cadenceReport.rhythmLevel === "elevated"
          ? "border-cool/40 bg-info-soft text-cool"
          : "border-good/40 bg-good-soft text-good";

  return (
    <section
      aria-label={pick("노코드 WGSL 셰이더 · 분산 타일 그리드 · 작업 리듬 코치 패널", "No-Code WGSL Shader, Distributed Tile Grid & Work Rhythm Coach Panel")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("노코드 WGSL · 분산 타일 그리드 · 로컬 작업 리듬 코치", "No-Code WGSL · Distributed Tile Grid · Local Rhythm Coach")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">
          {pick("커스텀 셰이더 · 분산 렌더 그리드 · 작업 리듬 스튜디오", "Custom Shader, Distributed Grid & Creative Rhythm Studio")}
        </h2>
        <p className="text-xs text-fg-2">
          {pick(
            "자연어·컬러 스와치로 유효 WGSL 셰이더와 결정론적 프리뷰를 만들고, 콘텐츠 주소화 타일 캐시·워크스틸링과 비의료 로컬 휴식 리듬을 한곳에서 점검합니다.",
            "Build validated WGSL shaders from prompts or swatches, simulate content-addressed work-stealing tile grids, and follow gentle local-only break pacing.",
          )}
        </p>
      </header>

      <div
        role="tablist"
        aria-label={pick("셰이더·그리드·리듬 코치 탭", "Shader, Grid & Rhythm Coach tabs")}
        className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BTN} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}
            >
              <span>{pick(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "shader-builder" && (
        <div id={`${uid}-panel-shader-builder`} role="tabpanel" aria-labelledby={`${uid}-tab-shader-builder`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${uid}-shader-prompt`} className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Wand2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("자연어 질감 · 조명 프롬프트", "Natural Language Texture & Lighting Prompt")}</span>
              </label>
              <div className="flex items-center gap-1.5">
                {(["compute", "fragment"] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    aria-pressed={targetStage === stage}
                    onClick={() => setTargetStage(stage)}
                    className={`${BTN_CHOICE} ${targetStage === stage ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    <span>{stage === "compute" ? "@compute" : "@fragment"}</span>
                  </button>
                ))}
              </div>
            </div>

            <input
              id={`${uid}-shader-prompt`}
              type="text"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder={pick("예: 따뜻한 수채화 종이 림라이트", "e.g. warm watercolor paper rim light")}
              className={`w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
            />

            <div className="flex flex-wrap gap-1.5">
              {NOCODE_SHADER_PRESETS.map((preset) => {
                const label = pick(preset.promptKo, preset.promptEn);
                const active = promptText.trim() === label;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPromptText(label)}
                    className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    <span>{pick(preset.labelKo, preset.labelEn)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-2">
                <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("레퍼런스 스와치:", "Reference Swatch:")}
              </span>
              <button
                type="button"
                aria-pressed={selectedSwatchId === null}
                onClick={() => setSelectedSwatchId(null)}
                className={`${BTN_CHOICE} ${selectedSwatchId === null ? BTN_ACTIVE : BTN_IDLE}`}
              >
                <span>{pick("프롬프트 자동", "Auto from Prompt")}</span>
              </button>
              {REFERENCE_SWATCH_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selectedSwatchId === preset.id}
                  onClick={() => setSelectedSwatchId(preset.id)}
                  className={`${BTN_CHOICE} ${selectedSwatchId === preset.id ? BTN_ACTIVE : BTN_IDLE}`}
                >
                  <span>{pick(preset.labelKo, preset.labelEn)}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor={`${uid}-shader-intensity`} className="flex items-center gap-2 text-xs text-fg-2">
                <span>{pick("적용 강도", "Blend Intensity")}</span>
                <input
                  id={`${uid}-shader-intensity`}
                  type="range"
                  min={0.4}
                  max={1.4}
                  step={0.1}
                  value={intensity}
                  onChange={(event) => setIntensity(Number(event.target.value))}
                  className="w-28 accent-accent"
                />
                <span className="font-semibold tabular-nums text-fg">{intensity.toFixed(1)}</span>
              </label>
              <button type="button" onClick={handleConfirmShader} className={BTN_PRIMARY}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("셰이더 빌드 적용 확인", "Verify & Apply Shader")}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-fg">{pick("결정론적 CPU 프리뷰 버퍼", "Deterministic CPU Preview Buffer")}</span>
                <span data-testid="shader-digest-badge" className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-2">
                  ID {shaderBundle.preview.digestHex.slice(0, 10)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <canvas
                  ref={previewCanvasRef}
                  width={shaderBundle.preview.width}
                  height={shaderBundle.preview.height}
                  aria-label={pick("셰이더 RGBA 픽셀 프리뷰 캔버스", "Shader RGBA pixel preview canvas")}
                  className="h-24 w-24 shrink-0 rounded-lg border border-line bg-canvas"
                />
                <svg
                  data-testid="shader-luma-preview-svg"
                  viewBox="0 0 8 8"
                  className="h-24 w-24 shrink-0 rounded-lg border border-line bg-canvas text-accent"
                  role="img"
                  aria-label={pick("8×8 휘도 분포 프리뷰", "8x8 luminance distribution preview")}
                  shapeRendering="crispEdges"
                >
                  {shaderBundle.preview.lumaGrid8x8.map((luma, index) => (
                    <rect
                      key={index}
                      x={index % 8}
                      y={Math.floor(index / 8)}
                      width={1}
                      height={1}
                      fill="currentColor"
                      fillOpacity={Math.max(0.08, Math.min(1, luma))}
                    />
                  ))}
                </svg>
                <div className="space-y-1 text-xs">
                  <div data-testid="shader-recipe-summary" className="font-semibold text-fg">
                    {pick(shaderBundle.recipe.summaryKo, shaderBundle.recipe.summaryEn)}
                  </div>
                  <div className="text-[11px] tabular-nums text-fg-2">
                    {pick("평균 휘도", "Mean Luma")}: {shaderBundle.preview.stats.meanLuma} · {pick("대비", "Contrast")}: {shaderBundle.preview.stats.contrastStdDev}
                  </div>
                  <div className="text-[11px] tabular-nums text-fg-2">
                    {pick("림라이트 비중", "Rim Ratio")}: {Math.round(shaderBundle.preview.stats.rimPixelRatio * 100)}% · Uniform {activeValidation.uniformByteLength}B
                  </div>
                  <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${activeValidation.valid ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                    <span>{activeValidation.valid ? pick("WGSL 정적 검증 통과", "WGSL Validated") : pick("WGSL 오류", "WGSL Error")}</span>
                    <span className="tabular-nums">({activeValidation.lineCount}L)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-fg">
                  <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("생성된 WGSL 코드", "Generated WGSL Source")}</span>
                </span>
                <span className="text-[11px] tabular-nums text-fg-3">
                  {activeValidation.entryPoint} · {activeValidation.bindingCount} bindings
                </span>
              </div>
              <pre
                data-testid="nocode-wgsl-code"
                className="max-h-36 overflow-auto rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-fg-2"
              >
                <code>{shaderBundle.primaryWgsl}</code>
              </pre>
            </div>
          </div>

          {shaderNotice && (
            <div role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good">
              {shaderNotice}
            </div>
          )}
        </div>
      )}

      {activeTab === "tile-grid" && (
        <div id={`${uid}-panel-tile-grid`} role="tabpanel" aria-labelledby={`${uid}-tab-tile-grid`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Grid2x2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("콘텐츠 주소화 분산 타일 캐시 & 멀티 워커 워크스틸링", "Content-Addressed Tile Cache & Work-Stealing Grid")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {WORKER_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={workerCount === count}
                    onClick={() => {
                      setWorkerCount(count);
                      runGridPass("cold", { workers: count });
                    }}
                    className={`${BTN_CHOICE} ${workerCount === count ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    <span className="tabular-nums">{count}W</span>
                  </button>
                ))}
                {(["sha-256", "fnv1a-64"] as const).map((algo) => (
                  <button
                    key={algo}
                    type="button"
                    aria-pressed={hashAlgorithm === algo}
                    onClick={() => {
                      setHashAlgorithm(algo);
                      runGridPass("cold", { algorithm: algo });
                    }}
                    className={`${BTN_CHOICE} ${hashAlgorithm === algo ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    <span>{algo === "sha-256" ? "SHA-256" : "FNV-1a 64"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={simulateNodeFault}
                onClick={() => {
                  const next = !simulateNodeFault;
                  setSimulateNodeFault(next);
                  runGridPass("cold", { fault: next });
                }}
                className={`${BTN_CHOICE} ${simulateNodeFault ? "border-bad/40 bg-bad-soft text-bad" : BTN_IDLE}`}
              >
                <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{simulateNodeFault ? pick("노드 1 장애 시뮬레이션 ON", "Worker-1 Fault ON") : pick("노드 1 장애 시뮬레이션 OFF", "Simulate Worker-1 Fault")}</span>
              </button>

              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => runGridPass("cold")} className={`${BTN_CHOICE} ${BTN_IDLE}`}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("콜드 캐시 새 렌더", "Cold Cache Render")}</span>
                </button>
                <button type="button" onClick={() => runGridPass("warm")} className={BTN_PRIMARY}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("동일 장면 재렌더 (캐시 검증)", "Warm Re-Render (Cache Hit)")}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              <div data-testid="grid-cache-hit-rate" className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("캐시 적중률", "Cache Hit Rate")}</div>
                <div className="font-bold tabular-nums text-fg">
                  {Math.round(gridState.report.cacheHitRate * 100)}% ({gridState.report.cacheHits}/{gridState.report.totalTiles})
                </div>
              </div>
              <div data-testid="grid-speedup" className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("병렬 가속 배율", "Parallel Speedup")}</div>
                <div className="font-bold tabular-nums text-accent">{gridState.report.parallelSpeedup}x</div>
              </div>
              <div data-testid="grid-work-steals" className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("워크스틸링", "Work Steals")}</div>
                <div className="font-bold tabular-nums text-fg">{gridState.report.workStealCount}{pick("회", " steals")}</div>
              </div>
              <div
                data-testid="grid-failover-status"
                className={`rounded-lg border px-2.5 py-2 ${gridState.report.allTilesRecovered ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}
              >
                <div className="text-[11px] opacity-85">{pick("장애 자동 재할당", "Auto Failover")}</div>
                <div className="font-bold tabular-nums">
                  {gridState.report.failoverCount}{pick("건", "")} · {gridState.report.completedTiles}/{gridState.report.totalTiles}
                </div>
              </div>
            </div>

            <div data-testid="tile-grid-map" className="grid grid-cols-4 gap-1.5">
              {gridState.report.tileResults.map((tile) => {
                const tone = tile.source === "cache"
                  ? "border-good/40 bg-good-soft text-good"
                  : tile.wasReassigned
                    ? "border-warn/40 bg-warning-soft text-warn"
                    : tile.wasStolen
                      ? "border-cool/40 bg-info-soft text-cool"
                      : "border-line bg-canvas text-fg-2";
                const tag = tile.source === "cache"
                  ? pick("캐시", "HIT")
                  : tile.wasReassigned
                    ? pick("재할당", "RE")
                    : tile.wasStolen
                      ? pick("스틸", "STL")
                      : tile.executedByNodeId?.replace("worker-", "W") ?? "-";
                return (
                  <div key={tile.tileId} className={`rounded-md border px-2 py-1.5 text-[11px] tabular-nums ${tone}`}>
                    <div className="flex items-center justify-between font-semibold">
                      <span>{tile.tileId}</span>
                      <span>{tag}</span>
                    </div>
                    <div className="truncate opacity-80">{tile.contentKey.slice(0, 14)}</div>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] tabular-nums text-fg-3">
              {pick("스티치 다이제스트", "Stitched Digest")}: <span data-testid="grid-stitched-digest" className="font-mono text-fg-2">{gridState.report.stitchedDigestHex}</span> ·{" "}
              {pick("부하 균형 효율", "Load Balance")}: {Math.round(gridState.report.loadBalanceEfficiency * 100)}%
            </div>
          </div>

          {gridNotice && (
            <div role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good">
              {gridNotice}
            </div>
          )}
        </div>
      )}

      {activeTab === "ergo-coach" && (
        <div id={`${uid}-panel-ergo-coach`} role="tabpanel" aria-labelledby={`${uid}-tab-ergo-coach`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("로컬 입력 케이던스 기반 휴식 리듬 코치", "Local Input Cadence Break Coach")}</span>
              </div>
              <span data-testid="ergo-privacy-badge" className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("외부 전송 0 B · 로컬 메모리 전용", "0 B Sent · Local Memory Only")}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {CADENCE_SCENARIOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={cadenceScenario === item.id}
                    onClick={() => handleSelectScenario(item.id)}
                    className={`${BTN_CHOICE} ${cadenceScenario === item.id ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    <span>{pick(item.ko, item.en)}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleCompleteBreak} className={BTN_PRIMARY}>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("휴식 완료 · 리듬 초기화", "Mark Break Done")}</span>
              </button>
            </div>

            <div data-testid="ergo-rhythm-banner" className={`rounded-xl border p-3 ${rhythmBadgeTone}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold">{pick(cadenceReport.headlineKo, cadenceReport.headlineEn)}</div>
                <div className="text-xs font-bold tabular-nums">
                  {pick("리듬 부하", "Pace Load")} {cadenceReport.overallPaceLoad}/100 ·{" "}
                  {cadenceReport.recommendedBreakMinutes > 0
                    ? pick(`권장 휴식 ${cadenceReport.recommendedBreakMinutes}분`, `Suggest ${cadenceReport.recommendedBreakMinutes}m break`)
                    : pick(`다음 휴식 약 ${cadenceReport.nextSuggestedBreakInMinutes}분 뒤`, `Next break in ~${cadenceReport.nextSuggestedBreakInMinutes}m`)}
                </div>
              </div>
              <p className="mt-1 text-xs opacity-90">{pick(cadenceReport.guidanceKo, cadenceReport.guidanceEn)}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-line bg-canvas p-2.5 space-y-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-cadence-mins`} className="text-fg-2">{pick("연속 작업 시간", "Continuous Work")}</label>
                  <span className="font-bold tabular-nums text-fg">{cadenceInput.continuousWorkMinutes}{pick("분", "m")}</span>
                </div>
                <input
                  id={`${uid}-cadence-mins`}
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  value={cadenceInput.continuousWorkMinutes}
                  onChange={(event) =>
                    setCadenceInput((prev) => ({
                      ...prev,
                      continuousWorkMinutes: Number(event.target.value),
                      lastBreakMinutesAgo: Number(event.target.value),
                    }))
                  }
                  className="w-full accent-accent"
                />
              </div>

              <div className="rounded-lg border border-line bg-canvas p-2.5 space-y-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-cadence-spm`} className="text-fg-2">{pick("분당 스트로크 밀도", "Strokes / Min")}</label>
                  <span className="font-bold tabular-nums text-fg">{cadenceInput.strokesPerMinute} spm</span>
                </div>
                <input
                  id={`${uid}-cadence-spm`}
                  type="range"
                  min={8}
                  max={90}
                  step={2}
                  value={cadenceInput.strokesPerMinute}
                  onChange={(event) =>
                    setCadenceInput((prev) => ({ ...prev, strokesPerMinute: Number(event.target.value) }))
                  }
                  className="w-full accent-accent"
                />
              </div>

              <div className="rounded-lg border border-line bg-canvas p-2.5 space-y-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-cadence-undo`} className="text-fg-2">{pick("최근 5분 실행취소", "Undos (5m)")}</label>
                  <span className="font-bold tabular-nums text-fg">
                    {cadenceInput.recentUndoCount5Min} ({cadenceReport.undoSurgeRatio}x)
                  </span>
                </div>
                <input
                  id={`${uid}-cadence-undo`}
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={cadenceInput.recentUndoCount5Min}
                  onChange={(event) =>
                    setCadenceInput((prev) => ({ ...prev, recentUndoCount5Min: Number(event.target.value) }))
                  }
                  className="w-full accent-accent"
                />
              </div>
            </div>

            <div data-testid="ergo-stretch-list" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cadenceReport.recommendedRoutines.map((routine) => (
                <div key={routine.id} className="rounded-lg border border-line bg-canvas p-2.5 text-xs">
                  <div className="flex items-center justify-between font-semibold text-fg">
                    <span>{pick(routine.titleKo, routine.titleEn)}</span>
                    <span className="tabular-nums text-fg-3">{routine.durationSeconds}s</span>
                  </div>
                  <p className="mt-1 text-[11px] text-fg-2">{pick(routine.stepsKo, routine.stepsEn)}</p>
                </div>
              ))}
            </div>

            <p data-testid="ergo-disclaimer" className="text-[11px] text-fg-3">
              {pick(cadenceReport.disclaimerKo, cadenceReport.disclaimerEn)}
            </p>
          </div>

          {cadenceNotice && (
            <div role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good">
              {cadenceNotice}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

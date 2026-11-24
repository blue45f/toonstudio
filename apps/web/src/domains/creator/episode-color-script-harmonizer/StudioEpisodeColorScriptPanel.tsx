/**
 * AI-Free 60컷 로컬 OKLCH 컬러 스크립트 & 무드 아크 하모나이저 스튜디오 패널.
 *
 * - Props 없이 단독 렌더 가능하며 4종 서사 템플릿, 12~60컷 인터랙티브 `<canvas>` 컬러 리본,
 *   ΔE_OKLCH 급변 경고, 원클릭 단조 스플라인 조화, 컷별 3D 조명 색온도(Kelvin) + 1D/3D LUT 인스펙터를 제공한다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건 · 명시적 transition 속성만 사용 · Web Storage 비의존).
 */

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactElement } from "react";

import {
  DEFAULT_EPISODE_CUT_COUNT,
  NARRATIVE_COLOR_TEMPLATES,
  STORY_ACT_LABELS_KO,
  auditEpisodeColorScript,
  buildEpisodeColorScriptBundle,
  computeCutLightingAndLutGrade,
  findNarrativeColorTemplateById,
  formatOklchCss,
  generateEpisodeColorScript,
  harmonizeEpisodeColorScript,
  renderEpisodeColorRibbonCanvas,
  serializeEpisodeColorScriptBundle,
} from "./episode-color-script-engine";
import type { CutColorScriptNode, NarrativeColorTemplateId, OklchCoord } from "./types";

export interface StudioEpisodeColorScriptPanelProps {
  readonly initialTemplateId?: NarrativeColorTemplateId;
  readonly initialCutCount?: number;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const CUT_COUNT_PRESETS = [12, 24, 36, 60] as const;

function downloadJsonFile(filename: string, content: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const url = URL.createObjectURL(new Blob([`${content}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function drawCutTriSwatchCanvas(canvas: HTMLCanvasElement, cut: CutColorScriptNode): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width || 240;
  const h = canvas.height || 44;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = formatOklchCss(cut.primary);
  ctx.fillRect(0, 0, Math.round(w * 0.56), h);
  ctx.fillStyle = formatOklchCss(cut.shadow);
  ctx.fillRect(Math.round(w * 0.56), 0, Math.round(w * 0.24), h);
  ctx.fillStyle = formatOklchCss(cut.accent);
  ctx.fillRect(Math.round(w * 0.8), 0, w - Math.round(w * 0.8), h);
}

export function StudioEpisodeColorScriptPanel({
  initialTemplateId,
  initialCutCount,
  className,
}: StudioEpisodeColorScriptPanelProps = {}): ReactElement {
  const uid = useId();
  const initialTemplate = findNarrativeColorTemplateById(initialTemplateId);
  const startCutCount = initialCutCount ?? DEFAULT_EPISODE_CUT_COUNT;

  const [templateId, setTemplateId] = useState<NarrativeColorTemplateId>(initialTemplate.id);
  const [cutCount, setCutCount] = useState<number>(startCutCount);
  const [cuts, setCuts] = useState<readonly CutColorScriptNode[]>(() =>
    generateEpisodeColorScript(initialTemplate.id, startCutCount, { injectDraftSpikes: true }),
  );
  const [selectedCutNumber, setSelectedCutNumber] = useState<number>(1);
  const [noticeText, setNoticeText] = useState<string>("");

  const ribbonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const swatchCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeTemplate = findNarrativeColorTemplateById(templateId);
  const audit = useMemo(() => auditEpisodeColorScript(cuts), [cuts]);

  const selectedCut = useMemo(
    () => cuts.find((item) => item.cutNumber === selectedCutNumber) ?? cuts[0],
    [cuts, selectedCutNumber],
  );
  const selectedGrade = useMemo(
    () => (selectedCut ? computeCutLightingAndLutGrade(selectedCut) : null),
    [selectedCut],
  );

  useEffect(() => {
    const canvas = ribbonCanvasRef.current;
    if (!canvas) return;
    renderEpisodeColorRibbonCanvas(canvas, cuts, audit, selectedCut?.cutNumber ?? 1);
  }, [audit, cuts, selectedCut?.cutNumber]);

  useEffect(() => {
    const swatch = swatchCanvasRef.current;
    if (!swatch || !selectedCut) return;
    drawCutTriSwatchCanvas(swatch, selectedCut);
  }, [selectedCut]);

  const handleSelectTemplate = (nextId: NarrativeColorTemplateId): void => {
    const tpl = findNarrativeColorTemplateById(nextId);
    setTemplateId(tpl.id);
    setCuts(generateEpisodeColorScript(tpl.id, cutCount, { injectDraftSpikes: true }));
    setSelectedCutNumber(1);
    setNoticeText(`"${tpl.nameKo}" 서사 템플릿(${cutCount}컷 초안)을 생성했습니다.`);
  };

  const handleSelectCutCount = (nextCount: number): void => {
    setCutCount(nextCount);
    setCuts(generateEpisodeColorScript(templateId, nextCount, { injectDraftSpikes: true }));
    setSelectedCutNumber(1);
    setNoticeText(`에피소드 컬러 스크립트를 ${nextCount}컷 구성으로 재생성했습니다.`);
  };

  const handleHarmonizeArc = (): void => {
    const smoothed = harmonizeEpisodeColorScript(cuts, { strength: 1.0 });
    setCuts(smoothed);
    setNoticeText("단조 큐빅 스플라인으로 전 컷 무드 아크를 부드럽게 조화했습니다.");
  };

  const handleInjectDraftSpikes = (): void => {
    setCuts(generateEpisodeColorScript(templateId, cutCount, { injectDraftSpikes: true }));
    setNoticeText("초안 명도·색상·채도 급변 컷 3곳을 주입해 감사 경고를 재확인합니다.");
  };

  const handleResetSmooth = (): void => {
    setCuts(generateEpisodeColorScript(templateId, cutCount, { injectDraftSpikes: false }));
    setSelectedCutNumber(1);
    setNoticeText("템플릿 기준 순수 단조 아크로 초기화했습니다.");
  };

  const updateSelectedPrimary = (patch: Partial<OklchCoord>): void => {
    if (!selectedCut) return;
    setCuts((prev) =>
      prev.map((node) =>
        node.cutNumber === selectedCut.cutNumber
          ? { ...node, primary: { ...node.primary, ...patch } }
          : node,
      ),
    );
  };

  const handleRibbonClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    const canvas = ribbonCanvasRef.current;
    if (!canvas || cuts.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(0.9999, Math.max(0, (event.clientX - rect.left) / rect.width));
    const idx = Math.floor(ratio * cuts.length);
    setSelectedCutNumber(idx + 1);
  };

  const handleCopyBundleJson = async (): Promise<void> => {
    const bundle = buildEpisodeColorScriptBundle(templateId, cuts);
    const json = serializeEpisodeColorScriptBundle(bundle);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setNoticeText("OKLCH 컬러 스크립트 및 3D 조명·LUT JSON을 복사했습니다.");
        return;
      }
    } catch {
      // 클립보드 권한이 없는 환경에서는 안내 메시지만 표시한다.
    }
    setNoticeText("컬러 스크립트 JSON 생성이 완료되었습니다. 저장 버튼으로 내려받을 수 있습니다.");
  };

  const handleDownloadBundleJson = (): void => {
    const bundle = buildEpisodeColorScriptBundle(templateId, cuts);
    const json = serializeEpisodeColorScriptBundle(bundle);
    downloadJsonFile(`episode-color-script-${templateId}-${cutCount}cuts.json`, json);
    setNoticeText(`episode-color-script-${templateId}-${cutCount}cuts.json 파일을 저장했습니다.`);
  };

  const lutCurvePolylinePoints = useMemo(() => {
    if (!selectedGrade) return "";
    return selectedGrade.lut1dCurve16
      .map((val, idx) => {
        const x = Math.round((idx / 15) * 180 + 10);
        const y = Math.round((1 - val) * 68 + 8);
        return `${x},${y}`;
      })
      .join(" ");
  }, [selectedGrade]);

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-accent">
            <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>AI-Free 60컷 로컬 OKLCH 컬러 스크립트 하모나이저</span>
          </div>
          <h2
            id={`${uid}-heading`}
            className="text-base font-bold tracking-tight text-fg [word-break:keep-all] md:text-lg"
          >
            에피소드 OKLCH 감정 컬러 리본 · ΔE 급변 감사 · 3D 조명 & LUT 출력
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            4종 서사 4막 아크를 기반으로 12~60컷 OKLCH 색채 흐름을 설계하고, 인접 컷
            ΔE_OKLCH 급변을 탐지한 뒤 단조 큐빅 스플라인으로 매끄럽게 보정합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleHarmonizeArc} className={BTN_PRIMARY}>
            <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>원클릭 스플라인 조화</span>
          </button>
          <button type="button" onClick={handleInjectDraftSpikes} className={BTN_OUTLINE}>
            <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>초안 급변 주입</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyBundleJson();
            }}
            className={BTN_OUTLINE}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>LUT JSON 복사</span>
          </button>
          <button type="button" onClick={handleDownloadBundleJson} className={BTN_OUTLINE}>
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>저장</span>
          </button>
          <button type="button" onClick={handleResetSmooth} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      {/* 서사 템플릿 4종 + 컷 수 선택 */}
      <div className="mt-4 flex flex-col gap-3">
        <div role="group" aria-label="서사 컬러 템플릿 선택" className="flex flex-wrap gap-2">
          {NARRATIVE_COLOR_TEMPLATES.map((tpl) => {
            const isActive = tpl.id === activeTemplate.id;
            return (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelectTemplate(tpl.id)}
                className={isActive ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                <span>{tpl.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="에피소드 컷 수 선택" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-fg-2">컷 수:</span>
            {CUT_COUNT_PRESETS.map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={cutCount === count}
                onClick={() => handleSelectCutCount(count)}
                className={cutCount === count ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                <span className="tabular-nums">{count}컷</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">급변 경고 (심각)</div>
              <div
                className={`mt-0.5 flex items-center gap-1 text-xs font-bold tabular-nums ${
                  audit.jarringCount === 0 ? "text-good" : "text-bad"
                }`}
              >
                {audit.jarringCount === 0 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{audit.jarringCount}건</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">최대 ΔE_OKLCH</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                {audit.maxDeltaE.toFixed(1)}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">평균 ΔE_OKLCH</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                {audit.averageDeltaE.toFixed(1)}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">아크 매끄러움</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-accent">
                {audit.arcSmoothnessScore}점
              </div>
            </div>
          </div>
        </div>
      </div>

      {noticeText ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
        >
          {noticeText}
        </p>
      ) : null}

      {/* 인터랙티브 12~60컷 OKLCH 리본 스트립 <canvas> */}
      <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-fg">
            에피소드 OKLCH 컬러 스크립트 리본 ({cuts.length}컷 · 클릭하여 컷 검사)
          </span>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            상단 주조색 · 중단 그림자 · 하단 포인트 · 실선 명도 아크
          </span>
        </div>

        <canvas
          ref={ribbonCanvasRef}
          width={720}
          height={186}
          onClick={handleRibbonClick}
          aria-label="에피소드 OKLCH 컬러 스크립트 리본 캔버스"
          className="block h-44 w-full cursor-pointer rounded-lg border border-line bg-panel"
        />

        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <label htmlFor={`${uid}-cut-scrubber`} className="text-xs font-medium text-fg-2">
            검사 컷 선택
          </label>
          <input
            id={`${uid}-cut-scrubber`}
            type="range"
            min={1}
            max={cuts.length}
            step={1}
            value={selectedCut?.cutNumber ?? 1}
            onChange={(event) => setSelectedCutNumber(Number(event.target.value))}
            className="min-w-44 flex-1 accent-accent"
          />
          <span className="text-xs font-bold tabular-nums text-fg">
            #{selectedCut?.cutNumber ?? 1} / {cuts.length}
          </span>
        </div>
      </div>

      {/* 하단 2열: 좌측 컷 인스펙터 & 3D 조명·LUT / 우측 ΔE_OKLCH 불연속성 경고 목록 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {selectedCut && selectedGrade ? (
          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>
                  컷 #{selectedCut.cutNumber} 인스펙터 · {STORY_ACT_LABELS_KO[selectedCut.act]} (
                  {selectedCut.labelKo})
                </span>
              </div>
              <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] font-medium tabular-nums text-fg-2">
                {formatOklchCss(selectedCut.primary)}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <canvas
                ref={swatchCanvasRef}
                width={220}
                height={48}
                aria-label={`컷 ${selectedCut.cutNumber} 주조·그림자·포인트 OKLCH 스워치`}
                className="h-12 w-full rounded-lg border border-line sm:w-56"
              />
              <div className="grid flex-1 grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
                  <div className="text-fg-3">키 라이트</div>
                  <div className="font-bold tabular-nums text-fg">
                    {selectedGrade.keyLightKelvin}K
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
                  <div className="text-fg-3">필 라이트</div>
                  <div className="font-bold tabular-nums text-fg">
                    {selectedGrade.fillLightKelvin}K
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
                  <div className="text-fg-3">노출 · 채도</div>
                  <div className="font-bold tabular-nums text-fg">
                    {selectedGrade.exposureEv > 0 ? "+" : ""}
                    {selectedGrade.exposureEv}EV · ×{selectedGrade.saturationGain}
                  </div>
                </div>
              </div>
            </div>

            {/* OKLCH 수동 편집 슬라이더 */}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-oklch-l`} className="text-fg-2">
                    명도 (L)
                  </label>
                  <span className="font-semibold tabular-nums text-fg">
                    {selectedCut.primary.l.toFixed(2)}
                  </span>
                </div>
                <input
                  id={`${uid}-oklch-l`}
                  type="range"
                  min={0.08}
                  max={0.96}
                  step={0.01}
                  value={selectedCut.primary.l}
                  onChange={(event) => updateSelectedPrimary({ l: Number(event.target.value) })}
                  className="w-full accent-accent"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-oklch-c`} className="text-fg-2">
                    채도 (C)
                  </label>
                  <span className="font-semibold tabular-nums text-fg">
                    {selectedCut.primary.c.toFixed(3)}
                  </span>
                </div>
                <input
                  id={`${uid}-oklch-c`}
                  type="range"
                  min={0}
                  max={0.32}
                  step={0.005}
                  value={selectedCut.primary.c}
                  onChange={(event) => updateSelectedPrimary({ c: Number(event.target.value) })}
                  className="w-full accent-accent"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-oklch-h`} className="text-fg-2">
                    색상각 (H)
                  </label>
                  <span className="font-semibold tabular-nums text-fg">
                    {Math.round(selectedCut.primary.h)}°
                  </span>
                </div>
                <input
                  id={`${uid}-oklch-h`}
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={Math.round(selectedCut.primary.h)}
                  onChange={(event) => updateSelectedPrimary({ h: Number(event.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
            </div>

            {/* 1D/3D LUT 파라미터 & 커브 미리보기 */}
            <div className="mt-3 grid gap-3 rounded-lg border border-line bg-panel p-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-fg-2">
                  <Sun className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>1D 톤 LUT 커브 (16pt)</span>
                </div>
                <svg
                  role="img"
                  aria-label="선택 컷 1D 톤 LUT 커브"
                  viewBox="0 0 200 84"
                  className="block h-20 w-full rounded border border-line bg-canvas"
                >
                  <line x1={10} y1={76} x2={190} y2={8} className="stroke-line" strokeDasharray="4 4" />
                  <polyline
                    fill="none"
                    points={lutCurvePolylinePoints}
                    className="stroke-accent"
                    strokeWidth={2.5}
                  />
                </svg>
              </div>

              <dl className="grid grid-cols-1 gap-1.5 text-[11px] tabular-nums">
                <div className="flex items-center justify-between border-b border-line pb-1">
                  <dt className="text-fg-3">Shadow Lift (RGB)</dt>
                  <dd className="font-semibold text-fg">
                    [{selectedGrade.shadowLift.join(", ")}]
                  </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-1">
                  <dt className="text-fg-3">Midtone Gamma (RGB)</dt>
                  <dd className="font-semibold text-fg">
                    [{selectedGrade.midtoneGamma.join(", ")}]
                  </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-1">
                  <dt className="text-fg-3">Highlight Gain (RGB)</dt>
                  <dd className="font-semibold text-fg">
                    [{selectedGrade.highlightGain.join(", ")}]
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-fg-3">3D LUT 큐브 규격</dt>
                  <dd className="font-semibold text-accent">
                    {selectedGrade.lut3dCubeSize}³ ({selectedGrade.lut3dCornerSamples.length} 코너)
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {/* 불연속성 경고 목록 */}
        <div className="rounded-xl border border-line bg-card p-3.5">
          <h3 className="text-xs font-semibold text-fg">
            ΔE_OKLCH 색차 급변 경고 ({audit.discontinuityAlerts.length}건)
          </h3>
          {audit.discontinuityAlerts.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-good [word-break:keep-all]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>전 컷의 명도·채도·색상각 전이가 단조 스플라인 기준 안에서 매끄럽게 이어집니다.</span>
            </p>
          ) : (
            <ul className="mt-2.5 max-h-72 space-y-2 overflow-y-auto pr-1">
              {audit.discontinuityAlerts.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCutNumber(alert.toCut)}
                    className={`flex min-h-11 w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      alert.severity === "jarring"
                        ? "border-bad/40 bg-bad-soft text-bad hover:border-bad"
                        : "border-warn/40 bg-warning-soft text-warn hover:border-warn"
                    }`}
                  >
                    <span className="font-semibold">
                      {alert.severity === "jarring" ? "심각 급변" : "주의 전이"} · 컷{" "}
                      {alert.fromCut} → {alert.toCut}
                    </span>
                    <span className="tabular-nums text-fg-2 [word-break:keep-all]">
                      {alert.messageKo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

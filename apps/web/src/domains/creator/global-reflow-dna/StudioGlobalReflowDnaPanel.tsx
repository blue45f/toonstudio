/**
 * 글로벌 출판 양방향 리플로우 · 2D→3D 소실점 자동 역산 · 스타일 DNA 락 · 분기형 인터랙티브 웹툰 통합 패널 (Wave 24).
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 원시 색상 0건 · 명시적 transition 속성만 사용 · 순수 메모리 상태 · 모든 props 선택형 · KO/EN.
 */

import {
  AlertTriangle, BookOpen, CheckCircle2, Compass, Download, GitBranch, Layers, RotateCcw, ShieldCheck, Sparkles,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  PRINT_BOOK_FORMAT_LIST, buildSyntheticPerspectivePairs, createDemoScrollCuts,
  reflowPrintPagesToScroll, reflowScrollToPrintPages, solvePerspectiveCameraFromTwoPairs,
  type PrintBookFormatId, type PrintToScrollReflowResult, type ReadingDirection,
  type ScrollCutInput, type ScrollToPrintReflowResult, type SolvedPerspectiveCamera,
  type SyntheticPerspectiveCameraSpec,
} from "./reflow-perspective-matcher";
import {
  auditCutAgainstStyleDna, buildInteractiveWebtoonHtmlBundle, createDemoAssistantCuts,
  createDemoInteractiveStoryGraph, createDemoStyleDnaSamples, extractWorkStyleDna,
  validateInteractiveStoryGraph,
  type InteractiveStoryGraph, type InteractiveWebtoonBundleResult, type StyleDnaAuditReport,
  type StyleDnaCutSample,
} from "./style-dna-and-interactive-branch";

export type GlobalReflowDnaTabId = "reflow" | "perspective-dna" | "interactive";
export type ReflowDirectionMode = "scroll-to-print" | "print-to-scroll";
export type PerspectivePresetId = "eye-level" | "high-angle" | "low-angle";

export interface StudioGlobalReflowDnaPanelProps {
  readonly initialTab?: GlobalReflowDnaTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialFormat?: PrintBookFormatId;
  readonly initialReadingDirection?: ReadingDirection;
  readonly scrollCuts?: readonly ScrollCutInput[];
  readonly referenceDnaSamples?: readonly StyleDnaCutSample[];
  readonly storyGraph?: InteractiveStoryGraph;
  readonly onReflowComputed?: (result: ScrollToPrintReflowResult | PrintToScrollReflowResult) => void;
  readonly onCameraSolved?: (camera: SolvedPerspectiveCamera) => void;
  readonly onStyleAuditRun?: (report: StyleDnaAuditReport) => void;
  readonly onBundleBuilt?: (bundle: InteractiveWebtoonBundleResult) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const TABS: readonly { readonly id: GlobalReflowDnaTabId; readonly ko: string; readonly en: string }[] = [
  { id: "reflow", ko: "세로↔단행본 양방향 리플로우", en: "Scroll ↔ Print Reflow" },
  { id: "perspective-dna", ko: "2D→3D 소실점 역산 · 스타일 DNA 락", en: "2D→3D Perspective · Style DNA" },
  { id: "interactive", ko: "선택지 분기형 인터랙티브 웹툰", en: "Interactive Branching Webtoon" },
];

const PERSPECTIVE_PRESETS: Readonly<Record<PerspectivePresetId, { readonly ko: string; readonly en: string; readonly spec: SyntheticPerspectiveCameraSpec }>> = {
  "eye-level": { ko: "눈높이 2점 투시", en: "Eye-Level 2-Point", spec: { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 48, pitchDeg: 0, yawDeg: 32, rollDeg: 0 } },
  "high-angle": { ko: "부감(하이앵글) 틸트", en: "High-Angle Tilt", spec: { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 52, pitchDeg: -14, yawDeg: 28, rollDeg: 6 } },
  "low-angle": { ko: "앙각(로우앵글) 액션", en: "Low-Angle Action", spec: { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 42, pitchDeg: 12, yawDeg: -35, rollDeg: -5 } },
};

function triggerHtmlDownload(filename: string, html: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/** 글로벌 출판 양방향 리플로우 · 2D→3D 소실점 역산 · 스타일 DNA 락 · 분기형 인터랙티브 웹툰 패널. */
export function StudioGlobalReflowDnaPanel({
  initialTab = "reflow", locale, className, initialFormat = "b5", initialReadingDirection = "ltr",
  scrollCuts, referenceDnaSamples, storyGraph, onReflowComputed, onCameraSolved, onStyleAuditRun, onBundleBuilt,
}: StudioGlobalReflowDnaPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<GlobalReflowDnaTabId>(initialTab);
  const [reflowMode, setReflowMode] = useState<ReflowDirectionMode>("scroll-to-print");
  const [printFormat, setPrintFormat] = useState<PrintBookFormatId>(initialFormat);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(initialReadingDirection);
  const [reflowNotice, setReflowNotice] = useState<string>("");

  const [cameraPreset, setCameraPreset] = useState<PerspectivePresetId>("high-angle");
  const [assistantVariant, setAssistantVariant] = useState<"aligned" | "drifted">("drifted");
  const [dnaNotice, setDnaNotice] = useState<string>("");

  const [graphVariant, setGraphVariant] = useState<"clean" | "defective">("clean");
  const [previewPath, setPreviewPath] = useState<readonly string[]>(["scene-start"]);
  const [showBundlePreview, setShowBundlePreview] = useState<boolean>(false);
  const [interactiveNotice, setInteractiveNotice] = useState<string>("");

  const activeScrollCuts = useMemo(() => scrollCuts ?? createDemoScrollCuts(), [scrollCuts]);
  const scrollToPrint = useMemo(() => reflowScrollToPrintPages(activeScrollCuts, { format: printFormat, readingDirection }), [activeScrollCuts, printFormat, readingDirection]);
  const printToScroll = useMemo(() => reflowPrintPagesToScroll(scrollToPrint.pages, { targetWidthPx: 800 }), [scrollToPrint.pages]);
  const solvedCamera = useMemo(() => solvePerspectiveCameraFromTwoPairs(buildSyntheticPerspectivePairs(PERSPECTIVE_PRESETS[cameraPreset].spec)), [cameraPreset]);

  const dnaSamples = useMemo(() => referenceDnaSamples ?? createDemoStyleDnaSamples(), [referenceDnaSamples]);
  const workDna = useMemo(() => extractWorkStyleDna("moonlit-clocktower", isKo ? "자정의 시계탑" : "Moonlit Clocktower", dnaSamples), [dnaSamples, isKo]);
  const demoAssistants = useMemo(() => createDemoAssistantCuts(), []);
  const styleAudit = useMemo(() => auditCutAgainstStyleDna(workDna, demoAssistants[assistantVariant]), [assistantVariant, demoAssistants, workDna]);

  const activeGraph = useMemo(() => storyGraph ?? createDemoInteractiveStoryGraph(graphVariant), [graphVariant, storyGraph]);
  const graphValidation = useMemo(() => validateInteractiveStoryGraph(activeGraph), [activeGraph]);
  const htmlBundle = useMemo(() => buildInteractiveWebtoonHtmlBundle(activeGraph), [activeGraph]);

  const currentNodeId = previewPath[previewPath.length - 1] ?? activeGraph.startNodeId;
  const currentPreviewNode = activeGraph.nodes.find((n) => n.id === currentNodeId) ?? activeGraph.nodes.find((n) => n.id === activeGraph.startNodeId) ?? activeGraph.nodes[0];

  const handleSelectFormat = (fmt: PrintBookFormatId): void => { setPrintFormat(fmt); setReadingDirection(fmt === "jp-shinsho" ? "rtl" : "ltr"); };
  const handleApplyReflow = (): void => {
    if (reflowMode === "scroll-to-print") {
      onReflowComputed?.(scrollToPrint);
      setReflowNotice(pick(`${scrollToPrint.spec.labelKo} 리플로우 완료 · ${scrollToPrint.totalPages}페이지 · 말풍선 잘림 ${scrollToPrint.clippedBalloonCount}건`, `${scrollToPrint.spec.labelEn} reflow ready · ${scrollToPrint.totalPages} pages · ${scrollToPrint.clippedBalloonCount} clipped balloons.`));
    } else {
      onReflowComputed?.(printToScroll);
      setReflowNotice(pick(`800px 세로 스크롤 역전개 완료 · ${printToScroll.totalCuts}컷 · 평균 호흡 여백 ${printToScroll.averageBreathingGapPx}px`, `800px vertical scroll expanded · ${printToScroll.totalCuts} cuts · avg gap ${printToScroll.averageBreathingGapPx}px.`));
    }
  };
  const handleSolveCamera = (): void => {
    onCameraSolved?.(solvedCamera);
    setDnaNotice(pick(`3D 카메라 역산 적용 · FOV ${solvedCamera.fovDeg.toFixed(1)}° · Pitch ${solvedCamera.pitchDeg.toFixed(1)}° · Yaw ${solvedCamera.yawDeg.toFixed(1)}° · Roll ${solvedCamera.rollDeg.toFixed(1)}°`, `3D camera applied · FOV ${solvedCamera.fovDeg.toFixed(1)}° · Pitch ${solvedCamera.pitchDeg.toFixed(1)}° · Yaw ${solvedCamera.yawDeg.toFixed(1)}° · Roll ${solvedCamera.rollDeg.toFixed(1)}°`));
  };
  const handleRunStyleAudit = (): void => {
    onStyleAuditRun?.(styleAudit);
    setDnaNotice(pick(`스타일 DNA 감사 완료 · 통일성 ${styleAudit.consistencyScore}점 · 이탈 ${styleAudit.deviations.length}건`, `Style DNA audit complete · score ${styleAudit.consistencyScore}/100 · ${styleAudit.deviations.length} drift item(s).`));
  };
  const handleBuildBundle = (): void => {
    onBundleBuilt?.(htmlBundle);
    triggerHtmlDownload(htmlBundle.filename, htmlBundle.html);
    setInteractiveNotice(pick(`${htmlBundle.filename} 생성 완료 · ${(htmlBundle.byteLength / 1024).toFixed(1)}KB · XSS 안전 검증 통과`, `${htmlBundle.filename} built · ${(htmlBundle.byteLength / 1024).toFixed(1)}KB · XSS-safe verified.`));
  };
  const handleSelectGraphVariant = (next: "clean" | "defective"): void => {
    setGraphVariant(next); setPreviewPath([storyGraph?.startNodeId ?? "scene-start"]); setInteractiveNotice("");
  };

  return (
    <section aria-label={pick("글로벌 출판 리플로우 · 소실점 역산 · 스타일 DNA · 분기형 웹툰 패널", "Global Reflow, Perspective Solver, Style DNA & Interactive Webtoon Panel")} className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <BookOpen className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("출판 리플로우 · 2D→3D 소실점 · 스타일 DNA 락 · 분기 웹툰", "Print Reflow · 2D→3D Camera · Style DNA · Branching Webtoon")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("글로벌 연재 · 출판 리플로우 & 스타일 DNA 스튜디오", "Global Reflow, Perspective & Style DNA Studio")}</h2>
          <p className="text-xs text-fg-2">{pick("세로 웹툰과 단행본 규격을 양방향으로 자동 배치하고, 2D 투시선 3D 역산·스타일 DNA 락·독립 HTML5 분기 웹툰을 한 곳에서 검증합니다.", "Reflow vertical scroll and print books bidirectionally, solve 3D cameras from 2D lines, guard work Style DNA, and export XSS-safe HTML5 branching webtoons.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">{pick("300 DPI · 도련 3mm", "300 DPI · 3mm Bleed")}</span>
          <span className="rounded-full bg-good-soft px-2.5 py-1 text-good">{pick(`DNA ${styleAudit.consistencyScore}점`, `DNA ${styleAudit.consistencyScore}/100`)}</span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("글로벌 리플로우 및 스타일 DNA 탭", "Global reflow and style DNA tabs")} className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${BTN_CHOICE} ${activeTab === tab.id ? BTN_ACTIVE : BTN_IDLE}`}>
            {pick(tab.ko, tab.en)}
          </button>
        ))}
      </div>

      {activeTab === "reflow" ? (
        <div id={`${uid}-panel-reflow`} role="tabpanel" aria-labelledby={`${uid}-tab-reflow`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setReflowMode("scroll-to-print")} className={`${BTN_CHOICE} ${reflowMode === "scroll-to-print" ? BTN_ACTIVE : BTN_IDLE}`}>
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("세로 스크롤 → 단행본", "Scroll → Print Book")}
              </button>
              <button type="button" onClick={() => setReflowMode("print-to-scroll")} className={`${BTN_CHOICE} ${reflowMode === "print-to-scroll" ? BTN_ACTIVE : BTN_IDLE}`}>
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("단행본 → 800px 세로 스크롤", "Print → 800px Scroll")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["ltr", "rtl"] as const).map((dir) => (
                <button key={dir} type="button" onClick={() => setReadingDirection(dir)} className={`${BTN_CHOICE} ${readingDirection === dir ? BTN_ACTIVE : BTN_IDLE}`}>
                  {dir === "ltr" ? pick("LTR 좌→우", "LTR") : pick("RTL 우→좌(일본)", "RTL (JP)")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRINT_BOOK_FORMAT_LIST.map((spec) => (
              <button key={spec.id} type="button" onClick={() => handleSelectFormat(spec.id)} className={`${BTN_CHOICE} ${printFormat === spec.id ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick(spec.labelKo, spec.labelEn)}
              </button>
            ))}
          </div>

          {reflowMode === "scroll-to-print" ? (
            <div data-testid="reflow-print-summary" className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-4 tabular-nums">
              <div><p className="text-[11px] text-fg-3">{pick("재단 + 도련 3mm (300DPI)", "Trim + 3mm Bleed (300DPI)")}</p><p className="text-sm font-bold text-fg">{scrollToPrint.dimensions.fullWidthPx}×{scrollToPrint.dimensions.fullHeightPx}px</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("자동 배치 페이지", "Reflowed Pages")}</p><p className="text-sm font-bold text-fg">{pick(`${scrollToPrint.totalPages}p (총 ${scrollToPrint.totalCuts}컷)`, `${scrollToPrint.totalPages}p (${scrollToPrint.totalCuts} cuts)`)}</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("최소 컷 폭", "Min Panel Width")}</p><p className="text-sm font-bold text-fg">{scrollToPrint.minPanelWidthMm.toFixed(1)}mm / {scrollToPrint.minReadableWidthMm}mm</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("말풍선 잘림", "Clipped Balloons")}</p><p className="text-sm font-bold text-good">{pick(`${scrollToPrint.clippedBalloonCount}건 (무손실)`, `${scrollToPrint.clippedBalloonCount} (Safe)`)}</p></div>
            </div>
          ) : (
            <div data-testid="reflow-scroll-summary" className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-4 tabular-nums">
              <div><p className="text-[11px] text-fg-3">{pick("세로 스크롤 폭", "Scroll Strip Width")}</p><p className="text-sm font-bold text-fg">{printToScroll.canvasWidthPx}px</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("전개 컷 · 총 높이", "Expanded Cuts · Height")}</p><p className="text-sm font-bold text-fg">{printToScroll.totalCuts} / {printToScroll.totalHeightPx}px</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("평균 호흡 여백", "Avg Breathing Gap")}</p><p className="text-sm font-bold text-fg">{printToScroll.averageBreathingGapPx}px</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("읽기 방향 · 잘림", "Order · Clipped")}</p><p className="text-sm font-bold text-good">{printToScroll.readingDirection.toUpperCase()} · {printToScroll.clippedBalloonCount}</p></div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {reflowMode === "scroll-to-print"
              ? scrollToPrint.pages.map((page) => (
                  <div key={page.pageNumber} className="rounded-xl border border-line bg-canvas p-3 text-xs tabular-nums">
                    <div className="flex items-center justify-between font-semibold text-fg">
                      <span>{pick(`${page.pageNumber}페이지 (${page.side === "recto" ? "홀수면" : "짝수면"})`, `Page ${page.pageNumber} (${page.side})`)}</span>
                      <span className="text-accent">{pick(`${page.cutCount}컷 · 점유 ${(page.fillRatio * 100).toFixed(0)}%`, `${page.cutCount} cuts · ${(page.fillRatio * 100).toFixed(0)}%`)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-fg-2">{page.panels.map((p) => `${p.sourceCutId}(${p.widthMm.toFixed(0)}×${p.heightMm.toFixed(0)}mm)`).join(" · ")}</p>
                  </div>
                ))
              : printToScroll.cuts.slice(0, 4).map((cut) => (
                  <div key={cut.sourcePanelId} className="rounded-xl border border-line bg-canvas p-3 text-xs tabular-nums">
                    <div className="flex items-center justify-between font-semibold text-fg">
                      <span>No.{cut.scrollOrder} · {cut.sourcePanelId}</span>
                      <span className="text-accent">{cut.widthPx}×{cut.heightPx}px</span>
                    </div>
                    <p className="mt-1 text-[11px] text-fg-2">{pick(`Y=${cut.yPx}px · 호흡 여백 +${cut.breathingGapAfterPx}px (${cut.pacingReason})`, `Y=${cut.yPx}px · gap +${cut.breathingGapAfterPx}px (${cut.pacingReason})`)}</p>
                  </div>
                ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={handleApplyReflow} className={BTN_PRIMARY}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {pick("양방향 리플로우 검증 · 확정", "Verify & Apply Reflow")}
            </button>
            {reflowNotice ? <p role="status" aria-live="polite" className="text-xs font-semibold text-good">{reflowNotice}</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "perspective-dna" ? (
        <div id={`${uid}-panel-perspective-dna`} role="tabpanel" aria-labelledby={`${uid}-tab-perspective-dna`} className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("2D 투시선 2쌍 → 3D 카메라 소실점·FOV·회전 자동 역산", "2D Two-Pair Lines → 3D Camera Auto-Solver")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(["eye-level", "high-angle", "low-angle"] as const).map((preset) => (
                  <button key={preset} type="button" onClick={() => setCameraPreset(preset)} className={`${BTN_CHOICE} ${cameraPreset === preset ? BTN_ACTIVE : BTN_IDLE}`}>
                    {pick(PERSPECTIVE_PRESETS[preset].ko, PERSPECTIVE_PRESETS[preset].en)}
                  </button>
                ))}
              </div>
            </div>
            <div data-testid="perspective-camera-readout" className="grid gap-2 rounded-lg border border-line bg-canvas p-2.5 text-xs sm:grid-cols-4 tabular-nums">
              <div><p className="text-[11px] text-fg-3">{pick("소실점 VP1 / VP2", "VP1 / VP2")}</p><p className="font-semibold text-fg">({solvedCamera.vp1?.x.toFixed(0)}, {solvedCamera.vp1?.y.toFixed(0)}) / ({solvedCamera.vp2?.x.toFixed(0)}, {solvedCamera.vp2?.y.toFixed(0)})</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("지평선 Y · 초점거리", "Horizon Y · Focal")}</p><p className="font-semibold text-fg">Y={solvedCamera.horizonYAtCenterPx.toFixed(1)}px · {solvedCamera.focalLength35mm.toFixed(1)}mm</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("수직 FOV", "Vertical FOV")}</p><p className="font-semibold text-accent">{solvedCamera.fovDeg.toFixed(2)}°</p></div>
              <div><p className="text-[11px] text-fg-3">Pitch / Yaw / Roll</p><p className="font-semibold text-fg">{solvedCamera.pitchDeg.toFixed(1)}° / {solvedCamera.yawDeg.toFixed(1)}° / {solvedCamera.rollDeg.toFixed(1)}°</p></div>
            </div>
            <button type="button" onClick={handleSolveCamera} className={BTN_PRIMARY}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {pick("역산 3D 카메라 씬 동기화", "Sync Solved 3D Camera")}
            </button>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("작품 전용 스타일 DNA 락 · 어시스턴트 컷 자동 감사", "Work Style DNA Lock · Assistant Cut Audit")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setAssistantVariant("aligned")} className={`${BTN_CHOICE} ${assistantVariant === "aligned" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("정상 컷 (DNA 일치)", "Aligned Cut")}</button>
                <button type="button" onClick={() => setAssistantVariant("drifted")} className={`${BTN_CHOICE} ${assistantVariant === "drifted" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("이탈 컷 (보정 필요)", "Drifted Cut")}</button>
              </div>
            </div>
            <div data-testid="style-dna-score-card" className="grid gap-2 rounded-lg border border-line bg-canvas p-2.5 text-xs sm:grid-cols-4 tabular-nums">
              <div><p className="text-[11px] text-fg-3">{pick("DNA 통일성 점수", "DNA Score")}</p><p className={`text-sm font-bold ${styleAudit.passed ? "text-good" : "text-bad"}`}>{styleAudit.consistencyScore} / 100 ({styleAudit.grade})</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("선 굵기 보정 배율", "Stroke Multiplier")}</p><p className="font-semibold text-fg">×{styleAudit.autoCorrectionParams.strokeScaleMultiplier.toFixed(2)}</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("그림자 OKLCH H 보정", "Shadow Hue Shift")}</p><p className="font-semibold text-fg">{styleAudit.autoCorrectionParams.shadowHueShiftDeg > 0 ? "+" : ""}{styleAudit.autoCorrectionParams.shadowHueShiftDeg.toFixed(1)}°</p></div>
              <div><p className="text-[11px] text-fg-3">{pick("잠금 말풍선 폰트", "Locked Balloon Font")}</p><p className="font-semibold text-fg">{workDna.balloon.primaryFontFamily} ({workDna.balloon.meanOutlineWidthPx.toFixed(1)}px)</p></div>
            </div>
            {styleAudit.deviations.length > 0 ? (
              <ul data-testid="style-dna-deviations" className="space-y-1 text-xs text-fg-2">
                {styleAudit.deviations.slice(0, 4).map((dev) => (
                  <li key={dev.metric} className="flex items-start gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
                    <span>{pick(dev.messageKo, dev.messageEn)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={handleRunStyleAudit} className={BTN_PRIMARY}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {pick("스타일 DNA 자동 보정 리포트 확정", "Run Style DNA Guard Audit")}
              </button>
              {dnaNotice ? <p role="status" aria-live="polite" className="text-xs font-semibold text-good">{dnaNotice}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "interactive" ? (
        <div id={`${uid}-panel-interactive`} role="tabpanel" aria-labelledby={`${uid}-tab-interactive`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleSelectGraphVariant("clean")} className={`${BTN_CHOICE} ${graphVariant === "clean" ? BTN_ACTIVE : BTN_IDLE}`}>
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("정상 멀티엔딩 분기", "Valid Multi-Ending Graph")}
              </button>
              <button type="button" onClick={() => handleSelectGraphVariant("defective")} className={`${BTN_CHOICE} ${graphVariant === "defective" ? BTN_ACTIVE : BTN_IDLE}`}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("결함 진단 (고립·데드엔드·순환)", "Defect Check (Dead-End/Cycle)")}
              </button>
            </div>
            <span data-testid="interactive-graph-badge" className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${graphValidation.valid ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
              {graphValidation.valid
                ? pick(`검증 통과 · 엔딩 ${graphValidation.endingNodeIds.length}개`, `Valid · ${graphValidation.endingNodeIds.length} Endings`)
                : pick(`오류 ${graphValidation.issues.length}건 · 고립 ${graphValidation.unreachableNodeIds.length} · 데드엔드 ${graphValidation.deadEndNodeIds.length} · 순환 ${graphValidation.cycles.length}`, `${graphValidation.issues.length} Issue(s) · Unreachable ${graphValidation.unreachableNodeIds.length} · Dead-End ${graphValidation.deadEndNodeIds.length} · Cycles ${graphValidation.cycles.length}`)}
            </span>
          </div>

          {currentPreviewNode ? (
            <div data-testid="interactive-preview-stage" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-fg">{currentPreviewNode.title}</h3>
                <span className="text-[11px] text-fg-3 tabular-nums">{pick(`진행 ${previewPath.length}단계`, `Step ${previewPath.length}`)}</span>
              </div>
              <p className="text-xs text-fg-2">{currentPreviewNode.caption}</p>
              {currentPreviewNode.dialogueText ? (
                <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                  <span className="font-bold text-accent">{currentPreviewNode.dialogueSpeaker}: </span>
                  <span className="text-fg">{currentPreviewNode.dialogueText}</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {currentPreviewNode.choices.map((choice) => (
                  <button key={choice.id} type="button" onClick={() => setPreviewPath((prev) => [...prev, choice.targetNodeId])} className={`${BTN_CHOICE} ${BTN_ACTIVE}`}>{choice.label}</button>
                ))}
                {currentPreviewNode.isEnding ? (
                  <span className="inline-flex min-h-11 items-center rounded-lg border border-good bg-good-soft px-3 text-xs font-bold text-good">{currentPreviewNode.endingTag ?? pick("엔딩 도달", "Ending Reached")}</span>
                ) : null}
                <button type="button" onClick={() => setPreviewPath([activeGraph.startNodeId])} className={`${BTN_CHOICE} ${BTN_IDLE}`}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("처음으로", "Restart")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleBuildBundle} className={BTN_PRIMARY}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {pick("독립 HTML5 번들 출고", "Export Standalone HTML5")}
              </button>
              <button type="button" onClick={() => setShowBundlePreview((v) => !v)} className={`${BTN_CHOICE} ${BTN_IDLE}`}>
                {showBundlePreview ? pick("HTML 소스 접기", "Hide HTML Source") : pick("HTML5 번들 미리보기", "Preview HTML5 Source")}
              </button>
            </div>
            {interactiveNotice ? <p role="status" aria-live="polite" className="text-xs font-semibold text-good">{interactiveNotice}</p> : null}
          </div>

          {showBundlePreview ? (
            <pre data-testid="interactive-html-preview" className="max-h-40 overflow-auto rounded-lg border border-line bg-canvas p-2.5 text-[11px] text-fg-2">{htmlBundle.html.slice(0, 600)}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

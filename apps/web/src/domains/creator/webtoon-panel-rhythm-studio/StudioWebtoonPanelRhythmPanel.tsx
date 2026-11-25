/**
 * Wave 43E — 한국 상업 웹툰 세로 스크롤 컷 분할 · 여백 리듬 · 대사 호흡 연출 스튜디오 패널.
 *
 * - 플랫폼 규격 3종(`naver-800` · `kakao-690` · `global-1080`) + 8대 상업 웹툰 세로 연출 리듬 템플릿
 * - 독자 엄지 스크롤 속도 시뮬레이터(추정) · 컷별 높이/여백/대사 미세조정 · 단조로움 경고 & 자동 보정
 * - 실시간 긴장도 곡선 SVG + 세로 컷 스트립 프리뷰 + JSON/SVG 복사·미리보기
 * - Calm Atelier 시맨틱 토큰 전용(원시 색 · 광범위 트랜지션 · 기본 빈 객체 props · Web Storage 미사용)
 */

import {
  Activity, AlertTriangle, CheckCircle2, Code2, Copy, Gauge,
  Layers, Plus, RotateCcw, SlidersHorizontal, Trash2, Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_SCROLL_SPEED_PX_PER_SEC, MAX_SCROLL_SPEED_PX_PER_SEC, MIN_SCROLL_SPEED_PX_PER_SEC,
  PANEL_RHYTHM_TEMPLATES, WEBTOON_PLATFORM_PRESETS,
  analyzeScrollRhythm, autoBalanceGutters, buildRhythmStripSvg, exportPanelRhythmJson,
  getPanelRhythmTemplateSpec, getWebtoonPlatformSpec, instantiateTemplatePanels,
  type AutoBalanceGuttersResult, type PanelBeatInput, type PanelBeatRole,
  type PanelPaceTag, type PanelRhythmTemplateId, type RhythmWarningSeverity,
  type ScrollRhythmAnalysis, type WebtoonPlatformPresetId,
} from "./panel-rhythm-engine";
import { MAX_RHYTHM_PANELS } from "./panel-rhythm-input-contract";
import { RhythmOperationStatus } from "./RhythmOperationStatus";
import { useClipboardOutput } from "./use-clipboard-output";
import { useExampleNotification } from "./use-example-notification";

export interface StudioWebtoonPanelRhythmPanelProps {
  readonly initialPlatform?: WebtoonPlatformPresetId;
  readonly initialTemplate?: PanelRhythmTemplateId;
  readonly initialScrollSpeedPxPerSec?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  /** 계산 예제 결과 알림이며 실제 원고 적용·저장 완료 응답이 아니다. */
  readonly onAnalysisChange?: (analysis: ScrollRhythmAnalysis) => void | Promise<void>;
  readonly onExportJson?: (json: string, analysis: ScrollRhythmAnalysis) => void | Promise<void>;
  readonly onExportSvg?: (svg: string, analysis: ScrollRhythmAnalysis) => void | Promise<void>;
}

type ExportPreviewMode = "json" | "svg" | "hidden";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SPEED_QUICK_PRESETS: readonly { readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly speed: number }[] = [
  { id: "careful", labelKo: "정독 280", labelEn: "Slow 280", speed: 280 },
  { id: "standard", labelKo: "표준 420", labelEn: "Std 420", speed: 420 },
  { id: "fast", labelKo: "쾌속 640", labelEn: "Fast 640", speed: 640 },
];

function roleLabel(role: PanelBeatRole, isEn: boolean): string {
  switch (role) {
    case "establishing": return isEn ? "Establish" : "도입";
    case "dialogue": return isEn ? "Dialogue" : "대사";
    case "closeup": return isEn ? "Close-up" : "클로즈업";
    case "action": return isEn ? "Action" : "액션";
    case "silence": return isEn ? "Silence" : "침묵";
    case "reveal": return isEn ? "Reveal" : "반전";
    case "cliffhanger": return isEn ? "Cliffhanger" : "클리프행어";
    case "panorama": return isEn ? "Panorama" : "파노라마";
  }
}

function paceBadge(pace: PanelPaceTag, isEn: boolean): { readonly label: string; readonly tone: string } {
  if (pace === "rapid") return { label: isEn ? "Rapid" : "쾌속", tone: "border-accent bg-accent-soft text-accent" };
  if (pace === "suspense") return { label: isEn ? "Suspense" : "서스펜스", tone: "border-warn bg-warning-soft text-warn" };
  if (pace === "deliberate") return { label: isEn ? "Deliberate" : "여유", tone: "border-cool bg-info-soft text-cool" };
  return { label: isEn ? "Steady" : "안정", tone: "border-good bg-good-soft text-good" };
}

function warningTone(severity: RhythmWarningSeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";
}

function tensionTextClass(score: number): string {
  if (score >= 82) return "text-bad";
  if (score >= 66) return "text-accent";
  return score >= 50 ? "text-cool" : "text-fg-2";
}

function healthTone(score: number): string {
  return score >= 82 ? "text-good" : score >= 64 ? "text-warn" : "text-bad";
}

function snapTen(value: number): number { return Math.round(value / 10) * 10; }

function RhythmMetricCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function TensionCurveChart(props: { readonly analysis: ScrollRhythmAnalysis; readonly isEn: boolean }): ReactElement {
  const { analysis, isEn } = props;
  const width = 460;
  const height = 164;
  const padL = 34;
  const padR = 18;
  const padT = 16;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const count = analysis.panels.length;

  const coords = analysis.panels.map((panel, idx) => ({
    x: Math.round((count <= 1 ? padL + innerW * 0.5 : padL + (idx / (count - 1)) * innerW) * 10) / 10,
    y: Math.round((padT + (1 - panel.tensionScore / 100) * innerH) * 10) / 10,
    panel,
  }));
  const linePts = coords.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const baseY = padT + innerH;
  const areaPts = coords.length >= 2 ? `${coords[0]!.x},${baseY} ${linePts} ${coords[coords.length - 1]!.x},${baseY}` : "";

  return (
    <svg
      data-testid="rhythm-tension-curve-svg"
      data-peak-tension={analysis.summary.peakTension}
      data-panel-count={count}
      viewBox={`0 0 ${width} ${height}`}
      className="h-44 w-full text-fg"
      role="img"
      aria-label={isEn ? "Panel-by-panel tension curve chart" : "컷별 긴장도 곡선 차트"}
    >
      {[25, 50, 75, 100].map((tick) => {
        const ty = padT + (1 - tick / 100) * innerH;
        return (
          <g key={tick} className="text-fg-3">
            <line x1={padL} y1={ty} x2={width - padR} y2={ty} stroke="currentColor" strokeOpacity={tick === 50 ? 0.35 : 0.18} strokeDasharray={tick === 50 ? "4 4" : undefined} strokeWidth="1" />
            <text x={padL - 6} y={ty + 3} textAnchor="end" fill="currentColor" fontSize="9.5">{tick}</text>
          </g>
        );
      })}
      {areaPts ? <polygon points={areaPts} className="text-accent" fill="currentColor" fillOpacity={0.14} /> : null}
      {coords.length >= 2 ? <polyline points={linePts} className="text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {coords.map(({ x, y, panel }) => {
        const isPeak = panel.index === analysis.summary.peakTensionPanelIndex;
        return (
          <g key={panel.id}>
            <circle cx={x} cy={y} r={isPeak ? 5.5 : 4} className={tensionTextClass(panel.tensionScore)} fill="currentColor" stroke="currentColor" strokeOpacity={0.35} strokeWidth="2" />
            <text x={x} y={y - 8} textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight={isPeak ? "700" : "500"}>{panel.tensionScore}</text>
            <text x={x} y={height - 7} textAnchor="middle" className="text-fg-3" fill="currentColor" fontSize="9.5">{isEn ? `P${panel.index + 1}` : `${panel.index + 1}컷`}</text>
          </g>
        );
      })}
    </svg>
  );
}

function VerticalRhythmStripPreview(props: { readonly analysis: ScrollRhythmAnalysis; readonly isEn: boolean }): ReactElement {
  const { analysis, isEn } = props;
  const stripW = 296;
  const padX = 14;
  const padTop = 32;
  const padBottom = 18;
  const railW = 42;
  const colW = stripW - padX * 2 - railW;
  const scale = colW / Math.max(analysis.platform.widthPx, 1);
  const svgH = padTop + Math.max(120, Math.round(analysis.summary.totalHeightPx * scale)) + padBottom;
  const railLeft = padX + colW + 10;
  const railInnerW = Math.max(20, railW - 14);
  const railPts = analysis.panels
    .map((p) => `${Math.round((railLeft + (p.tensionScore / 100) * railInnerW) * 10) / 10},${Math.round((padTop + (p.topY + p.heightPx * 0.5) * scale) * 10) / 10}`)
    .join(" ");

  return (
    <svg
      data-testid="rhythm-strip-preview-svg"
      data-platform={analysis.platform.id}
      data-template={analysis.templateId ?? "custom"}
      data-panel-count={analysis.summary.panelCount}
      data-total-height-px={analysis.summary.totalHeightPx}
      viewBox={`0 0 ${stripW} ${svgH}`}
      className="mx-auto w-full max-w-[310px] text-fg"
      role="img"
      aria-label={isEn ? "Vertical scroll webtoon beat strip preview" : "세로 스크롤 컷 비트 스트립 프리뷰"}
    >
      <rect x="1" y="1" width={stripW - 2} height={svgH - 2} rx="10" className="text-canvas" fill="currentColor" />
      <rect x="1" y="1" width={stripW - 2} height={svgH - 2} rx="10" className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1" />
      <text x={padX} y="20" className="text-fg-2" fill="currentColor" fontSize="10.5" fontWeight="600">
        {isEn ? `${analysis.platform.shortLabelEn} · ${analysis.platform.widthPx}px` : `${analysis.platform.shortLabelKo} · 폭 ${analysis.platform.widthPx}px`}
      </text>
      {analysis.panels.map((panel) => {
        const y = Math.round((padTop + panel.topY * scale) * 10) / 10;
        const h = Math.max(24, Math.round(panel.heightPx * scale * 10) / 10);
        const gutterH = Math.round(panel.gutterAfterPx * scale * 10) / 10;
        const inset = panel.shape === "wide-bleed" ? 0 : panel.shape === "floating" ? 12 : 5;
        const rx = padX + inset;
        const rw = colW - inset * 2;
        const gMidX = padX + colW * 0.5;
        const toneCls = tensionTextClass(panel.tensionScore);
        return (
          <g key={panel.id} data-strip-panel={panel.id}>
            {panel.shape === "slanted" ? (
              <polygon
                points={`${rx},${y + Math.min(8, h * 0.16)} ${rx + rw},${y} ${rx + rw},${y + h - Math.min(8, h * 0.16)} ${rx},${y + h}`}
                className={toneCls}
                fill="currentColor"
                fillOpacity={0.2}
                stroke="currentColor"
                strokeWidth="1.4"
              />
            ) : (
              <rect
                x={rx} y={y} width={rw} height={h} rx="4"
                className={toneCls}
                fill="currentColor"
                fillOpacity={panel.shape === "blackout-transition" ? 0.34 : 0.18}
                stroke="currentColor"
                strokeWidth="1.4"
              />
            )}
            <text x={rx + 7} y={y + 14} fill="currentColor" fontSize="9.5" fontWeight="600">
              {isEn ? `P${panel.index + 1} ${panel.labelEn}` : `${panel.index + 1}컷 · ${panel.labelKo}`}
            </text>
            {h >= 34 ? (
              <text x={rx + 7} y={y + 27} className="text-fg-2" fill="currentColor" fontSize="8.5">
                {isEn ? `${panel.heightPx}px · ${panel.dwellTimeSec}s · ${panel.dialogueCharCount}ch` : `${panel.heightPx}px · 체류 ${panel.dwellTimeSec}초 · ${panel.dialogueCharCount}자`}
              </text>
            ) : null}
            {gutterH >= 8 ? (
              <g className={panel.inMonotoneStreak ? "text-warn" : "text-fg-3"}>
                <line x1={gMidX} y1={y + h + 2} x2={gMidX} y2={y + h + Math.max(7, gutterH - 2)} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                {gutterH >= 15 ? (
                  <text x={gMidX + 5} y={y + h + gutterH * 0.5 + 3} fill="currentColor" fontSize="8">
                    {`${panel.gutterAfterPx}px · ${panel.silenceBreathSec}s`}
                  </text>
                ) : null}
              </g>
            ) : null}
          </g>
        );
      })}
      <line x1={railLeft} y1={padTop} x2={railLeft} y2={svgH - padBottom} className="text-line-strong" stroke="currentColor" strokeWidth="1" />
      {analysis.panels.length >= 2 ? (
        <polyline points={railPts} className="text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {analysis.panels.map((p) => (
        <circle key={`dot-${p.id}`} cx={railLeft + (p.tensionScore / 100) * railInnerW} cy={padTop + (p.topY + p.heightPx * 0.5) * scale} r="3" className="text-accent" fill="currentColor" />
      ))}
    </svg>
  );
}

/** 한국 상업 웹툰 세로 스크롤 컷 분할·여백 리듬·대사 호흡 연출 스튜디오 패널. */
export function StudioWebtoonPanelRhythmPanel(props: StudioWebtoonPanelRhythmPanelProps): ReactElement {
  const {
    initialPlatform = "naver-800",
    initialTemplate = "action-3beat-impact",
    initialScrollSpeedPxPerSec = DEFAULT_SCROLL_SPEED_PX_PER_SEC,
    locale,
    className,
    onAnalysisChange,
    onExportJson,
    onExportSvg,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "en";
  const analysisNotification = useExampleNotification(onAnalysisChange);
  const jsonNotification = useExampleNotification<readonly [string, ScrollRhythmAnalysis]>(onExportJson ? ([text, result]) => onExportJson(text, result) : undefined);
  const svgNotification = useExampleNotification<readonly [string, ScrollRhythmAnalysis]>(onExportSvg ? ([text, result]) => onExportSvg(text, result) : undefined);
  const clipboard = useClipboardOutput();
  const operations = [analysisNotification, jsonNotification, svgNotification, clipboard];
  const pending = operations.some((operation) => operation.status === "pending");
  function isPending(): boolean { return operations.some((operation) => operation.isPending()); }
  const lastAnalysis = useRef<ScrollRhythmAnalysis | null>(null);
  const notifyAnalysis = analysisNotification.notify;
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [platformId, setPlatformId] = useState<WebtoonPlatformPresetId>(initialPlatform);
  const [templateId, setTemplateId] = useState<PanelRhythmTemplateId>(initialTemplate);
  const [scrollSpeed, setScrollSpeed] = useState<number>(initialScrollSpeedPxPerSec);
  const [panels, setPanels] = useState<readonly PanelBeatInput[]>(() => instantiateTemplatePanels(initialTemplate, initialPlatform));
  const [exportMode, setExportMode] = useState<ExportPreviewMode>("json");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [lastBalance, setLastBalance] = useState<AutoBalanceGuttersResult | null>(null);
  const customPanelSeq = useRef(1);

  const analysis = useMemo<ScrollRhythmAnalysis>(
    () => analyzeScrollRhythm({ panels, platformId, scrollSpeedPxPerSec: scrollSpeed, templateId }),
    [panels, platformId, scrollSpeed, templateId],
  );
  const stripSvg = useMemo<string>(() => buildRhythmStripSvg(analysis, { locale: isEn ? "en" : "ko" }), [analysis, isEn]);
  const layoutJson = useMemo<string>(() => exportPanelRhythmJson(analysis), [analysis]);

  useEffect(() => {
    if (lastAnalysis.current === analysis) return;
    lastAnalysis.current = analysis;
    notifyAnalysis(analysis);
  }, [analysis, notifyAnalysis]);

  const handleSelectPlatform = (nextId: WebtoonPlatformPresetId): void => {
    if (isPending()) return;
    if (nextId === platformId) return;
    const prevSpec = getWebtoonPlatformSpec(platformId);
    const nextSpec = getWebtoonPlatformSpec(nextId);
    const ratio = nextSpec.widthPx / prevSpec.widthPx;
    setPlatformId(nextId);
    setPanels((prev) => prev.map((p) => ({
      ...p,
      heightPx: Math.min(2400, Math.max(220, snapTen(p.heightPx * ratio))),
      gutterAfterPx: Math.min(900, Math.max(60, snapTen(p.gutterAfterPx * ratio))),
    })));
    setLastBalance(null);
    setStatusMessage(pick(`${nextSpec.labelKo} 규격으로 컷·여백 비율을 스케일링했습니다.`, `Scaled panels and gutters to ${nextSpec.labelEn}.`));
  };

  const handleSelectTemplate = (nextId: PanelRhythmTemplateId): void => {
    if (isPending()) return;
    const spec = getPanelRhythmTemplateSpec(nextId);
    setTemplateId(spec.id);
    setPanels(instantiateTemplatePanels(spec.id, platformId));
    setScrollSpeed(spec.recommendedScrollSpeedPxPerSec);
    setLastBalance(null);
    setStatusMessage(pick(`${spec.labelKo} 템플릿을 적용했습니다.`, `Loaded ${spec.labelEn} template.`));
  };

  const handleUpdatePanel = (index: number, patch: Partial<Pick<PanelBeatInput, "heightPx" | "gutterAfterPx" | "dialogueCharCount">>): void => {
    if (isPending()) return;
    setPanels((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setLastBalance(null);
  };

  const handleAddPanel = (): void => {
    if (isPending() || panels.length >= MAX_RHYTHM_PANELS) return;
    const platform = getWebtoonPlatformSpec(platformId);
    const nextSeq = customPanelSeq.current;
    customPanelSeq.current += 1;
    setPanels(function appendPanel(previous): readonly PanelBeatInput[] {
      if (previous.length >= MAX_RHYTHM_PANELS) return previous;
      return [...previous, {
        id: `custom-${nextSeq}`, labelKo: `추가 컷 ${previous.length + 1}`, labelEn: `Extra Panel ${previous.length + 1}`,
        role: "dialogue", heightPx: snapTen(platform.widthPx * 0.65), gutterAfterPx: platform.idealAverageGutterPx,
        dialogueCharCount: 18, shape: "standard", visualDensity: "medium",
      }];
    });
    setLastBalance(null);
    setStatusMessage(pick("새 컷을 시퀀스 끝에 추가했습니다.", "Appended a new panel to the sequence."));
  };

  const handleRemovePanel = (index: number): void => {
    if (isPending()) return;
    if (panels.length <= 2) return;
    setPanels((prev) => prev.filter((_, i) => i !== index));
    setLastBalance(null);
    setStatusMessage(pick(`${index + 1}번 컷을 제거했습니다.`, `Removed panel ${index + 1}.`));
  };

  const handleAutoBalance = (): void => {
    if (isPending()) return;
    const balanced = autoBalanceGutters(panels, platformId, scrollSpeed, templateId);
    setPanels(balanced.panels);
    setLastBalance(balanced);
    setStatusMessage(
      balanced.adjustments.length > 0
        ? pick(
            `${balanced.adjustments.length}개 여백을 자동 보정했습니다 (리듬 점수 ${balanced.beforeAnalysis.summary.rhythmHealthScore} → ${balanced.afterAnalysis.summary.rhythmHealthScore}).`,
            `Auto-balanced ${balanced.adjustments.length} gutters (score ${balanced.beforeAnalysis.summary.rhythmHealthScore} -> ${balanced.afterAnalysis.summary.rhythmHealthScore}).`,
          )
        : pick("현재 예제 여백이 모델의 범위와 대비 기준을 충족합니다.", "The example gutters meet the model ranges and contrast targets."),
    );
  };

  const handleResetTemplate = (): void => {
    if (isPending()) return;
    const spec = getPanelRhythmTemplateSpec(templateId);
    setPanels(instantiateTemplatePanels(templateId, platformId));
    setScrollSpeed(spec.recommendedScrollSpeedPxPerSec);
    setLastBalance(null);
    setStatusMessage(pick("현재 템플릿의 기본 컷·여백 값으로 복원했습니다.", "Restored template defaults."));
  };

  const handleCopyJson = (): void => {
    if (isPending()) return;
    jsonNotification.notify([layoutJson, analysis]);
    clipboard.notify(layoutJson);
    setExportMode("json");
    setStatusMessage(pick("JSON 예제 알림과 클립보드 응답을 아래에서 확인하세요.", "Check the JSON example notification and clipboard response below."));
  };

  const handleCopySvg = (): void => {
    if (isPending()) return;
    svgNotification.notify([stripSvg, analysis]);
    clipboard.notify(stripSvg);
    setExportMode("svg");
    setStatusMessage(pick("SVG 예제 알림과 클립보드 응답을 아래에서 확인하세요.", "Check the SVG example notification and clipboard response below."));
  };

  const activeTemplate = getPanelRhythmTemplateSpec(templateId);
  const speedSliderId = `${uid}-scroll-speed`;

  return (
    <section
      data-testid="studio-webtoon-panel-rhythm-panel"
      aria-busy={pending}
      aria-label={pick("웹툰 세로 스크롤 컷 · 여백 리듬 스튜디오", "Webtoon Vertical Panel Rhythm Studio")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <p data-testid="rhythm-scope-notice" className="rounded-lg border border-line bg-panel p-3 text-xs text-fg-2">{pick("CPU 좌표·여백 계산 예제입니다. 폭·권장 여백·읽기 속도와 긴장도는 모델 가정이며 현행 플랫폼 제출 기준이나 실측 독자 반응이 아닙니다. 실제 원고를 읽거나 적용·저장하지 않으며 새로 열면 초기화됩니다.", "CPU geometry and gutter examples. Widths, gutter targets, reading speed and tension are model assumptions, not current platform requirements or measured reader responses. No manuscript is read or changed; inputs are not saved and reset on reopening.")}</p>
      <RhythmOperationStatus channel="analysis" status={analysisNotification.status} retry={analysisNotification.retry} pending={pending} isEn={isEn} />
      <RhythmOperationStatus channel="json" status={jsonNotification.status} retry={jsonNotification.retry} pending={pending} isEn={isEn} />
      <RhythmOperationStatus channel="svg" status={svgNotification.status} retry={svgNotification.retry} pending={pending} isEn={isEn} />
      <RhythmOperationStatus channel="clipboard" status={clipboard.status} retry={clipboard.retry} pending={pending} isEn={isEn} />
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("세로 스크롤 연출", "Vertical Pacing")}
            </span>
            <span data-testid="rhythm-estimate-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
              <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("추정 시뮬레이션", "Estimated Simulation")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("웹툰 컷 분할 · 여백 리듬 · 대사 호흡 스튜디오", "Webtoon Panel Rhythm & Gutter Studio")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "플랫폼 폭과 독자 엄지 스크롤 속도를 기준으로 컷 체류 시간·침묵 호흡·긴장도 곡선·클리프행어 타이밍을 설계합니다.",
              "Design vertical webtoon gutter cadence, dwell timing, tension curves, and cliffhanger drops.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="rhythm-auto-balance-btn" onClick={handleAutoBalance} className={BTN_SOLID}>
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("자동 리듬 보정", "Auto-Balance Gutters")}
          </button>
          <button type="button" data-testid="rhythm-reset-btn" onClick={handleResetTemplate} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
          <button type="button" data-testid="rhythm-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="rhythm-copy-svg-btn" onClick={handleCopySvg} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("SVG 복사", "Copy SVG")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="rhythm-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RhythmMetricCard
          testId="rhythm-health-score" label={pick("리듬 완성도 점수", "Rhythm Health Score")}
          value={`${analysis.summary.rhythmHealthScore} / 100`}
          subtext={analysis.warnings.length === 0 ? pick("단조로움·규격 경고 0건", "0 pacing warnings") : pick(`경고 ${analysis.warnings.length}건 감지`, `${analysis.warnings.length} warnings`)}
          valueTone={healthTone(analysis.summary.rhythmHealthScore)}
        />
        <RhythmMetricCard
          testId="rhythm-total-height" label={pick("총 세로 스크롤 길이", "Total Scroll Height")}
          value={`${analysis.summary.totalHeightPx.toLocaleString("ko-KR")}px`}
          subtext={pick(`${analysis.platform.shortLabelKo} · 약 ${analysis.summary.viewportScreensCount}화면`, `${analysis.platform.shortLabelEn} · ~${analysis.summary.viewportScreensCount} screens`)}
        />
        <RhythmMetricCard
          testId="rhythm-total-time" label={pick("총 감상 호흡 (추정)", "Est. Read Experience")}
          value={`${analysis.summary.totalExperienceSec}s`}
          subtext={pick(`체류 ${analysis.summary.totalDwellSec}초 · 침묵 ${analysis.summary.totalSilenceSec}초`, `Dwell ${analysis.summary.totalDwellSec}s · Silence ${analysis.summary.totalSilenceSec}s`)}
        />
        <RhythmMetricCard
          testId="rhythm-tension-range" label={pick("긴장도 진폭 · 엔딩 준비도", "Tension Spread & Hook")}
          value={`Δ${analysis.summary.tensionDynamicRange}`}
          subtext={pick(`최고 ${analysis.summary.peakTension} · 클리프행어 ${analysis.summary.cliffhangerReadinessScore}점`, `Peak ${analysis.summary.peakTension} · Hook ${analysis.summary.cliffhangerReadinessScore}`)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("1. 연재 플랫폼 규격 (3종)", "1. Platform Spec (3 Presets)")}</h3>
            <span className="text-[11px] font-medium text-fg-3 tabular-nums">
              {pick(`표준 여백 ${analysis.platform.recommendedGutterMinPx}~${analysis.platform.recommendedGutterMaxPx}px`, `Gutter ${analysis.platform.recommendedGutterMinPx}-${analysis.platform.recommendedGutterMaxPx}px`)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {WEBTOON_PLATFORM_PRESETS.map((spec) => (
              <button key={spec.id} type="button" data-testid={`rhythm-platform-${spec.id}`} aria-pressed={spec.id === platformId} onClick={() => handleSelectPlatform(spec.id)} className={spec.id === platformId ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{isEn ? spec.shortLabelEn : spec.shortLabelKo}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? analysis.platform.pacingNoteEn : analysis.platform.pacingNoteKo}</p>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={speedSliderId} className="text-xs font-bold text-fg [word-break:keep-all]">
              {pick("2. 독자 평균 엄지 스크롤 속도 (추정)", "2. Reader Thumb Scroll Speed (Est.)")}
            </label>
            <span data-testid="rhythm-speed-readout" className="text-xs font-bold text-accent tabular-nums">{`${scrollSpeed} px/s`}</span>
          </div>
          <input
            id={speedSliderId} data-testid="rhythm-speed-slider" type="range"
            min={MIN_SCROLL_SPEED_PX_PER_SEC} max={MAX_SCROLL_SPEED_PX_PER_SEC} step={10} value={scrollSpeed}
            onChange={(event) => setScrollSpeed(Number(event.target.value))}
            className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            {SPEED_QUICK_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`rhythm-speed-preset-${preset.id}`} aria-pressed={scrollSpeed === preset.speed} onClick={() => setScrollSpeed(preset.speed)} className={scrollSpeed === preset.speed ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{isEn ? preset.labelEn : preset.labelKo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("3. 8대 한국 상업 웹툰 세로 연출 리듬 템플릿", "3. Eight Commercial Webtoon Rhythm Templates")}</h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? activeTemplate.rhythmSignatureEn : activeTemplate.rhythmSignatureKo}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {PANEL_RHYTHM_TEMPLATES.map((tpl) => {
            const active = tpl.id === templateId;
            return (
              <button
                key={tpl.id} type="button" data-testid={`rhythm-template-${tpl.id}`} aria-pressed={active}
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  active ? "border-accent bg-accent-soft text-fg" : "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-fg">{isEn ? tpl.shortLabelEn : tpl.shortLabelKo}</span>
                  <span className="rounded border border-line bg-card px-1.5 py-0.5 text-[10px] font-semibold text-fg-3">{isEn ? tpl.genreEn : tpl.genreKo}</span>
                </div>
                <span className="text-[11px] text-fg-3">{isEn ? tpl.rhythmSignatureEn : tpl.rhythmSignatureKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid="rhythm-warnings-panel" className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
            {analysis.warnings.length === 0 ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />}
            <span className="[word-break:keep-all]">
              {analysis.warnings.length === 0
                ? pick("리듬 진단 통과 · 단조로움 및 규격 경고 없음", "Pacing Audit Passed · No Warnings")
                : pick(`리듬 경고 ${analysis.warnings.length}건 — 자동 보정으로 해소 가능`, `${analysis.warnings.length} Rhythm Warnings Detected`)}
            </span>
          </div>
          <span className="text-[11px] text-fg-3 tabular-nums">
            {pick(`평균 여백 ${analysis.summary.averageGutterPx}px · 표준편차 ${analysis.summary.gutterStdDevPx}px`, `Avg Gutter ${analysis.summary.averageGutterPx}px · SD ${analysis.summary.gutterStdDevPx}px`)}
          </span>
        </div>
        {analysis.warnings.length > 0 ? (
          <ul className="space-y-1.5">
            {analysis.warnings.map((w, idx) => (
              <li key={`${w.code}-${idx}`} data-testid={`rhythm-warning-${w.code}`} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${warningTone(w.severity)}`}>
                <div className="font-bold">{isEn ? w.titleEn : w.titleKo}</div>
                <div className="mt-0.5 opacity-90">{isEn ? w.detailEn : w.detailKo}</div>
              </li>
            ))}
          </ul>
        ) : null}
        {lastBalance && lastBalance.adjustments.length > 0 ? (
          <div data-testid="rhythm-balance-summary" className="rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good [word-break:keep-all]">
            {lastBalance.adjustments.map((a) => (isEn ? `P${a.index + 1}: ${a.beforeGutterPx}->${a.afterGutterPx}px` : `${a.index + 1}컷 ${a.beforeGutterPx}→${a.afterGutterPx}px`)).join(" · ")}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.85fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("실시간 긴장도 곡선 (0~100)", "Live Tension Curve (0-100)")}</span>
              </div>
              <span className="text-[11px] text-fg-3 tabular-nums">
                {analysis.summary.peakTensionPanelIndex >= 0
                  ? pick(`최고 정점: ${analysis.summary.peakTensionPanelIndex + 1}컷 (${analysis.summary.peakTension}점)`, `Peak: P${analysis.summary.peakTensionPanelIndex + 1} (${analysis.summary.peakTension})`)
                  : "-"}
              </span>
            </div>
            <TensionCurveChart analysis={analysis} isEn={isEn} />
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("4. 컷별 높이 · 하단 여백 · 대사 호흡 미세조정", "4. Per-Panel Height, Gutter & Dialogue Controls")}</span>
              </div>
              <button type="button" data-testid="rhythm-add-panel-btn" disabled={panels.length >= MAX_RHYTHM_PANELS} onClick={handleAddPanel} className={BTN_OUTLINE}>
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("컷 추가", "Add Panel")}
              </button>
            </div>
            <p className="text-[11px] text-fg-3">{pick(`현재 ${panels.length}컷 · 예제 상한 ${MAX_RHYTHM_PANELS}컷`, `${panels.length} panels · example limit ${MAX_RHYTHM_PANELS}`)}</p>
            <div className="space-y-2.5">
              {analysis.panels.map((panel) => {
                const pace = paceBadge(panel.paceTag, isEn);
                const hId = `${uid}-h-${panel.id}`;
                const gId = `${uid}-g-${panel.id}`;
                const dId = `${uid}-d-${panel.id}`;
                return (
                  <div key={panel.id} data-testid={`rhythm-panel-row-${panel.index}`} className={`space-y-2 rounded-xl border p-3 ${panel.inMonotoneStreak ? "border-warn bg-warning-soft" : "border-line bg-card"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] font-bold text-fg tabular-nums">{isEn ? `P${panel.index + 1}` : `${panel.index + 1}컷`}</span>
                        <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? panel.labelEn : panel.labelKo}</span>
                        <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">{roleLabel(panel.role, isEn)}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${pace.tone}`}>{pace.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-fg-2 tabular-nums">
                        <span data-testid={`panel-dwell-${panel.index}`}>{pick(`체류 ${panel.dwellTimeSec}s`, `Dwell ${panel.dwellTimeSec}s`)}</span>
                        <span data-testid={`panel-silence-${panel.index}`}>{pick(`침묵 ${panel.silenceBreathSec}s`, `Silence ${panel.silenceBreathSec}s`)}</span>
                        <span data-testid={`panel-tension-${panel.index}`} className="font-bold text-accent">{pick(`긴장 ${panel.tensionScore}`, `T${panel.tensionScore}`)}</span>
                        <button
                          type="button" data-testid={`panel-remove-${panel.index}`} disabled={analysis.panels.length <= 2}
                          aria-label={pick(`${panel.index + 1}번 컷 삭제`, `Remove panel ${panel.index + 1}`)}
                          onClick={() => handleRemovePanel(panel.index)}
                          className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-canvas text-fg-3 transition-colors motion-reduce:transition-none hover:border-bad hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor={hId} className="font-medium text-fg-2">{pick("컷 높이", "Height")}</label>
                          <span className="font-semibold text-fg tabular-nums">{`${panel.heightPx}px`}</span>
                        </div>
                        <input id={hId} data-testid={`panel-height-${panel.index}`} type="range" min={220} max={2000} step={20} value={panel.heightPx} onChange={(e) => handleUpdatePanel(panel.index, { heightPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor={gId} className="font-medium text-fg-2">{pick("하단 여백", "Gutter")}</label>
                          <span className="font-semibold text-fg tabular-nums">{`${panel.gutterAfterPx}px`}</span>
                        </div>
                        <input id={gId} data-testid={`panel-gutter-${panel.index}`} type="range" min={40} max={800} step={10} value={panel.gutterAfterPx} onChange={(e) => handleUpdatePanel(panel.index, { gutterAfterPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor={dId} className="font-medium text-fg-2">{pick("대사 글자 수", "Dialogue")}</label>
                          <span className="font-semibold text-fg tabular-nums">{isEn ? `${panel.dialogueCharCount} ch` : `${panel.dialogueCharCount}자`}</span>
                        </div>
                        <input id={dId} data-testid={`panel-dialogue-${panel.index}`} type="range" min={0} max={120} step={2} value={panel.dialogueCharCount} onChange={(e) => handleUpdatePanel(panel.index, { dialogueCharCount: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("세로 스크롤 컷 스트립 프리뷰", "Vertical Beat Strip Preview")}</h3>
            <span className="text-[11px] text-fg-3 tabular-nums">{`${analysis.summary.panelCount}${isEn ? " cuts" : "컷"}`}</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto rounded-lg border border-line bg-raised p-2.5">
            <VerticalRhythmStripPreview analysis={analysis} isEn={isEn} />
          </div>
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">
            {pick("우측 궤적은 컷 중심의 긴장도(0~100)를, 점선은 컷 사이 침묵 여백(px·초)을 나타냅니다.", "The right rail plots per-panel tension (0-100); dashed lines mark gutter pixels and silence breath.")}
          </p>
        </aside>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-fg [word-break:keep-all]">{pick("레이아웃 내보내기 미리보기", "Layout Export Preview")}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="rhythm-preview-tab-json" aria-pressed={exportMode === "json"} onClick={() => setExportMode("json")} className={exportMode === "json" ? BTN_ACTIVE : BTN_OUTLINE}>JSON</button>
            <button type="button" data-testid="rhythm-preview-tab-svg" aria-pressed={exportMode === "svg"} onClick={() => setExportMode("svg")} className={exportMode === "svg" ? BTN_ACTIVE : BTN_OUTLINE}>SVG</button>
            <button type="button" data-testid="rhythm-preview-tab-hidden" aria-pressed={exportMode === "hidden"} onClick={() => setExportMode("hidden")} className={exportMode === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("접기", "Hide")}</button>
          </div>
        </div>
        {exportMode !== "hidden" ? (
          <pre data-testid="rhythm-export-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {exportMode === "json" ? layoutJson : stripSvg}
          </pre>
        ) : null}
      </div>
      </fieldset>
    </section>
  );
}

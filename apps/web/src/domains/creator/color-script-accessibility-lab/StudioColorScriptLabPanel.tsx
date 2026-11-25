/**
 * Wave 41D — 회차 4막 OKLCH 감정 컬러 스크립트 · 4종 LMS 색각이상 시뮬레이터 ·
 * 다크/라이트 모바일 양면 뷰어 경계·할로 검수 랩 패널.
 *
 * - 3탭 인터랙티브 컬러 랩 (4막 컬러 스크립트 아크 / 4종 색각이상 시뮬레이터 / 다크·라이트 양면 경계 검수).
 * - Calm Atelier 시맨틱 토큰 전용 (TSX 원시 hex/rgb/hsl 리터럴 0건 · inline style 0건 · SVG 데이터 바인딩 프리뷰).
 */

import {
  AlertTriangle, CheckCircle2, Eye, Layers, Moon, Palette,
  RotateCcw, ShieldCheck, SlidersHorizontal, Sun, Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  auditDualViewerReadability, buildEpisodeColorScriptArc, CVD_TYPE_METADATA,
  DUAL_VIEWER_PANEL_PRESETS, EPISODE_EMOTION_ARC_PRESETS, evaluateColorPairAccessibility,
  HARMONY_RULES, oklchToSrgb, simulateColorVisionDeficiency, srgbToOklch, WEBTOON_CVD_AUDIT_PAIRS,
  type ColorPairAuditInput, type ColorVisionDeficiencyType, type DiscriminabilityStatus,
  type DualViewerPanelInput, type EmotionArcPresetId, type HarmonyRuleId,
  type RgbColor, type RiskSeverity,
} from "./colorblind-harmony-engine";

import { useExampleNotification } from "./use-example-notification";

export type ColorScriptLabTabId = "arc" | "cvd" | "dualViewer";

export interface StudioColorScriptLabPanelProps {
  readonly initialTab?: ColorScriptLabTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  /** 메모리 예제 결과 알림이며 실제 원고·기기·설정 적용이나 저장 완료 응답이 아니다. */
  readonly onHarmonyRuleChange?: (rule: HarmonyRuleId) => void | Promise<void>;
  readonly onCvdTypeChange?: (type: ColorVisionDeficiencyType) => void | Promise<void>;
  readonly onApplySafeColor?: (pairId: string, suggestedHex: string) => void | Promise<void>;
  readonly onApplyDualViewerRepair?: (presetId: string, recommendedBorderHex: string) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

function getStatusToneClass(status: DiscriminabilityStatus): string {
  return status === "safe" ? "border-good/40 bg-good-soft text-good" : status === "caution" ? "border-warn/40 bg-warning-soft text-warn" : "border-bad/40 bg-bad-soft text-bad";
}

function getRiskToneClass(risk: RiskSeverity): string {
  return risk === "safe" ? "border-good/40 bg-good-soft text-good" : risk === "warning" ? "border-warn/40 bg-warning-soft text-warn" : "border-bad/40 bg-bad-soft text-bad";
}

function getStatusLabel(status: DiscriminabilityStatus, isEn: boolean): string {
  if (status === "safe") return isEn ? "Safe" : "구분 안전";
  return status === "caution" ? (isEn ? "Caution" : "혼동 주의") : (isEn ? "Collision" : "구분 충돌");
}

function getRiskLabel(risk: RiskSeverity, isEn: boolean): string {
  if (risk === "safe") return isEn ? "Safe" : "안전";
  return risk === "warning" ? (isEn ? "Warning" : "주의") : (isEn ? "Critical" : "위험");
}

function worstRisk(a: RiskSeverity, b: RiskSeverity): RiskSeverity {
  if (a === "critical" || b === "critical") return "critical";
  return a === "warning" || b === "warning" ? "warning" : "safe";
}

interface SwatchBadgeSvgProps {
  readonly fillHex: string;
  readonly strokeHex?: string;
  readonly label: string;
  readonly sizeClass?: string;
}

function SwatchBadgeSvg({ fillHex, strokeHex, label, sizeClass = "h-4 w-4" }: SwatchBadgeSvgProps): ReactElement {
  return (
    <svg viewBox="0 0 20 20" role="img" aria-label={label} className={`${sizeClass} shrink-0 rounded border border-line`}>
      <rect x="0" y="0" width="20" height="20" rx="4" fill={fillHex} stroke={strokeHex} strokeWidth={strokeHex ? 2 : 0} />
    </svg>
  );
}

interface RangeRowProps {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly readout: string;
  readonly readoutTestId?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}

function RangeRow({ id, testId, label, readout, readoutTestId, min, max, step, value, onChange }: RangeRowProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-semibold text-fg">{label}</label>
        <span data-testid={readoutTestId} className="font-bold text-accent tabular-nums">{readout}</span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** Wave 41D 회차 컬러 스크립트 · 4종 LMS 색각이상 시뮬레이터 · 다크/라이트 양면 경계 검수 패널. */
export function StudioColorScriptLabPanel(props: StudioColorScriptLabPanelProps): ReactElement {
  const {
    initialTab = "arc", locale = "ko", className,
    onHarmonyRuleChange, onCvdTypeChange, onApplySafeColor, onApplyDualViewerRepair,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const harmonyNotification = useExampleNotification(onHarmonyRuleChange);
  const cvdNotification = useExampleNotification(onCvdTypeChange);
  const safeColorNotification = useExampleNotification(onApplySafeColor ? (value: readonly [string, string]) => onApplySafeColor(value[0], value[1]) : undefined);
  const dualNotification = useExampleNotification(onApplyDualViewerRepair ? (value: readonly [string, string]) => onApplyDualViewerRepair(value[0], value[1]) : undefined);
  const notifications = [harmonyNotification, cvdNotification, safeColorNotification, dualNotification];
  const isPending = (): boolean => notifications.some((n) => n.isPending());
  const [activeTab, setActiveTab] = useState<ColorScriptLabTabId>(initialTab);
  const [arcPresetId, setArcPresetId] = useState<EmotionArcPresetId>(EPISODE_EMOTION_ARC_PRESETS[0]!.id);
  const [baseHueDeg, setBaseHueDeg] = useState<number>(EPISODE_EMOTION_ARC_PRESETS[0]!.baseHueDeg);
  const [harmonyRule, setHarmonyRule] = useState<HarmonyRuleId>(EPISODE_EMOTION_ARC_PRESETS[0]!.harmonyRule);
  const [baseChroma, setBaseChroma] = useState<number>(EPISODE_EMOTION_ARC_PRESETS[0]!.baseChroma);
  const [tensionCurve, setTensionCurve] = useState<readonly [number, number, number, number]>(EPISODE_EMOTION_ARC_PRESETS[0]!.tensionCurve);

  const [activeCvdType, setActiveCvdType] = useState<ColorVisionDeficiencyType>("protanopia");
  const [cvdSeverity, setCvdSeverity] = useState<number>(1);
  const [activePairId, setActivePairId] = useState<string>(WEBTOON_CVD_AUDIT_PAIRS[0]!.id);
  const [overrideColorB, setOverrideColorB] = useState<RgbColor | null>(null);

  const [dualPresetId, setDualPresetId] = useState<string>(DUAL_VIEWER_PANEL_PRESETS[0]!.id);
  const [dualInput, setDualInput] = useState<DualViewerPanelInput>(DUAL_VIEWER_PANEL_PRESETS[0]!);

  const arcResult = useMemo(
    () => buildEpisodeColorScriptArc({ baseHueDeg, harmonyRule, baseChroma, tensionCurve, presetId: arcPresetId }),
    [baseHueDeg, harmonyRule, baseChroma, tensionCurve, arcPresetId],
  );
  const activeBasePair = useMemo(
    () => WEBTOON_CVD_AUDIT_PAIRS.find((p) => p.id === activePairId) ?? WEBTOON_CVD_AUDIT_PAIRS[0]!,
    [activePairId],
  );
  const effectivePair: ColorPairAuditInput = useMemo(
    () => (overrideColorB ? { ...activeBasePair, colorB: overrideColorB } : activeBasePair),
    [activeBasePair, overrideColorB],
  );
  const pairReport = useMemo(() => evaluateColorPairAccessibility(effectivePair, cvdSeverity), [effectivePair, cvdSeverity]);
  const activeSimA = useMemo(() => simulateColorVisionDeficiency(effectivePair.colorA, activeCvdType, cvdSeverity), [effectivePair.colorA, activeCvdType, cvdSeverity]);
  const activeSimB = useMemo(() => simulateColorVisionDeficiency(effectivePair.colorB, activeCvdType, cvdSeverity), [effectivePair.colorB, activeCvdType, cvdSeverity]);
  const activeCvdCheck = useMemo(() => pairReport.checks.find((c) => c.type === activeCvdType) ?? pairReport.checks[0]!, [pairReport.checks, activeCvdType]);
  const dualReport = useMemo(() => auditDualViewerReadability(dualInput), [dualInput]);
  const borderLightness = useMemo(() => srgbToOklch(dualInput.borderColor).L, [dualInput.borderColor]);

  const handleSelectArcPreset = (presetId: EmotionArcPresetId): void => {
    if (isPending()) return;
    const preset = EPISODE_EMOTION_ARC_PRESETS.find((p) => p.id === presetId) ?? EPISODE_EMOTION_ARC_PRESETS[0]!;
    setArcPresetId(preset.id);
    setBaseHueDeg(preset.baseHueDeg);
    setHarmonyRule(preset.harmonyRule);
    setBaseChroma(preset.baseChroma);
    setTensionCurve(preset.tensionCurve);
    harmonyNotification.notify(preset.harmonyRule);
  };

  const handleSelectHarmonyRule = (nextRule: HarmonyRuleId): void => {
    if (isPending()) return;
    setHarmonyRule(nextRule);
    harmonyNotification.notify(nextRule);
  };

  const handleUpdateTension = (actIndex: 0 | 1 | 2 | 3, value: number): void => {
    if (isPending()) return;
    setTensionCurve((prev) => {
      const next: [number, number, number, number] = [prev[0], prev[1], prev[2], prev[3]];
      next[actIndex] = value;
      return next;
    });
  };

  const handleSelectCvdType = (nextType: ColorVisionDeficiencyType): void => {
    if (isPending()) return;
    setActiveCvdType(nextType);
    cvdNotification.notify(nextType);
  };

  const handleSelectPair = (pairId: string): void => {
    if (isPending()) return;
    setActivePairId(pairId);
    setOverrideColorB(null);
  };

  const handleApplySafeAlternative = (): void => {
    if (isPending()) return;
    if (!pairReport.suggestion) return;
    setOverrideColorB(pairReport.suggestion.suggestedColorB);
    safeColorNotification.notify([effectivePair.id, pairReport.suggestion.suggestedHex]);
  };

  const handleSelectDualPreset = (presetId: string): void => {
    if (isPending()) return;
    const preset = DUAL_VIEWER_PANEL_PRESETS.find((p) => p.id === presetId) ?? DUAL_VIEWER_PANEL_PRESETS[0]!;
    setDualPresetId(preset.id);
    setDualInput(preset);
  };

  const handleBorderLightnessChange = (nextL: number): void => {
    if (isPending()) return;
    const lch = srgbToOklch(dualInput.borderColor);
    setDualInput((prev) => ({ ...prev, borderColor: oklchToSrgb({ L: nextL, C: lch.C, h: lch.h }) }));
  };

  const handleApplyDualRepair = (): void => {
    if (isPending()) return;
    const r = dualReport.repairSuggestion;
    setDualInput((prev) => ({
      ...prev,
      borderColor: r.recommendedBorderColor,
      borderWidthPx: r.recommendedBorderWidthPx,
      gutterEdgeColor: r.recommendedGutterEdgeColor,
      outerHaloWidthPx: r.recommendedOuterHaloWidthPx,
      hasTransparentOutside: true,
    }));
    dualNotification.notify([dualInput.id, r.recommendedBorderHex]);
  };

  const tabs: readonly { readonly id: ColorScriptLabTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "arc", label: pick("4막 감정 컬러 스크립트 아크", "4-Act Color Script Arc"), icon: <Palette className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "cvd", label: pick("4종 색각이상 LMS 시뮬레이터", "4-Type LMS CVD Simulator"), icon: <Eye className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "dualViewer", label: pick("다크·라이트 양면 경계 검수", "Dark/Light Dual Viewer"), icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const tensionPoints = arcResult.acts.map((act, idx) => `${44 + idx * 88},${Math.round(78 - act.tension * 58)}`).join(" ");
  const dualGradeBadgeClass = dualReport.grade === "pass"
    ? "border-good/40 bg-good-soft text-good"
    : dualReport.grade === "caution"
      ? "border-warn/40 bg-warning-soft text-warn"
      : "border-bad/40 bg-bad-soft text-bad";

  return (
    <section
      data-testid="color-script-a11y-panel"
      aria-busy={notifications.some((n) => n.status === "pending")}
      aria-label={pick("회차 4막 컬러 스크립트 · 4종 색각이상 LMS 시뮬레이터 · 다크/라이트 양면 뷰어 검수 랩", "Episode 4-Act Color Script, LMS CVD Simulator & Dual-Viewer Lab")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Wave 41D · OKLCH 합성 아크 · LMS 근사 모델 · 양면 SVG 예제", "Wave 41D · Synthetic OKLCH Arc · Approximate LMS Models · Dual SVG Example")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick("컬러 스크립트 · 색각이상 접근성 · 다크/라이트 경계 검수 랩", "Color Script · Color Vision Accessibility · Dual-Viewer Lab")}
          </h2>
        </div>
        <div className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-semibold text-good tabular-nums">
          {pick(`양면 점수 ${dualReport.overallScore}점 · 최저 ΔE00 ${pairReport.minDeltaE00.toFixed(1)}`, `Dual ${dualReport.overallScore}/100 · Min ΔE00 ${pairReport.minDeltaE00.toFixed(1)}`)}
        </div>
      </header>
      <p data-testid="color-script-scope-notice" className="text-xs text-fg-2">{pick("고정 합성 색·도형을 CPU와 SVG로 비교하는 모델 계산 예제입니다. 색각 시뮬레이션·대비·경계 점수는 실제 이용자 접근성·모바일 기기·영상·원고 픽셀의 실측이나 출고 승인이 아닙니다. 실제 원고·설정·영구 저장에는 반영하지 않으며 패널을 닫으면 예제 상태가 사라집니다.", "CPU and SVG model calculations compare fixed synthetic colors and shapes. CVD, contrast and border scores are not measured user accessibility, mobile hardware, media or manuscript pixels, nor publication approval. No manuscript, settings or persistent storage changes; state ends when this panel closes.")}</p>
      {notifications.map((n, i) => n.status !== "idle" ? <div key={i} data-testid={`color-notification-${i}`} role={n.status === "failed" ? "alert" : "status"} className="text-xs text-fg-2">
        {n.status === "failed" ? pick("예제 알림 실패", "Example notification failed") : n.status === "pending" ? pick("예제 알림 대기 중", "Example notification pending") : n.status === "local-only" ? pick("메모리 예제만 변경됨 · 수신자 미연결", "Memory example changed; no receiver") : pick("예제 알림 완료", "Example notification delivered")} · {pick("실제 적용·저장 완료 아님", "No real apply or save confirmed")}
        {n.status === "failed" ? <button type="button" onClick={n.retry} className={BTN_OUTLINE}>{pick("예제 알림 다시 시도", "Retry example notification")}</button> : null}
      </div> : null)}
      <fieldset disabled={notifications.some((n) => n.status === "pending")} className="m-0 min-w-0 space-y-4 border-0 p-0">

      <div role="tablist" aria-label={pick("컬러 스크립트 및 접근성 검수 탭", "Color Script & Accessibility Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              data-testid={`csa-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BASE} ${selected ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "arc" && (
        <div id={`${uid}-panel-arc`} role="tabpanel" aria-labelledby={`${uid}-tab-arc`} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("회차 장르별 감정 아크 프리셋 (4종)", "Episode Emotion Arc Presets")}</h3>
              <span data-testid="arc-climax-badge" className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">
                {pick(
                  `절정 막: ${arcResult.acts.find((a) => a.actId === arcResult.climaxActId)?.labelKo ?? ""} · 채도 진폭 ${arcResult.chromaDynamicRange.toFixed(3)}`,
                  `Climax: ${arcResult.climaxActId} · Chroma Span ${arcResult.chromaDynamicRange.toFixed(3)}`,
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EPISODE_EMOTION_ARC_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  data-testid={`arc-preset-${preset.id}`}
                  type="button"
                  aria-pressed={arcPresetId === preset.id}
                  onClick={() => handleSelectArcPreset(preset.id)}
                  className={`${arcPresetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start text-left`}
                >
                  <span>{isEn ? preset.labelEn : preset.labelKo}</span>
                  <span className="text-[11px] font-normal text-fg-2">{isEn ? preset.summaryEn : preset.summaryKo}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-fg">{pick("OKLCH 하모니 규칙", "OKLCH Harmony Rule")}</div>
                <div className="grid grid-cols-2 gap-2">
                  {HARMONY_RULES.map((rule) => (
                    <button
                      key={rule.id}
                      data-testid={`harmony-rule-${rule.id}`}
                      type="button"
                      aria-pressed={harmonyRule === rule.id}
                      onClick={() => handleSelectHarmonyRule(rule.id)}
                      className={harmonyRule === rule.id ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {isEn ? rule.labelEn : rule.labelKo}
                    </button>
                  ))}
                </div>
                <RangeRow id={`${uid}-base-hue`} testId="arc-hue-slider" label={pick("기준 색상각 (OKLCH Hue)", "Base Hue Angle")} readout={`${Math.round(baseHueDeg)}°`} readoutTestId="arc-hue-readout" min={0} max={355} step={5} value={baseHueDeg} onChange={setBaseHueDeg} />
                <RangeRow id={`${uid}-base-chroma`} testId="arc-chroma-slider" label={pick("기본 채도 (Base Chroma)", "Base Chroma")} readout={baseChroma.toFixed(2)} min={0.06} max={0.22} step={0.01} value={baseChroma} onChange={setBaseChroma} />
              </div>

              <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-fg">{pick("4막 감정 긴장도 곡선 · 필름스트립", "4-Act Tension Curve & Filmstrip")}</span>
                  <span className="text-[11px] text-fg-2 tabular-nums">{pick("긴장도 → 명도↓ · 채도↑", "Tension → Value↓ · Chroma↑")}</span>
                </div>
                <svg data-testid="episode-arc-svg" viewBox="0 0 352 148" role="img" aria-label={pick("4막 감정 컬러 스크립트 필름스트립 및 긴장도 그래프", "4-Act Color Script Filmstrip and Tension Graph")} className="h-36 w-full rounded-lg border border-line bg-panel">
                  {arcResult.acts.map((act, actIdx) => (
                    <g key={act.actId} transform={`translate(${8 + actIdx * 86}, 88)`}>
                      {act.swatches.map((swatch, sIdx) => (
                        <rect key={swatch.role} x={sIdx * 15} y={0} width={14} height={50} rx={2} fill={swatch.hex} />
                      ))}
                    </g>
                  ))}
                  <polyline points={tensionPoints} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent" />
                  {arcResult.acts.map((act, idx) => (
                    <circle key={act.actId} cx={44 + idx * 88} cy={Math.round(78 - act.tension * 58)} r="5" fill={act.swatches[3]!.hex} stroke="currentColor" strokeWidth="1.5" className="text-fg" />
                  ))}
                </svg>
                <div className="grid grid-cols-2 gap-2">
                  {arcResult.acts.map((act, idx) => (
                    <RangeRow key={act.actId} id={`${uid}-tension-${act.actId}`} testId={`arc-tension-${act.actId}`} label={isEn ? act.labelEn : act.labelKo} readout={`${Math.round(act.tension * 100)}%`} min={0.1} max={1} step={0.05} value={act.tension} onChange={(v) => handleUpdateTension(idx as 0 | 1 | 2 | 3, v)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {arcResult.acts.map((act) => (
              <article key={act.actId} data-testid={`arc-card-${act.actId}`} className="space-y-2.5 rounded-xl border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-fg">{isEn ? act.labelEn : act.labelKo}</h4>
                  <span className="text-[11px] font-semibold text-fg-2 tabular-nums">
                    {pick(`긴장 ${Math.round(act.tension * 100)}% · 최고 C ${act.peakChroma.toFixed(3)} · 명암폭 ${(act.luminanceSpan * 100).toFixed(0)}%`, `Tension ${Math.round(act.tension * 100)}% · Peak C ${act.peakChroma.toFixed(3)}`)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {act.swatches.map((swatch) => (
                    <div key={swatch.role} className="space-y-1 rounded-lg border border-line bg-canvas p-1.5 text-center">
                      <SwatchBadgeSvg fillHex={swatch.hex} label={`${isEn ? swatch.labelEn : swatch.labelKo} ${swatch.hex}`} sizeClass="h-7 w-full" />
                      <div className="truncate text-[10px] font-semibold text-fg">{isEn ? swatch.labelEn : swatch.labelKo}</div>
                      <div className="text-[10px] text-fg-3 tabular-nums">{swatch.hex}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-fg-2">{isEn ? act.directorNoteEn : act.directorNoteKo}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "cvd" && (
        <div id={`${uid}-panel-cvd`} role="tabpanel" aria-labelledby={`${uid}-tab-cvd`} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("4종 색각이상 정밀 LMS 시뮬레이션 모델", "4-Type Linear LMS CVD Simulator")}</h3>
              <span data-testid="cvd-overall-badge" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${getStatusToneClass(pairReport.overallStatus)}`}>
                {`${getStatusLabel(pairReport.overallStatus, isEn)} · 최저 ΔE00 ${pairReport.minDeltaE00.toFixed(1)}`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CVD_TYPE_METADATA.map((meta) => (
                <button
                  key={meta.id}
                  data-testid={`cvd-type-${meta.id}`}
                  type="button"
                  aria-pressed={activeCvdType === meta.id}
                  onClick={() => handleSelectCvdType(meta.id)}
                  className={`${activeCvdType === meta.id ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start text-left`}
                >
                  <span>{isEn ? meta.labelEn : meta.labelKo}</span>
                  <span className="text-[10px] font-normal text-fg-2">{meta.modelTag}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-fg">{pick("캐릭터 · 효과음 대비 검수 쌍 (4종)", "Character & SFX Pair Presets")}</div>
                <div className="space-y-1.5">
                  {WEBTOON_CVD_AUDIT_PAIRS.map((pair) => (
                    <button
                      key={pair.id}
                      data-testid={`cvd-pair-${pair.id}`}
                      type="button"
                      aria-pressed={activePairId === pair.id}
                      onClick={() => handleSelectPair(pair.id)}
                      className={`${activePairId === pair.id ? BTN_ACTIVE : BTN_OUTLINE} w-full justify-between text-left`}
                    >
                      <span className="truncate">{isEn ? pair.labelEn : pair.labelKo}</span>
                      <span className="inline-flex items-center gap-1">
                        <SwatchBadgeSvg fillHex={simulateColorVisionDeficiency(pair.colorA, "protanopia", 0).originalHex} label={isEn ? pair.roleAEn : pair.roleAKo} />
                        <SwatchBadgeSvg fillHex={simulateColorVisionDeficiency(pair.colorB, "protanopia", 0).originalHex} label={isEn ? pair.roleBEn : pair.roleBKo} />
                      </span>
                    </button>
                  ))}
                </div>
                <RangeRow id={`${uid}-cvd-severity`} testId="cvd-severity-slider" label={pick("색각 결손 강도 (0% 정상 ↔ 100% 완전)", "CVD Severity")} readout={`${Math.round(cvdSeverity * 100)}%`} readoutTestId="cvd-severity-readout" min={0} max={1} step={0.1} value={cvdSeverity} onChange={setCvdSeverity} />
              </div>

              <div className="space-y-2.5 rounded-lg border border-line bg-canvas p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-fg">{pick("정상 시야 vs 시뮬레이션 시야 비교", "Normal Vision vs Simulated View")}</span>
                  <span data-testid="cvd-active-deltae" className="font-bold text-accent tabular-nums">
                    {`ΔE00 ${activeCvdCheck.deltaE00.toFixed(1)} · ΔY ${(activeCvdCheck.luminanceDiff * 100).toFixed(0)}%`}
                  </span>
                </div>
                <svg data-testid="cvd-comparison-svg" viewBox="0 0 320 124" role="img" aria-label={pick("정상 시야와 선택 색각이상 시야의 캐릭터 및 효과음 대비 비교", "Normal vs Simulated Character and SFX Pair Comparison")} className="h-32 w-full rounded-lg border border-line bg-panel">
                  <g transform="translate(8, 10)">
                    <rect x="0" y="0" width="144" height="104" rx="8" fill={activeSimA.originalHex} />
                    <polygon points="96,18 112,42 136,46 116,64 122,90 96,76 70,90 76,64 56,46 80,42" fill={activeSimB.originalHex} />
                    <circle cx="40" cy="54" r="24" fill={activeSimB.originalHex} opacity="0.92" />
                  </g>
                  <g transform="translate(168, 10)">
                    <rect x="0" y="0" width="144" height="104" rx="8" fill={activeSimA.simulatedHex} />
                    <polygon points="96,18 112,42 136,46 116,64 122,90 96,76 70,90 76,64 56,46 80,42" fill={activeSimB.simulatedHex} />
                    <circle cx="40" cy="54" r="24" fill={activeSimB.simulatedHex} opacity="0.92" />
                  </g>
                </svg>

                <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  {pairReport.checks.map((chk) => (
                    <div key={chk.type} data-testid={`cvd-matrix-${chk.type}`} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${getStatusToneClass(chk.status)}`}>
                      <span className="font-semibold">{isEn ? chk.labelEn.split(" ")[0] : chk.labelKo.split(" ")[0]}</span>
                      <span>{`ΔE ${chk.deltaE00.toFixed(1)} · ΔY ${(chk.luminanceDiff * 100).toFixed(0)}%`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {pairReport.suggestion ? (
              <div data-testid="cvd-suggestion-card" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warning-soft p-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-fg">
                      {pick(`모델 후보 색 제안: ${pairReport.suggestion.originalBHex} → ${pairReport.suggestion.suggestedHex}`, `Model Candidate: ${pairReport.suggestion.originalBHex} → ${pairReport.suggestion.suggestedHex}`)}
                    </div>
                    <p className="text-[11px] text-fg-2">{isEn ? pairReport.suggestion.reasonEn : pairReport.suggestion.reasonKo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SwatchBadgeSvg fillHex={pairReport.suggestion.suggestedHex} label={pairReport.suggestion.suggestedHex} sizeClass="h-8 w-8" />
                  <button data-testid="cvd-apply-safe-btn" type="button" onClick={handleApplySafeAlternative} className={BTN_SOLID}>
                    <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pick("후보 색을 예제에 적용", "Apply Safe Color")}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div data-testid="cvd-safe-banner" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-good/40 bg-good-soft p-3 text-xs font-semibold text-good">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {pick("적색맹·녹색맹·청황색맹·전색맹 4종 모델의 예제 구분 기준을 충족합니다.", "Passes discriminability checks across all 4 color vision models.")}
                </span>
                {overrideColorB ? (
                  <button data-testid="cvd-reset-color-btn" type="button" onClick={() => setOverrideColorB(null)} className={BTN_OUTLINE}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pick("원래 색 복원", "Reset Color")}</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "dualViewer" && (
        <div id={`${uid}-panel-dualViewer`} role="tabpanel" aria-labelledby={`${uid}-tab-dualViewer`} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">
                {pick(`모바일 다크(${dualReport.darkViewer.viewerBgHex}) vs 라이트(${dualReport.lightViewer.viewerBgHex}) 양면 뷰어 검수`, `Mobile Dark (${dualReport.darkViewer.viewerBgHex}) vs Light (${dualReport.lightViewer.viewerBgHex}) Audit`)}
              </h3>
              <span data-testid="dual-viewer-score-badge" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${dualGradeBadgeClass}`}>
                {pick(`양면 가독성 ${dualReport.overallScore}점 · ${dualReport.grade === "pass" ? "예제 기준 통과" : dualReport.grade === "caution" ? "보완 권장" : "예제 기준 미달"}`, `Dual Score ${dualReport.overallScore}/100 · ${dualReport.grade.toUpperCase()}`)}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DUAL_VIEWER_PANEL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  data-testid={`dual-preset-${preset.id}`}
                  type="button"
                  aria-pressed={dualPresetId === preset.id}
                  onClick={() => handleSelectDualPreset(preset.id)}
                  className={`${dualPresetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE} justify-start text-left`}
                >
                  <span className="truncate">{isEn ? preset.labelEn : preset.labelKo}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("컷 테두리 · 외곽 할로 실시간 조정", "Live Border & Halo Controls")}</span>
                </div>
                <RangeRow id={`${uid}-border-width`} testId="dual-border-width-slider" label={pick("컷 테두리 두께", "Cut Border Width")} readout={`${dualInput.borderWidthPx.toFixed(1)}px`} min={0} max={5} step={0.5} value={dualInput.borderWidthPx} onChange={(v) => setDualInput((prev) => ({ ...prev, borderWidthPx: v }))} />
                <RangeRow id={`${uid}-border-lightness`} testId="dual-border-lightness-slider" label={pick("테두리 명도 (OKLCH L)", "Border Lightness (L)")} readout={`${Math.round(borderLightness * 100)}%`} min={0.08} max={0.96} step={0.02} value={borderLightness} onChange={handleBorderLightnessChange} />
                <RangeRow id={`${uid}-halo-width`} testId="dual-halo-width-slider" label={pick("외곽 흰 여백 할로 폭", "Outer Halo Bleed Width")} readout={`${dualInput.outerHaloWidthPx.toFixed(1)}px`} min={0} max={5} step={0.5} value={dualInput.outerHaloWidthPx} onChange={(v) => setDualInput((prev) => ({ ...prev, outerHaloWidthPx: v }))} />
                <button
                  data-testid="dual-transparent-toggle"
                  type="button"
                  aria-pressed={dualInput.hasTransparentOutside}
                  onClick={() => setDualInput((prev) => ({ ...prev, hasTransparentOutside: !prev.hasTransparentOutside }))}
                  className={`${dualInput.hasTransparentOutside ? BTN_ACTIVE : BTN_OUTLINE} w-full`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{dualInput.hasTransparentOutside ? pick("PNG 외곽 투명 매트 활성", "Transparent Outer Matte: ON") : pick("흰 배경 불투명 매트 (할로 유발)", "Opaque White Matte (Halo Risk)")}</span>
                </button>
              </div>

              <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-fg"><Moon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("다크 뷰어", "Dark")}</span>
                  <span className="inline-flex items-center gap-1 font-bold text-fg"><Sun className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("라이트 뷰어", "Light")}</span>
                </div>
                <svg data-testid="dual-viewer-preview-svg" viewBox="0 0 320 132" role="img" aria-label={pick("모바일 다크모드와 라이트모드 양면 컷 경계 및 할로 비교 미리보기", "Side-by-side Mobile Dark and Light Viewer Cut Preview")} className="h-32 w-full rounded-lg border border-line">
                  {[{ x: 0, bg: dualReport.darkViewer.viewerBgHex }, { x: 160, bg: dualReport.lightViewer.viewerBgHex }].map((viewer) => (
                    <g key={viewer.x} transform={`translate(${viewer.x}, 0)`}>
                      <rect x="0" y="0" width="160" height="132" fill={viewer.bg} />
                      {dualInput.outerHaloWidthPx > 0 ? (
                        <rect x={22 - dualInput.outerHaloWidthPx} y={20 - dualInput.outerHaloWidthPx} width={116 + dualInput.outerHaloWidthPx * 2} height={92 + dualInput.outerHaloWidthPx * 2} rx="6" fill={dualReport.gutterEdgeHex} />
                      ) : null}
                      <rect x="22" y="20" width="116" height="92" rx="4" fill={dualReport.panelFillHex} stroke={dualReport.borderHex} strokeWidth={dualInput.borderWidthPx} />
                      <circle cx="62" cy="58" r="14" fill={dualReport.borderHex} opacity="0.45" />
                      <rect x="84" y="44" width="38" height="22" rx="8" fill={dualReport.gutterEdgeHex} opacity="0.85" />
                    </g>
                  ))}
                </svg>

                <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  <div data-testid="dual-dark-audit" className={`rounded-lg border p-2 ${getRiskToneClass(worstRisk(dualReport.darkViewer.borderVanishRisk, dualReport.darkViewer.haloBleedRisk))}`}>
                    <div className="font-bold">{pick(`다크 (${dualReport.darkViewer.viewerBgHex})`, `Dark (${dualReport.darkViewer.viewerBgHex})`)}</div>
                    <div>{pick(`테두리 소실: ${getRiskLabel(dualReport.darkViewer.borderVanishRisk, isEn)}`, `Border Vanish: ${getRiskLabel(dualReport.darkViewer.borderVanishRisk, isEn)}`)}</div>
                    <div>{pick(`할로 위험: ${dualReport.darkViewer.haloBleedScore}/100 (${getRiskLabel(dualReport.darkViewer.haloBleedRisk, isEn)})`, `Halo Bleed: ${dualReport.darkViewer.haloBleedScore}/100`)}</div>
                  </div>
                  <div data-testid="dual-light-audit" className={`rounded-lg border p-2 ${getRiskToneClass(worstRisk(dualReport.lightViewer.borderVanishRisk, dualReport.lightViewer.haloBleedRisk))}`}>
                    <div className="font-bold">{pick(`라이트 (${dualReport.lightViewer.viewerBgHex})`, `Light (${dualReport.lightViewer.viewerBgHex})`)}</div>
                    <div>{pick(`테두리 소실: ${getRiskLabel(dualReport.lightViewer.borderVanishRisk, isEn)}`, `Border Vanish: ${getRiskLabel(dualReport.lightViewer.borderVanishRisk, isEn)}`)}</div>
                    <div>{pick(`대비율: ${dualReport.lightViewer.borderVsBgContrast.toFixed(2)}:1`, `Contrast: ${dualReport.lightViewer.borderVsBgContrast.toFixed(2)}:1`)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3">
              <div className="space-y-1 text-xs">
                <div className="font-bold text-fg">{pick("예제 경계 보정 제안", "Dual-Viewer Repair Prescription")}</div>
                <p data-testid="dual-repair-guidance" className="text-[11px] text-fg-2">
                  {isEn ? dualReport.repairSuggestion.guidanceEn : dualReport.repairSuggestion.guidanceKo}
                </p>
              </div>
              <button data-testid="dual-viewer-apply-repair-btn" type="button" onClick={handleApplyDualRepair} className={BTN_SOLID}>
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("예제 경계 보정", "Auto-Fix Dual Border")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </fieldset>
    </section>
  );
}

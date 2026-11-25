/**
 * Wave 50B — 문맥 적응형 UI 단순화 · 스마트 스태킹 & 저사양 기기 메모리/발열 가드 스튜디오 패널.
 *
 * - 5대 창작 단계 문맥 선택(콘티·선화·채색·식자·출고) + 집중 부스트 + 접이식 보조 서랍 미리보기
 * - 4대 기기 티어 시뮬레이터 + 4대 고부하 기능 토글 + 비파괴 자동 안전 강등(3D 정지·임파스토 LOD·프리캐시 스로틀링)
 * - 순수 시맨틱 SVG 2단 시각화: (좌) UI 복잡도 다이어트 전/후·캔버스 점유율 도해, (우) 메모리·발열·프레임 예산 게이지
 *   (oklch/currentColor 전용, 원시 색 0건, 바이올렛 휴 270~320° 0%)
 * - 스마트 어시스턴트 스태킹 우선순위 큐(최대 2개 노출 검증) + 단일 제스처 매크로 4종 편집 + 적용/원복 + JSON 복사
 */

import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, Code2, Copy,
  Cpu, Eye, EyeOff, Focus, Gauge, Hand, Layers, RotateCcw,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Thermometer, Undo2, X,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ASSISTANT_DOMAIN_META, CANVAS_VIEWPORT_TARGET_PCT, DEVICE_FEATURE_LOADS,
  DEVICE_TIER_SPECS, GESTURE_ACTION_OPTIONS, STUDIO_CONTEXT_PROFILES,
  applyAdaptiveCalmSession, applyRecommendedDegradations, computeAdaptiveCalmLayoutPlan,
  createAdaptiveCalmSession, evaluateDeviceThermalBudget, exportAdaptiveCalmConfigJson,
  findDuplicateGestureActions, getStudioContextProfile, rankAndStackAssistantSuggestions,
  resetGestureMacros, revertAdaptiveCalmSession, toggleDegradationGuard,
  updateGestureMacro, updateWorkingCalmSnapshot,
  type AdaptiveCalmConfigSnapshot, type AdaptiveCalmLayoutPlan,
  type AdaptiveCalmSessionState, type DeviceFeatureId, type DeviceThermalBudgetReport,
  type DeviceTierId, type GestureActionId, type GestureTriggerId,
  type RankedAssistantCard, type StudioContextId, type SuggestionSeverity,
  type ThermalBudgetStatus,
} from "./adaptive-calm-stack-engine";

export interface StudioAdaptiveCalmGuardPanelProps {
  readonly initialContextId?: StudioContextId;
  readonly initialDeviceTier?: DeviceTierId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (snapshot: AdaptiveCalmConfigSnapshot, session: AdaptiveCalmSessionState) => void;
  readonly onExportJson?: (json: string, session: AdaptiveCalmSessionState) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_WARN = `${BTN_BASE} border border-warn bg-warning-soft px-3 py-2 text-warn`;

/** 모든 휴(Hue)가 바이올렛 대역(270~320°) 밖인 순수 OKLCH SVG 팔레트. */
const SVG_OKLCH = {
  paper: "oklch(0.97 0.008 85)",
  surface: "oklch(0.93 0.012 82)",
  track: "oklch(0.87 0.012 84)",
  safeFill: "oklch(0.64 0.14 156 / 0.20)",
  safeStroke: "oklch(0.50 0.15 156)",
  warnFill: "oklch(0.74 0.15 74 / 0.22)",
  warnStroke: "oklch(0.60 0.16 74)",
  badFill: "oklch(0.58 0.19 26 / 0.20)",
  badStroke: "oklch(0.52 0.20 26)",
  accentBlue: "oklch(0.52 0.14 228)",
  accentTeal: "oklch(0.54 0.13 196)",
  mutedSlate: "oklch(0.56 0.03 238)",
} as const;

const budgetToneClass = (status: ThermalBudgetStatus): string =>
  status === "critical" ? "border-bad bg-bad-soft text-bad"
    : status === "caution" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";

const budgetOklchStroke = (status: ThermalBudgetStatus): string =>
  status === "critical" ? SVG_OKLCH.badStroke : status === "caution" ? SVG_OKLCH.warnStroke : SVG_OKLCH.safeStroke;

const severityToneClass = (severity: SuggestionSeverity): string =>
  severity === "critical" ? "border-bad bg-bad-soft text-bad"
    : severity === "warning" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";

function snapshotsEqual(a: AdaptiveCalmConfigSnapshot, b: AdaptiveCalmConfigSnapshot): boolean {
  if (a.contextId !== b.contextId || a.focusBoost !== b.focusBoost || a.deviceTierId !== b.deviceTierId) return false;
  if (
    a.features.canvas4k !== b.features.canvas4k || a.features.bg3dViewport !== b.features.bg3dViewport
    || a.features.impastoTexture !== b.features.impastoTexture || a.features.localAiAssist !== b.features.localAiAssist
  ) return false;
  if (a.appliedDegradationIds.length !== b.appliedDegradationIds.length) return false;
  for (let i = 0; i < a.appliedDegradationIds.length; i += 1) {
    if (a.appliedDegradationIds[i] !== b.appliedDegradationIds[i]) return false;
  }
  if (a.gestures.length !== b.gestures.length) return false;
  for (let i = 0; i < a.gestures.length; i += 1) {
    const ga = a.gestures[i];
    const gb = b.gestures[i];
    if (!ga || !gb || ga.actionId !== gb.actionId || ga.enabled !== gb.enabled) return false;
  }
  return true;
}

function ComplexityDietBeforeAfterSvg(props: { readonly plan: AdaptiveCalmLayoutPlan; readonly isEn: boolean }): ReactElement {
  const { plan, isEn } = props;
  const barX = 16, barW = 248;
  const afterComplexW = Math.max(14, Math.round((plan.adaptedComplexityIndex / 100) * barW));
  const beforeVpW = Math.round((plan.baselineViewportPct / 100) * barW);
  const afterVpW = Math.round((plan.adaptedViewportPct / 100) * barW);
  const targetVpX = Math.round(barX + (CANVAS_VIEWPORT_TARGET_PCT / 100) * barW);

  return (
    <svg
      data-testid="calm-complexity-diet-svg" data-context-id={plan.contextId}
      data-complexity-reduction={plan.complexityReductionPct}
      data-visible-controls={plan.visibleControlCount} data-adapted-viewport={plan.adaptedViewportPct}
      viewBox="0 0 280 226" role="img"
      className="h-auto w-full rounded-xl border border-line bg-canvas text-fg"
      aria-label={isEn
        ? `UI complexity diet comparison: reduced by ${plan.complexityReductionPct} percent and canvas expanded to ${plan.adaptedViewportPct} percent`
        : `UI 복잡도 다이어트 전후 비교: 복잡도 ${plan.complexityReductionPct}% 절감, 캔버스 점유율 ${plan.adaptedViewportPct}% 확보`}
    >
      <rect x="0" y="0" width="280" height="226" rx="10" fill={SVG_OKLCH.paper} />

      <text x={barX} y="22" fill="currentColor" fontSize="10" fontWeight="700">
        {isEn ? "UI COMPLEXITY INDEX (BEFORE → AFTER)" : "UI 복잡도 지수 (적용 전 → 후)"}
      </text>
      <rect x="202" y="10" width="62" height="17" rx="8.5" fill={SVG_OKLCH.safeFill} stroke={SVG_OKLCH.safeStroke} strokeWidth="1" />
      <text x="233" y="21.5" textAnchor="middle" fill={SVG_OKLCH.safeStroke} fontSize="9.5" fontWeight="800" fontFamily="monospace">
        {`-${plan.complexityReductionPct}%`}
      </text>

      <text x={barX} y="42" fill={SVG_OKLCH.mutedSlate} fontSize="8.5" fontWeight="600">
        {isEn ? `Before: All ${plan.totalControlCount} panels open` : `적용 전: 전체 ${plan.totalControlCount}개 패널 고정`}
      </text>
      <text x={barX + barW} y="42" textAnchor="end" fill={SVG_OKLCH.mutedSlate} fontSize="8.5" fontWeight="700" fontFamily="monospace">100</text>
      <rect x={barX} y="47" width={barW} height="14" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="47" width={barW} height="14" rx="5" fill={SVG_OKLCH.warnFill} stroke={SVG_OKLCH.warnStroke} strokeWidth="1.2" />

      <text x={barX} y="76" fill={SVG_OKLCH.accentBlue} fontSize="8.5" fontWeight="700">
        {isEn ? `After: ${plan.visibleControlCount} core pinned (${plan.collapsedControlCount} in drawer)` : `적용 후: 핵심 ${plan.visibleControlCount}개 고정 (${plan.collapsedControlCount}개 서랍)`}
      </text>
      <text x={barX + barW} y="76" textAnchor="end" fill={SVG_OKLCH.safeStroke} fontSize="8.5" fontWeight="800" fontFamily="monospace">{plan.adaptedComplexityIndex}</text>
      <rect x={barX} y="81" width={barW} height="16" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="81" width={afterComplexW} height="16" rx="5" fill={SVG_OKLCH.safeStroke} />

      <line x1={barX} y1="112" x2={barX + barW} y2="112" stroke="currentColor" strokeOpacity={0.14} strokeWidth="1" />

      <text x={barX} y="130" fill="currentColor" fontSize="10" fontWeight="700">
        {isEn ? "CANVAS VIEWPORT AREA (≥82% GOAL)" : "캔버스 점유율 (목표 ≥82%)"}
      </text>
      <text x={barX + barW} y="130" textAnchor="end" fill={SVG_OKLCH.accentTeal} fontSize="9.5" fontWeight="800" fontFamily="monospace">{`+${plan.viewportGainPct}%p`}</text>

      <text x={barX} y="148" fill={SVG_OKLCH.mutedSlate} fontSize="8.5" fontWeight="600">{isEn ? "Before Diet" : "정리 전"}</text>
      <text x={barX + barW} y="148" textAnchor="end" fill={SVG_OKLCH.mutedSlate} fontSize="8.5" fontWeight="700" fontFamily="monospace">{`${plan.baselineViewportPct}%`}</text>
      <rect x={barX} y="153" width={barW} height="12" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="153" width={beforeVpW} height="12" rx="5" fill={SVG_OKLCH.mutedSlate} fillOpacity={0.45} />

      <text x={barX} y="180" fill={SVG_OKLCH.accentTeal} fontSize="8.5" fontWeight="700">
        {isEn ? `Calm Stack (${plan.contextLabelEn})` : `적응형 배치 (${plan.contextLabelKo})`}
      </text>
      <text x={barX + barW} y="180" textAnchor="end" fill={SVG_OKLCH.accentTeal} fontSize="8.5" fontWeight="800" fontFamily="monospace">{`${plan.adaptedViewportPct}%`}</text>
      <rect x={barX} y="185" width={barW} height="14" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="185" width={afterVpW} height="14" rx="5" fill={SVG_OKLCH.accentTeal} />

      <line x1={targetVpX} y1="149" x2={targetVpX} y2="205" stroke={SVG_OKLCH.badStroke} strokeWidth="1.4" strokeDasharray="3 2" />
      <text x={targetVpX - 3} y="216" textAnchor="end" fill={SVG_OKLCH.badStroke} fontSize="8" fontWeight="700" fontFamily="monospace">82% MIN</text>
      <text x={barX} y="216" fill={SVG_OKLCH.safeStroke} fontSize="8" fontWeight="700">
        {plan.meetsComplexityDietTarget ? (isEn ? "60%+ Diet Goal Met" : "복잡도 60%+ 절감 달성") : (isEn ? "Diet Below Target" : "목표 미달")}
      </text>
    </svg>
  );
}

function DeviceThermalBudgetGaugeSvg(props: { readonly report: DeviceThermalBudgetReport; readonly isEn: boolean }): ReactElement {
  const { report, isEn } = props;
  const barX = 16, barW = 248;
  const cur = report.current;
  const proj = report.projectedAfterAllGuards;
  const statusStroke = budgetOklchStroke(cur.status);

  const memFillW = Math.min(barW, Math.max(10, Math.round((Math.min(120, cur.memoryUtilizationPct) / 120) * barW)));
  const projMemX = Math.round(barX + (Math.min(120, proj.memoryUtilizationPct) / 120) * barW);
  const memSafeLimitX = Math.round(barX + (75 / 120) * barW);
  const memBudget100X = Math.round(barX + (100 / 120) * barW);

  const thermalFillW = Math.min(barW, Math.max(10, Math.round((cur.thermalLoadPct / 100) * barW)));
  const projThermalX = Math.round(barX + (proj.thermalLoadPct / 100) * barW);
  const thermalColor = cur.thermalLoadPct >= 88 ? SVG_OKLCH.badStroke : cur.thermalLoadPct >= 72 ? SVG_OKLCH.warnStroke : SVG_OKLCH.accentBlue;

  const frameFillW = Math.min(barW, Math.max(10, Math.round((Math.min(30, cur.estimatedFrameMs) / 30) * barW)));
  const frameTargetX = Math.round(barX + (16.6 / 30) * barW);
  const frameColor = cur.estimatedFrameMs > 22 ? SVG_OKLCH.badStroke : cur.estimatedFrameMs > 16.6 ? SVG_OKLCH.warnStroke : SVG_OKLCH.accentTeal;

  const statusTag = cur.status === "critical" ? (isEn ? "GUARD NEEDED" : "강등 필요")
    : cur.status === "caution" ? (isEn ? "CAUTION" : "주의") : (isEn ? "SAFE" : "안전");
  const statusFill = cur.status === "critical" ? SVG_OKLCH.badFill : cur.status === "caution" ? SVG_OKLCH.warnFill : SVG_OKLCH.safeFill;

  return (
    <svg
      data-testid="device-budget-gauge-svg" data-device-tier={report.deviceTier.id}
      data-budget-status={cur.status} data-memory-mb={cur.estimatedMemoryMb}
      data-thermal-pct={cur.thermalLoadPct} data-fps={cur.estimatedFps}
      viewBox="0 0 280 226" role="img"
      className="h-auto w-full rounded-xl border border-line bg-canvas text-fg"
      aria-label={isEn
        ? `Device memory and thermal gauge for ${report.deviceTier.labelEn}: ${cur.estimatedMemoryMb}MB, ${cur.thermalLoadPct} percent thermal, ${cur.estimatedFps} fps`
        : `${report.deviceTier.labelKo} 메모리·발열·프레임 게이지: ${cur.estimatedMemoryMb}MB, 발열 ${cur.thermalLoadPct}%, ${cur.estimatedFps}fps`}
    >
      <rect x="0" y="0" width="280" height="226" rx="10" fill={SVG_OKLCH.paper} />

      <text x={barX} y="22" fill="currentColor" fontSize="10" fontWeight="700">
        {isEn ? "MEMORY · THERMAL · FRAME BUDGET" : "메모리 · 발열 · 프레임 예산 게이지"}
      </text>
      <rect x="204" y="10" width="60" height="17" rx="8.5" fill={statusFill} stroke={statusStroke} strokeWidth="1" />
      <text x="234" y="21.5" textAnchor="middle" fill={statusStroke} fontSize="8.5" fontWeight="800">{statusTag}</text>

      <text x={barX} y="46" fill="currentColor" fontSize="8.5" fontWeight="700">{isEn ? "VRAM / RAM Usage" : "추정 VRAM / RAM"}</text>
      <text x={barX + barW} y="46" textAnchor="end" fill={statusStroke} fontSize="8.5" fontWeight="800" fontFamily="monospace">
        {`${cur.estimatedMemoryMb} / ${report.deviceTier.memoryBudgetMb}MB (${cur.memoryUtilizationPct}%)`}
      </text>
      <rect x={barX} y="52" width={barW} height="16" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="52" width={memFillW} height="16" rx="5" fill={statusStroke} />
      <line x1={memSafeLimitX} y1="50" x2={memSafeLimitX} y2="70" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1" strokeDasharray="2 2" />
      <line x1={memBudget100X} y1="50" x2={memBudget100X} y2="70" stroke={SVG_OKLCH.badStroke} strokeWidth="1.3" strokeDasharray="3 2" />
      {report.needsDegradation && proj.estimatedMemoryMb < cur.estimatedMemoryMb ? (
        <g>
          <line x1={projMemX} y1="49" x2={projMemX} y2="71" stroke={SVG_OKLCH.safeStroke} strokeWidth="2" />
          <text x={Math.min(barX + barW - 4, projMemX + 4)} y="80" fill={SVG_OKLCH.safeStroke} fontSize="7.5" fontWeight="700" fontFamily="monospace">
            {isEn ? `After guard ${proj.estimatedMemoryMb}MB` : `강등 후 ${proj.estimatedMemoryMb}MB`}
          </text>
        </g>
      ) : null}

      <text x={barX} y="104" fill="currentColor" fontSize="8.5" fontWeight="700">{isEn ? "Thermal Load Index" : "예상 발열 부하"}</text>
      <text x={barX + barW} y="104" textAnchor="end" fill={thermalColor} fontSize="8.5" fontWeight="800" fontFamily="monospace">{`${cur.thermalLoadPct}%`}</text>
      <rect x={barX} y="110" width={barW} height="15" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="110" width={thermalFillW} height="15" rx="5" fill={thermalColor} />
      {report.needsDegradation && proj.thermalLoadPct < cur.thermalLoadPct ? (
        <line x1={projThermalX} y1="108" x2={projThermalX} y2="127" stroke={SVG_OKLCH.safeStroke} strokeWidth="2" />
      ) : null}

      <text x={barX} y="150" fill="currentColor" fontSize="8.5" fontWeight="700">{isEn ? "Frame Time (16.6ms = 60fps)" : "프레임 시간 (16.6ms = 60fps)"}</text>
      <text x={barX + barW} y="150" textAnchor="end" fill={frameColor} fontSize="8.5" fontWeight="800" fontFamily="monospace">{`${cur.estimatedFrameMs}ms · ${cur.estimatedFps}fps`}</text>
      <rect x={barX} y="156" width={barW} height="15" rx="5" fill={SVG_OKLCH.track} />
      <rect x={barX} y="156" width={frameFillW} height="15" rx="5" fill={frameColor} />
      <line x1={frameTargetX} y1="154" x2={frameTargetX} y2="174" stroke={SVG_OKLCH.safeStroke} strokeWidth="1.4" strokeDasharray="3 2" />
      <text x={frameTargetX + 4} y="184" fill={SVG_OKLCH.safeStroke} fontSize="7.5" fontWeight="700" fontFamily="monospace">16.6ms (60fps)</text>

      <rect x={barX} y="194" width={barW} height="22" rx="6" fill={SVG_OKLCH.surface} />
      <text x={barX + 8} y="208" fill="currentColor" fontSize="8.5" fontWeight="700">{isEn ? report.deviceTier.labelEn : report.deviceTier.labelKo}</text>
      <text x={barX + barW - 8} y="208" textAnchor="end" fill={SVG_OKLCH.mutedSlate} fontSize="8" fontWeight="700" fontFamily="monospace">
        {isEn ? `Guards: ${report.appliedDegradationIds.length}/${report.degradationProposals.length}` : `활성 가드 ${report.appliedDegradationIds.length}/${report.degradationProposals.length}`}
      </text>
    </svg>
  );
}

function AssistantStackCard(props: {
  readonly card: RankedAssistantCard; readonly isEn: boolean; readonly onDismiss: (id: string) => void;
}): ReactElement {
  const { card, isEn, onDismiss } = props;
  const { suggestion } = card;
  const domainMeta = ASSISTANT_DOMAIN_META[suggestion.domain];
  const severityLabel = suggestion.severity === "critical" ? (isEn ? "Critical" : "치명 오류")
    : suggestion.severity === "warning" ? (isEn ? "Warning" : "주의") : (isEn ? "Advisory" : "권장");

  return (
    <article
      data-testid={`assistant-visible-card-${card.stackSlot ?? 0}`}
      data-suggestion-id={suggestion.id} data-severity={suggestion.severity}
      className="flex flex-col justify-between rounded-xl border border-line bg-card p-3.5 shadow-xs"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-raised px-2 py-0.5 font-mono text-[11px] font-bold text-accent tabular-nums">{`#${card.stackSlot} · ${card.priorityScore}pt`}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold [word-break:keep-all] ${severityToneClass(suggestion.severity)}`}>{severityLabel}</span>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-[10px] font-medium text-fg-2 [word-break:keep-all]">{isEn ? domainMeta.labelEn : domainMeta.labelKo}</span>
          </div>
          <span className="font-mono text-[10px] font-semibold text-fg-3 tabular-nums">{suggestion.cutLabel}</span>
        </div>
        <h4 className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? suggestion.titleEn : suggestion.titleKo}</h4>
        <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{isEn ? suggestion.detailEn : suggestion.detailKo}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">
          {isEn ? `Rel +${card.contextRelevanceScore} · Sev +${card.severityScore}` : `문맥 +${card.contextRelevanceScore} · 긴급 +${card.severityScore}`}
        </span>
        <button type="button" data-testid={`assistant-dismiss-btn-${suggestion.id}`} onClick={() => onDismiss(suggestion.id)} className={BTN_OUTLINE}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />{isEn ? "Defer" : "보류"}
        </button>
      </div>
    </article>
  );
}

/** 문맥 적응형 UI 단순화 · 스마트 스태킹 & 저사양 기기 메모리/발열 가드 스튜디오 패널. */
export function StudioAdaptiveCalmGuardPanel(props: StudioAdaptiveCalmGuardPanelProps): ReactElement {
  const { initialContextId, initialDeviceTier, locale = "ko", className, onApply, onExportJson } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [session, setSession] = useState<AdaptiveCalmSessionState>(() =>
    createAdaptiveCalmSession({ initialContextId, initialDeviceTier }),
  );
  const [dismissedIds, setDismissedIds] = useState<readonly string[]>([]);
  const [showDrawerPreview, setShowDrawerPreview] = useState<boolean>(false);
  const [showQueuePreview, setShowQueuePreview] = useState<boolean>(true);
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const working = session.working;
  const activeProfile = useMemo(() => getStudioContextProfile(working.contextId), [working.contextId]);
  const layoutPlan = useMemo(
    () => computeAdaptiveCalmLayoutPlan(working.contextId, { focusBoost: working.focusBoost }),
    [working.contextId, working.focusBoost],
  );
  const assistantStack = useMemo(
    () => rankAndStackAssistantSuggestions({ contextId: working.contextId, dismissedIds }),
    [working.contextId, dismissedIds],
  );
  const thermalReport = useMemo(
    () => evaluateDeviceThermalBudget(working.deviceTierId, working.features, working.appliedDegradationIds),
    [working.deviceTierId, working.features, working.appliedDegradationIds],
  );
  const duplicateGestureActions = useMemo(() => findDuplicateGestureActions(working.gestures), [working.gestures]);
  const jsonText = useMemo(
    () => exportAdaptiveCalmConfigJson({ session, layoutPlan, assistantStack, thermalReport }),
    [session, layoutPlan, assistantStack, thermalReport],
  );

  const canRevert = session.applied !== null || !snapshotsEqual(session.baseline, working);

  const handleSelectContext = (contextId: StudioContextId): void => {
    const profile = getStudioContextProfile(contextId);
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, contextId })));
    setStatusMessage(pick(
      `'${profile.labelKo}' 문맥으로 전환해 핵심 컨트롤 ${profile.pinnedControlIds.length}개만 노출했습니다.`,
      `Switched to '${profile.labelEn}' context (${profile.pinnedControlIds.length} core controls pinned).`,
    ));
  };

  const handleToggleFocusBoost = (): void => {
    const nextBoost = !working.focusBoost;
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, focusBoost: nextBoost })));
    setStatusMessage(nextBoost
      ? pick("집중 부스트를 켜서 5개 최소 컨트롤과 최대 캔버스를 확보했습니다.", "Enabled focus boost for 5-control minimal chrome.")
      : pick("집중 부스트를 해제하고 단계 기본 5~7개 구성을 복원했습니다.", "Disabled focus boost and restored stage core set."));
  };

  const handleSelectDeviceTier = (deviceTierId: DeviceTierId): void => {
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, deviceTierId, appliedDegradationIds: [] })));
    const spec = DEVICE_TIER_SPECS.find((item) => item.id === deviceTierId);
    setStatusMessage(pick(`'${spec?.labelKo ?? deviceTierId}' 메모리·발열 프로파일로 시뮬레이션합니다.`, `Simulating '${spec?.labelEn ?? deviceTierId}' memory & thermal envelope.`));
  };

  const handleToggleFeature = (featureId: DeviceFeatureId): void => {
    const nextValue = !working.features[featureId];
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, features: { ...cur.features, [featureId]: nextValue } })));
  };

  const handleApplyRecommendedGuards = (): void => {
    setSession((prev) => applyRecommendedDegradations(prev, thermalReport));
    setStatusMessage(pick(
      `권장 비파괴 안전 강등 ${thermalReport.degradationProposals.length}건을 적용했습니다(원본 데이터 보존).`,
      `Applied ${thermalReport.degradationProposals.length} recommended non-destructive guards.`,
    ));
  };

  const handleGestureActionChange = (triggerId: GestureTriggerId, actionId: GestureActionId): void => {
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, gestures: updateGestureMacro(cur.gestures, triggerId, { actionId }) })));
    setStatusMessage(pick("제스처 매크로 동작을 변경했습니다.", "Updated gesture macro binding."));
  };

  const handleGestureEnabledToggle = (triggerId: GestureTriggerId, enabled: boolean): void => {
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, gestures: updateGestureMacro(cur.gestures, triggerId, { enabled }) })));
  };

  const handleResetGestures = (): void => {
    setSession((prev) => updateWorkingCalmSnapshot(prev, (cur) => ({ ...cur, gestures: resetGestureMacros() })));
    setStatusMessage(pick("단일 제스처 매크로 4종을 기본값으로 되돌렸습니다.", "Reset all 4 gesture macros to defaults."));
  };

  const handleApplyAll = (): void => {
    const next = applyAdaptiveCalmSession(session);
    setSession(next);
    onApply?.(next.working, next);
    setStatusMessage(pick("문맥 레이아웃·어시스턴트 스태킹·기기 가드·제스처 설정을 적용했습니다.", "Applied calm layout, assistant stack, device guard, and gesture bindings."));
  };

  const handleRevertAll = (): void => {
    setSession((prev) => revertAdaptiveCalmSession(prev));
    setDismissedIds([]);
    setStatusMessage(pick("모든 UI 단순화 및 기기 가드 변경을 초기 상태로 원복했습니다.", "Reverted all calm stack and device guard edits to baseline."));
  };

  const handleExportJson = (): void => {
    setShowJson(true);
    onExportJson?.(jsonText, session);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(jsonText).catch(() => undefined);
    }
    setStatusMessage(pick("적응형 UI·기기 가드·제스처 JSON을 복사했습니다.", "Copied adaptive calm stack JSON."));
  };

  const sessionStatusLabel = session.status === "applied" ? pick("적용됨", "Applied")
    : session.status === "reverted" ? pick("원복됨", "Reverted") : pick("대기(초안)", "Draft (Idle)");
  const budgetStatusLabel = thermalReport.current.status === "critical" ? pick("예산 초과 · 강등 권장", "Over Budget · Guard Needed")
    : thermalReport.current.status === "caution" ? pick("임계 근접 · 주의", "Near Threshold · Caution") : pick("안전 예산 유지", "Within Safe Budget");

  return (
    <section
      data-testid="studio-adaptive-calm-guard-panel"
      className={`rounded-2xl border border-line bg-card p-5 text-fg shadow-sm ${className ?? ""}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("문맥 적응형 UI 단순화 · 스마트 스태킹 & 기기 가드", "Adaptive Calm Stack & Device Budget Guard")}
            </h2>
            <span data-testid="calm-non-destructive-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{pick("비파괴 자동 정리", "Non-Destructive Guard")}
            </span>
            <span data-testid="calm-session-status-badge" className="inline-flex items-center rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              {sessionStatusLabel}
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "창작 단계별 핵심 컨트롤 5~7개만 남겨 UI 복잡도를 60%+ 줄이고, 동시 어시스턴트 제안을 최대 2개로 제어하며 저사양 기기 메모리·발열을 보호합니다.",
              "Cuts UI complexity 60%+ by pinning 5–7 stage-core controls, caps assistant cards to 2 at once, and guards device RAM and thermal headroom.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="calm-apply-btn" onClick={handleApplyAll} className={BTN_SOLID}>
            <Check className="h-4 w-4" aria-hidden="true" />{pick("설정 적용", "Apply Config")}
          </button>
          <button type="button" data-testid="calm-revert-btn" disabled={!canRevert} onClick={handleRevertAll} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />{pick("원복", "Revert")}
          </button>
          <button type="button" data-testid="calm-copy-json-btn" onClick={handleExportJson} className={BTN_OUTLINE}>
            <Copy className="h-4 w-4" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="calm-toggle-json-btn" aria-expanded={showJson} onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4" aria-hidden="true" />{showJson ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "View JSON")}
          </button>
        </div>
      </header>

      {/* 1. 5대 창작 단계 문맥 선택 & UI 다이어트 */}
      <div className="mt-4 space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("1. 창작 단계 문맥 프로파일 (5~7개 핵심 컨트롤 자동 엄선)", "1. Creative Stage Context Profile (5–7 Core Controls)")}
          </div>
          <button type="button" data-testid="calm-focus-boost-btn" aria-pressed={working.focusBoost} onClick={handleToggleFocusBoost} className={working.focusBoost ? BTN_ACTIVE : BTN_OUTLINE}>
            <Focus className="h-4 w-4" aria-hidden="true" />
            {working.focusBoost ? pick("집중 부스트 켜짐 (5개 최소)", "Focus Boost On (Min 5)") : pick("집중 부스트 (5개 최소)", "Focus Boost (Min 5)")}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STUDIO_CONTEXT_PROFILES.map((profile) => (
            <button
              key={profile.id} type="button" data-testid={`calm-context-${profile.id}`}
              aria-pressed={working.contextId === profile.id}
              onClick={() => handleSelectContext(profile.id)}
              className={working.contextId === profile.id ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {isEn ? profile.labelEn : profile.labelKo}
            </button>
          ))}
        </div>

        <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? activeProfile.focusGoalEn : activeProfile.focusGoalKo}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="calm-visible-count-badge" className="rounded-md bg-card px-2.5 py-1 font-mono text-xs font-bold text-accent tabular-nums">
            {pick(`노출 ${layoutPlan.visibleControlCount}개 / 전체 ${layoutPlan.totalControlCount}개`, `${layoutPlan.visibleControlCount} / ${layoutPlan.totalControlCount} Pinned`)}
          </span>
          <span data-testid="calm-reduction-badge" className="rounded-md border border-good bg-good-soft px-2.5 py-1 font-mono text-xs font-bold text-good tabular-nums">
            {pick(`복잡도 -${layoutPlan.complexityReductionPct}%`, `Complexity -${layoutPlan.complexityReductionPct}%`)}
          </span>
          <span data-testid="calm-viewport-badge" className="rounded-md border border-cool bg-info-soft px-2.5 py-1 font-mono text-xs font-bold text-cool tabular-nums">
            {pick(`캔버스 ${layoutPlan.adaptedViewportPct}%`, `Canvas ${layoutPlan.adaptedViewportPct}%`)}
          </span>
          <button type="button" data-testid="calm-drawer-toggle-btn" aria-expanded={showDrawerPreview} onClick={() => setShowDrawerPreview((prev) => !prev)} className={BTN_OUTLINE}>
            {showDrawerPreview ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {pick(`접이식 서랍 (${layoutPlan.collapsedControlCount}개)`, `Tucked Drawer (${layoutPlan.collapsedControlCount})`)}
          </button>
        </div>

        <div data-testid="calm-pinned-controls" className="flex flex-wrap gap-1.5">
          {layoutPlan.pinnedControls.map((control) => (
            <span key={control.id} data-testid={`calm-pinned-chip-${control.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg [word-break:keep-all]">
              <kbd className="rounded bg-raised px-1 font-mono text-[10px] font-bold text-accent">{control.shortcutHint}</kbd>
              {isEn ? control.labelEn : control.labelKo}
            </span>
          ))}
        </div>

        {showDrawerPreview ? (
          <div data-testid="calm-drawer-list" className="rounded-lg border border-line bg-card p-3">
            <div className="mb-2 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              {pick(`자동 정리된 보조 서랍 묶음: ${activeProfile.drawerGroupLabelsKo.join(" · ")}`, `Auto-collapsed drawer groups: ${activeProfile.drawerGroupLabelsEn.join(" · ")}`)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layoutPlan.drawerControls.map((control) => (
                <span key={control.id} className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-2 [word-break:keep-all]">
                  {isEn ? control.labelEn : control.labelKo}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 2. 순수 시맨틱 SVG 2단 시각화 */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Gauge className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("UI 복잡도 다이어트 전/후 · 캔버스 점유율 도해", "UI Complexity Diet Before/After & Canvas Area")}
          </div>
          <ComplexityDietBeforeAfterSvg plan={layoutPlan} isEn={isEn} />
        </div>
        <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Thermometer className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("기기 메모리 · 발열 · 프레임 예산 게이지", "Device Memory · Thermal · Frame Budget Gauge")}
          </div>
          <DeviceThermalBudgetGaugeSvg report={thermalReport} isEn={isEn} />
        </div>
      </div>

      {/* 3. 기기 티어 시뮬레이터 & 자동 안전 강등 가드 */}
      <div className="mt-5 space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("2. 기기 티어 시뮬레이터 & 메모리/발열 안전 강등 가드", "2. Device Tier Simulator & Thermal Safe-Degradation Guard")}
          </div>
          <span data-testid="device-budget-status-badge" data-status={thermalReport.current.status} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${budgetToneClass(thermalReport.current.status)}`}>
            {thermalReport.current.status === "critical" ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              : thermalReport.current.status === "caution" ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {budgetStatusLabel}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("기기 티어 4종", "4 Device Tiers")}</div>
            <div className="flex flex-wrap gap-1.5">
              {DEVICE_TIER_SPECS.map((tier) => (
                <button
                  key={tier.id} type="button" data-testid={`calm-device-${tier.id}`}
                  aria-pressed={working.deviceTierId === tier.id}
                  onClick={() => handleSelectDeviceTier(tier.id)}
                  className={working.deviceTierId === tier.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? tier.labelEn : tier.labelKo}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? thermalReport.deviceTier.hardwareSummaryEn : thermalReport.deviceTier.hardwareSummaryKo}</p>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("활성 고부하 기능 토글", "Active Heavy Features")}</div>
            <div className="flex flex-wrap gap-1.5">
              {DEVICE_FEATURE_LOADS.map((feature) => (
                <button
                  key={feature.id} type="button" data-testid={`calm-feature-${feature.id}`}
                  aria-pressed={working.features[feature.id]}
                  onClick={() => handleToggleFeature(feature.id)}
                  className={working.features[feature.id] ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? feature.labelEn : feature.labelKo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div data-testid="device-budget-summary" className={`rounded-lg border p-3 text-xs [word-break:keep-all] ${budgetToneClass(thermalReport.current.status)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{isEn ? thermalReport.summaryEn : thermalReport.summaryKo}</span>
            {thermalReport.degradationProposals.length > 0 ? (
              <button type="button" data-testid="calm-apply-recommended-guard-btn" onClick={handleApplyRecommendedGuards} className={thermalReport.needsDegradation ? BTN_SOLID : BTN_OUTLINE}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />{pick("권장 안전 강등 일괄 적용", "Apply All Safe Guards")}
              </button>
            ) : null}
          </div>
        </div>

        {thermalReport.degradationProposals.length > 0 ? (
          <div data-testid="calm-degradation-list" className="grid gap-2 md:grid-cols-2">
            {thermalReport.degradationProposals.map((proposal) => {
              const applied = thermalReport.appliedDegradationIds.includes(proposal.id);
              return (
                <div key={proposal.id} data-testid={`calm-degradation-${proposal.id}`} className={`flex flex-col justify-between rounded-lg border p-3 ${applied ? "border-good bg-good-soft/40" : "border-line bg-card"}`}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? proposal.titleEn : proposal.titleKo}</span>
                      <span className="font-mono text-[11px] font-bold text-good tabular-nums">{`-${proposal.savedMemoryMb}MB · -${proposal.savedFrameMs}ms`}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-fg-2 [word-break:keep-all]">{isEn ? proposal.effectEn : proposal.effectKo}</p>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button" data-testid={`calm-toggle-degradation-${proposal.id}`} aria-pressed={applied}
                      onClick={() => setSession((prev) => toggleDegradationGuard(prev, proposal.id))}
                      className={applied ? BTN_ACTIVE : BTN_WARN}
                    >
                      {applied ? pick("강등 해제", "Disable Guard") : pick("비파괴 강등 켜기", "Enable Safe Guard")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 4. 스마트 어시스턴트 스태킹 우선순위 큐 미리보기 (최대 2개 노출) */}
      <div className="mt-5 space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("3. 스마트 어시스턴트 스태킹 우선순위 큐 (최상단 최대 2개 노출)", "3. Smart Assistant Stack Queue (Max 2 Visible Cards)")}</h3>
            <p data-testid="assistant-stack-summary" className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? assistantStack.summaryEn : assistantStack.summaryKo}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="assistant-toggle-queue-btn" aria-expanded={showQueuePreview} onClick={() => setShowQueuePreview((prev) => !prev)} className={BTN_OUTLINE}>
              {showQueuePreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              {pick(`대기 큐 (${assistantStack.queuedCards.length})`, `Queue (${assistantStack.queuedCards.length})`)}
            </button>
            {dismissedIds.length > 0 ? (
              <button type="button" data-testid="assistant-reset-dismissed-btn" onClick={() => setDismissedIds([])} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("보류 초기화", "Restore Deferred")}
              </button>
            ) : null}
          </div>
        </div>

        <div data-testid="assistant-visible-stack" className="grid gap-3 md:grid-cols-2">
          {assistantStack.visibleCards.length > 0 ? (
            assistantStack.visibleCards.map((card) => (
              <AssistantStackCard
                key={card.suggestion.id} card={card} isEn={isEn}
                onDismiss={(id) => setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
              />
            ))
          ) : (
            <div className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2 [word-break:keep-all]">
              {pick("현재 보류하지 않은 어시스턴트 제안이 없습니다.", "No active assistant suggestions remaining.")}
            </div>
          )}
        </div>

        {showQueuePreview && assistantStack.queuedCards.length > 0 ? (
          <div data-testid="assistant-queue-list" className="space-y-1.5 rounded-lg border border-line bg-card p-3">
            <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              {pick("백그라운드 보류 큐 (인지 과부하·중복 충돌 차단)", "Background Queue (Cognitive Cap & Conflict Shield)")}
            </div>
            <ul className="space-y-1.5">
              {assistantStack.queuedCards.map((card) => {
                const domainMeta = ASSISTANT_DOMAIN_META[card.suggestion.domain];
                const reasonLabel = card.queueReason === "conflict-deferred" ? pick("충돌 보류", "Conflict Deferred") : pick("최대 2개 제한 보류", "Max-2 Cap Queued");
                return (
                  <li key={card.suggestion.id} data-testid={`assistant-queued-item-${card.suggestion.id}`} data-queue-reason={card.queueReason} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-fg-2 tabular-nums">{`${card.priorityScore}pt`}</span>
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">{isEn ? domainMeta.labelEn : domainMeta.labelKo}</span>
                      <span className="font-medium text-fg [word-break:keep-all]">{isEn ? card.suggestion.titleEn : card.suggestion.titleKo}</span>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold [word-break:keep-all] ${card.queueReason === "conflict-deferred" ? "border-warn bg-warning-soft text-warn" : "border-line bg-card text-fg-2"}`}>
                      {reasonLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {/* 5. 단일 제스처 매크로 4종 커스텀 */}
      <div className="mt-5 space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Hand className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("4. 단일 제스처 매크로 4종 커스텀", "4. Single-Gesture Macros (4 Slots)")}
          </div>
          <button type="button" data-testid="calm-reset-gestures-btn" onClick={handleResetGestures} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("기본 매크로 초기화", "Reset Defaults")}
          </button>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {working.gestures.map((macro) => {
            const selectId = `${uid}-gesture-${macro.triggerId}`;
            return (
              <div key={macro.triggerId} data-testid={`calm-gesture-row-${macro.triggerId}`} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={selectId} className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? macro.triggerLabelEn : macro.triggerLabelKo}</label>
                  <button
                    type="button" data-testid={`calm-gesture-toggle-${macro.triggerId}`} aria-pressed={macro.enabled}
                    onClick={() => handleGestureEnabledToggle(macro.triggerId, !macro.enabled)}
                    className={macro.enabled ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {macro.enabled ? pick("사용 중", "Enabled") : pick("꺼짐", "Disabled")}
                  </button>
                </div>
                <select
                  id={selectId} data-testid={`calm-gesture-select-${macro.triggerId}`}
                  value={macro.actionId} disabled={!macro.enabled}
                  onChange={(e) => handleGestureActionChange(macro.triggerId, e.target.value as GestureActionId)}
                  className={`min-h-11 w-full rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {GESTURE_ACTION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{isEn ? opt.labelEn : opt.labelKo}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {duplicateGestureActions.length > 0 ? (
          <p data-testid="calm-gesture-duplicate-notice" className="text-xs font-medium text-warn [word-break:keep-all]">
            {pick(
              `중복 할당된 제스처 동작이 ${duplicateGestureActions.length}건 있습니다. 서로 다른 동작으로 나누면 작업 속도가 높아집니다.`,
              `${duplicateGestureActions.length} action(s) are assigned to multiple enabled gestures.`,
            )}
          </p>
        ) : null}
      </div>

      {showJson ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <pre data-testid="calm-json-preview" className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-fg-2">{jsonText}</pre>
        </div>
      ) : null}

      <p data-testid="calm-status-message" aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs text-fg-3 [word-break:keep-all]">{statusMessage}</p>
    </section>
  );
}

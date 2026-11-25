/**
 * Wave 57B — 화면 복잡도 극한 감축(Zen 94% · Stage 86% · Pro 82%) ·
 * 의도 기반 0-용어 직관 UX · 8방향 방사형 파이 휠 · 고대비/색각안전 디자인 오케스트레이터 제어판.
 *
 * - 모든 props 선택적(`= {}` 기본 props 미사용), 순수 결정론적 엔진 연동
 * - 순수 시맨틱 SVG 2단 시각화 (좌: 94/86/82% 캔버스 + 8방향 파이 휠 + 고스트 프리뷰,
 *   우: Hick-Hyman·Fitts 절감 막대 + 85/10/5 시각 비율 + 동심원 곡률 도해)
 * - OKLCH·currentColor 전용, 원시 hex/rgb/hsl 0건, 바이올렛 휴(270~320°) 0%
 */

import {
  CheckCircle2, Code2, Compass, Copy, Eye, Hand, Layers, Maximize2, Palette, RotateCcw, Search, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ATELIER_THEMES, COLOR_VISION_MODES, COMPLEXITY_TIERS, INTENT_QUICK_CHIPS, WORKFLOW_STAGES,
  buildCalmIntentUxProfile, exportCalmIntentUxJson, formatOklch, getComplexityTier, getWorkflowStage,
  simulateColorVisionOklch,
  type AtelierThemeId, type CalmIntentUxProfileSnapshot, type ColorVisionModeId, type ComplexityTierId,
  type IntentActionCard, type WorkflowStageId,
} from "./calm-intent-ux-engine";

export interface StudioCalmIntentUxPanelProps {
  readonly initialTier?: ComplexityTierId;
  readonly initialStage?: WorkflowStageId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onProfileChange?: (snapshot: CalmIntentUxProfileSnapshot) => void;
  readonly onExportJson?: (json: string, snapshot: CalmIntentUxProfileSnapshot) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function getSimulatedColors(snapshot: CalmIntentUxProfileSnapshot) {
  const { activeTheme: t, activeVisionMode: v } = snapshot.designPolish;
  const s = (c: typeof t.canvas, alpha?: number): string => formatOklch(simulateColorVisionOklch(c, v.id), alpha);
  return {
    canvas: s(t.canvas), panel: s(t.panel), card: s(t.card), line: s(t.line),
    fg: s(t.fg), muted: s(t.fgMuted), accent: s(t.accent), accentSoft: s(t.accent, 0.18),
    good: s(t.good), bad: s(t.bad),
  };
}

function ViewportRadialWheelSvg(props: {
  readonly snapshot: CalmIntentUxProfileSnapshot; readonly hoveredCard: IntentActionCard | null; readonly isEn: boolean;
}): ReactElement {
  const { snapshot, hoveredCard, isEn } = props;
  const { tier, radialSlots, designPolish, leftHanded, proDrawerOpen } = snapshot;
  const sim = getSimulatedColors(snapshot);
  const topBarH = tier.topBarHeightPx > 0 ? 24 : 0;
  const sideRailW = tier.leftRailWidthPx > 0 ? 28 : 0;
  const drawerW = tier.id === "atelier-pro" && proDrawerOpen ? 58 : 0;
  const railX = leftHanded ? 352 - sideRailW : 8;
  const drawerX = leftHanded ? 8 : 352 - drawerW;
  const canvasX = 8 + (leftHanded ? drawerW : sideRailW);
  const canvasW = 344 - sideRailW - drawerW;
  const canvasY = 8 + topBarH;
  const canvasH = 224 - topBarH;
  const cx = canvasX + canvasW * 0.5;
  const cy = canvasY + canvasH * 0.52;
  const outerR = 64;
  const innerR = 22;
  const ghostText = hoveredCard
    ? isEn ? `Ghost: ${hoveredCard.titleEn}` : `고스트 시연 · ${hoveredCard.titleKo}`
    : isEn ? snapshot.intentResolution.ghostOverlayBadgeEn : snapshot.intentResolution.ghostOverlayBadgeKo;

  return (
    <svg
      data-testid="calm-ux-viewport-wheel-svg" data-tier-id={tier.id} data-canvas-percent={tier.canvasViewportPercent}
      data-control-count={snapshot.visibleControls.length} data-left-handed={String(leftHanded)}
      data-theme-id={designPolish.activeTheme.id} data-vision-mode={designPolish.activeVisionMode.id}
      data-ghost-card={hoveredCard?.id ?? "idle"} data-violet-free="true" viewBox="0 0 360 240" role="img"
      aria-label={isEn ? `${tier.labelEn} ${tier.canvasViewportPercent}% canvas viewport and 8-direction radial pie wheel` : `${tier.labelKo} 캔버스 ${tier.canvasViewportPercent}% 비율 및 8방향 방사형 파이 휠 도해`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="240" rx="14" fill={sim.panel} />
      <rect x="8" y="8" width="344" height="224" rx="10" fill={sim.canvas} stroke={sim.line} strokeWidth="1" />
      {topBarH > 0 ? (
        <g>
          <rect x="8" y="8" width="344" height={topBarH} rx="6" fill={sim.card} stroke={sim.line} strokeWidth="0.9" />
          <circle cx="22" cy="20" r="3.5" fill={sim.good} />
          <text x="32" y="23" fill={sim.fg} fontSize="8.5" fontWeight="700">{`${isEn ? snapshot.stage.labelEn : snapshot.stage.labelKo} · ${tier.canvasViewportPercent}%`}</text>
          <text x="344" y="23" textAnchor="end" fill={sim.accent} fontSize="8" fontFamily="monospace" fontWeight="700">{`${snapshot.visibleControls.length} CTRL · 0% JARGON`}</text>
        </g>
      ) : (
        <g>
          <rect x={leftHanded ? 248 : 16} y="14" width="96" height="18" rx="9" fill={sim.card} stroke={sim.accent} strokeWidth="0.9" />
          <text x={leftHanded ? 296 : 64} y="26" textAnchor="middle" fill={sim.accent} fontSize="8" fontWeight="700">{isEn ? "ZEN 94% · 5 CTRL" : "ZEN 94% · 5컨트롤"}</text>
        </g>
      )}
      {sideRailW > 0 ? (
        <g>
          <rect x={railX} y={canvasY} width={sideRailW} height={canvasH} rx="6" fill={sim.card} stroke={sim.line} strokeWidth="0.9" />
          {[0, 1, 2, 3, 4].map((idx) => (
            <rect key={`rail-slot-${idx}`} x={railX + 6} y={canvasY + 14 + idx * 24} width="16" height="16" rx="4" fill={idx === 0 ? sim.accent : sim.panel} stroke={sim.line} strokeWidth="0.7" />
          ))}
        </g>
      ) : null}
      {drawerW > 0 ? (
        <g>
          <rect x={drawerX} y={canvasY} width={drawerW} height={canvasH} rx="6" fill={sim.card} stroke={sim.accent} strokeWidth="0.9" strokeDasharray="3 2" />
          <text x={drawerX + drawerW / 2} y={canvasY + 18} textAnchor="middle" fill={sim.accent} fontSize="7.5" fontWeight="700">{isEn ? "PRO +2" : "서랍 +2"}</text>
          <rect x={drawerX + 7} y={canvasY + 28} width={drawerW - 14} height="22" rx="4" fill={sim.accentSoft} />
          <rect x={drawerX + 7} y={canvasY + 58} width={drawerW - 14} height="22" rx="4" fill={sim.panel} stroke={sim.line} strokeWidth="0.7" />
        </g>
      ) : null}
      <circle cx={cx} cy={cy} r={outerR + 8} fill={hoveredCard ? sim.accentSoft : "none"} stroke={sim.accent} strokeWidth={hoveredCard ? "1.6" : "0.9"} strokeDasharray="4 3" />
      <circle cx={cx} cy={cy} r={outerR} fill={sim.card} fillOpacity={0.92} stroke={sim.line} strokeWidth="1.1" />
      {radialSlots.map((slot) => {
        const dividerRad = (((slot.angleDeg - 22.5) - 90) * Math.PI) / 180;
        const lx = cx + slot.unitX * (outerR * 0.69);
        const ly = cy + slot.unitY * (outerR * 0.69);
        const isPrimary = slot.id === "undo" || slot.id === "brush-size";
        return (
          <g key={slot.id} data-wheel-slot={slot.id} data-wheel-dir={slot.direction}>
            <line x1={cx} y1={cy} x2={cx + Math.cos(dividerRad) * outerR} y2={cy + Math.sin(dividerRad) * outerR} stroke={sim.line} strokeWidth="0.7" strokeOpacity={0.75} />
            <text x={lx} y={ly - 2} textAnchor="middle" dominantBaseline="central" fill={isPrimary ? sim.accent : sim.fg} fontSize="7.2" fontWeight="700">{isEn ? slot.labelEn : slot.labelKo}</text>
            <text x={lx} y={ly + 7} textAnchor="middle" dominantBaseline="central" fill={sim.muted} fontSize="6" fontFamily="monospace">{slot.direction}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR} fill={sim.canvas} stroke={sim.accent} strokeWidth="1.4" />
      <text x={cx} y={cy - 2} textAnchor="middle" fill={sim.fg} fontSize="7.5" fontWeight="700">{leftHanded ? (isEn ? "L-MIRROR" : "왼손 대칭") : (isEn ? "8-WAY" : "8방향 휠")}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill={sim.accent} fontSize="6.5" fontFamily="monospace" fontWeight="700">{`${tier.radialWheelRadiusPx}px`}</text>
      <rect x={canvasX + 6} y="206" width={canvasW - 12} height="20" rx="6" fill={sim.card} stroke={sim.accent} strokeWidth="0.9" />
      <text x={canvasX + 14} y="219" fill={sim.fg} fontSize="7.6" fontWeight="600">{ghostText.length > 44 ? `${ghostText.slice(0, 43)}…` : ghostText}</text>
    </svg>
  );
}

function CognitiveAndDesignSvg(props: { readonly snapshot: CalmIntentUxProfileSnapshot; readonly isEn: boolean }): ReactElement {
  const { snapshot, isEn } = props;
  const { cognitiveAudit, designPolish } = snapshot;
  const sim = getSimulatedColors(snapshot);
  const maxHick = Math.max(1200, cognitiveAudit.overcrowdedBaseline.hickDecisionMs);
  const baseHickW = Math.round((cognitiveAudit.overcrowdedBaseline.hickDecisionMs / maxHick) * 204);
  const activeHickW = Math.round((cognitiveAudit.toonStudioActive.hickDecisionMs / maxHick) * 204);
  const activeDistW = Math.max(20, Math.round((cognitiveAudit.toonStudioActive.fittsTravelDistancePx / cognitiveAudit.overcrowdedBaseline.fittsTravelDistancePx) * 204));
  const bal = designPolish.visualBalance;
  const w85 = Math.round((bal.neutralCanvasPercent / 100) * 200);
  const w10 = Math.round((bal.secondaryChromePercent / 100) * 200);
  const w5 = 200 - w85 - w10;

  return (
    <svg
      data-testid="calm-ux-metrics-chart-svg" data-hick-saved-pct={cognitiveAudit.hickTimeSavedPercent}
      data-fitts-saved-pct={cognitiveAudit.fittsTravelSavedPercent} data-balance-rule="85-10-5"
      data-concentric-exact={String(designPolish.concentricRadius.exactConcentric)} data-violet-free="true"
      viewBox="0 0 360 240" role="img"
      aria-label={isEn ? "Hick-Hyman decision time, Fitts travel reduction, 85/10/5 color balance, and concentric corner radii" : "Hick-Hyman 선택 시간·Fitts 이동거리 절감 및 85/10/5 시각 비율·동심원 곡률 도표"}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="240" rx="14" fill={sim.panel} />
      <rect x="10" y="10" width="340" height="114" rx="10" fill={sim.card} stroke={sim.line} strokeWidth="0.9" />
      <text x="20" y="26" fill={sim.fg} fontSize="8.8" fontWeight="700">{isEn ? "Hick-Hyman Decision & Fitts 8-Way Travel" : "Hick-Hyman 선택 시간 · Fitts 8방향 이동 절감"}</text>
      <text x="20" y="44" fill={sim.muted} fontSize="7.4">{isEn ? "Legacy 72" : "과밀 72개"}</text>
      <rect x="82" y="35" width={baseHickW} height="11" rx="4" fill={sim.bad} fillOpacity={0.78} />
      <text x="292" y="44" fill={sim.fg} fontSize="7.4" fontFamily="monospace">{`${cognitiveAudit.overcrowdedBaseline.hickDecisionMs}ms`}</text>
      <text x="20" y="61" fill={sim.accent} fontSize="7.4" fontWeight="700">{`Toon ${cognitiveAudit.toonStudioActive.visibleControlCount}`}</text>
      <rect x="82" y="52" width={activeHickW} height="11" rx="4" fill={sim.accent} />
      <text x="292" y="61" fill={sim.accent} fontSize="7.4" fontFamily="monospace" fontWeight="700">{`${cognitiveAudit.toonStudioActive.hickDecisionMs}ms`}</text>
      <text x="20" y="84" fill={sim.muted} fontSize="7.4">{isEn ? "Corner Bar" : "상단 툴바"}</text>
      <rect x="82" y="75" width={204} height="11" rx="4" fill={sim.muted} fillOpacity={0.48} />
      <text x="292" y="84" fill={sim.fg} fontSize="7.4" fontFamily="monospace">{`${cognitiveAudit.overcrowdedBaseline.fittsTravelDistancePx}px`}</text>
      <text x="20" y="101" fill={sim.good} fontSize="7.4" fontWeight="700">{isEn ? "8-Way Pie" : "8방향 휠"}</text>
      <rect x="82" y="92" width={activeDistW} height="11" rx="4" fill={sim.good} />
      <text x="292" y="101" fill={sim.good} fontSize="7.4" fontFamily="monospace" fontWeight="700">{`${cognitiveAudit.toonStudioActive.fittsTravelDistancePx}px (-${cognitiveAudit.fittsTravelSavedPercent}%)`}</text>

      <rect x="10" y="132" width="224" height="98" rx="10" fill={sim.card} stroke={sim.line} strokeWidth="0.9" />
      <text x="20" y="148" fill={sim.fg} fontSize="8.5" fontWeight="700">{isEn ? "85 / 10 / 5 Atelier Balance" : "85 / 10 / 5 아틀리에 시각 비율"}</text>
      <rect x="20" y="158" width={w85} height="18" rx="4" fill={sim.canvas} stroke={sim.line} strokeWidth="0.9" />
      <rect x={20 + w85 + 2} y="158" width={w10 - 2} height="18" rx="3" fill={sim.muted} />
      <rect x={20 + w85 + w10 + 2} y="158" width={Math.max(8, w5 - 2)} height="18" rx="3" fill={sim.accent} />
      <text x="20" y="191" fill={sim.muted} fontSize="7.4" fontFamily="monospace">85% Canvas · 10% Chrome · 5% Accent</text>
      <text x="20" y="207" fill={sim.good} fontSize="7.6" fontWeight="700">{isEn ? `Contrast ${designPolish.activeContrast.bodyContrastRatio}:1 · Matrix ${designPolish.matrixPassCount}/16` : `본문 대비 ${designPolish.activeContrast.bodyContrastRatio}:1 · 4×4 통과 ${designPolish.matrixPassCount}/16`}</text>
      <text x="20" y="221" fill={sim.accent} fontSize="7.2" fontFamily="monospace">{`Violet Slop ${designPolish.violetSlop.violetSlopPercent}% (${designPolish.violetSlop.inspectedTokenCount} tokens)`}</text>

      <rect x="242" y="132" width="108" height="98" rx="20" fill={sim.card} stroke={sim.line} strokeWidth="1.2" />
      <rect x="250" y="140" width="92" height="82" rx="12" fill={sim.panel} stroke={sim.accent} strokeWidth="1" />
      <rect x="258" y="148" width="76" height="66" rx="8" fill={sim.canvas} stroke={sim.good} strokeWidth="1" />
      <text x="296" y="175" textAnchor="middle" fill={sim.fg} fontSize="7.8" fontWeight="700">{isEn ? "Concentric" : "동심원 곡률"}</text>
      <text x="296" y="189" textAnchor="middle" fill={sim.accent} fontSize="7.4" fontFamily="monospace" fontWeight="700">R20→R12→R8</text>
      <text x="296" y="202" textAnchor="middle" fill={sim.muted} fontSize="6.8" fontFamily="monospace">{`drift ${designPolish.concentricRadius.maxDriftPx}px`}</text>
    </svg>
  );
}

/** 화면 복잡도 감축 · 0-용어 의도 UX · 8방향 방사형 휠 · 고대비 디자인 오케스트레이터 제어판. */
export function StudioCalmIntentUxPanel(props: StudioCalmIntentUxPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const initTier: ComplexityTierId = getComplexityTier(props.initialTier ?? "stage-flow").id;
  const initStage: WorkflowStageId = getWorkflowStage(props.initialStage ?? "color-light").id;

  const [tierId, setTierId] = useState<ComplexityTierId>(initTier);
  const [stageId, setStageId] = useState<WorkflowStageId>(initStage);
  const [themeId, setThemeId] = useState<AtelierThemeId>("ink-slate-dark");
  const [visionModeId, setVisionModeId] = useState<ColorVisionModeId>("normal");
  const [intentQuery, setIntentQuery] = useState<string>("역광 넣어줘");
  const [leftHanded, setLeftHanded] = useState<boolean>(false);
  const [proDrawerOpen, setProDrawerOpen] = useState<boolean>(true);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [showJsonDrawer, setShowJsonDrawer] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const snapshot = useMemo(
    () => buildCalmIntentUxProfile({ tierId, stageId, themeId, visionModeId, intentQuery, leftHanded, proDrawerOpen }),
    [tierId, stageId, themeId, visionModeId, intentQuery, leftHanded, proDrawerOpen],
  );
  const jsonOutput = useMemo(() => exportCalmIntentUxJson(snapshot), [snapshot]);
  const hoveredCard = useMemo(
    () => snapshot.intentResolution.cards.find((c) => c.id === hoveredCardId) ?? null,
    [snapshot.intentResolution.cards, hoveredCardId],
  );

  const emitChange = (patch: Partial<{
    tierId: ComplexityTierId; stageId: WorkflowStageId; themeId: AtelierThemeId;
    visionModeId: ColorVisionModeId; intentQuery: string; leftHanded: boolean; proDrawerOpen: boolean;
  }>): CalmIntentUxProfileSnapshot => {
    const nextSnapshot = buildCalmIntentUxProfile({
      tierId: patch.tierId ?? tierId, stageId: patch.stageId ?? stageId, themeId: patch.themeId ?? themeId,
      visionModeId: patch.visionModeId ?? visionModeId, intentQuery: patch.intentQuery ?? intentQuery,
      leftHanded: patch.leftHanded ?? leftHanded, proDrawerOpen: patch.proDrawerOpen ?? proDrawerOpen,
    });
    props.onProfileChange?.(nextSnapshot);
    return nextSnapshot;
  };

  const handleSelectTier = (nextTier: ComplexityTierId): void => {
    setTierId(nextTier);
    const next = emitChange({ tierId: nextTier });
    setStatusMessage(pick(`'${next.tier.labelKo}' 전환 · 캔버스 ${next.tier.canvasViewportPercent}% · 컨트롤 ${next.visibleControls.length}개`, `Switched to ${next.tier.labelEn} (${next.tier.canvasViewportPercent}% canvas, ${next.visibleControls.length} controls).`));
  };

  const handleSelectStage = (nextStage: WorkflowStageId): void => {
    setStageId(nextStage);
    const next = emitChange({ stageId: nextStage });
    setStatusMessage(pick(`'${next.stage.labelKo}' 단계 핵심 ${next.visibleControls.length}개 도구만 표시합니다.`, `Focused on ${next.stage.labelEn} with ${next.visibleControls.length} plain controls.`));
  };

  const handleIntentChange = (nextQuery: string, announce: boolean): void => {
    setIntentQuery(nextQuery);
    setHoveredCardId(null);
    const next = emitChange({ intentQuery: nextQuery });
    if (announce) setStatusMessage(pick(`'${nextQuery}' 의도를 전문용어 없는 액션 ${next.intentResolution.cards.length}개로 안내합니다.`, `Resolved '${nextQuery}' into ${next.intentResolution.cards.length} jargon-free actions.`));
  };

  const handleApplyCard = (card: IntentActionCard): void => {
    const targetStage = snapshot.intentResolution.recommendedStage;
    setStageId(targetStage);
    setHoveredCardId(card.id);
    emitChange({ stageId: targetStage });
    setStatusMessage(pick(`'${card.titleKo}' 프리뷰를 적용하고 '${getWorkflowStage(targetStage).labelKo}' 단계로 맞췄습니다.`, `Applied '${card.titleEn}' preview on ${getWorkflowStage(targetStage).labelEn}.`));
  };

  const handleSelectTheme = (nextTheme: AtelierThemeId): void => {
    setThemeId(nextTheme);
    const next = emitChange({ themeId: nextTheme });
    setStatusMessage(pick(`'${next.designPolish.activeTheme.labelKo}' 적용 · 본문 대비 ${next.designPolish.activeContrast.bodyContrastRatio}:1`, `Applied ${next.designPolish.activeTheme.labelEn} (${next.designPolish.activeContrast.bodyContrastRatio}:1).`));
  };

  const handleSelectVision = (nextVision: ColorVisionModeId): void => {
    setVisionModeId(nextVision);
    const next = emitChange({ visionModeId: nextVision });
    setStatusMessage(pick(`'${next.designPolish.activeVisionMode.labelKo}' 검증: 본문 ${next.designPolish.activeContrast.bodyContrastRatio}:1 · 액센트 ${next.designPolish.activeContrast.accentContrastRatio}:1`, `${next.designPolish.activeVisionMode.labelEn}: body ${next.designPolish.activeContrast.bodyContrastRatio}:1, accent ${next.designPolish.activeContrast.accentContrastRatio}:1.`));
  };

  const handleToggleLeftHanded = (): void => {
    const nextLeft = !leftHanded;
    setLeftHanded(nextLeft);
    emitChange({ leftHanded: nextLeft });
    setStatusMessage(nextLeft ? pick("왼손잡이 미러링을 켰습니다. 8방향 파이 휠과 도구 레일이 좌우 대칭 반전됩니다.", "Enabled left-handed mirror for pie wheel and side rail.") : pick("오른손잡이 기본 배치로 되돌렸습니다.", "Restored standard right-handed layout."));
  };

  const handleExportJson = (): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) void navigator.clipboard.writeText(jsonOutput).catch(() => undefined);
    setShowJsonDrawer(true);
    props.onExportJson?.(jsonOutput, snapshot);
    setStatusMessage(pick("화면 복잡도·의도 UX·디자인 검증 JSON 프로파일을 복사했습니다.", "Copied Calm Intent UX & design audit JSON profile."));
  };

  const handleReset = (): void => {
    setTierId(initTier); setStageId(initStage); setThemeId("ink-slate-dark"); setVisionModeId("normal");
    setIntentQuery("역광 넣어줘"); setLeftHanded(false); setProDrawerOpen(true); setHoveredCardId(null); setShowJsonDrawer(false);
    emitChange({ tierId: initTier, stageId: initStage, themeId: "ink-slate-dark", visionModeId: "normal", intentQuery: "역광 넣어줘", leftHanded: false, proDrawerOpen: true });
    setStatusMessage(pick("기본 작업 흐름과 테마 설정으로 되돌렸습니다.", "Reset Calm UX tiers, intent, and theme defaults."));
  };

  return (
    <section
      data-testid="calm-intent-ux-panel"
      aria-label={pick("화면 복잡도 감축 · 의도 기반 0-용어 UX · 디자인 고도화 오케스트레이터", "Calm Intent UX & High-Contrast Design Orchestrator")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="calm-ux-canvas-badge" className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent tabular-nums [word-break:keep-all]">
              <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(`캔버스 ${snapshot.tier.canvasViewportPercent}% · 컨트롤 ${snapshot.visibleControls.length}개`, `${snapshot.tier.canvasViewportPercent}% Canvas · ${snapshot.visibleControls.length} Controls`)}
            </span>
            <span data-testid="calm-ux-jargon-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(`전문용어 ${snapshot.cognitiveAudit.toonStudioActive.jargonExposurePercent}% · 바이올렛 ${snapshot.designPolish.violetSlop.violetSlopPercent}%`, `Jargon ${snapshot.cognitiveAudit.toonStudioActive.jargonExposurePercent}% · Violet ${snapshot.designPolish.violetSlop.violetSlopPercent}%`)}
            </span>
            <span data-testid="calm-ux-contrast-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg tabular-nums [word-break:keep-all]">
              <Eye className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {`${snapshot.designPolish.activeTheme.contrastStandard} ${snapshot.designPolish.activeContrast.bodyContrastRatio}:1 (${snapshot.designPolish.matrixPassCount}/16)`}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("화면 복잡도 3단 압축 · 0-용어 의도 UX · 고대비 색각안전 아틀리에", "3-Tier Screen Compression · Zero-Jargon Intent UX · Color-Safe Atelier")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("72개 과밀 도구 대신 Zen 94%·Stage 86%·Pro 82%로 화면을 덜어내고, 평이한 말 한 줄과 8방향 파이 휠로 창작 몰입을 지킵니다.", "Compresses 72-control clutter into Zen 94% / Stage 86% / Pro 82% tiers with plain-language intent actions and an 8-way radial pie wheel.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="calm-ux-export-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("프로파일 JSON 복사", "Copy Profile JSON")}
          </button>
          <button type="button" data-testid="calm-ux-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="calm-ux-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(`현재 '${snapshot.tier.labelKo}' · '${snapshot.stage.labelKo}' 단계입니다. 의도 카드에 마우스를 올리면 캔버스 고스트 미리보기가 즉시 바뀝니다.`, `Active: ${snapshot.tier.labelEn} on ${snapshot.stage.labelEn}. Hover any intent card to preview its ghost overlay.`)}
      </div>

      {/* 3단 화면 압축 + 6단계 작업 흐름 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 xl:grid-cols-12">
        <div className="space-y-2.5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("3단 점진적 화면 압축", "3-Tier Progressive Compression")}
            </h3>
            {tierId === "atelier-pro" ? (
              <button
                type="button" data-testid="calm-ux-pro-drawer-toggle" aria-pressed={proDrawerOpen}
                onClick={() => { const nextOpen = !proDrawerOpen; setProDrawerOpen(nextOpen); emitChange({ proDrawerOpen: nextOpen }); }}
                className={proDrawerOpen ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {proDrawerOpen ? pick("전문 서랍 접기", "Fold Pro Drawer") : pick("전문 서랍 1클릭 열기", "Open Pro Drawer")}
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1" role="group" aria-label={pick("화면 압축 단계 선택", "Select screen compression tier")}>
            {COMPLEXITY_TIERS.map((tier) => {
              const active = tier.id === tierId;
              return (
                <button
                  key={tier.id} type="button" data-testid={`calm-ux-tier-${tier.id}`} aria-pressed={active}
                  onClick={() => handleSelectTier(tier.id)}
                  className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-bold">{isEn ? tier.labelEn : tier.labelKo}</span>
                    <span className="font-mono text-[11px] font-semibold text-accent tabular-nums">{`${tier.canvasViewportPercent}% · ${tier.visibleControlCount}`}</span>
                  </div>
                  <span className="text-[11px] text-fg-2">{isEn ? tier.summaryEn : tier.summaryKo}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("6단계 작업 흐름별 최소 컨트롤 노출", "6-Stage Contextual Minimal Controls")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {pick(`노출 ${snapshot.visibleControls.length}개 / 과밀 72개 (-${snapshot.cognitiveAudit.controlReductionPercent}%)`, `${snapshot.visibleControls.length} vs 72 (-${snapshot.cognitiveAudit.controlReductionPercent}%)`)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label={pick("작업 단계 선택", "Select workflow stage")}>
            {WORKFLOW_STAGES.map((stage) => (
              <button key={stage.id} type="button" data-testid={`calm-ux-stage-${stage.id}`} aria-pressed={stage.id === stageId} onClick={() => handleSelectStage(stage.id)} className={stage.id === stageId ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? stage.labelEn : stage.labelKo}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 rounded-xl border border-line bg-card p-3">
            <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? snapshot.stage.summaryEn : snapshot.stage.summaryKo}</p>
            <div data-testid="calm-ux-visible-controls-list" className="flex flex-wrap gap-1.5">
              {snapshot.visibleControls.map((c) => (
                <span key={c.id} className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium [word-break:keep-all] ${c.priority === "pro" ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-fg"}`}>
                  {isEn ? c.labelEn : c.labelKo}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 0-용어 의도 검색창 & 6종 원클릭 칩 + 고스트 프리뷰 호버 시연 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${uid}-intent-input`} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Search className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("0-용어 의도 커맨드 라우터 (평이한 말로 바로 요청)", "Zero-Jargon Intent Router (Ask in Plain Words)")}
          </label>
          <span data-testid="calm-ux-intent-meta" className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`${snapshot.intentResolution.intentId} · ${Math.round(snapshot.intentResolution.confidence * 100)}%`}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`${uid}-intent-input`} data-testid="calm-ux-intent-input" type="search" value={intentQuery}
            onChange={(e) => handleIntentChange(e.target.value, false)}
            placeholder={pick("예: 역광 넣어줘, 손이 어색해, 3D 창틀, 저작권 증명", "e.g., add rim backlight, crayon texture, copyright proof")}
            className={`min-h-11 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
          <button type="button" data-testid="calm-ux-clear-intent-btn" onClick={() => handleIntentChange("", true)} className={BTN_OUTLINE}>
            {pick("입력 비우기", "Clear")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("6종 원클릭 의도 칩", "6 one-click intent chips")}>
          {INTENT_QUICK_CHIPS.map((chip) => {
            const label = isEn ? chip.canonicalQueryEn : chip.canonicalQueryKo;
            const active = snapshot.intentResolution.intentId === chip.id;
            return (
              <button key={chip.id} type="button" data-testid={`calm-ux-chip-${chip.id}`} aria-pressed={active} onClick={() => handleIntentChange(label, true)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2" data-testid="calm-ux-intent-cards">
          {snapshot.intentResolution.cards.map((c) => {
            const isHovered = hoveredCardId === c.id;
            return (
              <div
                key={c.id} data-testid={`calm-ux-action-card-${c.id}`}
                onMouseEnter={() => setHoveredCardId(c.id)} onMouseLeave={() => setHoveredCardId(null)}
                className={`flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors motion-reduce:transition-none [word-break:keep-all] ${isHovered ? "border-accent bg-accent-soft" : "border-line bg-card"}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg">{isEn ? c.titleEn : c.titleKo}</span>
                    <span className="font-mono text-[10px] text-fg-3 tabular-nums">{`~${c.estimatedSeconds}s`}</span>
                  </div>
                  <p className="text-[11px] text-fg-2">{isEn ? c.summaryEn : c.summaryKo}</p>
                  <p className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-fg-2">
                    <strong className="text-accent">{pick("고스트 미리보기: ", "Ghost Preview: ")}</strong>
                    {isEn ? c.ghostPreviewEn : c.ghostPreviewKo}
                  </p>
                </div>
                <div className="flex justify-end">
                  <button type="button" data-testid={`calm-ux-apply-card-${c.id}`} onFocus={() => setHoveredCardId(c.id)} onClick={() => handleApplyCard(c)} className={BTN_ACTIVE}>
                    {isEn ? c.applyCtaEn : c.applyCtaKo}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4종 테마 · 4종 색각안전 · 왼손잡이 미러링 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("4종 고대비 아틀리에 테마", "4 High-Contrast Atelier Themes")}
          </span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("테마 선택", "Select theme")}>
            {ATELIER_THEMES.map((theme) => (
              <button key={theme.id} type="button" data-testid={`calm-ux-theme-${theme.id}`} aria-pressed={theme.id === themeId} onClick={() => handleSelectTheme(theme.id)} className={theme.id === themeId ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? theme.labelEn : theme.labelKo}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 lg:col-span-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("4종 색각안전 대비 검증", "4 Color-Vision Modes")}
          </span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("색각 모드 선택", "Select color vision mode")}>
            {COLOR_VISION_MODES.map((mode) => (
              <button key={mode.id} type="button" data-testid={`calm-ux-vision-${mode.id}`} aria-pressed={mode.id === visionModeId} onClick={() => handleSelectVision(mode.id)} className={mode.id === visionModeId ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? mode.labelEn : mode.labelKo}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 lg:col-span-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Hand className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("왼손잡이 · 제스처 미러링", "Left-Handed Ergonomics")}
          </span>
          <button type="button" data-testid="calm-ux-left-handed-toggle" aria-pressed={leftHanded} onClick={handleToggleLeftHanded} className={leftHanded ? BTN_SOLID : BTN_OUTLINE}>
            {leftHanded ? pick("왼손잡이 미러링 켜짐", "Left-Handed Mirror ON") : pick("왼손잡이 미러링 켜기", "Enable Left-Handed Mirror")}
          </button>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">
            {pick(`동심원 곡률 R20→R12→R8 (오차 ${snapshot.designPolish.concentricRadius.maxDriftPx}px) · 아틀리에 점수 ${snapshot.designPolish.overallPolishScore}/100`, `Concentric R20→R12→R8 (${snapshot.designPolish.concentricRadius.maxDriftPx}px drift) · Score ${snapshot.designPolish.overallPolishScore}/100`)}
          </p>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 시각화 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("94/86/82% 캔버스 · 8방향 방사형 파이 휠 · 고스트 프리뷰", "94/86/82% Canvas · 8-Way Pie Wheel · Ghost Preview")}</h3>
            <span className="font-mono text-[11px] text-accent tabular-nums">{leftHanded ? pick("좌우 대칭 반전", "Mirrored") : pick("표준 8방향", "Standard 8-Way")}</span>
          </div>
          <ViewportRadialWheelSvg snapshot={snapshot} hoveredCard={hoveredCard} isEn={isEn} />
        </div>
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("Hick-Hyman · Fitts 절감률 & 85/10/5 · 동심원 곡률 감사", "Hick-Hyman · Fitts Savings & 85/10/5 · Concentric Audit")}</h3>
            <span className="font-mono text-[11px] text-good tabular-nums">{`Calm ${snapshot.cognitiveAudit.calmIndexScore}/100`}</span>
          </div>
          <CognitiveAndDesignSvg snapshot={snapshot} isEn={isEn} />
        </div>
      </div>

      {/* 핵심 KPI 4종 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("Hick 선택 시간 단축", "Hick Decision Saved")}</div>
          <div data-testid="calm-ux-kpi-hick" className="mt-1 font-mono text-sm font-bold text-accent tabular-nums">{`${snapshot.cognitiveAudit.toonStudioActive.hickDecisionMs}ms (-${snapshot.cognitiveAudit.hickTimeSavedPercent}%)`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("Fitts 이동거리 절감", "Fitts Travel Saved")}</div>
          <div data-testid="calm-ux-kpi-fitts" className="mt-1 font-mono text-sm font-bold text-good tabular-nums">{`-${snapshot.cognitiveAudit.fittsTravelSavedPercent}% (${snapshot.cognitiveAudit.toonStudioActive.fittsTravelDistancePx}px)`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("44×44px 터치 적합률", "44×44px Touch Ready")}</div>
          <div data-testid="calm-ux-kpi-touch" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${snapshot.cognitiveAudit.toonStudioActive.touchReadyPercent}%`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("대비비 (본문 / 액센트)", "Contrast (Body / Accent)")}</div>
          <div data-testid="calm-ux-kpi-contrast" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${snapshot.designPolish.activeContrast.bodyContrastRatio}:1 / ${snapshot.designPolish.activeContrast.accentContrastRatio}:1`}</div>
        </div>
      </div>

      {/* 멀티모달 제스처 매트릭스 & JSON 미리보기 서랍 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("멀티모달 터치·펜 제스처 매트릭스 & 프로파일 JSON", "Multimodal Touch & Stylus Matrix & Profile JSON")}</span>
          <button type="button" data-testid="calm-ux-toggle-json-btn" aria-expanded={showJsonDrawer} onClick={() => setShowJsonDrawer((prev) => !prev)} className={showJsonDrawer ? BTN_ACTIVE : BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJsonDrawer ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "View JSON")}
          </button>
        </div>
        <div data-testid="calm-ux-gesture-list" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.gestures.map((g) => (
            <div key={g.id} className="rounded-lg border border-line bg-card px-2.5 py-2 text-[11px] [word-break:keep-all]">
              <div className="flex items-center justify-between gap-1 font-semibold text-fg">
                <span>{isEn ? g.triggerEn : g.triggerKo}</span>
                <span className="font-mono text-[10px] text-accent tabular-nums">{`${g.responseTargetMs}ms`}</span>
              </div>
              <div className="mt-0.5 text-fg-2">{isEn ? g.actionEn : g.actionKo}</div>
            </div>
          ))}
        </div>
        {showJsonDrawer ? (
          <pre data-testid="calm-ux-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {jsonOutput}
          </pre>
        ) : null}
      </div>
    </section>
  );
}

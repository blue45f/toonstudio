/**
 * Wave 63C — CalmChrome GNB·LNB·탑 메뉴·푸터 평면 동선 & 작업 단계 적응형 커맨드 런처 패널.
 *
 * - 100% ToonStudio 고유 브랜드(CalmChrome · AtelierInk · AtelierSolid · AtelierCast · AtelierStage) 전용.
 * - 순수 시맨틱 OKLCH / currentColor SVG 와이어프레임 (원시 색상 0건 · 바이올렛 270~320° 0% ·
 *   전역 전환 클래스·Web Storage·장식 아이콘·기본 빈 객체 props 미사용).
 * - 정적 아키텍처 시뮬레이션 UI이며 기존 site-header / site-footer DOM이나 서버 상태를 직접 변경하지 않는다.
 */

import {
  ArrowUpRight, Check, ChevronLeft, ChevronRight, Command, Compass, Copy,
  Layers, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, X,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ATELIER_NAV_BRAND, CALM_CHROME_GNB_PILLARS, WORKFLOW_PHASE_CHROME_PROFILES,
  buildVisualUndoTimeline, evaluateChromeErgonomics, exportNavFlowArchitectureJson,
  getCalmGnbPillar, getWorkflowPhaseProfile, restoreVisualUndoSnapshot, searchIntentRoutes,
  type CanonicalIntentRoute, type ChromeErgonomicsReport, type IntentSearchResult,
  type VisualUndoSnapshot, type VisualUndoTimelineState, type WorkflowPhaseChromeProfile, type WorkflowPhaseId,
} from "./atelier-nav-flow-engine";

export interface StudioAtelierNavFlowPanelProps {
  readonly locale?: "ko" | "en"; readonly className?: string;
  readonly initialPhaseId?: WorkflowPhaseId; readonly initialLnbExpanded?: boolean;
  readonly initialImmersiveFocus?: boolean; readonly initialFooterSitemapOpen?: boolean;
  readonly initialCommandOverlayOpen?: boolean; readonly initialSearchQuery?: string;
  readonly initialUndoIndex?: number;
  readonly onSelectRoute?: (route: CanonicalIntentRoute) => void;
  readonly onPhaseChange?: (profile: WorkflowPhaseChromeProfile) => void;
  readonly onRestoreSnapshot?: (snapshot: VisualUndoSnapshot) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent [word-break:keep-all] transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;

const QUICK_INTENT_CHIPS: readonly { readonly query: string; readonly labelKo: string; readonly labelEn: string }[] = [
  { query: "선화", labelKo: "선화", labelEn: "lineart" }, { query: "3d", labelKo: "3D CAD", labelEn: "3d" },
  { query: "캐릭터", labelKo: "캐릭터", labelEn: "character" }, { query: "협업", labelKo: "협업", labelEn: "collab" },
  { query: "발표", labelKo: "기술 발표", labelEn: "deck" }, { query: "내보내기", labelKo: "내보내기", labelEn: "export" },
  { query: "ㅂㄹㅅ", labelKo: "초성: ㅂㄹㅅ", labelEn: "Choseong: ㅂㄹㅅ" },
];

const SVG_TOKENS = Object.freeze({
  surface: "var(--color-canvas, oklch(0.2 0.012 72))", chrome: "var(--color-panel, oklch(0.25 0.014 72))",
  elevated: "var(--color-raised, oklch(0.3 0.016 72))", card: "var(--color-card, oklch(0.28 0.014 72))",
  line: "var(--color-line-strong, oklch(0.45 0.014 72))", fg: "currentColor",
  fgMuted: "var(--color-fg-2, oklch(0.76 0.01 75))", good: "var(--color-good, oklch(0.68 0.14 155))",
  paper: "oklch(0.95 0.008 78)", paperPanel: "oklch(0.91 0.009 76)", paperInk: "oklch(0.26 0.016 72)",
  paperMuted: "oklch(0.62 0.012 74)", balloonFill: "oklch(0.98 0.004 78)",
});

interface WireframePreviewProps {
  readonly ergonomics: ChromeErgonomicsReport; readonly phase: WorkflowPhaseChromeProfile;
  readonly searchResult: IntentSearchResult; readonly activeFrame: VisualUndoSnapshot;
  readonly commandOverlayOpen: boolean; readonly isEn: boolean;
}

function CalmChromeWireframeSvg(svgProps: WireframePreviewProps): ReactElement {
  const { ergonomics, phase, searchResult, activeFrame, commandOverlayOpen, isEn } = svgProps;
  const accentStroke = `oklch(0.64 0.14 ${phase.accentHueDeg})`;
  const accentSoft = `oklch(0.64 0.14 ${phase.accentHueDeg} / 0.18)`;
  const frameAccent = `oklch(0.54 0.1 ${activeFrame.thumb.accentHueDeg})`;
  const frameColorFill = `oklch(0.86 0.06 ${activeFrame.thumb.accentHueDeg} / 0.45)`;

  const topH = ergonomics.immersiveFocusMode ? 24 : 38;
  const lnbW = ergonomics.immersiveFocusMode ? 0 : (ergonomics.lnbExpanded ? 124 : 40);
  const footH = ergonomics.immersiveFocusMode ? 0 : (ergonomics.footerSitemapExpanded ? 74 : 24);
  const canvasX = lnbW;
  const canvasY = topH;
  const canvasW = 720 - lnbW;
  const canvasH = 400 - topH - footH;
  const topHit = searchResult.hits[0]?.route;

  return (
    <svg
      role="img"
      data-testid="calm-chrome-wireframe-svg"
      aria-label={isEn
        ? `CalmChrome wireframe preview showing ${ergonomics.calm.canvasUsableRatioPct}% usable canvas`
        : `CalmChrome 4대 크롬 실시간 와이어프레임 프리뷰 (캔버스 가용 면적 ${ergonomics.calm.canvasUsableRatioPct}%)`}
      viewBox="0 0 720 400"
      className="h-auto w-full rounded-xl border border-line bg-panel text-fg"
    >
      <rect x={0} y={0} width={720} height={400} rx={12} fill={SVG_TOKENS.surface} />
      {/* 1. Top 44px Single GNB + Phase Context Bar */}
      <rect x={0} y={0} width={720} height={topH} fill={SVG_TOKENS.chrome} />
      <line x1={0} y1={topH} x2={720} y2={topH} stroke={SVG_TOKENS.line} strokeWidth={1} />
      <rect x={10} y={topH / 2 - 8} width={66} height={16} rx={4} fill={accentSoft} stroke={accentStroke} strokeWidth={1} />
      <text x={43} y={topH / 2 + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={accentStroke}>CalmChrome</text>
      {CALM_CHROME_GNB_PILLARS.map((pillar, idx) => {
        const px = 86 + idx * 62;
        const isCurrent = pillar.id === phase.gnbPillarId;
        return (
          <g key={pillar.id}>
            <rect x={px} y={topH / 2 - 8} width={56} height={16} rx={4} fill={isCurrent ? accentSoft : "none"} stroke={isCurrent ? accentStroke : SVG_TOKENS.line} strokeWidth={0.8} />
            <text x={px + 28} y={topH / 2 + 3.5} textAnchor="middle" fontSize={8} fontWeight={isCurrent ? 700 : 500} fill={isCurrent ? accentStroke : SVG_TOKENS.fg}>
              {isEn ? pillar.labelEn : pillar.labelKo}
            </text>
          </g>
        );
      })}
      {!ergonomics.immersiveFocusMode && phase.topBarTools.map((tool, idx) => {
        const tx = 346 + idx * 54;
        return (
          <g key={tool.id}>
            <rect x={tx} y={10} width={50} height={18} rx={4} fill={SVG_TOKENS.elevated} stroke={idx === 0 ? accentStroke : SVG_TOKENS.line} strokeWidth={0.8} />
            <text x={tx + 25} y={22} textAnchor="middle" fontSize={7.2} fill={SVG_TOKENS.fg}>
              {tool.shortcut} · {(isEn ? tool.labelEn : tool.labelKo).slice(0, 4)}
            </text>
          </g>
        );
      })}
      <rect x={624} y={topH / 2 - 9} width={86} height={18} rx={5} fill={commandOverlayOpen ? accentSoft : SVG_TOKENS.elevated} stroke={accentStroke} strokeWidth={1} />
      <text x={667} y={topH / 2 + 3.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={commandOverlayOpen ? accentStroke : SVG_TOKENS.fg}>Cmd+K · 24</text>

      {/* 2. Left 52px Adaptive Icon Rail (or 216px Expanded Drawer) */}
      {lnbW > 0 && (
        <g data-testid="wireframe-lnb-rail">
          <rect x={0} y={topH} width={lnbW} height={canvasH} fill={SVG_TOKENS.chrome} />
          <line x1={lnbW} y1={topH} x2={lnbW} y2={topH + canvasH} stroke={SVG_TOKENS.line} strokeWidth={1} />
          {phase.lnbRailItems.map((item, idx) => {
            const ry = topH + 14 + idx * 38;
            return (
              <g key={item.id}>
                <rect x={6} y={ry} width={lnbW - 12} height={28} rx={6} fill={idx === 0 ? accentSoft : SVG_TOKENS.elevated} stroke={idx === 0 ? accentStroke : SVG_TOKENS.line} strokeWidth={0.8} />
                <text x={ergonomics.lnbExpanded ? 18 : lnbW / 2} y={ry + 17} textAnchor={ergonomics.lnbExpanded ? "start" : "middle"} fontSize={8.5} fontWeight={700} fill={idx === 0 ? accentStroke : SVG_TOKENS.fg}>
                  {ergonomics.lnbExpanded ? `${item.shortCode}  ${isEn ? item.labelEn : item.labelKo}` : item.shortCode}
                </text>
              </g>
            );
          })}
          <text x={lnbW / 2} y={topH + canvasH - 10} textAnchor="middle" fontSize={7.5} fill={SVG_TOKENS.fgMuted}>{ergonomics.calm.lnbWidthPx}px</text>
        </g>
      )}

      {/* 3. Center 88~96% Full-Bleed Canvas Surface */}
      <g data-testid="wireframe-canvas-stage">
        <rect x={canvasX + 10} y={canvasY + 10} width={canvasW - 20} height={canvasH - 20} rx={8} fill={SVG_TOKENS.paper} />
        {Array.from({ length: activeFrame.thumb.panelCount }, (_, pIdx) => {
          const cols = activeFrame.thumb.panelCount >= 4 ? 2 : activeFrame.thumb.panelCount;
          const rows = Math.ceil(activeFrame.thumb.panelCount / cols);
          const innerW = (canvasW - 64) / cols;
          const innerH = (canvasH - 84) / rows;
          const px = canvasX + 26 + (pIdx % cols) * (innerW + 10);
          const py = canvasY + 46 + Math.floor(pIdx / cols) * (innerH + 10);
          return (
            <g key={`panel-${pIdx}`}>
              <rect
                x={px} y={py} width={innerW} height={innerH} rx={4}
                fill={activeFrame.thumb.hasColorPass ? frameColorFill : SVG_TOKENS.paperPanel}
                stroke={activeFrame.thumb.hasLineartPass ? SVG_TOKENS.paperInk : SVG_TOKENS.paperMuted}
                strokeWidth={activeFrame.thumb.hasLineartPass ? 1.6 : 1}
                strokeDasharray={activeFrame.thumb.hasLineartPass ? undefined : "4 3"}
              />
              {activeFrame.thumb.hasSolid3dPass && (
                <polygon points={`${px + 12},${py + innerH - 10} ${px + innerW * 0.48},${py + 16} ${px + innerW - 12},${py + innerH - 10}`} fill="none" stroke={frameAccent} strokeWidth={1} />
              )}
              {pIdx < activeFrame.thumb.balloonCount && (
                <ellipse cx={px + innerW - 26} cy={py + 16} rx={16} ry={9} fill={SVG_TOKENS.balloonFill} stroke={SVG_TOKENS.paperInk} strokeWidth={1} />
              )}
            </g>
          );
        })}
        <rect x={canvasX + 22} y={canvasY + 18} width={226} height={20} rx={5} fill={SVG_TOKENS.chrome} stroke={SVG_TOKENS.line} strokeWidth={0.8} />
        <text x={canvasX + 32} y={canvasY + 31} fontSize={8.5} fontWeight={700} fill={SVG_TOKENS.fg}>
          {isEn
            ? `Canvas ${ergonomics.calm.canvasUsableRatioPct}% · ${phase.brandEngine} · ${activeFrame.timestampLabel}`
            : `캔버스 가용 ${ergonomics.calm.canvasUsableRatioPct}% · ${phase.brandEngine} · ${activeFrame.timestampLabel}`}
        </text>
      </g>

      {/* 4. Bottom 28px Minimal System Status Footer + <details> Sitemap */}
      {footH > 0 && (
        <g data-testid="wireframe-footer-bar">
          <rect x={0} y={400 - footH} width={720} height={footH} fill={SVG_TOKENS.chrome} />
          <line x1={0} y1={400 - footH} x2={720} y2={400 - footH} stroke={SVG_TOKENS.line} strokeWidth={1} />
          <circle cx={14} cy={400 - footH + 12} r={3.5} fill={SVG_TOKENS.good} />
          <text x={24} y={400 - footH + 15} fontSize={8} fill={SVG_TOKENS.fg}>{phase.footerStatus.saveLabelKo} · {phase.footerStatus.zoomLabel} · {phase.footerStatus.syncLabelKo}</text>
          <text x={706} y={400 - footH + 15} textAnchor="end" fontSize={8} fontWeight={600} fill={accentStroke}>{ergonomics.footerSitemapExpanded ? "▼ <details> 전체 사이트맵 열림" : "▶ <details> 전체 사이트맵 접힘"}</text>
          {ergonomics.footerSitemapExpanded && CALM_CHROME_GNB_PILLARS.map((pillar, idx) => (
            <g key={`foot-${pillar.id}`}>
              <rect x={16 + idx * 174} y={400 - footH + 26} width={162} height={38} rx={5} fill={SVG_TOKENS.elevated} stroke={SVG_TOKENS.line} strokeWidth={0.7} />
              <text x={26 + idx * 174} y={400 - footH + 41} fontSize={8} fontWeight={700} fill={accentStroke}>{isEn ? pillar.labelEn : pillar.labelKo} ({pillar.canonicalHref})</text>
              <text x={26 + idx * 174} y={400 - footH + 55} fontSize={7.2} fill={SVG_TOKENS.fgMuted}>{pillar.brandEngine} · {pillar.shortcutChord}</text>
            </g>
          ))}
        </g>
      )}

      {/* 5. Floating Cmd+K Intent Command Launcher Overlay */}
      {commandOverlayOpen && (
        <g data-testid="wireframe-cmdk-overlay">
          <rect x={176} y={76} width={368} height={154} rx={10} fill={SVG_TOKENS.chrome} stroke={accentStroke} strokeWidth={1.5} />
          <rect x={190} y={90} width={340} height={24} rx={5} fill={SVG_TOKENS.surface} stroke={SVG_TOKENS.line} strokeWidth={0.9} />
          <text x={200} y={105} fontSize={9} fill={SVG_TOKENS.fg}>Cmd+K › {searchResult.query.trim() || (isEn ? "Type intent (lineart, 3d, deck...)" : "의도 검색 (선화 · 3d · 발표 · 캐릭터 · 협업)")}</text>
          {topHit && (
            <g>
              <rect x={190} y={122} width={340} height={30} rx={6} fill={accentSoft} stroke={accentStroke} strokeWidth={1} />
              <text x={200} y={136} fontSize={8.5} fontWeight={700} fill={SVG_TOKENS.fg}>1순위: {isEn ? topHit.labelEn : topHit.labelKo} ({topHit.href})</text>
              <text x={200} y={147} fontSize={7.5} fill={SVG_TOKENS.fgMuted}>{topHit.brandEngine} · 1클릭 직행 · {topHit.shortcut}</text>
            </g>
          )}
          <text x={192} y={168} fontSize={7.5} fontWeight={700} fill={SVG_TOKENS.fgMuted}>{isEn ? "Predictive Prefetch (3):" : "예측 프리페치 3건:"}</text>
          {searchResult.prefetchTargets.map((target, idx) => (
            <g key={target.routeId}>
              <rect x={190 + idx * 115} y={176} width={110} height={40} rx={5} fill={SVG_TOKENS.card} stroke={SVG_TOKENS.line} strokeWidth={0.8} />
              <text x={197 + idx * 115} y={192} fontSize={7.4} fontWeight={700} fill={SVG_TOKENS.fg}>{(isEn ? target.labelEn : target.labelKo).slice(0, 10)}</text>
              <text x={197 + idx * 115} y={206} fontSize={7} fill={accentStroke}>{target.confidencePct}% · {target.brandEngine}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function UndoThumbnailSvg({ frame }: { readonly frame: VisualUndoSnapshot }): ReactElement {
  const accent = `oklch(0.62 0.13 ${frame.thumb.accentHueDeg})`;
  const colorFill = `oklch(0.84 0.07 ${frame.thumb.accentHueDeg} / 0.55)`;
  return (
    <svg viewBox="0 0 96 56" aria-hidden="true" className="h-14 w-full rounded-md border border-line bg-canvas">
      <rect x={2} y={2} width={92} height={52} rx={4} fill={SVG_TOKENS.paper} />
      {Array.from({ length: frame.thumb.panelCount }, (_, idx) => {
        const isGrid = frame.thumb.panelCount >= 4;
        const w = isGrid ? 40 : 26;
        const h = isGrid ? 20 : 42;
        const x = isGrid ? 6 + (idx % 2) * 44 : 6 + idx * 29;
        const y = isGrid ? 6 + Math.floor(idx / 2) * 24 : 7;
        return (
          <g key={idx}>
            <rect x={x} y={y} width={w} height={h} rx={2} fill={frame.thumb.hasColorPass ? colorFill : SVG_TOKENS.paperPanel} stroke={frame.thumb.hasLineartPass ? SVG_TOKENS.paperInk : accent} strokeWidth={frame.thumb.hasLineartPass ? 1.4 : 0.9} />
            {frame.thumb.hasSolid3dPass && <line x1={x + 4} y1={y + h - 4} x2={x + w - 4} y2={y + 4} stroke={accent} strokeWidth={0.9} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Wave 63C CalmChrome 4대 크롬 평면 동선·작업 단계 적응형 커맨드 런처 통합 패널. */
export function StudioAtelierNavFlowPanel(props: StudioAtelierNavFlowPanelProps): ReactElement {
  const {
    locale = "ko", className, initialPhaseId = "sketch-conti", initialLnbExpanded = false,
    initialImmersiveFocus = false, initialFooterSitemapOpen = false, initialCommandOverlayOpen = true,
    initialSearchQuery = "", initialUndoIndex, onSelectRoute, onPhaseChange, onRestoreSnapshot,
  } = props;

  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const searchInputId = useId();

  const [activePhaseId, setActivePhaseId] = useState<WorkflowPhaseId>(initialPhaseId);
  const [lnbExpanded, setLnbExpanded] = useState<boolean>(initialLnbExpanded);
  const [immersiveFocus, setImmersiveFocus] = useState<boolean>(initialImmersiveFocus);
  const [footerSitemapOpen, setFooterSitemapOpen] = useState<boolean>(initialFooterSitemapOpen);
  const [commandOverlayOpen, setCommandOverlayOpen] = useState<boolean>(initialCommandOverlayOpen);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<VisualUndoTimelineState>(() =>
    buildVisualUndoTimeline(initialUndoIndex !== undefined ? { activeIndex: initialUndoIndex } : undefined),
  );
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "fallback">("idle");
  const [liveStatus, setLiveStatus] = useState<string>(
    pick("CalmChrome v3 평면 동선 시뮬레이터가 준비되었습니다.", "CalmChrome v3 navigation simulator ready."),
  );

  const activePhase = useMemo(() => getWorkflowPhaseProfile(activePhaseId), [activePhaseId]);
  const activePillar = useMemo(() => getCalmGnbPillar(activePhase.gnbPillarId), [activePhase.gnbPillarId]);
  const ergonomics = useMemo(
    () => evaluateChromeErgonomics({
      viewportWidthPx: 1440, viewportHeightPx: 900, lnbExpanded, lnbPinned: lnbExpanded,
      footerSitemapExpanded: footerSitemapOpen, immersiveFocusMode: immersiveFocus, activePhaseId,
    }),
    [activePhaseId, footerSitemapOpen, immersiveFocus, lnbExpanded],
  );
  const searchResult = useMemo(
    () => searchIntentRoutes(searchQuery, { activePhaseId, limit: 6 }),
    [activePhaseId, searchQuery],
  );
  const activeFrame = timeline.frames[timeline.activeIndex] ?? (timeline.frames[0] as VisualUndoSnapshot);
  const architectureJson = useMemo(
    () => exportNavFlowArchitectureJson({ ergonomics, searchResult, timeline }),
    [ergonomics, searchResult, timeline],
  );

  const handleSelectPhase = (phaseId: WorkflowPhaseId): void => {
    const profile = getWorkflowPhaseProfile(phaseId);
    setActivePhaseId(phaseId);
    setLiveStatus(isEn
      ? `Switched top bar & LNB rail to ${profile.labelEn} (${profile.topBarTools.length} tools).`
      : `[${profile.labelKo}] 단계로 탑 메뉴 ${profile.topBarTools.length}도구와 LNB 레일 ${profile.lnbRailItems.length}핀을 자동 전환했습니다.`);
    onPhaseChange?.(profile);
  };

  const handleRoutePick = (route: CanonicalIntentRoute): void => {
    setSelectedRouteId(route.id);
    setLiveStatus(isEn
      ? `Selected canonical route ${route.labelEn} (${route.href}) via ${route.brandEngine}.`
      : `[${route.labelKo}] (${route.href} · ${route.brandEngine}) 1클릭 목적지를 선택했습니다.`);
    onSelectRoute?.(route);
  };

  const handleRestoreFrame = (targetIndex: number): void => {
    const next = restoreVisualUndoSnapshot(timeline, targetIndex);
    const restored = next.frames[next.activeIndex] ?? (next.frames[0] as VisualUndoSnapshot);
    setTimeline(next);
    setActivePhaseId(restored.phaseId);
    setLiveStatus(next.lastActionSummaryKo);
    onRestoreSnapshot?.(restored);
  };

  const handleCopyJson = async (): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(architectureJson);
        setCopyFeedback("copied");
        setLiveStatus(pick("CalmChrome v3 아키텍처 JSON을 클립보드에 복사했습니다.", "Copied CalmChrome v3 JSON."));
        return;
      }
      setCopyFeedback("fallback");
    } catch {
      setCopyFeedback("fallback");
    }
  };

  const breadcrumbs = isEn ? timeline.resumeBreadcrumbEn : timeline.resumeBreadcrumbKo;

  return (
    <section
      data-testid="studio-atelier-nav-flow-panel"
      aria-label={pick("CalmChrome 평면 동선 및 적응형 크롬 오케스트레이터", "CalmChrome Navigation Flow Orchestrator")}
      className={`space-y-5 rounded-2xl border border-line bg-canvas p-4 text-fg sm:p-6 ${className ?? ""}`}
    >
      <header className="space-y-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-fg-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-accent">
                <Compass size={13} aria-hidden="true" />
                {ATELIER_NAV_BRAND.chrome} v3 · {ATELIER_NAV_BRAND.suite}
              </span>
              <span className="rounded-full border border-line bg-panel px-2.5 py-0.5">
                {pick("시뮬레이션 설계 모델", "Architecture Simulation")}
              </span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all] sm:text-xl">
              {pick("4대 목적 평면 동선 · 작업 단계 적응형 크롬 오케스트레이터", "4-Pillar Flat Navigation & Phase-Adaptive Chrome")}
            </h2>
            <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              {pick(
                "294개 분산 라우트와 5대 허브(124탭)를 4대 목적 GNB · 52px 적응형 LNB · 44px 단일 탑 바 · 28px 미니멀 푸터 · Cmd+K 의도 런처로 압축 검증합니다.",
                "Compresses 294 distributed routes and 124 hub tabs into a 4-pillar GNB, 52px rail, 44px single top bar, 28px footer, and Cmd+K launcher.",
              )}
            </p>
          </div>
          <button type="button" data-testid="nav-copy-json-btn" onClick={() => { void handleCopyJson(); }} className={BTN_SOLID}>
            {copyFeedback === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copyFeedback === "copied" ? pick("JSON 복사됨", "JSON Copied") : pick("아키텍처 JSON 복사", "Copy Architecture JSON")}
          </button>
        </div>

        <nav data-testid="nav-resume-breadcrumb" aria-label={pick("작업 복귀 경로", "Work Resume Breadcrumb")} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs">
          <ol className="flex flex-wrap items-center gap-1.5 font-medium text-fg [word-break:keep-all]">
            <li className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">{pick("이어쓰기 복귀", "Resume")}</li>
            {breadcrumbs.map((crumb, idx) => (
              <li key={`${crumb}-${idx}`} className="inline-flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden="true" className="text-fg-3">›</span>}
                <span className={idx === breadcrumbs.length - 1 ? "font-bold text-fg" : "text-fg-2"}>{crumb}</span>
              </li>
            ))}
          </ol>
          <span className="text-[11px] text-fg-2 tabular-nums">{activePillar.brandEngine} · {activeFrame.routeHref}</span>
        </nav>
      </header>

      <p className="text-xs text-fg-2">{pick("도구 배치와 작업 순서를 보여 주는 예제입니다. 아래 수치는 설정한 모형에서 계산했습니다.", "This preview illustrates workflow and tool layout. The figures below come from the configured model.")}</p>
      {/* 설계 모형 지표 */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{pick("평균 클릭 깊이", "Avg Click Depth")}</div>
          <div data-testid="metric-click-depth" className="mt-1 text-base font-bold text-fg tabular-nums">{ergonomics.legacy.avgClickDepth} → {ergonomics.calm.avgClickDepth}</div>
          <div className="text-[11px] text-good tabular-nums">-{ergonomics.calm.clickReductionPct}%</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{pick("캔버스 실가용 면적", "Usable Canvas Area")}</div>
          <div data-testid="metric-canvas-area" className="mt-1 text-base font-bold text-fg tabular-nums">{ergonomics.calm.canvasUsableRatioPct}%</div>
          <div className="text-[11px] text-good tabular-nums">+{ergonomics.calm.canvasGainPct}%p ({ergonomics.legacy.canvasUsableRatioPct}% 대비)</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{pick("GNB · 탑 바 예산", "GNB & Top Budget")}</div>
          <div className="mt-1 text-base font-bold text-fg tabular-nums">{ergonomics.calm.gnbItemCount}축 · {ergonomics.calm.topBarToolCount}도구</div>
          <div className="text-[11px] text-fg-2 tabular-nums">{ergonomics.calm.topBarHeightPx}px · LNB {ergonomics.calm.lnbWidthPx}px</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{pick("중복 진입 통합", "Duplicate Entry Cleanup")}</div>
          <div className="mt-1 text-base font-bold text-fg tabular-nums">{ergonomics.calm.duplicateEntryEliminatedCount}건 통합</div>
          <div className="text-[11px] text-fg-2 tabular-nums">{ergonomics.legacy.totalRoutes}라우트 → 24 정본</div>
        </div>
      </div>

      {/* Interactive Wireframe Preview + Controls */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
            {pick("4대 크롬 실시간 와이어프레임 (1440×900 기준)", "Live 4-Surface Chrome Wireframe (1440×900)")}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="toggle-lnb-expand" aria-pressed={lnbExpanded} disabled={immersiveFocus} onClick={() => setLnbExpanded((prev) => !prev)} className={lnbExpanded && !immersiveFocus ? BTN_ACTIVE : BTN_OUTLINE}>
              {lnbExpanded ? <PanelLeftClose size={14} aria-hidden="true" /> : <PanelLeftOpen size={14} aria-hidden="true" />}
              {lnbExpanded ? pick("LNB 216px 확장", "LNB 216px") : pick("LNB 52px 레일", "LNB 52px Rail")}
            </button>
            <button type="button" data-testid="toggle-immersive-focus" aria-pressed={immersiveFocus} onClick={() => setImmersiveFocus((prev) => !prev)} className={immersiveFocus ? BTN_ACTIVE : BTN_OUTLINE}>
              {immersiveFocus ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
              {pick("몰입 96% 모드", "Immersive 96%")}
            </button>
            <button type="button" data-testid="toggle-cmdk-overlay" aria-pressed={commandOverlayOpen} onClick={() => setCommandOverlayOpen((prev) => !prev)} className={commandOverlayOpen ? BTN_ACTIVE : BTN_OUTLINE}>
              <Command size={14} aria-hidden="true" />
              {pick("Cmd+K 오버레이", "Cmd+K Overlay")}
            </button>
            <button type="button" data-testid="toggle-footer-sitemap" aria-pressed={footerSitemapOpen} disabled={immersiveFocus} onClick={() => setFooterSitemapOpen((prev) => !prev)} className={footerSitemapOpen && !immersiveFocus ? BTN_ACTIVE : BTN_OUTLINE}>
              <Layers size={14} aria-hidden="true" />
              {pick("푸터 사이트맵", "Footer Sitemap")}
            </button>
          </div>
        </div>
        <CalmChromeWireframeSvg ergonomics={ergonomics} phase={activePhase} searchResult={searchResult} activeFrame={activeFrame} commandOverlayOpen={commandOverlayOpen} isEn={isEn} />
      </div>

      {/* 6 Workflow Phase Adaptive Morphing Studio */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("6대 작업 단계별 탑 메뉴(5도구) · LNB 자동 변신", "6-Phase Adaptive Top Bar (5 Tools) & LNB Rail")}</h3>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? activePhase.focusSummaryEn : activePhase.focusSummaryKo}</p>
          </div>
          <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-fg-2">
            {activePhase.brandEngine} · {isEn ? activePillar.labelEn : activePillar.labelKo}
          </span>
        </div>

        <div role="group" aria-label={pick("작업 단계 선택", "Select Workflow Phase")} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {WORKFLOW_PHASE_CHROME_PROFILES.map((phase) => (
            <button key={phase.id} type="button" data-testid={`phase-tab-${phase.id}`} aria-pressed={phase.id === activePhaseId} onClick={() => handleSelectPhase(phase.id)} className={phase.id === activePhaseId ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? phase.labelEn : phase.labelKo}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between text-xs font-bold text-fg">
              <span>{pick("44px 탑 컨텍스트 바 (핵심 5도구 고정)", "44px Top Context Bar (5 Core Tools)")}</span>
              <span className="text-[11px] font-semibold text-accent tabular-nums">{activePhase.topBarTools.length} / 5</span>
            </div>
            <ul data-testid="active-phase-topbar-tools" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {activePhase.topBarTools.map((tool) => (
                <li key={tool.id} className="flex items-center justify-between rounded-md border border-line bg-panel px-2.5 py-2 text-xs">
                  <span className="font-semibold text-fg [word-break:keep-all]">{isEn ? tool.labelEn : tool.labelKo}</span>
                  <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-bold text-fg-2 tabular-nums">{tool.shortcut}</kbd>
                </li>
              ))}
            </ul>
            <details className="rounded-md border border-line bg-panel px-2.5 py-2 text-xs text-fg-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-fg [word-break:keep-all]">
                <span>{pick("서랍/Cmd+K로 정리된 보조 도구 보기", "Overflow Tools Tucked in Drawer / Cmd+K")}</span>
                <span className="tabular-nums">{activePhase.overflowDrawerToolsKo.length}건</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px]">
                {activePhase.overflowDrawerToolsKo.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between text-xs font-bold text-fg">
              <span>{pick("52px LNB 적응형 아이콘 레일", "52px Adaptive LNB Rail")}</span>
              <span className="text-[11px] font-semibold text-fg-2 tabular-nums">{activePhase.lnbRailItems.length} / 6</span>
            </div>
            <ul data-testid="active-phase-lnb-items" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {activePhase.lnbRailItems.map((item) => (
                <li key={item.id} className="rounded-md border border-line bg-panel p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">{item.shortCode}</span>
                    <span className="text-[10px] text-fg-3">{item.pinnedByDefault ? pick("고정", "Pin") : pick("보조", "Opt")}</span>
                  </div>
                  <div className="mt-1 font-semibold text-fg [word-break:keep-all]">{isEn ? item.labelEn : item.labelKo}</div>
                </li>
              ))}
            </ul>
            <div data-testid="active-phase-footer-status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11px] text-fg-2 tabular-nums">
              <span>{activePhase.footerStatus.saveLabelKo}</span>
              <span>{activePhase.footerStatus.zoomLabel} · {activePhase.footerStatus.syncLabelKo}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Cmd+K Intent Command Launcher + 3 Predictive Prefetch Targets */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("Cmd+K 0-클릭 의도 커맨드 런처 (24 정본 목적지)", "Cmd+K Zero-Click Intent Launcher (24 Canonical Routes)")}</h3>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{pick("한글 초성(ㅂㄹㅅ · ㄱㅅ)이나 자연어 의도(선화 · 3d · 발표 · 캐릭터 · 협업 · 내보내기)로 1클릭 이동합니다.", "Search by Korean Choseong or natural intent to jump in 1 click.")}</p>
          </div>
          <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[11px] text-fg-2 tabular-nums">{searchResult.hits.length} / {searchResult.totalCatalogRoutes}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={searchInputId} className="sr-only">{pick("Cmd+K 의도 검색어 입력", "Cmd+K Intent Search")}</label>
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
            <input
              id={searchInputId}
              data-testid="cmdk-intent-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={pick("선화, 3d, 발표, 캐릭터, 협업, 내보내기 또는 초성(ㅂㄹㅅ)...", "Try lineart, 3d, deck, character, collab, export...")}
              className={`min-h-11 w-full rounded-lg border border-line bg-card py-2 pl-9 pr-9 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
            />
            {searchQuery.length > 0 && (
              <button type="button" data-testid="cmdk-clear-btn" aria-label={pick("검색어 지우기", "Clear search")} onClick={() => setSearchQuery("")} className={`absolute right-1.5 top-1/2 inline-flex min-h-8 min-w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-fg-2 hover:bg-raised ${FOCUS_RING}`}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_INTENT_CHIPS.map((chip) => (
            <button key={chip.query} type="button" data-testid={`intent-chip-${chip.query}`} onClick={() => setSearchQuery(chip.query)} className={searchQuery === chip.query ? BTN_ACTIVE : BTN_OUTLINE}>
              {isEn ? chip.labelEn : chip.labelKo}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <ul data-testid="cmdk-results-list" className="space-y-1.5 lg:col-span-2">
            {searchResult.hits.length === 0 ? (
              <li className="rounded-lg border border-line bg-card p-4 text-xs text-fg-2 [word-break:keep-all]">
                {pick("일치하는 목적지가 없습니다. '선화', '3d', '캐릭터', '발표' 같은 의도 키워드를 입력해 보세요.", "No matching routes found.")}
              </li>
            ) : (
              searchResult.hits.map((hit) => (
                <li key={hit.route.id}>
                  <button
                    type="button"
                    data-testid={`cmdk-hit-${hit.route.id}`}
                    onClick={() => handleRoutePick(hit.route)}
                    className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none ${
                      selectedRouteId === hit.route.id ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-strong hover:bg-raised"
                    } ${FOCUS_RING}`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? hit.route.labelEn : hit.route.labelKo}</span>
                        <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">{hit.route.brandEngine}</span>
                        <span className="text-[10px] text-fg-3">{hit.route.href}</span>
                      </div>
                      <p className="truncate text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? hit.route.summaryEn : hit.route.summaryKo}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent tabular-nums">
                      {hit.route.shortcut}
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("예측 프리페치 자동 추천 (3건)", "Predictive Prefetch Targets (3)")}</div>
            <ol data-testid="nav-prefetch-list" className="space-y-2">
              {searchResult.prefetchTargets.map((target, idx) => (
                <li key={target.routeId} className="rounded-md border border-line bg-panel p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg [word-break:keep-all]">{idx + 1}. {isEn ? target.labelEn : target.labelKo}</span>
                    <span className="rounded bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good tabular-nums">{target.confidencePct}%</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-3">{target.href} · {target.brandEngine}</div>
                  <p className="mt-1 text-[11px] text-fg-2 [word-break:keep-all]">{target.reasonKo}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Visual Undo Filmstrip Scrubber */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("이전 작업 시점 선택 예제", "Undo Timeline Example")}</h3>
            <p className="text-xs text-fg-2 tabular-nums">{isEn ? timeline.episodeTitleEn : timeline.episodeTitleKo} · Undo {timeline.undoDepth} / Redo {timeline.redoDepth}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" data-testid="undo-prev-btn" disabled={timeline.activeIndex <= 0} onClick={() => handleRestoreFrame(timeline.activeIndex - 1)} className={BTN_OUTLINE}>
              <ChevronLeft size={14} aria-hidden="true" />{pick("이전 스냅샷", "Prev")}
            </button>
            <button type="button" data-testid="undo-next-btn" disabled={timeline.activeIndex >= timeline.headIndex} onClick={() => handleRestoreFrame(timeline.activeIndex + 1)} className={BTN_OUTLINE}>
              {pick("다음 스냅샷", "Next")}<ChevronRight size={14} aria-hidden="true" />
            </button>
            <button type="button" data-testid="undo-latest-btn" disabled={timeline.activeIndex === timeline.headIndex} onClick={() => handleRestoreFrame(timeline.headIndex)} className={BTN_OUTLINE}>
              <RotateCcw size={14} aria-hidden="true" />{pick("최신 복귀", "Latest")}
            </button>
          </div>
        </div>

        <div data-testid="visual-undo-filmstrip" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {timeline.frames.map((frame) => (
            <button
              key={frame.id}
              type="button"
              data-testid={`undo-frame-${frame.index}`}
              aria-pressed={frame.isCurrentHead}
              onClick={() => handleRestoreFrame(frame.index)}
              className={`flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors motion-reduce:transition-none ${
                frame.isCurrentHead ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-strong hover:bg-raised"
              } ${FOCUS_RING}`}
            >
              <UndoThumbnailSvg frame={frame} />
              <div className="text-[11px] font-bold text-fg [word-break:keep-all]">{isEn ? frame.labelEn : frame.labelKo}</div>
              <div className="flex items-center justify-between text-[10px] text-fg-2 tabular-nums">
                <span>{frame.timestampLabel}</span>
                <span>{frame.strokeCount}획 · L{frame.layerCount}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4-Surface Chrome Before/After Comparison + Collapsible JSON Spec */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("4대 크롬 (GNB · LNB · 탑 메뉴 · 푸터) Before / After 진단", "4-Surface Chrome Before / After Ergonomics")}</h3>
        <div className="grid gap-2.5 md:grid-cols-2">
          {ergonomics.surfaceAudits.map((audit) => (
            <article key={audit.surfaceId} data-testid={`chrome-audit-${audit.surfaceId}`} className="space-y-1.5 rounded-lg border border-line bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-fg [word-break:keep-all]">{isEn ? audit.titleEn : audit.titleKo}</h4>
                <span className="rounded bg-raised px-2 py-0.5 text-[10px] font-semibold text-fg-2 tabular-nums">{audit.beforePixels}px → {audit.afterPixels}px</span>
              </div>
              <p className="text-[11px] text-fg-3 [word-break:keep-all]">Before: {audit.legacyMetricKo}</p>
              <p className="text-[11px] font-semibold text-fg [word-break:keep-all]">After: {audit.calmMetricKo}</p>
              <p className="text-[11px] font-semibold text-good [word-break:keep-all]">{audit.improvementKo}</p>
            </article>
          ))}
        </div>

        <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-fg [word-break:keep-all]">
            <span>{pick("CalmChrome v3 아키텍처 JSON 스펙 미리보기", "Preview CalmChrome v3 Architecture JSON")}</span>
            <span className="text-[11px] text-fg-2 tabular-nums">{architectureJson.length} chars</span>
          </summary>
          <pre data-testid="nav-architecture-json" className="mt-2 max-h-56 overflow-auto rounded-md border border-line bg-canvas p-3 text-[11px] text-fg-2 tabular-nums">
            {architectureJson}
          </pre>
        </details>
      </div>

      <p role="status" aria-live="polite" data-testid="nav-live-status" className="text-xs text-fg-2 [word-break:keep-all]">{liveStatus}</p>
    </section>
  );
}

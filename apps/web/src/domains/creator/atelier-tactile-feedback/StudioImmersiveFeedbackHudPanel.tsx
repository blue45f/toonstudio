/**
 * Wave 59B — 96% 풀블리드 몰입 미니멀 모드 & 5종 비침습 촉각 시각 피드백 라이브 스튜디오.
 *
 * - 3단계 몰입 뷰포트(96% 풀블리드 · 88% 차분한 아틀리에 · 82% 전문 워크벤치) 전환 & 가장자리 28px 근접 부상
 * - 4종 아틀리에 표면 테마, 필압·기울기·크기·불투명도 슬라이더, 실행취소·OPFS 저장·스냅·스포이드 루페 제어
 * - 순수 시맨틱 SVG 라이브 캔버스 목업(OKLCH·currentColor 전용, 원시 색·바이올렛 270~320° 0%)
 * - 라이브 캔버스 크롬이나 로컬 저장소를 변경하지 않는 인터랙티브 미리보기·토큰 규격 내보내기 패널이다.
 */

import {
  CheckCircle2, Code2, Copy, Crosshair, Eye, Hand, Layers, Maximize2,
  Minimize2, Pipette, RotateCcw, Save, SlidersHorizontal, Undo2, WifiOff,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";

import { Switch } from "@/shared/components/ui/switch";

import {
  ATELIER_SURFACE_THEMES, EDGE_REVEAL_THRESHOLD_PX, EPHEMERAL_PILL_TTL_MS,
  EYEDROPPER_SAMPLE_PRESETS, IMMERSIVE_VIEWPORT_MODES, INK_RIPPLE_DURATION_MS,
  LIVE_CANVAS_SVG_HEIGHT, LIVE_CANVAS_SVG_WIDTH, evaluateTactileFeedbackState,
  exportTactileFeedbackSpecJson, formatOklch, transitionImmersiveViewportMode,
  type AtelierSurfaceId, type ImmersiveViewportModeId, type OpfsSaveStatus,
  type TactileFeedbackState, type TactileRippleActionKind,
} from "./atelier-tactile-engine";

export interface StudioImmersiveFeedbackHudPanelProps {
  readonly initialMode?: ImmersiveViewportModeId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onModeChange?: (mode: ImmersiveViewportModeId, state: TactileFeedbackState) => void;
  readonly onExportJson?: (json: string, state: TactileFeedbackState) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const DETENT_CLASS =
  "transition-[transform,color,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold [word-break:keep-all] ${DETENT_CLASS} ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function StudioLiveTactileCanvasSvg(props: {
  readonly state: TactileFeedbackState; readonly isEn: boolean; readonly grainPatternId: string;
}): ReactElement {
  const { state, isEn, grainPatternId } = props;
  const { viewport, edgeReveal, nibHalo, ephemeralPill, inkRippleAndSave, eyedropperLoupe, surfaceTactile } = state;
  const theme = surfaceTactile.theme;

  const canvasBg = formatOklch(theme.canvasBg);
  const chromeBg = formatOklch(theme.chromeBg);
  const chromeTranslucent = formatOklch(theme.chromeBg, 0.92);
  const paperInk = formatOklch(theme.paperInk);
  const mutedInk = formatOklch(theme.mutedInk);
  const borderInk = formatOklch(theme.border);
  const accentColor = formatOklch(theme.accent);
  const hudPillBg = formatOklch(theme.paperInk, 0.9);
  const hudPillFg = formatOklch(theme.canvasBg);
  const warnBadgeColor = formatOklch({ l: 0.72, c: 0.15, h: 74 });
  const dangerBadgeColor = formatOklch({ l: 0.62, c: 0.175, h: 28 });

  const topBarH = viewport.topBarVisible ? 30 : 0;
  const leftRailW = viewport.leftRailVisible ? (viewport.leftSlidersOnly ? 30 : 42) : 0;
  const rightInspectorW = viewport.inspectorDocked ? 96 : 0;
  const stageX = leftRailW;
  const stageY = topBarH;
  const stageW = LIVE_CANVAS_SVG_WIDTH - leftRailW - rightInspectorW;
  const stageH = LIVE_CANVAS_SVG_HEIGHT - topBarH - 26;
  const nibX = Math.round(stageX + stageW * 0.44);
  const nibY = Math.round(stageY + stageH * 0.54);
  const loupeX = Math.round(stageX + stageW * 0.74);
  const loupeY = Math.round(stageY + stageH * 0.42);
  const opfsX = stageX + stageW - 18;
  const opfsY = stageY + 18;
  const grainTile = Math.max(4, Math.round(theme.grainScalePx * 4));

  const ariaLabel = isEn
    ? `Live atelier tactile HUD preview in ${viewport.labelEn}, ${viewport.canvasOccupancyPercent}% canvas area, ${theme.labelEn} surface, grain ${surfaceTactile.grainPercentLabel}`
    : `${viewport.labelKo} 라이브 캔버스 목업, 캔버스 점유 ${viewport.canvasOccupancyPercent}%, ${theme.labelKo} 표면, 종이결 ${surfaceTactile.grainPercentLabel}`;

  return (
    <svg
      data-testid="tactile-live-canvas-svg" data-viewport-mode={viewport.id}
      data-canvas-occupancy={viewport.canvasOccupancyPercent} data-surface-id={surfaceTactile.surfaceId}
      data-edge-revealed={String(edgeReveal.revealed)} data-ephemeral-visible={String(ephemeralPill.visible)}
      data-ripple-action={inkRippleAndSave.actionKind} data-ripple-active={String(inkRippleAndSave.active)}
      data-opfs-status={inkRippleAndSave.opfsDot.status} data-loupe-active={String(eyedropperLoupe.active)}
      data-loupe-violet-detected={String(eyedropperLoupe.violetSlopDetected)} data-reduced-motion={String(state.reducedMotion)}
      data-violet-free="true" viewBox={`0 0 ${LIVE_CANVAS_SVG_WIDTH} ${LIVE_CANVAS_SVG_HEIGHT}`}
      role="img" aria-label={ariaLabel}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <pattern id={grainPatternId} width={grainTile} height={grainTile} patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.7" fill={paperInk} />
          <circle cx="6" cy="5" r="0.55" fill={mutedInk} />
        </pattern>
      </defs>

      <rect x="0" y="0" width={LIVE_CANVAS_SVG_WIDTH} height={LIVE_CANVAS_SVG_HEIGHT} fill={canvasBg} />
      <rect data-testid="tactile-svg-grain-layer" x="0" y="0" width={LIVE_CANVAS_SVG_WIDTH} height={LIVE_CANVAS_SVG_HEIGHT} fill={`url(#${grainPatternId})`} opacity={surfaceTactile.grainOpacity} />

      {viewport.topBarVisible ? (
        <g data-testid="tactile-svg-topbar">
          <rect x="0" y="0" width={LIVE_CANVAS_SVG_WIDTH} height={topBarH} fill={chromeBg} />
          <line x1="0" y1={topBarH} x2={LIVE_CANVAS_SVG_WIDTH} y2={topBarH} stroke={borderInk} strokeWidth="1" />
          <rect x="12" y="8" width="54" height="14" rx="4" fill={borderInk} opacity="0.55" />
          <rect x="190" y="7" width="180" height="16" rx="8" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
          <text x="280" y="18" textAnchor="middle" fill={paperInk} fontSize="8" fontFamily="monospace" fontWeight="700">
            {isEn ? "44PX CONTEXT BAR · 5 STAGES" : "44PX 단일 컨텍스트 바 · 5공정"}
          </text>
        </g>
      ) : null}

      {viewport.leftRailVisible ? (
        <g data-testid="tactile-svg-left-rail">
          <rect x="0" y={topBarH} width={leftRailW} height={stageH} fill={chromeBg} />
          <line x1={leftRailW} y1={topBarH} x2={leftRailW} y2={topBarH + stageH} stroke={borderInk} strokeWidth="1" />
          <rect x="9" y={stageY + 24} width="6" height="84" rx="3" fill={borderInk} />
          <rect x="9" y={stageY + 24 + Math.round((1 - nibHalo.brushSizePx / 160) * 66)} width="6" height="18" rx="3" fill={accentColor} />
          <rect x="18" y={stageY + 24} width="6" height="84" rx="3" fill={borderInk} />
          <rect x="18" y={stageY + 24 + Math.round((1 - ephemeralPill.brushOpacityPercent / 100) * 66)} width="6" height="18" rx="3" fill={paperInk} />
          {!viewport.leftSlidersOnly ? (
            <g>
              <rect x="9" y={stageY + 124} width="24" height="16" rx="4" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
              <rect x="9" y={stageY + 148} width="24" height="16" rx="4" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
              <rect x="9" y={stageY + 172} width="24" height="16" rx="4" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
            </g>
          ) : null}
        </g>
      ) : null}

      {viewport.inspectorDocked ? (
        <g data-testid="tactile-svg-inspector">
          <rect x={stageX + stageW} y={topBarH} width={rightInspectorW} height={stageH} fill={chromeBg} />
          <line x1={stageX + stageW} y1={topBarH} x2={stageX + stageW} y2={topBarH + stageH} stroke={borderInk} strokeWidth="1" />
          <text x={stageX + stageW + 10} y={stageY + 20} fill={paperInk} fontSize="8" fontFamily="monospace" fontWeight="700">
            {isEn ? "INSPECTOR" : "인스펙터"}
          </text>
          <rect x={stageX + stageW + 10} y={stageY + 30} width="76" height="44" rx="5" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
          <rect x={stageX + stageW + 10} y={stageY + 84} width="76" height="58" rx="5" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
          <rect x={stageX + stageW + 10} y={stageY + 152} width="76" height="36" rx="5" fill={canvasBg} stroke={borderInk} strokeWidth="1" />
        </g>
      ) : null}

      <g>
        <rect x={stageX + 22} y={stageY + 18} width={Math.max(120, stageW - 44)} height={Math.max(120, stageH - 36)} rx="6" fill="none" stroke={borderInk} strokeWidth="1.2" strokeDasharray="4 3" />
        <path
          d={`M ${stageX + 54} ${stageY + stageH * 0.68} Q ${nibX - 42} ${nibY - 38} ${nibX} ${nibY} T ${stageX + stageW - 64} ${stageY + stageH * 0.36}`}
          fill="none" stroke={paperInk} strokeWidth={Math.max(1.4, nibHalo.ringStrokeWidthPx * 1.15)} strokeLinecap="round"
          opacity={Math.max(0.25, ephemeralPill.brushOpacityPercent / 100)}
        />
      </g>

      {viewport.id === "full-bleed-96" ? (
        <g
          data-testid="tactile-svg-edge-pill"
          opacity={edgeReveal.pillOpacity}
          style={{ transitionProperty: "opacity", transitionDuration: `${edgeReveal.fadeDurationMs}ms`, transitionTimingFunction: edgeReveal.easing }}
        >
          <rect x={Math.round(LIVE_CANVAS_SVG_WIDTH / 2 - 122)} y="8" width="244" height="26" rx="13" fill={chromeTranslucent} stroke={borderInk} strokeWidth="1" />
          <text x={LIVE_CANVAS_SVG_WIDTH / 2} y="24" textAnchor="middle" fill={paperInk} fontSize="8.5" fontFamily="monospace" fontWeight="700">
            {isEn
              ? `EDGE ${edgeReveal.edgeDistancePx}px <= ${EDGE_REVEAL_THRESHOLD_PX}px · FADE ${edgeReveal.fadeDurationMs}ms`
              : `가장자리 ${edgeReveal.edgeDistancePx}px 근접 · ${edgeReveal.fadeDurationMs}ms 플로팅 필`}
          </text>
        </g>
      ) : null}

      <g data-testid="tactile-svg-nib-halo" transform={`translate(${nibX} ${nibY})`}>
        <ellipse cx="0" cy="0" rx={nibHalo.radiusXPx} ry={nibHalo.radiusYPx} transform={`rotate(${-nibHalo.tiltAzimuthDeg})`} fill={nibHalo.fillColorOklch} stroke={nibHalo.ringColorOklch} strokeWidth={nibHalo.ringStrokeWidthPx} />
        <line x1={-nibHalo.radiusXPx - 5} y1="0" x2={-nibHalo.radiusXPx - 1} y2="0" stroke={paperInk} strokeWidth="1" />
        <line x1={nibHalo.radiusXPx + 1} y1="0" x2={nibHalo.radiusXPx + 5} y2="0" stroke={paperInk} strokeWidth="1" />
        <line x1="0" y1={-nibHalo.radiusYPx - 5} x2="0" y2={-nibHalo.radiusYPx - 1} stroke={paperInk} strokeWidth="1" />
        <line x1="0" y1={nibHalo.radiusYPx + 1} x2="0" y2={nibHalo.radiusYPx + 5} stroke={paperInk} strokeWidth="1" />
        <text x="0" y={nibHalo.radiusYPx + 15} textAnchor="middle" fill={mutedInk} fontSize="7.6" fontFamily="monospace" fontWeight="600">
          {`P ${Math.round(nibHalo.pressure * 100)}% · TILT ${nibHalo.tiltDeg}deg · R ${nibHalo.radiusXPx}x${nibHalo.radiusYPx}`}
        </text>
      </g>

      {ephemeralPill.visible ? (
        <g data-testid="tactile-svg-ephemeral-pill" opacity={ephemeralPill.opacity} style={{ transitionProperty: "opacity", transitionDuration: `${ephemeralPill.transitionMs}ms` }}>
          <rect x={stageX + 18} y={stageY + 14} width="196" height="24" rx="12" fill={hudPillBg} />
          <text x={stageX + 116} y={stageY + 29} textAnchor="middle" fill={hudPillFg} fontSize="8.2" fontFamily="monospace" fontWeight="700">
            {isEn ? `${ephemeralPill.labelEn} · ${ephemeralPill.remainingMs}ms` : `${ephemeralPill.labelKo} · ${ephemeralPill.remainingMs}ms`}
          </text>
        </g>
      ) : null}

      {inkRippleAndSave.active ? (
        <g data-testid="tactile-svg-ink-ripple" transform={`translate(${nibX} ${nibY})`}>
          <circle cx="0" cy="0" r={inkRippleAndSave.rippleRadiusPx} fill="none" stroke={inkRippleAndSave.rippleColorOklch} strokeWidth="2.2" opacity={inkRippleAndSave.rippleOpacity} />
          <circle cx="0" cy="0" r={Math.max(4, inkRippleAndSave.rippleRadiusPx * 0.62)} fill="none" stroke={inkRippleAndSave.rippleColorOklch} strokeWidth="1.1" opacity={inkRippleAndSave.rippleOpacity * 0.7} />
        </g>
      ) : null}

      <g data-testid="tactile-svg-opfs-dot" transform={`translate(${opfsX} ${opfsY})`}>
        {inkRippleAndSave.opfsDot.shapeCue === "diamond-amber" ? (
          <polygon points="0,-6 6,0 0,6 -6,0" fill={inkRippleAndSave.opfsDot.dotColorOklch} stroke={canvasBg} strokeWidth="1.2" />
        ) : (
          <>
            {inkRippleAndSave.opfsDot.shapeCue === "ring-pulse" ? (
              <circle cx="0" cy="0" r="8.5" fill="none" stroke={inkRippleAndSave.opfsDot.ringColorOklch} strokeWidth="1.6" />
            ) : null}
            <circle cx="0" cy="0" r="4.8" fill={inkRippleAndSave.opfsDot.dotColorOklch} stroke={canvasBg} strokeWidth="1.2" />
          </>
        )}
        <text x="-11" y="3" textAnchor="end" fill={mutedInk} fontSize="7.6" fontFamily="monospace" fontWeight="700">
          {isEn ? inkRippleAndSave.opfsDot.labelEn : inkRippleAndSave.opfsDot.labelKo}
        </text>
      </g>

      {eyedropperLoupe.active ? (
        <g data-testid="tactile-svg-loupe" transform={`translate(${loupeX} ${loupeY})`}>
          <circle cx="0" cy="0" r="24" fill={eyedropperLoupe.safeSwatchOklch} stroke={eyedropperLoupe.outerRingOklch} strokeWidth="3.2" />
          <circle cx="0" cy="0" r="20.5" fill="none" stroke={eyedropperLoupe.innerRingOklch} strokeWidth="1.5" />
          <rect x="-3" y="-3" width="6" height="6" fill="none" stroke={eyedropperLoupe.innerRingOklch} strokeWidth="1.2" />
          <rect x="-56" y="29" width="112" height="28" rx="6" fill={hudPillBg} />
          <text x="0" y="40" textAnchor="middle" fill={hudPillFg} fontSize="7.3" fontFamily="monospace" fontWeight="700">
            {`L ${eyedropperLoupe.rawL} · C ${eyedropperLoupe.rawC} · H ${eyedropperLoupe.rawHueDeg}deg`}
          </text>
          <text x="0" y="51" textAnchor="middle" fill={eyedropperLoupe.violetSlopDetected ? warnBadgeColor : eyedropperLoupe.cvdWarningLevel === "high-risk" ? dangerBadgeColor : hudPillFg} fontSize="7.1" fontFamily="monospace" fontWeight="700">
            {eyedropperLoupe.violetSlopDetected
              ? `SAFE H ${eyedropperLoupe.safeHueDeg}deg · ${eyedropperLoupe.contrastVsCanvas}:1`
              : `${eyedropperLoupe.contrastGrade} ${eyedropperLoupe.contrastVsCanvas}:1 · CVD ${eyedropperLoupe.cvdWarningLevel.toUpperCase()}`}
          </text>
        </g>
      ) : null}

      <rect x="0" y={LIVE_CANVAS_SVG_HEIGHT - 26} width={LIVE_CANVAS_SVG_WIDTH} height="26" fill={chromeBg} />
      <line x1="0" y1={LIVE_CANVAS_SVG_HEIGHT - 26} x2={LIVE_CANVAS_SVG_WIDTH} y2={LIVE_CANVAS_SVG_HEIGHT - 26} stroke={borderInk} strokeWidth="1" />
      <text x="12" y={LIVE_CANVAS_SVG_HEIGHT - 10} fill={paperInk} fontSize="8" fontFamily="monospace" fontWeight="700">
        {`CANVAS ${viewport.canvasOccupancyPercent}% · GRAIN ${surfaceTactile.grainPercentLabel} · DETENT ${surfaceTactile.pressDetentDepthPx}px · MOTION ${surfaceTactile.detentTransitionMs}ms`}
      </text>
      <text x={LIVE_CANVAS_SVG_WIDTH - 12} y={LIVE_CANVAS_SVG_HEIGHT - 10} textAnchor="end" fill={mutedInk} fontSize="7.8" fontFamily="monospace">
        {`CONTRAST ${surfaceTactile.canvasInkContrast}:1 · VIOLET-FREE`}
      </text>
    </svg>
  );
}

/** 96% 풀블리드 몰입 미니멀 모드 & 5종 비침습 촉각 시각 피드백 라이브 스튜디오 패널. */
export function StudioImmersiveFeedbackHudPanel(props: StudioImmersiveFeedbackHudPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const grainPatternId = useId();
  const pressureId = useId();
  const tiltId = useId();
  const brushSizeId = useId();
  const brushOpacityId = useId();

  const [mode, setMode] = useState<ImmersiveViewportModeId>(props.initialMode ?? "full-bleed-96");
  const [surfaceId, setSurfaceId] = useState<AtelierSurfaceId>("warm-alabaster");
  const [edgeDistancePx, setEdgeDistancePx] = useState<number>(48);
  const [edgePointerActive, setEdgePointerActive] = useState<boolean>(false);
  const [pressure, setPressure] = useState<number>(0.64);
  const [tiltDeg, setTiltDeg] = useState<number>(56);
  const [brushSizePx, setBrushSizePx] = useState<number>(28);
  const [brushOpacityPercent, setBrushOpacityPercent] = useState<number>(88);
  const [ephemeralElapsedMs, setEphemeralElapsedMs] = useState<number | null>(null);
  const [lastActionKind, setLastActionKind] = useState<TactileRippleActionKind>("idle");
  const [actionElapsedMs, setActionElapsedMs] = useState<number>(0);
  const [opfsSaveStatus, setOpfsSaveStatus] = useState<OpfsSaveStatus>("steady-forest");
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(true);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(EYEDROPPER_SAMPLE_PRESETS[1].id);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [jsonOpen, setJsonOpen] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const ephemeralTimerRef = useRef<number | null>(null);
  const rippleTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (ephemeralTimerRef.current !== null) window.clearTimeout(ephemeralTimerRef.current);
    if (rippleTimerRef.current !== null) window.clearTimeout(rippleTimerRef.current);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  const selectedPreset = useMemo(
    () => EYEDROPPER_SAMPLE_PRESETS.find((item) => item.id === selectedPresetId) ?? EYEDROPPER_SAMPLE_PRESETS[1],
    [selectedPresetId],
  );

  const feedbackState = useMemo(
    () =>
      evaluateTactileFeedbackState({
        mode, surfaceId, edgeDistancePx, edgePointerActive, pressure, tiltDeg, velocityPxPerSec: 340,
        brushSizePx, brushOpacityPercent, ephemeralTriggerElapsedMs: ephemeralElapsedMs, lastActionKind,
        actionElapsedMs, opfsSaveStatus, eyedropperActive, sampledPixel: selectedPreset.color, reducedMotion,
      }),
    [
      mode, surfaceId, edgeDistancePx, edgePointerActive, pressure, tiltDeg, brushSizePx, brushOpacityPercent,
      ephemeralElapsedMs, lastActionKind, actionElapsedMs, opfsSaveStatus, eyedropperActive, selectedPreset, reducedMotion,
    ],
  );

  const specJsonText = useMemo(() => exportTactileFeedbackSpecJson(feedbackState), [feedbackState]);

  function applyModeChange(nextMode: ImmersiveViewportModeId): void {
    setMode(nextMode);
    const nextState = evaluateTactileFeedbackState({
      mode: nextMode, surfaceId, edgeDistancePx, edgePointerActive, pressure, tiltDeg, velocityPxPerSec: 340,
      brushSizePx, brushOpacityPercent, ephemeralTriggerElapsedMs: ephemeralElapsedMs, lastActionKind,
      actionElapsedMs, opfsSaveStatus, eyedropperActive, sampledPixel: selectedPreset.color, reducedMotion,
    });
    props.onModeChange?.(nextMode, nextState);
  }

  function scheduleEphemeralPill(): void {
    if (ephemeralTimerRef.current !== null) window.clearTimeout(ephemeralTimerRef.current);
    setEphemeralElapsedMs(0);
    ephemeralTimerRef.current = window.setTimeout(() => {
      setEphemeralElapsedMs(EPHEMERAL_PILL_TTL_MS);
      ephemeralTimerRef.current = null;
    }, EPHEMERAL_PILL_TTL_MS);
  }

  function triggerRipple(kind: Exclude<TactileRippleActionKind, "idle">): void {
    if (rippleTimerRef.current !== null) window.clearTimeout(rippleTimerRef.current);
    setLastActionKind(kind);
    setActionElapsedMs(45);
    rippleTimerRef.current = window.setTimeout(() => {
      setActionElapsedMs(INK_RIPPLE_DURATION_MS + 10);
      rippleTimerRef.current = null;
    }, reducedMotion ? 16 : INK_RIPPLE_DURATION_MS);
  }

  function handleOpfsSaveTrigger(): void {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    triggerRipple("opfs-save");
    setOpfsSaveStatus("saving-pulse");
    saveTimerRef.current = window.setTimeout(() => {
      setOpfsSaveStatus("steady-forest");
      saveTimerRef.current = null;
    }, reducedMotion ? 16 : 280);
  }

  function handleStagePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nearestEdge = Math.round(Math.min(
      Math.max(0, event.clientY - rect.top), Math.max(0, event.clientX - rect.left), Math.max(0, rect.right - event.clientX),
    ));
    setEdgePointerActive(true);
    setEdgeDistancePx(nearestEdge);
  }

  async function handleCopyJson(): Promise<void> {
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(specJsonText);
      setCopyStatus("copied");
      props.onExportJson?.(specJsonText, feedbackState);
    } catch {
      setCopyStatus("error");
    }
  }

  function handleReset(): void {
    if (ephemeralTimerRef.current !== null) window.clearTimeout(ephemeralTimerRef.current);
    if (rippleTimerRef.current !== null) window.clearTimeout(rippleTimerRef.current);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    ephemeralTimerRef.current = null;
    rippleTimerRef.current = null;
    saveTimerRef.current = null;
    setMode(props.initialMode ?? "full-bleed-96");
    setSurfaceId("warm-alabaster");
    setEdgeDistancePx(48);
    setEdgePointerActive(false);
    setPressure(0.64);
    setTiltDeg(56);
    setBrushSizePx(28);
    setBrushOpacityPercent(88);
    setEphemeralElapsedMs(null);
    setLastActionKind("idle");
    setActionElapsedMs(0);
    setOpfsSaveStatus("steady-forest");
    setEyedropperActive(true);
    setSelectedPresetId(EYEDROPPER_SAMPLE_PRESETS[1].id);
    setReducedMotion(false);
    setCopyStatus("idle");
  }

  const isFullBleed = mode === "full-bleed-96";
  const edgeSimulatedActive = edgePointerActive && edgeDistancePx <= EDGE_REVEAL_THRESHOLD_PX;
  const sliderSpecs = [
    { id: pressureId, testId: "tactile-slider-pressure", label: pick("필압", "Pressure"), readout: `${Math.round(pressure * 100)}%`, min: 0, max: 100, value: Math.round(pressure * 100), onChange: (v: number) => setPressure(v / 100) },
    { id: tiltId, testId: "tactile-slider-tilt", label: pick("펜 기울기 (15°~90°)", "Pen Tilt (15°–90°)"), readout: `${tiltDeg}°`, min: 15, max: 90, value: tiltDeg, onChange: (v: number) => setTiltDeg(v) },
    { id: brushSizeId, testId: "tactile-slider-brush-size", label: pick("브러시 크기", "Brush Size"), readout: `${brushSizePx}px`, min: 4, max: 160, value: brushSizePx, onChange: (v: number) => { setBrushSizePx(v); scheduleEphemeralPill(); } },
    { id: brushOpacityId, testId: "tactile-slider-brush-opacity", label: pick("브러시 불투명도", "Brush Opacity"), readout: `${brushOpacityPercent}%`, min: 10, max: 100, value: brushOpacityPercent, onChange: (v: number) => { setBrushOpacityPercent(v); scheduleEphemeralPill(); } },
  ];
  const metricCards = [
    { testId: "tactile-metric-nib", title: pick("1. 펜촉 헤일로", "1. Nib Halo"), value: `${feedbackState.nibHalo.radiusXPx}×${feedbackState.nibHalo.radiusYPx}px`, sub: pick("시야 방해 0%", "0% Occlusion"), tone: "text-fg", span: "" },
    { testId: "tactile-metric-pill", title: pick("2. 자동 소멸 필", "2. Ephemeral Pill"), value: feedbackState.ephemeralPill.visible ? `${feedbackState.ephemeralPill.remainingMs}ms` : pick("대기(900ms)", "Idle (900ms)"), sub: feedbackState.ephemeralPill.phase, tone: "text-fg", span: "" },
    { testId: "tactile-metric-opfs", title: pick("3. 잉크 파동·OPFS", "3. Ripple & OPFS"), value: `${feedbackState.inkRippleAndSave.durationMs}ms`, sub: isEn ? feedbackState.inkRippleAndSave.opfsDot.labelEn : feedbackState.inkRippleAndSave.opfsDot.labelKo, tone: "text-good", span: "" },
    { testId: "tactile-metric-loupe", title: pick("4. OKLCH 루페", "4. OKLCH Loupe"), value: `${feedbackState.eyedropperLoupe.contrastVsCanvas}:1 (${feedbackState.eyedropperLoupe.contrastGrade})`, sub: `H ${feedbackState.eyedropperLoupe.rawHueDeg}° → ${feedbackState.eyedropperLoupe.safeHueDeg}°`, tone: "text-fg", span: "" },
    { testId: "tactile-metric-surface", title: pick("5. 종이결·음각", "5. Grain & Detent"), value: `${feedbackState.surfaceTactile.grainPercentLabel} · ${feedbackState.surfaceTactile.pressDetentDepthPx}px`, sub: `Y ${feedbackState.surfaceTactile.activeTranslateYPx}px`, tone: "text-fg", span: "col-span-2 sm:col-span-1" },
  ];

  return (
    <section
      data-testid="atelier-tactile-hud-panel"
      aria-label={pick("96% 풀블리드 몰입 모드 및 촉각 시각 피드백 HUD", "96% Full-Bleed Immersive Mode & Tactile Visual Feedback HUD")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${props.className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent tabular-nums">
              <Maximize2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {`${feedbackState.viewport.canvasOccupancyPercent}% CANVAS`}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pick("미리보기·토큰 규격 전용", "Preview & Token Spec Only")}</span>
          </div>
          <h2 className="text-base font-bold text-fg [word-break:keep-all]">
            {pick("아틀리에 몰입 모드 & 5종 촉각 피드백 HUD", "Atelier Immersive Mode & 5 Tactile Visual Feedback HUD")}
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {isEn ? feedbackState.viewport.summaryEn : feedbackState.viewport.summaryKo}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button" data-testid="tactile-full-bleed-toggle-btn" aria-pressed={isFullBleed}
            onClick={() => applyModeChange(transitionImmersiveViewportMode(mode, { type: "toggle-full-bleed" }))}
            className={isFullBleed ? BTN_SOLID : BTN_OUTLINE}
          >
            {isFullBleed ? <Minimize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {isFullBleed ? pick("96% 풀블리드 활성", "96% Full-Bleed On") : pick("96% 풀블리드 켜기", "Enter 96% Full-Bleed")}
          </button>
          <button type="button" data-testid="tactile-copy-json-btn" onClick={() => void handleCopyJson()} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("JSON 규격 복사", "Copy Spec JSON")}
          </button>
          <button type="button" data-testid="tactile-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("초기화", "Reset")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={pick("3단계 몰입 뷰포트 선택", "Select 3-stage immersive viewport mode")}>
          {IMMERSIVE_VIEWPORT_MODES.map((spec) => (
            <button key={spec.id} type="button" data-testid={`tactile-mode-${spec.id}`} aria-pressed={mode === spec.id} onClick={() => applyModeChange(spec.id)} className={mode === spec.id ? BTN_ACTIVE : BTN_OUTLINE}>
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{isEn ? spec.labelEn : spec.labelKo}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isFullBleed ? (
            <button
              type="button" data-testid="tactile-edge-proximity-btn" aria-pressed={edgeSimulatedActive}
              onClick={() => { setEdgePointerActive(!edgeSimulatedActive); setEdgeDistancePx(edgeSimulatedActive ? 48 : 16); }}
              className={edgeSimulatedActive ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {edgeSimulatedActive ? pick("가장자리 16px 부상 중", "Edge 16px Revealed") : pick("가장자리 28px 근접 시연", "Simulate 28px Edge Hover")}
            </button>
          ) : null}
          <div className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1">
            <span className="text-xs font-medium text-fg-2 [word-break:keep-all]">{pick("모션 감소(즉시 스냅)", "Reduced Motion")}</span>
            <Switch data-testid="tactile-reduced-motion-switch" checked={reducedMotion} onCheckedChange={setReducedMotion} aria-label={pick("모션 감소 즉시 스냅 전환", "Toggle reduced motion instant snap")} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-line/60 pt-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("실시간 캔버스 HUD 목업 (가장자리 호버 감지)", "Live Canvas HUD Mockup (Edge Hover Active)")}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {`EDGE ${feedbackState.edgeReveal.edgeDistancePx}px · ${feedbackState.edgeReveal.fadeDurationMs}ms`}
            </span>
          </div>

          <div data-testid="tactile-stage-hover-zone" onPointerMove={handleStagePointerMove} onPointerLeave={() => { setEdgePointerActive(false); setEdgeDistancePx(48); }}>
            <StudioLiveTactileCanvasSvg state={feedbackState} isEn={isEn} grainPatternId={grainPatternId} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {metricCards.map((card) => (
              <div key={card.testId} className={`rounded-lg bg-raised p-2.5 ${card.span}`}>
                <div className="text-[11px] text-fg-3">{card.title}</div>
                <div data-testid={card.testId} className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${card.tone}`}>{card.value}</div>
                <div className="truncate font-mono text-[10px] text-fg-3 tabular-nums">{card.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("아틀리에 표면 4종 (종이결 1.5~2.8% · 1px 음각)", "4 Atelier Surfaces (1.5–2.8% Grain · 1px Detent)")}
            </h3>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={pick("아틀리에 표면 선택", "Select atelier surface")}>
              {ATELIER_SURFACE_THEMES.map((theme) => (
                <button key={theme.id} type="button" data-testid={`tactile-surface-${theme.id}`} aria-pressed={surfaceId === theme.id} onClick={() => setSurfaceId(theme.id)} className={surfaceId === theme.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span>{isEn ? theme.labelEn : theme.labelKo}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-line/60 pt-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("펜촉·브러시 실시간 입력 (변경 시 900ms HUD 필 표시)", "Live Pen & Brush Input (900ms Ephemeral Pill)")}
            </h3>
            {sliderSpecs.map((item) => (
              <div key={item.testId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={item.id} className="text-fg-2">{item.label}</label>
                  <span className="font-mono text-fg tabular-nums">{item.readout}</span>
                </div>
                <input id={item.id} data-testid={item.testId} type="range" min={item.min} max={item.max} value={item.value} onChange={(e) => item.onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-line/60 pt-3">
            <h3 className="text-xs font-semibold text-fg">{pick("150ms 잉크 파동 · OPFS 상태 점 · 스포이드 루페", "150ms Ink Ripple · OPFS Status Dot · Eyedropper Loupe")}</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="tactile-action-undo" onClick={() => triggerRipple("undo")} className={BTN_OUTLINE}>
                <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("실행취소 파동", "Undo Ripple")}
              </button>
              <button type="button" data-testid="tactile-action-opfs-save" onClick={handleOpfsSaveTrigger} className={BTN_OUTLINE}>
                <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("OPFS 저장 펄스", "OPFS Save Pulse")}
              </button>
              <button type="button" data-testid="tactile-action-snap" onClick={() => triggerRipple("snap")} className={BTN_OUTLINE}>
                <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("스냅 확인", "Snap Pulse")}
              </button>
              <button type="button" data-testid="tactile-action-offline" aria-pressed={opfsSaveStatus === "offline-amber"} onClick={() => setOpfsSaveStatus((prev) => (prev === "offline-amber" ? "steady-forest" : "offline-amber"))} className={opfsSaveStatus === "offline-amber" ? BTN_ACTIVE : BTN_OUTLINE}>
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("오프라인 앰버", "Offline Amber")}
              </button>
              <button type="button" data-testid="tactile-action-loupe" aria-pressed={eyedropperActive} onClick={() => setEyedropperActive((prev) => !prev)} className={eyedropperActive ? BTN_ACTIVE : BTN_OUTLINE}>
                <Pipette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{eyedropperActive ? pick("스포이드 루페 켜짐", "Loupe Active") : pick("스포이드 루페 켜기", "Enable Loupe")}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label={pick("스포이드 표본 픽셀", "Eyedropper sample pixel")}>
              {EYEDROPPER_SAMPLE_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`tactile-swatch-${preset.id}`} aria-pressed={selectedPresetId === preset.id} onClick={() => { setSelectedPresetId(preset.id); setEyedropperActive(true); }} className={selectedPresetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>

            <div
              data-testid="tactile-loupe-guidance"
              className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                feedbackState.eyedropperLoupe.violetSlopDetected || feedbackState.eyedropperLoupe.cvdWarningLevel !== "safe"
                  ? "bg-warning-soft text-warn"
                  : "bg-good-soft text-good"
              }`}
            >
              <div className="font-semibold">
                {isEn ? feedbackState.eyedropperLoupe.violetAvoidanceHintEn : feedbackState.eyedropperLoupe.violetAvoidanceHintKo}
              </div>
              <div>{isEn ? feedbackState.eyedropperLoupe.cvdWarningEn : feedbackState.eyedropperLoupe.cvdWarningKo}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-line/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
            <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            {pick("촉각 피드백 CSS·JSON 토큰 규격", "Tactile Feedback CSS & JSON Token Spec")}
          </span>
          <button type="button" data-testid="tactile-toggle-json-btn" aria-expanded={jsonOpen} onClick={() => setJsonOpen((prev) => !prev)} className={jsonOpen ? BTN_ACTIVE : BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {jsonOpen ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
          </button>
        </div>
        {copyStatus === "copied" ? (
          <p role="status" data-testid="tactile-copy-status" className="text-xs text-good">
            {pick("촉각 피드백 토큰 JSON 규격을 클립보드에 복사했습니다.", "Copied tactile feedback token JSON spec to clipboard.")}
          </p>
        ) : null}
        {copyStatus === "error" ? (
          <p role="alert" data-testid="tactile-copy-error" className="text-xs text-warn">
            {pick("클립보드 접근에 실패했습니다. 아래 JSON 미리보기에서 직접 복사하세요.", "Clipboard write failed. Copy directly from the JSON preview below.")}
          </p>
        ) : null}
        {jsonOpen ? (
          <pre data-testid="tactile-json-preview" className="max-h-64 overflow-auto rounded-lg bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {specJsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}

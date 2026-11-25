/**
 * Wave 46C — 애플 비전 프로·AR 스마트 글래스·스마트 워치·멀티 스크린 공간 창작 생태계 패널.
 *
 * - 6대 디바이스 노드 토글 & 4종 조합 프리셋(맥+아이패드+워치+폰 / 비전 프로 단독 / 갤럭시 탭+스마트 글래스 / 하이브리드 XR)
 * - 공개 웹 API 지원 매트릭스, 역할 충돌 감지, 지연 예산·대역폭 배분 시뮬레이션(`시뮬레이션 · 추정` 명시)
 * - 공간 6DoF 캔버스·좌측 레퍼런스 보드·우측 3D 포즈 스테이지 SVG 평면도 프리뷰 및 시선 하향각(0°~-15°) 인체공학 진단
 * - 스마트 워치 크라운·링 다이얼 시뮬레이터 + 비의료 단순 작업 시간 휴식 리마인더 + AR 스마트 글래스 최소 간섭 HUD + 세션 JSON 복사
 * - Calm Atelier 시맨틱 토큰 전용(원시 색·광범위 트랜지션·기본 빈 객체 props·Web Storage·내부 Map 스토어·장식 아이콘 0건)
 */

import {
  AlertTriangle, CheckCircle2, Clock, Compass, Copy, Eye, Glasses, Info,
  Laptop, Layers, Minus, Monitor, Plus, Radio, RotateCcw, Smartphone, Tablet, Watch,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  AR_HUD_PRESETS, DEFAULT_LINK_BANDWIDTH_MBPS, DEFAULT_SPATIAL_RIG_INPUT, SPATIAL_DEVICE_IDS,
  DEFAULT_WEARABLE_CONTROL_STATE, MULTI_DEVICE_PRESETS, SPATIAL_DEVICE_CATALOG,
  WEARABLE_DIAL_MODES, buildArGlassesHudProfile, computeMultiDeviceTopology,
  computeSpatialCanvasRig, evaluateSessionBreakReminder, exportSpatialWearableSessionJson,
  getArHudPreset, getMultiDevicePreset, getSpatialDeviceSpec, resolveWearableDialAction,
  type ArGlassesHudOptions, type ArHudPresetId, type BrowserCapabilitySupport,
  type MultiDevicePresetId, type MultiDeviceTopologyResult, type PerspectiveGridType,
  type SpatialCanvasRigResult, type SpatialDeviceId, type SpatialWearableSessionSnapshot,
  type SyncTransportMode, type TopologyConflictSeverity, type WearableDialActionResult,
  type WearableDialMode, type WearableGestureKind, type WearableStudioControlState,
} from "./spatial-wearable-engine";
import { validateSpatialDeviceIds } from "./spatial-input-contract";
import { useExampleCopy, useExampleNotification } from "./use-example-delivery";

export interface StudioSpatialWearablePanelProps {
  readonly initialPresetId?: MultiDevicePresetId;
  readonly initialActiveDeviceIds?: readonly SpatialDeviceId[];
  readonly initialTransportMode?: SyncTransportMode;
  readonly initialLinkBandwidthMbps?: number;
  readonly initialElapsedWorkMinutes?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onTopologyChange?: (topology: MultiDeviceTopologyResult) => void | Promise<void>;
  readonly onRigChange?: (rig: SpatialCanvasRigResult) => void | Promise<void>;
  readonly onExportJson?: (json: string, snapshot: SpatialWearableSessionSnapshot) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const TRANSPORT_OPTIONS: readonly { readonly id: SyncTransportMode; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "lan-webrtc", labelKo: "LAN WebRTC", labelEn: "LAN WebRTC" },
  { id: "usb-tether-hybrid", labelKo: "USB 하이브리드", labelEn: "USB Hybrid" },
  { id: "cloud-relay", labelKo: "클라우드 릴레이", labelEn: "Cloud Relay" },
];

const DIAL_MODE_LABELS: Readonly<Record<WearableDialMode, { readonly ko: string; readonly en: string }>> = {
  "brush-size": { ko: "브러시 크기", en: "Brush Size" },
  "canvas-zoom": { ko: "확대 · 축소", en: "Canvas Zoom" },
  "timeline-scrub": { ko: "타임라인 스크럽", en: "Timeline Scrub" },
  "undo-redo": { ko: "실행취소 · 복원", en: "Undo / Redo" },
};

const PERSPECTIVE_GRID_OPTIONS: readonly { readonly id: PerspectiveGridType; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "none", labelKo: "그리드 끔", labelEn: "Off" },
  { id: "1-point", labelKo: "1점 투시", labelEn: "1-Point" },
  { id: "2-point", labelKo: "2점 투시", labelEn: "2-Point" },
  { id: "3-point", labelKo: "3점 투시", labelEn: "3-Point" },
];

function scoreTone(score: number): string {
  return score >= 85 ? "text-good" : score >= 60 ? "text-warn" : "text-bad";
}

function conflictTone(severity: TopologyConflictSeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";
}

function capChipTone(level: BrowserCapabilitySupport): string {
  if (level === "supported") return "border-good bg-good-soft text-good";
  return level === "partial" ? "border-warn bg-warning-soft text-warn" : "border-line bg-canvas text-fg-3";
}

function capShortLabel(level: BrowserCapabilitySupport, isEn: boolean): string {
  if (level === "supported") return isEn ? "OK" : "지원";
  return level === "partial" ? (isEn ? "Part" : "부분") : (isEn ? "No" : "미지원");
}

function DeviceNodeIcon(props: { readonly id: SpatialDeviceId }): ReactElement {
  const cls = "h-4 w-4 shrink-0";
  switch (props.id) {
    case "vision-pro-webxr": return <Eye className={cls} aria-hidden="true" />;
    case "ar-smart-glasses": return <Glasses className={cls} aria-hidden="true" />;
    case "smart-watch-crown": return <Watch className={cls} aria-hidden="true" />;
    case "mac-studio-primary": return <Laptop className={cls} aria-hidden="true" />;
    case "tablet-pen-deck": return <Tablet className={cls} aria-hidden="true" />;
    case "phone-reader-mirror": return <Smartphone className={cls} aria-hidden="true" />;
  }
}

function KpiCard(props: {
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

/** 공간 6DoF 배치 평면도(Top-Down XZ) 시맨틱 SVG 프리뷰 — 원시 색 코드 미사용. */
function SpatialTopDownFloorPlanSvg(props: {
  readonly rig: SpatialCanvasRigResult; readonly isEn: boolean;
}): ReactElement {
  const { rig, isEn } = props;
  const cx = 180;
  const userY = 205;
  const scale = 68;
  const toSvg = (xM: number, zM: number): { readonly sx: number; readonly sy: number } => ({
    sx: Math.round((cx + xM * scale) * 10) / 10,
    sy: Math.round((userY + zM * scale) * 10) / 10,
  });

  const mainCenter = toSvg(rig.mainCutPanel.positionM.x, rig.mainCutPanel.positionM.z);
  const halfW = (rig.mainCutPanel.widthM * scale) / 2;
  const bendPx = Math.min(26, Math.round(rig.mainCutPanel.sagittaM * scale * 2.2));
  const mainPath = `M ${Math.round((mainCenter.sx - halfW) * 10) / 10} ${Math.round((mainCenter.sy + bendPx) * 10) / 10} Q ${mainCenter.sx} ${Math.round((mainCenter.sy - bendPx) * 10) / 10} ${Math.round((mainCenter.sx + halfW) * 10) / 10} ${Math.round((mainCenter.sy + bendPx) * 10) / 10}`;

  const leftPos = toSvg(rig.leftReferenceBoard.positionM.x, rig.leftReferenceBoard.positionM.z);
  const rightPos = toSvg(rig.rightPoseStage.positionM.x, rig.rightPoseStage.positionM.z);
  const fovHalfRad = ((rig.input.horizontalFovDeg / 2) * Math.PI) / 180;
  const coneLen = 175;
  const coneLeftX = Math.round((cx - Math.sin(fovHalfRad) * coneLen) * 10) / 10;
  const coneRightX = Math.round((cx + Math.sin(fovHalfRad) * coneLen) * 10) / 10;
  const coneEndY = Math.round((userY - Math.cos(fovHalfRad) * coneLen) * 10) / 10;
  const ergoTone = rig.ergonomics.neckFlexionStatus === "comfortable" ? "text-good" : rig.ergonomics.neckFlexionStatus === "caution" ? "text-warn" : "text-bad";

  return (
    <svg
      data-testid="spatial-rig-topdown-svg"
      data-gaze-pitch-deg={rig.ergonomics.gazeDownwardAngleDeg}
      data-neck-status={rig.ergonomics.neckFlexionStatus}
      data-curvature-deg={rig.mainCutPanel.curvatureDeg}
      viewBox="0 0 360 232"
      className="mx-auto w-full max-w-[380px] text-fg"
      role="img"
      aria-label={isEn ? "6DoF spatial canvas top-down layout preview" : "공간 6DoF 캔버스 배치 평면도 프리뷰"}
    >
      <rect x="4" y="4" width="352" height="224" rx="12" className="text-canvas" fill="currentColor" />
      <rect x="4" y="4" width="352" height="224" rx="12" className="text-line" fill="none" stroke="currentColor" strokeWidth="1" />

      <circle cx={cx} cy={userY} r={scale} className="text-line" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" />
      <circle cx={cx} cy={userY} r={scale * 2} className="text-line" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" />
      <text x={cx + scale + 4} y={userY - 4} className="text-fg-3" fill="currentColor" fontSize="8">1m</text>
      <text x={cx + scale * 2 - 18} y={userY - 4} className="text-fg-3" fill="currentColor" fontSize="8">2m</text>

      <path d={`M ${cx} ${userY} L ${coneLeftX} ${coneEndY} L ${coneRightX} ${coneEndY} Z`} className="text-accent" fill="currentColor" fillOpacity={0.09} />
      <line x1={cx} y1={userY} x2={coneLeftX} y2={coneEndY} className="text-accent" stroke="currentColor" strokeOpacity={0.4} strokeWidth="0.9" strokeDasharray="4 3" />
      <line x1={cx} y1={userY} x2={coneRightX} y2={coneEndY} className="text-accent" stroke="currentColor" strokeOpacity={0.4} strokeWidth="0.9" strokeDasharray="4 3" />

      <g data-testid="spatial-svg-main-panel">
        <path d={mainPath} className="text-accent" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <text x={mainCenter.sx} y={Math.max(22, mainCenter.sy - bendPx - 8)} textAnchor="middle" className="text-fg" fill="currentColor" fontSize="9" fontWeight="700">
          {isEn ? `Main Cut (${rig.mainCutPanel.widthM}m)` : `메인 컷 패널 (${rig.mainCutPanel.widthM}m)`}
        </text>
      </g>

      <g data-testid="spatial-svg-left-ref" transform={`translate(${leftPos.sx} ${leftPos.sy}) rotate(${Math.round(rig.leftReferenceBoard.yawFromCenterDeg * 0.75)})`}>
        <rect x="-28" y="-5" width="56" height="10" rx="4" className="text-cool" fill="currentColor" fillOpacity={0.28} />
        <rect x="-28" y="-5" width="56" height="10" rx="4" className="text-cool" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </g>
      <text x={Math.max(46, leftPos.sx)} y={Math.min(182, leftPos.sy + 18)} textAnchor="middle" className="text-cool" fill="currentColor" fontSize="8.5" fontWeight="600">
        {isEn ? "Left Ref" : "좌측 레퍼런스"}
      </text>

      <g data-testid="spatial-svg-right-pose" transform={`translate(${rightPos.sx} ${rightPos.sy})`}>
        <circle cx="0" cy="0" r="14" className="text-good" fill="currentColor" fillOpacity={0.2} />
        <circle cx="0" cy="0" r="14" className="text-good" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
        <circle cx="0" cy="0" r="3.5" className="text-good" fill="currentColor" />
      </g>
      <text x={Math.min(314, rightPos.sx)} y={Math.min(182, rightPos.sy + 24)} textAnchor="middle" className="text-good" fill="currentColor" fontSize="8.5" fontWeight="600">
        {isEn ? "3D Pose Stage" : "3D 포즈 스테이지"}
      </text>

      <circle cx={cx} cy={userY} r="7" className="text-fg" fill="currentColor" />
      <text x={cx} y={userY + 18} textAnchor="middle" className="text-fg-2" fill="currentColor" fontSize="8.5" fontWeight="600">
        {isEn ? `Creator (Eye ${rig.input.eyeHeightM}m)` : `작가 눈높이 ${rig.input.eyeHeightM}m`}
      </text>

      <text x="14" y="20" className={ergoTone} fill="currentColor" fontSize="8.5" fontWeight="700">
        {isEn ? `Pitch ${rig.ergonomics.gazeDownwardAngleDeg}° · FOV ${rig.input.horizontalFovDeg}°` : `시선 ${rig.ergonomics.gazeDownwardAngleDeg}° · FOV ${rig.input.horizontalFovDeg}°`}
      </text>
      <text x="346" y="20" textAnchor="end" className="text-fg-3" fill="currentColor" fontSize="8">
        {isEn ? `Curve ${rig.mainCutPanel.curvatureDeg}°` : `곡률 ${rig.mainCutPanel.curvatureDeg}°`}
      </text>
    </svg>
  );
}

/** 애플 비전 프로·AR 스마트 글래스·스마트 워치·멀티 디바이스 공간 창작 생태계 시뮬레이터 패널. */
export function StudioSpatialWearablePanel(props: StudioSpatialWearablePanelProps): ReactElement {
  const {
    initialPresetId = "mac-ipad-watch-phone", initialActiveDeviceIds, initialTransportMode,
    initialLinkBandwidthMbps = DEFAULT_LINK_BANDWIDTH_MBPS, initialElapsedWorkMinutes = 32,
    locale = "ko", className, onTopologyChange, onRigChange, onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialPreset = getMultiDevicePreset(initialPresetId);
  const initialBandwidth = Number.isFinite(initialLinkBandwidthMbps) ? Math.min(2000, Math.max(5, initialLinkBandwidthMbps)) : DEFAULT_LINK_BANDWIDTH_MBPS;
  const initialMinutes = Number.isFinite(initialElapsedWorkMinutes) ? Math.min(720, Math.max(0, initialElapsedWorkMinutes)) : 32;
  const [activeDeviceIds, setActiveDeviceIds] = useState<readonly SpatialDeviceId[]>(
    () => initialActiveDeviceIds ? validateSpatialDeviceIds(initialActiveDeviceIds, SPATIAL_DEVICE_IDS) : [...initialPreset.deviceIds],
  );
  const [syncTransportMode, setSyncTransportMode] = useState<SyncTransportMode>(
    () => initialTransportMode ?? initialPreset.recommendedTransport,
  );
  const [availableLinkBandwidthMbps, setAvailableLinkBandwidthMbps] = useState<number>(initialBandwidth);
  const [rigInput, setRigInput] = useState(DEFAULT_SPATIAL_RIG_INPUT);
  const [wearableMode, setWearableMode] = useState<WearableDialMode>("brush-size");
  const [wearableState, setWearableState] = useState<WearableStudioControlState>(DEFAULT_WEARABLE_CONTROL_STATE);
  const [precisionModifier, setPrecisionModifier] = useState<boolean>(false);
  const [lastDialAction, setLastDialAction] = useState<WearableDialActionResult | null>(null);
  const [elapsedWorkMinutes, setElapsedWorkMinutes] = useState<number>(initialMinutes);
  const [breakIntervalMinutes, setBreakIntervalMinutes] = useState<number>(50);
  const [hapticNudgeEnabled, setHapticNudgeEnabled] = useState<boolean>(true);
  const [arHudOptions, setArHudOptions] = useState<Required<ArGlassesHudOptions>>({
    presetId: "perspective-grid-minimal", perspectiveGridType: "2-point", gridOpacityPct: 18,
    showDeadlineTimer: true, deadlineRemainingMinutes: 45, peripheralCorner: "top-right",
  });
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const topology = useMemo<MultiDeviceTopologyResult>(
    () => computeMultiDeviceTopology({ activeDeviceIds, availableLinkBandwidthMbps, syncTransportMode }),
    [activeDeviceIds, availableLinkBandwidthMbps, syncTransportMode],
  );
  const spatialRig = useMemo<SpatialCanvasRigResult>(() => computeSpatialCanvasRig(rigInput), [rigInput]);
  const wearingHmd = topology.activeDeviceIds.includes("vision-pro-webxr") || topology.activeDeviceIds.includes("ar-smart-glasses");
  const breakReminder = useMemo(
    () => evaluateSessionBreakReminder({ elapsedWorkMinutes, breakIntervalMinutes, hapticNudgeEnabled, wearingHmd }),
    [elapsedWorkMinutes, breakIntervalMinutes, hapticNudgeEnabled, wearingHmd],
  );
  const arHudProfile = useMemo(() => buildArGlassesHudProfile(arHudOptions), [arHudOptions]);

  const sessionSnapshot = useMemo<SpatialWearableSessionSnapshot>(
    () => ({
      activeDeviceIds: topology.activeDeviceIds, syncTransportMode, availableLinkBandwidthMbps,
      spatialRigInput: spatialRig.input, wearableMode, wearableState,
      elapsedWorkMinutes, breakIntervalMinutes, hapticNudgeEnabled, arHudOptions,
    }),
    [
      topology.activeDeviceIds, syncTransportMode, availableLinkBandwidthMbps, spatialRig.input,
      wearableMode, wearableState, elapsedWorkMinutes, breakIntervalMinutes, hapticNudgeEnabled, arHudOptions,
    ],
  );
  const sessionJson = useMemo(() => exportSpatialWearableSessionJson(sessionSnapshot), [sessionSnapshot]);

  const topologyNotification = useExampleNotification(topology, onTopologyChange);
  const rigNotification = useExampleNotification(spatialRig, onRigChange);
  const delivery = useExampleCopy<SpatialWearableSessionSnapshot, "json">({ json: onExportJson });

  const handleApplyPreset = (presetId: MultiDevicePresetId): void => {
    const preset = getMultiDevicePreset(presetId);
    setActiveDeviceIds([...preset.deviceIds]);
    setSyncTransportMode(preset.recommendedTransport);
    setStatusMessage(pick(`${preset.labelKo} 조합을 적용했습니다.`, `Applied ${preset.labelEn} setup.`));
  };

  const handleToggleDevice = (deviceId: SpatialDeviceId): void => {
    const spec = getSpatialDeviceSpec(deviceId);
    const exists = activeDeviceIds.includes(deviceId);
    setActiveDeviceIds((prev) => (prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]));
    setStatusMessage(
      exists
        ? pick(`${spec.shortLabelKo} 연결을 해제했습니다.`, `Disconnected ${spec.shortLabelEn}.`)
        : pick(`${spec.shortLabelKo} 노드를 활성화했습니다.`, `Enabled ${spec.shortLabelEn}.`),
    );
  };

  const handleDialGesture = (gesture: WearableGestureKind, detentDelta = 0): void => {
    const result = resolveWearableDialAction({ mode: wearableMode, gesture, detentDelta, precisionModifier, state: wearableState });
    setWearableState(result.nextState);
    setWearableMode(result.nextMode);
    setLastDialAction(result);
    setStatusMessage(isEn ? result.summaryEn : result.summaryKo);
  };

  const handleSelectArPreset = (presetId: ArHudPresetId): void => {
    const preset = getArHudPreset(presetId);
    setArHudOptions((prev) => ({
      ...prev, presetId: preset.id, perspectiveGridType: preset.defaultGridType,
      gridOpacityPct: preset.defaultGridOpacityPct, showDeadlineTimer: preset.showDeadlineTimer,
    }));
    setStatusMessage(pick(`AR 글래스 HUD를 ${preset.labelKo} 프로필로 전환했습니다.`, `Switched AR HUD to ${preset.labelEn}.`));
  };

  const handleReset = (): void => {
    setActiveDeviceIds(validateSpatialDeviceIds(initialActiveDeviceIds ?? initialPreset.deviceIds, SPATIAL_DEVICE_IDS));
    setSyncTransportMode(initialTransportMode ?? initialPreset.recommendedTransport);
    setAvailableLinkBandwidthMbps(initialBandwidth);
    setRigInput(DEFAULT_SPATIAL_RIG_INPUT);
    setWearableMode("brush-size");
    setWearableState(DEFAULT_WEARABLE_CONTROL_STATE);
    setPrecisionModifier(false);
    setLastDialAction(null);
    setElapsedWorkMinutes(initialMinutes);
    setBreakIntervalMinutes(50);
    setHapticNudgeEnabled(true);
    setArHudOptions({ presetId: "perspective-grid-minimal", perspectiveGridType: "2-point", gridOpacityPct: 18, showDeadlineTimer: true, deadlineRemainingMinutes: 45, peripheralCorner: "top-right" });
    setStatusMessage(pick("공간·웨어러블 생태계 설정을 기본값으로 복원했습니다.", "Restored spatial wearable defaults."));
  };

  const handleCopyJson = (): void => {
    setShowJsonPreview(true);
    setStatusMessage("");
    delivery.copy("json", sessionJson, sessionSnapshot);
  };

  const hubSpec = topology.hubDeviceId ? getSpatialDeviceSpec(topology.hubDeviceId) : null;
  const activeDialValueLabel =
    wearableMode === "brush-size" ? `${wearableState.brushSizePx}px`
      : wearableMode === "canvas-zoom" ? `${wearableState.canvasZoomPct}%`
        : wearableMode === "timeline-scrub" ? `${wearableState.timelineFrame} / ${wearableState.timelineMaxFrames}f`
          : `${wearableState.historyIndex} / ${wearableState.historyMaxIndex}`;

  const bwSliderId = `${uid}-bw`;
  const eyeSliderId = `${uid}-eye`;
  const distSliderId = `${uid}-dist`;
  const fovSliderId = `${uid}-fov`;
  const pitchSliderId = `${uid}-pitch`;
  const curveSliderId = `${uid}-curve`;
  const workMinSliderId = `${uid}-work-min`;
  const hudOpacitySliderId = `${uid}-hud-opacity`;
  const deadlineSliderId = `${uid}-deadline-min`;

  return (
    <section
      data-testid="studio-spatial-wearable-panel"
      aria-label={pick("멀티 디바이스 공간 창작 생태계 시뮬레이터", "Spatial & Wearable Multi-Device Studio Simulator")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("공간 · 웨어러블 스튜디오", "Spatial & Wearable Studio")}
            </span>
            <span data-testid="spatial-estimate-badge" data-source-kind={topology.dataSourceKind} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("시뮬레이션 · 추정 (estimate)", "Simulated · Estimate")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("멀티 디바이스 공간 창작 생태계 시뮬레이터", "Multi-Device Spatial Creation Ecosystem")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("비전 프로(WebXR)·AR 스마트 글래스·스마트 워치·맥/태블릿/폰 협업 토폴로지와 6DoF 공간 배치를 설계·점검합니다.", "Simulate Vision Pro WebXR, AR glasses HUD, watch dial controls, and Mac/tablet/phone multi-screen topology.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="spatial-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
          <button type="button" data-testid="spatial-copy-json-btn" disabled={delivery.state === "pending"} onClick={handleCopyJson} className={BTN_SOLID}>
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("구성 JSON 복사", "Copy Config JSON")}
          </button>
        </div>
      </header>
      <div aria-live="polite" className="space-y-1 text-xs">
        {topologyNotification.pending || rigNotification.pending ? <p>{pick("공간 예제 전달 중", "Sending spatial example")}</p> : null}
        {topologyNotification.error ? <p role="alert">{pick("기기 조합 예제 전달 실패", "Topology example delivery failed")} <button type="button" data-testid="spatial-topology-retry" disabled={topologyNotification.pending} onClick={topologyNotification.retry} className={BTN_OUTLINE}>{pick("전달 재시도", "Retry delivery")}</button></p> : null}
        {rigNotification.error ? <p role="alert">{pick("배치 예제 전달 실패", "Rig example delivery failed")} <button type="button" data-testid="spatial-rig-retry" disabled={rigNotification.pending} onClick={rigNotification.retry} className={BTN_OUTLINE}>{pick("전달 재시도", "Retry delivery")}</button></p> : null}
        {delivery.state === "pending" ? <p>{pick("클립보드 복사·예제 전달 중", "Copying and delivering example")}</p> : null}
        {delivery.state === "error" ? <p role="alert">{pick("복사 또는 전달 실패. 완료된 복사는 반복하지 않습니다.", "Copy or delivery failed. Completed copies are not repeated.")} <button type="button" data-testid="spatial-copy-retry" onClick={delivery.retry} className={BTN_OUTLINE}>{pick("복사·전달 재시도", "Retry copy or delivery")}</button></p> : null}
        {delivery.state === "copied" ? <p>{pick("클립보드에 복사했습니다. 장치·원고·서버에는 적용하거나 저장하지 않았습니다.", "Copied to clipboard. No device, manuscript, or server changes were made.")}</p> : null}
      </div>

      {statusMessage ? (
        <div data-testid="spatial-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          testId="spatial-kpi-topology" label={pick("토폴로지 적합도 (추정)", "Topology Health (Est.)")}
          value={`${topology.healthScore} / 100`} valueTone={scoreTone(topology.healthScore)}
          subtext={hubSpec ? pick(`${topology.activeDeviceIds.length}/6대 · 허브 ${hubSpec.shortLabelKo}`, `${topology.activeDeviceIds.length}/6 nodes · Hub ${hubSpec.shortLabelEn}`) : pick("활성 기기 없음", "No active hub")}
        />
        <KpiCard
          testId="spatial-kpi-latency" label={pick("추정 지연 · 대역폭", "Est. Latency & Bandwidth")}
          value={`${topology.latencyBudget.totalEndToEndMs}ms`}
          valueTone={topology.latencyBudget.grade === "optimal" ? "text-good" : topology.latencyBudget.grade === "acceptable" ? "text-warn" : "text-bad"}
          subtext={pick(`${topology.totalAllocatedBandwidthMbps}/${topology.availableLinkBandwidthMbps} Mbps (${topology.bandwidthUtilizationPct}%)`, `${topology.totalAllocatedBandwidthMbps}/${topology.availableLinkBandwidthMbps} Mbps (${topology.bandwidthUtilizationPct}%)`)}
        />
        <KpiCard
          testId="spatial-kpi-ergonomics" label={pick("시선 하향각 · 인체공학", "Gaze Pitch & Ergonomics")}
          value={`${spatialRig.ergonomics.gazeDownwardAngleDeg}°`}
          valueTone={spatialRig.ergonomics.neckFlexionStatus === "comfortable" ? "text-good" : spatialRig.ergonomics.neckFlexionStatus === "caution" ? "text-warn" : "text-bad"}
          subtext={pick(`권장 0°~-15° · 점수 ${spatialRig.ergonomics.ergonomicsScore}/100`, `Ideal 0°..-15° · ${spatialRig.ergonomics.ergonomicsScore}/100`)}
        />
        <KpiCard
          testId="spatial-kpi-break" label={pick("작업 시간 알림 (비의료)", "Work Timer (Non-Medical)")}
          value={`${breakReminder.elapsedWorkMinutes}${pick("분", "m")}`}
          valueTone={breakReminder.status === "working" ? "text-good" : breakReminder.status === "micro-break-suggested" ? "text-warn" : "text-bad"}
          subtext={pick(`주기 ${breakReminder.effectiveBreakIntervalMinutes}분 · 남은 ${breakReminder.minutesUntilNextBreak}분`, `Cycle ${breakReminder.effectiveBreakIntervalMinutes}m · ${breakReminder.minutesUntilNextBreak}m left`)}
        />
      </div>

      {/* 1. 멀티 디바이스 조합 프리셋 & 6대 노드 토폴로지 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("1. 멀티 디바이스 조합 프리셋 · 6대 노드 토글", "1. Multi-Device Presets & 6 Node Roles")}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {TRANSPORT_OPTIONS.map((t) => (
              <button key={t.id} type="button" data-testid={`spatial-transport-${t.id}`} aria-pressed={syncTransportMode === t.id} onClick={() => setSyncTransportMode(t.id)} className={syncTransportMode === t.id ? BTN_ACTIVE : BTN_OUTLINE}>
                <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {isEn ? t.labelEn : t.labelKo}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MULTI_DEVICE_PRESETS.map((preset) => {
            const matched = preset.deviceIds.length === topology.activeDeviceIds.length && preset.deviceIds.every((id) => topology.activeDeviceIds.includes(id));
            return (
              <button key={preset.id} type="button" data-testid={`spatial-preset-${preset.id}`} aria-pressed={matched} onClick={() => handleApplyPreset(preset.id)} className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${matched ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}>
                <span className="text-xs font-bold">{isEn ? preset.labelEn : preset.labelKo}</span>
                <span className="mt-0.5 text-[11px] text-fg-3">{isEn ? preset.summaryEn : preset.summaryKo}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
          {SPATIAL_DEVICE_CATALOG.map((dev) => {
            const active = topology.activeDeviceIds.includes(dev.id);
            const alloc = topology.bandwidthAllocations.find((a) => a.deviceId === dev.id);
            const isHub = topology.hubDeviceId === dev.id;
            return (
              <div key={dev.id} data-testid={`spatial-device-card-${dev.id}`} className={`flex flex-col justify-between gap-2 rounded-lg border p-3 transition-colors motion-reduce:transition-none ${active ? "border-accent bg-card" : "border-line bg-raised opacity-80"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                      <DeviceNodeIcon id={dev.id} />
                      <span>{isEn ? dev.shortLabelEn : dev.shortLabelKo}</span>
                      {isHub ? <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{pick("허브", "Hub")}</span> : null}
                    </div>
                    <div className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? dev.roleLabelEn : dev.roleLabelKo}</div>
                  </div>
                  <button type="button" data-testid={`spatial-toggle-${dev.id}`} aria-pressed={active} onClick={() => handleToggleDevice(dev.id)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                    {active ? pick("연결됨", "On") : pick("꺼짐", "Off")}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 text-[10px] font-medium">
                  {(["webXr", "webRtc", "webBluetooth", "pointerEvents"] as const).map((cap) => {
                    const label = cap === "webXr" ? "WebXR" : cap === "webRtc" ? "WebRTC" : cap === "webBluetooth" ? "BLE" : "Pointer";
                    const lvl = dev.browserCapabilities[cap];
                    return (
                      <span key={cap} className={`rounded border px-1.5 py-0.5 ${capChipTone(lvl)}`}>
                        {`${label}:${capShortLabel(lvl, isEn)}`}
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-line pt-1.5 text-[11px] text-fg-3 tabular-nums">
                  <span>{pick(`목표 ${dev.targetBandwidthMbps} Mbps`, `Target ${dev.targetBandwidthMbps} Mbps`)}</span>
                  <span>{alloc ? pick(`배분 ${alloc.allocatedBandwidthMbps} Mbps (${alloc.bandwidthSharePct}%)`, `Alloc ${alloc.allocatedBandwidthMbps} Mbps`) : pick("대기", "Idle")}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={bwSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("로컬 링크 가용 대역폭 (추정 시뮬레이션)", "Available Link Bandwidth (Est.)")}</label>
              <span data-testid="spatial-bandwidth-readout" className="font-bold text-fg tabular-nums">{`${availableLinkBandwidthMbps} Mbps`}</span>
            </div>
            <input id={bwSliderId} data-testid="spatial-bandwidth-slider" type="range" min={10} max={500} step={5} value={availableLinkBandwidthMbps} onChange={(e) => setAvailableLinkBandwidthMbps(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
          </div>

          <div data-testid="spatial-conflicts-list" className="space-y-1.5">
            {topology.conflicts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-medium text-good [word-break:keep-all]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pick("역할 충돌 및 대역폭·지연 경고가 없습니다.", "No role conflicts, bandwidth caps, or latency warnings.")}
              </div>
            ) : (
              topology.conflicts.map((c) => (
                <div key={c.code} data-conflict-code={c.code} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${conflictTone(c.severity)}`}>
                  {c.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  <div>
                    <div className="font-bold">{isEn ? c.titleEn : c.titleKo}</div>
                    <div className="text-[11px] opacity-90">{isEn ? c.detailEn : c.detailKo}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. 공간 6DoF 배치 솔버 + 평면도 SVG 프리뷰 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("2. 공간 6DoF 캔버스 · 레퍼런스 월 배치 솔버", "2. 6DoF Spatial Canvas & Reference Wall Solver")}</h3>
            <span className="text-[11px] text-fg-3 tabular-nums">{pick(`고개 회전 폭 ${spatialRig.ergonomics.horizontalHeadSweepDeg}°`, `Head sweep ${spatialRig.ergonomics.horizontalHeadSweepDeg}°`)}</span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={eyeSliderId} className="font-medium text-fg-2">{pick("눈높이 (m)", "Eye Height (m)")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${spatialRig.input.eyeHeightM}m`}</span>
              </div>
              <input id={eyeSliderId} data-testid="spatial-eye-height-slider" type="range" min={0.95} max={1.85} step={0.02} value={rigInput.eyeHeightM} onChange={(e) => setRigInput((p) => ({ ...p, eyeHeightM: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={distSliderId} className="font-medium text-fg-2">{pick("시청 거리 (m)", "Viewing Distance (m)")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${spatialRig.input.viewingDistanceM}m`}</span>
              </div>
              <input id={distSliderId} data-testid="spatial-distance-slider" type="range" min={0.75} max={2.5} step={0.05} value={rigInput.viewingDistanceM} onChange={(e) => setRigInput((p) => ({ ...p, viewingDistanceM: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={fovSliderId} className="font-medium text-fg-2">{pick("수평 시야각 FOV (°)", "Horizontal FOV (°)")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${spatialRig.input.horizontalFovDeg}°`}</span>
              </div>
              <input id={fovSliderId} data-testid="spatial-fov-slider" type="range" min={55} max={115} step={5} value={rigInput.horizontalFovDeg} onChange={(e) => setRigInput((p) => ({ ...p, horizontalFovDeg: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={pitchSliderId} className="font-medium text-fg-2">{pick("시선 하향각 (권장 0~-15°)", "Gaze Pitch (Ideal 0..-15°)")}</label>
                <span data-testid="spatial-pitch-readout" className="font-semibold text-fg tabular-nums">{`${spatialRig.input.gazePitchDeg}°`}</span>
              </div>
              <input id={pitchSliderId} data-testid="spatial-pitch-slider" type="range" min={-28} max={14} step={1} value={rigInput.gazePitchDeg} onChange={(e) => setRigInput((p) => ({ ...p, gazePitchDeg: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={curveSliderId} className="font-medium text-fg-2">{pick("메인 컷 패널 곡률 (°)", "Main Panel Curvature (°)")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${spatialRig.mainCutPanel.curvatureDeg}° · ${spatialRig.mainCutPanel.curvatureRadiusM !== null ? `R=${spatialRig.mainCutPanel.curvatureRadiusM}m` : pick("평면", "Flat")}`}</span>
              </div>
              <input id={curveSliderId} data-testid="spatial-curvature-slider" type="range" min={0} max={48} step={2} value={rigInput.panelCurvatureDeg} onChange={(e) => setRigInput((p) => ({ ...p, panelCurvatureDeg: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { testId: "spatial-coord-main", title: pick("메인 컷 패널", "Main Cut Panel"), pos: spatialRig.mainCutPanel.positionM, size: `${spatialRig.mainCutPanel.widthM}×${spatialRig.mainCutPanel.heightM}m` },
              { testId: "spatial-coord-left", title: pick("좌측 레퍼런스", "Left Ref Board"), pos: spatialRig.leftReferenceBoard.positionM, size: `${spatialRig.leftReferenceBoard.widthM}×${spatialRig.leftReferenceBoard.heightM}m` },
              { testId: "spatial-coord-right", title: pick("우측 3D 포즈", "Right 3D Stage"), pos: spatialRig.rightPoseStage.positionM, size: `${spatialRig.rightPoseStage.widthM}×${spatialRig.rightPoseStage.heightM}×${spatialRig.rightPoseStage.depthM}m` },
            ].map((item) => (
              <div key={item.testId} data-testid={item.testId} className="rounded-lg border border-line bg-raised p-2.5 text-[11px] tabular-nums">
                <div className="font-bold text-fg [word-break:keep-all]">{item.title}</div>
                <div className="mt-1 font-mono text-[10px] text-fg-2">{`(${item.pos.x}, ${item.pos.y}, ${item.pos.z})m`}</div>
                <div className="mt-0.5 text-fg-3">{item.size}</div>
              </div>
            ))}
          </div>

          <div data-testid="spatial-ergonomics-summary" className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${spatialRig.ergonomics.neckFlexionStatus === "comfortable" ? "border-good bg-good-soft text-good" : spatialRig.ergonomics.neckFlexionStatus === "caution" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad"}`}>
            {isEn ? spatialRig.ergonomics.summaryEn : spatialRig.ergonomics.summaryKo}
          </div>
        </div>

        <div className="flex flex-col justify-between space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("공간 6DoF 배치 평면도 프리뷰", "6DoF Spatial Top-Down Preview")}</h3>
            <span className="text-[11px] text-fg-3 tabular-nums">{pick("단위: 미터(m) · 추정", "Units: meters · Est.")}</span>
          </div>
          <div className="rounded-lg border border-line bg-raised p-3">
            <SpatialTopDownFloorPlanSvg rig={spatialRig} isEn={isEn} />
          </div>
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? spatialRig.provenance.noticeEn : spatialRig.provenance.noticeKo}</p>
        </div>
      </div>

      {/* 3. 워치 크라운·링 다이얼 + 작업 시간 휴식 알림 & AR 스마트 글래스 최소 간섭 HUD */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <Watch className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("3. 워치 크라운 · 링 제스처 시뮬레이터", "3. Watch Crown & Ring Gesture Simulator")}
            </h3>
            <button type="button" data-testid="spatial-dial-precision-btn" aria-pressed={precisionModifier} onClick={() => setPrecisionModifier((v) => !v)} className={precisionModifier ? BTN_ACTIVE : BTN_OUTLINE}>
              {precisionModifier ? pick("정밀 틱 ON", "Fine Step ON") : pick("표준 틱", "Normal Step")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {WEARABLE_DIAL_MODES.map((m) => (
              <button key={m} type="button" data-testid={`spatial-dial-mode-${m}`} aria-pressed={wearableMode === m} onClick={() => setWearableMode(m)} className={wearableMode === m ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? DIAL_MODE_LABELS[m].en : DIAL_MODE_LABELS[m].ko}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised p-3">
            <div>
              <div className="text-[11px] text-fg-3">{isEn ? DIAL_MODE_LABELS[wearableMode].en : DIAL_MODE_LABELS[wearableMode].ko}</div>
              <div data-testid="spatial-dial-value" className="text-xl font-bold text-fg tabular-nums">{activeDialValueLabel}</div>
              <div data-testid="spatial-dial-haptic" className="text-[11px] text-fg-3 tabular-nums">
                {lastDialAction ? `${lastDialAction.commandId} · haptic:${lastDialAction.hapticPattern}` : pick("크라운 회전·링 트위스트 대기", "Ready for crown or ring gesture")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-testid="spatial-dial-dec5" onClick={() => handleDialGesture("crown-rotate", -5)} className={BTN_OUTLINE} aria-label={pick("크라운 반시계 5틱", "Crown -5 ticks")}><Minus className="h-3.5 w-3.5" aria-hidden="true" />5</button>
              <button type="button" data-testid="spatial-dial-dec1" onClick={() => handleDialGesture("crown-rotate", -1)} className={BTN_OUTLINE} aria-label={pick("크라운 반시계 1틱", "Crown -1 tick")}><Minus className="h-3.5 w-3.5" aria-hidden="true" />1</button>
              <button type="button" data-testid="spatial-dial-inc1" onClick={() => handleDialGesture("ring-pinch-twist", 1)} className={BTN_OUTLINE} aria-label={pick("링 시계 1틱", "Ring +1 tick")}><Plus className="h-3.5 w-3.5" aria-hidden="true" />1</button>
              <button type="button" data-testid="spatial-dial-inc5" onClick={() => handleDialGesture("crown-rotate", 5)} className={BTN_OUTLINE} aria-label={pick("크라운 시계 5틱", "Crown +5 ticks")}><Plus className="h-3.5 w-3.5" aria-hidden="true" />5</button>
              <button type="button" data-testid="spatial-dial-double-tap" onClick={() => handleDialGesture("double-tap")} className={BTN_OUTLINE}>{pick("더블 탭", "Double Tap")}</button>
              <button type="button" data-testid="spatial-dial-press" onClick={() => handleDialGesture("crown-press")} className={BTN_OUTLINE}>{pick("크라운 클릭", "Crown Press")}</button>
            </div>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={workMinSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("연속 작업 경과 시간 (단순 휴식 타이머)", "Elapsed Work Time (Simple Break Timer)")}</label>
              <span data-testid="spatial-work-minutes-readout" className="font-bold text-fg tabular-nums">{`${elapsedWorkMinutes}${pick("분", " min")} · haptic:${breakReminder.watchHapticCue}`}</span>
            </div>
            <input id={workMinSliderId} data-testid="spatial-work-minutes-slider" type="range" min={0} max={120} step={5} value={elapsedWorkMinutes} onChange={(e) => setElapsedWorkMinutes(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            <div data-testid="spatial-break-message" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg [word-break:keep-all]">
              {isEn ? breakReminder.messageEn : breakReminder.messageKo}
            </div>
            <div data-testid="spatial-non-medical-notice" className="rounded-lg border border-cool bg-info-soft px-3 py-1.5 text-[11px] font-medium text-cool [word-break:keep-all]">
              {isEn ? breakReminder.disclaimerEn : breakReminder.disclaimerKo}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <Glasses className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("4. AR 스마트 글래스 최소 간섭 HUD 프로필", "4. AR Smart Glasses Minimal HUD Profile")}
            </h3>
            <span data-testid="spatial-ar-occlusion-badge" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${arHudProfile.interferenceGrade === "minimal" ? "border-good bg-good-soft text-good" : arHudProfile.interferenceGrade === "moderate" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad"}`}>
              {pick(`시야 점유 추정 ${arHudProfile.estimatedFovOcclusionPct}%`, `Est. Occlusion ${arHudProfile.estimatedFovOcclusionPct}%`)}
            </span>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3">
            {AR_HUD_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`spatial-ar-preset-${preset.id}`} aria-pressed={arHudOptions.presetId === preset.id} onClick={() => handleSelectArPreset(preset.id)} className={arHudOptions.presetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PERSPECTIVE_GRID_OPTIONS.map((g) => (
              <button key={g.id} type="button" data-testid={`spatial-ar-grid-${g.id}`} aria-pressed={arHudOptions.perspectiveGridType === g.id} onClick={() => setArHudOptions((p) => ({ ...p, perspectiveGridType: g.id }))} className={arHudOptions.perspectiveGridType === g.id ? BTN_ACTIVE : BTN_OUTLINE}>
                <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {isEn ? g.labelEn : g.labelKo}
              </button>
            ))}
            <button type="button" data-testid="spatial-ar-deadline-toggle" aria-pressed={arHudOptions.showDeadlineTimer} onClick={() => setArHudOptions((p) => ({ ...p, showDeadlineTimer: !p.showDeadlineTimer }))} className={arHudOptions.showDeadlineTimer ? BTN_ACTIVE : BTN_OUTLINE}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {arHudOptions.showDeadlineTimer ? pick("마감 타이머 ON", "Deadline ON") : pick("마감 타이머 OFF", "Deadline OFF")}
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={hudOpacitySliderId} className="font-medium text-fg-2">{pick("투시선 불투명도", "Grid Opacity")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${arHudProfile.gridOpacityPct}%`}</span>
              </div>
              <input id={hudOpacitySliderId} data-testid="spatial-ar-opacity-slider" type="range" min={5} max={45} step={1} value={arHudOptions.gridOpacityPct} onChange={(e) => setArHudOptions((p) => ({ ...p, gridOpacityPct: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={deadlineSliderId} className="font-medium text-fg-2">{pick("마감까지 남은 시간", "Deadline Remaining")}</label>
                <span className="font-semibold text-fg tabular-nums">{`${arHudProfile.deadlineRemainingMinutes}${pick("분", "m")}`}</span>
              </div>
              <input id={deadlineSliderId} data-testid="spatial-ar-deadline-slider" type="range" min={5} max={240} step={5} value={arHudOptions.deadlineRemainingMinutes} onChange={(e) => setArHudOptions((p) => ({ ...p, deadlineRemainingMinutes: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
          </div>

          <ul className="space-y-1.5 text-xs">
            {arHudProfile.hudElements.map((el) => (
              <li key={el.id} className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-1.5 [word-break:keep-all]">
                <span className="font-medium text-fg">{isEn ? el.labelEn : el.labelKo}</span>
                <span className="text-[11px] text-fg-3 tabular-nums">{`${el.placementZone} · ${el.estimatedOcclusionPct}%`}</span>
              </li>
            ))}
          </ul>

          <div className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${arHudProfile.centerSafeZoneClear ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
            {isEn ? arHudProfile.noteEn : arHudProfile.noteKo}
          </div>
        </div>
      </div>

      {/* 4. 세션 설정 JSON 직렬화 미리보기 */}
      <div className="space-y-2 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Monitor className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("세션 구성 JSON 내보내기 미리보기", "Session Config JSON Preview")}
          </span>
          <button type="button" data-testid="spatial-json-toggle-btn" aria-pressed={showJsonPreview} onClick={() => setShowJsonPreview((v) => !v)} className={BTN_OUTLINE}>
            {showJsonPreview ? pick("접기", "Hide") : pick("펼치기", "Show")}
          </button>
        </div>
        {showJsonPreview ? (
          <pre data-testid="spatial-json-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {sessionJson}
          </pre>
        ) : null}
      </div>
    </section>
  );
}

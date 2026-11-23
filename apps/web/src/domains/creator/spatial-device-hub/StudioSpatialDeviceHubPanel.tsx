/**
 * Mac/iPad ProMotion·Display-P3 · 워치 BLE 리모컨 · AR 글래스 6DoF 공간 HUD · VR 3D 스카우팅 통합 패널 (Wave 28).
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 순수 메모리 상태 · 명시적 transition 속성 · 모든 props 선택형 · KO/EN.
 */

import { Bluetooth, Camera, CheckCircle2, Compass, Glasses, Laptop, Palette, RotateCcw, Timer, Volume2, Watch } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  SAMPLE_REAL_WORLD_COLORS, VR_SCOUTING_SCENES, captureVrAngleToCutFrame, computeSpatialHudAnchors,
  createInitialVrScoutingRig, sampleRealWorldColorToOklch, stepVrScoutingRig,
  type ArGlassDeviceProfile, type RealWorldOklchSwatch, type SpatialHudLockMode,
  type VrCutFrameSnapshot, type VrScoutingRigState, type VrScoutingSceneId,
} from "./ar-glass-vr-webxr-stage";
import {
  APPLE_CREATIVE_PRESET_ENVS, DEFAULT_TRACKPAD_CANVAS_STATE, DEFAULT_WATCH_COMPANION_STATE, WATCH_BLE_GATT_SPEC,
  createAppleHandoffSession, detectAppleCreativeCapabilities, evaluateCreatorBreakReminder,
  ingestContinuityPhotoToCanvas, mapMacTrackpadGesture, parseWatchBleCharacteristicPacket, routeWatchCompanionEvent,
  type AppleHandoffMode, type ContinuityPhotoPlacementReceipt, type MacTrackpadCanvasState,
  type MacTrackpadGestureEvent, type MacTrackpadGestureRoutingResult, type WatchCompanionRouteResult,
  type WatchCompanionStudioState, type WatchCrownMode, type WatchDeviceKind, type WatchDoubleTapBinding,
} from "./mac-ipad-watch-companion";

export type SpatialDeviceHubTabId = "apple-ecosystem" | "watch-companion" | "ar-vr-stage";

export interface StudioSpatialDeviceHubPanelProps {
  readonly initialTab?: SpatialDeviceHubTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onTrackpadGesture?: (result: MacTrackpadGestureRoutingResult) => void;
  readonly onContinuityPhotoPlaced?: (receipt: ContinuityPhotoPlacementReceipt) => void;
  readonly onWatchEventRouted?: (result: WatchCompanionRouteResult) => void;
  readonly onRealWorldSwatchSampled?: (swatch: RealWorldOklchSwatch) => void;
  readonly onVrCutCaptured?: (snapshot: VrCutFrameSnapshot) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_PILL = `min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const APPLE_ENV_OPTIONS: readonly { readonly id: "auto" | "macbook-pro-m4" | "ipad-pro-m4" | "standard-60hz"; readonly ko: string; readonly en: string }[] = [
  { id: "macbook-pro-m4", ko: "MacBook Pro 120Hz · P3", en: "MacBook Pro 120Hz · P3" },
  { id: "ipad-pro-m4", ko: "iPad Pro Sidecar · P3", en: "iPad Pro Sidecar · P3" },
  { id: "standard-60hz", ko: "표준 60Hz · sRGB", en: "Standard 60Hz · sRGB" },
  { id: "auto", ko: "현재 브라우저 실측", en: "Live Browser Probe" },
];
const WATCH_DEVICE_OPTIONS: readonly { readonly id: WatchDeviceKind; readonly ko: string; readonly en: string }[] = [
  { id: "apple-watch", ko: "Apple Watch", en: "Apple Watch" },
  { id: "wear-os", ko: "Wear OS 워치", en: "Wear OS Watch" },
  { id: "smart-ring", ko: "BLE 스마트 링", en: "BLE Smart Ring" },
];
const CROWN_MODES: readonly { readonly id: WatchCrownMode; readonly ko: string; readonly en: string }[] = [
  { id: "brush-size", ko: "브러시 크기", en: "Brush Size" },
  { id: "canvas-zoom", ko: "캔버스 줌", en: "Canvas Zoom" },
  { id: "timeline-scrub", ko: "타임라인", en: "Timeline" },
  { id: "layer-opacity", ko: "불투명도", en: "Opacity" },
];
const DOUBLE_TAP_OPTIONS: readonly { readonly id: WatchDoubleTapBinding; readonly ko: string; readonly en: string }[] = [
  { id: "undo", ko: "Undo 실행취소", en: "Undo" },
  { id: "toggle-layer-visibility", ko: "레이어 토글", en: "Toggle Layer" },
  { id: "cycle-crown-mode", ko: "크라운 모드 전환", en: "Cycle Mode" },
];
const AR_DEVICE_OPTIONS: readonly { readonly id: ArGlassDeviceProfile; readonly ko: string; readonly en: string }[] = [
  { id: "xreal-glass", ko: "XREAL 글래스", en: "XREAL Glass" },
  { id: "vision-pro", ko: "Vision Pro", en: "Vision Pro" },
  { id: "webxr-ar-headset", ko: "WebXR AR", en: "WebXR AR" },
];
const VR_SCENE_OPTIONS: readonly { readonly id: VrScoutingSceneId; readonly ko: string; readonly en: string }[] = [
  { id: "classroom", ko: "방과 후 교실", en: "Classroom" },
  { id: "alley", ko: "비 오는 골목", en: "Rainy Alley" },
  { id: "palace", ko: "고궁 전각", en: "Palace" },
];

function breakBadgeClass(level: "steady" | "upcoming" | "break-recommended" | "extended-break-recommended"): string {
  if (level === "steady") return "border-good bg-good-soft text-good";
  if (level === "upcoming") return "border-line bg-warning-soft text-warn";
  return "border-bad bg-bad-soft text-bad";
}

/** Mac/iPad ProMotion·Display-P3, 워치 BLE 리모컨, AR 6DoF HUD·VR 3D 스카우팅 통합 패널. */
export function StudioSpatialDeviceHubPanel({
  initialTab = "apple-ecosystem", locale, className,
  onTrackpadGesture, onContinuityPhotoPlaced, onWatchEventRouted, onRealWorldSwatchSampled, onVrCutCaptured,
}: StudioSpatialDeviceHubPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<SpatialDeviceHubTabId>(initialTab);
  const [notice, setNotice] = useState<string>("");

  const [envPreset, setEnvPreset] = useState<"auto" | "macbook-pro-m4" | "ipad-pro-m4" | "standard-60hz">("macbook-pro-m4");
  const [trackpadState, setTrackpadState] = useState<MacTrackpadCanvasState>(DEFAULT_TRACKPAD_CANVAS_STATE);
  const [handoffMode, setHandoffMode] = useState<AppleHandoffMode>("continuity-camera-photo");
  const [photoReceipt, setPhotoReceipt] = useState<ContinuityPhotoPlacementReceipt | null>(null);

  const [watchDevice, setWatchDevice] = useState<WatchDeviceKind>("apple-watch");
  const [watchState, setWatchState] = useState<WatchCompanionStudioState>(DEFAULT_WATCH_COMPANION_STATE);
  const [workMinutes, setWorkMinutes] = useState<number>(52);

  const [arDevice, setArDevice] = useState<ArGlassDeviceProfile>("vision-pro");
  const [hudLockMode, setHudLockMode] = useState<SpatialHudLockMode>("world-locked");
  const [sampleColorIdx, setSampleColorIdx] = useState<number>(1);
  const [vrRig, setVrRig] = useState<VrScoutingRigState>(() => createInitialVrScoutingRig("alley"));
  const [captureSeq, setCaptureSeq] = useState<number>(1);
  const [capturedCut, setCapturedCut] = useState<VrCutFrameSnapshot>(() => captureVrAngleToCutFrame(createInitialVrScoutingRig("alley")));

  const appleCaps = useMemo(
    () => detectAppleCreativeCapabilities(envPreset === "auto" ? undefined : APPLE_CREATIVE_PRESET_ENVS[envPreset]),
    [envPreset],
  );
  const handoffSession = useMemo(
    () => createAppleHandoffSession({ mode: handoffMode, canvasWidthPx: 1600, canvasHeightPx: 2400, capabilities: appleCaps }),
    [appleCaps, handoffMode],
  );
  const breakReport = useMemo(() => evaluateCreatorBreakReminder({ continuousWorkMinutes: workMinutes, intervalMinutes: 50 }), [workMinutes]);
  const spatialHud = useMemo(() => computeSpatialHudAnchors({ deviceProfile: arDevice, lockMode: hudLockMode }), [arDevice, hudLockMode]);
  const sampledSwatch = useMemo(
    () => sampleRealWorldColorToOklch(SAMPLE_REAL_WORLD_COLORS[sampleColorIdx] ?? SAMPLE_REAL_WORLD_COLORS[0]),
    [sampleColorIdx],
  );

  const runTrackpad = (event: MacTrackpadGestureEvent): void => {
    const res = mapMacTrackpadGesture(event, trackpadState);
    setTrackpadState(res.nextState);
    setNotice(pick(res.deltaSummaryKo, res.deltaSummaryEn));
    onTrackpadGesture?.(res);
  };

  const runContinuityPhotoSample = (): void => {
    const receipt = ingestContinuityPhotoToCanvas(handoffSession, {
      filename: "studio-desk-sketch.heic", mimeType: "image/heic", byteSize: 4_200_000,
      widthPx: 3024, heightPx: 4032, colorSpace: appleCaps.canvasColorSpace,
    });
    setPhotoReceipt(receipt);
    setNotice(pick(receipt.summaryKo, receipt.summaryEn));
    onContinuityPhotoPlaced?.(receipt);
  };

  const runWatchPacket = (packet: Uint8Array): void => {
    const ev = parseWatchBleCharacteristicPacket(packet, watchDevice);
    if (!ev) return;
    const res = routeWatchCompanionEvent(ev, watchState);
    setWatchState(res.nextState);
    setNotice(pick(res.summaryKo, res.summaryEn));
    onWatchEventRouted?.(res);
  };

  const handleSampleSwatch = (idx: number): void => {
    setSampleColorIdx(idx);
    const next = sampleRealWorldColorToOklch(SAMPLE_REAL_WORLD_COLORS[idx] ?? SAMPLE_REAL_WORLD_COLORS[0]);
    setNotice(pick(`실물 색 추출 완료: ${next.labelKo} (${next.cssOklch})`, `Sampled real-world color: ${next.labelEn} (${next.cssOklch})`));
    onRealWorldSwatchSampled?.(next);
  };

  const handleVrSceneSwitch = (sceneId: VrScoutingSceneId): void => {
    const nextRig = createInitialVrScoutingRig(sceneId);
    setVrRig(nextRig);
    const snap = captureVrAngleToCutFrame(nextRig, { sequenceIndex: captureSeq });
    setCapturedCut(snap);
    setNotice(pick(`VR 3D 배경 전환: ${VR_SCOUTING_SCENES[sceneId].nameKo}`, `Switched VR 3D set: ${VR_SCOUTING_SCENES[sceneId].nameEn}`));
  };

  const handleVrStep = (step: Parameters<typeof stepVrScoutingRig>[1]): void => {
    const nextRig = stepVrScoutingRig(vrRig, step);
    setVrRig(nextRig);
    setNotice(pick(`VR 위치 (${nextRig.positionMeters.x}m, ${nextRig.positionMeters.y}m, ${nextRig.positionMeters.z}m)`, `VR pose (${nextRig.positionMeters.x}m, ${nextRig.positionMeters.y}m, ${nextRig.positionMeters.z}m)`));
  };

  const handleCaptureVrCut = (): void => {
    const nextSeq = captureSeq + 1;
    setCaptureSeq(nextSeq);
    const snap = captureVrAngleToCutFrame(vrRig, { aspectRatio: "9:16", sequenceIndex: nextSeq });
    setCapturedCut(snap);
    setNotice(pick(`2D 콘티 컷 스냅 완료: ${snap.snapshotId} (${snap.camera.equivalent35mmFocalLengthMm}mm)`, `Captured 2D cut frame: ${snap.snapshotId} (${snap.camera.equivalent35mmFocalLengthMm}mm)`));
    onVrCutCaptured?.(snap);
  };

  const tabs: readonly { readonly id: SpatialDeviceHubTabId; readonly label: string }[] = [
    { id: "apple-ecosystem", label: pick("Mac/iPad ProMotion · P3 · 트랙패드", "Mac/iPad ProMotion · P3 · Trackpad") },
    { id: "watch-companion", label: pick("워치 크라운/제스처 리모컨", "Watch Crown / Gesture Remote") },
    { id: "ar-vr-stage", label: pick("AR 글래스 공간 HUD · VR 3D 스카우팅", "AR Spatial HUD · VR 3D Scouting") },
  ];

  return (
    <section
      aria-label={pick("주변 기기·공간 XR 생태계 허브 패널", "Peripheral Devices & Spatial XR Ecosystem Hub Panel")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Glasses className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Display-P3 · ProMotion 120Hz · Web Bluetooth · WebXR · Spatial Audio", "Display-P3 · ProMotion 120Hz · Web Bluetooth · WebXR · Spatial Audio")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("주변 기기 · 공간 컴퓨팅 스튜디오 허브", "Peripheral & Spatial XR Device Hub")}</h2>
          <p className="text-xs text-fg-2">{pick("맥북·아이패드 광색역/트랙패드, 워치 BLE 크라운 리모컨, AR 글래스 6DoF HUD와 VR 3D 배경 스카우팅을 웹 표준 프로토콜로 연결합니다.", "Connect Mac/iPad P3 & trackpad gestures, Watch BLE crown controls, AR 6DoF spatial HUD, and VR 3D background scouting via open web standards.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span data-testid="hub-gamut-badge" className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">
            {appleCaps.displayP3Supported ? "Display-P3" : "sRGB"} · {appleCaps.refreshRateHz}Hz
          </span>
          <span className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">
            {pick(`HUD 충돌 ${spatialHud.collisionCount}건`, `HUD Collisions ${spatialHud.collisionCount}`)}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("주변 기기 생태계 탭", "Spatial device hub tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_PRIMARY : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      ) : null}

      {activeTab === "apple-ecosystem" ? (
        <div id={`${uid}-panel-apple-ecosystem`} role="tabpanel" aria-labelledby={`${uid}-tab-apple-ecosystem`} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-card p-3">
            {APPLE_ENV_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" aria-pressed={envPreset === opt.id} onClick={() => setEnvPreset(opt.id)} className={`${BTN_PILL} ${envPreset === opt.id ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick(opt.ko, opt.en)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs tabular-nums">
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("색역 공간", "Color Gamut")}</div><div data-testid="apple-color-gamut" className="mt-1 text-base font-bold text-fg">{appleCaps.canvasColorSpace}</div></div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("프레임 버짓", "Frame Budget")}</div><div data-testid="apple-frame-budget" className="mt-1 text-base font-bold text-accent">{appleCaps.frameBudgetMs} ms</div></div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("잉크 예측 리드", "Ink Lead")}</div><div className="mt-1 text-base font-bold text-fg">{appleCaps.inkPredictionLeadMs} ms</div></div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("스트로크 모드", "Stroke Mode")}</div><div className="mt-1 text-xs font-bold text-good">{appleCaps.strokeCoalescingMode}</div></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Laptop className="h-4 w-4 text-accent" aria-hidden="true" />{pick("Mac 포스터치 트랙패드 제스처", "Mac Force Touch Trackpad")}</h3>
                <span data-testid="trackpad-readout" className="tabular-nums text-[11px] font-semibold text-fg-2">{trackpadState.zoomPercent}% · {trackpadState.rotationDeg}° · Undo {trackpadState.undoCount}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => runTrackpad({ kind: "pinch-zoom", scaleFactor: 1.2 })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("핀치 확대 +20%", "Pinch Zoom +20%")}</button>
                <button type="button" onClick={() => runTrackpad({ kind: "two-finger-rotate", rotationDeltaDeg: 15, snapRotationStepDeg: 15 })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("두손가락 회전 +15°", "Rotate +15 deg")}</button>
                <button type="button" onClick={() => runTrackpad({ kind: "force-click", forcePressure: 0.9 })} className={`${BTN_PILL} ${trackpadState.eyedropperPeekActive ? BTN_ACTIVE : BTN_IDLE}`}>{pick("포스클릭 스포이드", "Force Click Peek")}</button>
                <button type="button" onClick={() => runTrackpad({ kind: "three-finger-swipe-left" })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("세손가락 Undo", "3-Finger Undo")}</button>
                <button type="button" onClick={() => runTrackpad({ kind: "three-finger-swipe-up" })} className={`${BTN_PILL} ${trackpadState.focusCanvasMode ? BTN_ACTIVE : BTN_IDLE}`}>{pick("세손가락 집중캔버스", "3-Finger Focus")}</button>
              </div>
            </article>

            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Camera className="h-4 w-4 text-accent" aria-hidden="true" />{pick("iPad Sidecar · Continuity Camera 핸드오프", "iPad Sidecar & Continuity Camera")}</h3>
                <span className="tabular-nums text-[11px] font-semibold text-good">{pick(`뷰포트 ${handoffSession.sidecarViewportRatioPercent}%`, `Viewport ${handoffSession.sidecarViewportRatioPercent}%`)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={handoffMode === "continuity-camera-photo"} onClick={() => setHandoffMode("continuity-camera-photo")} className={`${BTN_PILL} ${handoffMode === "continuity-camera-photo" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("Continuity 사진 촬영", "Continuity Photo")}</button>
                <button type="button" aria-pressed={handoffMode === "ipad-sidecar-canvas"} onClick={() => setHandoffMode("ipad-sidecar-canvas")} className={`${BTN_PILL} ${handoffMode === "ipad-sidecar-canvas" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("iPad Sidecar 펜 캔버스", "iPad Sidecar Pen Canvas")}</button>
                <button type="button" onClick={runContinuityPhotoSample} className={BTN_PRIMARY}>{pick("원클릭 사진→캔버스 배치", "1-Click Photo to Canvas")}</button>
              </div>
              <p data-testid="handoff-status" className="rounded-lg border border-line bg-canvas p-2.5 text-[11px] text-fg-2">
                {photoReceipt ? pick(photoReceipt.summaryKo, photoReceipt.summaryEn) : pick(handoffSession.statusKo, handoffSession.statusEn)}
              </p>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "watch-companion" ? (
        <div id={`${uid}-panel-watch-companion`} role="tabpanel" aria-labelledby={`${uid}-tab-watch-companion`} className="grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Watch className="h-4 w-4 text-accent" aria-hidden="true" />{pick("디지털 크라운 · 더블탭 BLE 컨트롤러", "Digital Crown & Double-Tap BLE")}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-accent"><Bluetooth className="h-3 w-3" aria-hidden="true" />{watchState.connectedBatteryPercent}%</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WATCH_DEVICE_OPTIONS.map((d) => (
                <button key={d.id} type="button" aria-pressed={watchDevice === d.id} onClick={() => setWatchDevice(d.id)} className={`${BTN_PILL} ${watchDevice === d.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(d.ko, d.en)}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CROWN_MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={watchState.crownMode === m.id} onClick={() => setWatchState((s) => ({ ...s, crownMode: m.id }))} className={`${BTN_PILL} ${watchState.crownMode === m.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(m.ko, m.en)}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-[11px]">
              <div data-testid="watch-brush-zoom">{pick(`브러시 ${watchState.brushSizePx}px · 줌 ${watchState.canvasZoomPercent}%`, `Brush ${watchState.brushSizePx}px · Zoom ${watchState.canvasZoomPercent}%`)}</div>
              <div data-testid="watch-timeline-layer">{pick(`프레임 ${watchState.timelineFrame}/${watchState.totalTimelineFrames} · 레이어 ${watchState.activeLayerVisible ? "표시" : "숨김"}`, `Frame ${watchState.timelineFrame}/${watchState.totalTimelineFrames} · Layer ${watchState.activeLayerVisible ? "On" : "Off"}`)}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => runWatchPacket(new Uint8Array([0x01, 253, 0, watchState.connectedBatteryPercent]))} className={BTN_OUTLINE}>{pick("크라운 -3틱", "Crown -3 Ticks")}</button>
              <button type="button" onClick={() => runWatchPacket(new Uint8Array([0x01, 3, 0, watchState.connectedBatteryPercent]))} className={BTN_PRIMARY}>{pick("크라운 +3틱", "Crown +3 Ticks")}</button>
              <button type="button" onClick={() => runWatchPacket(new Uint8Array([0x02, 0, 0, watchState.connectedBatteryPercent]))} className={BTN_OUTLINE}>{pick("더블탭 실행", "Trigger Double-Tap")}</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="text-[11px] font-semibold text-fg-3">{pick("더블탭 지정:", "Double-Tap:")}</span>
              {DOUBLE_TAP_OPTIONS.map((b) => (
                <button key={b.id} type="button" aria-pressed={watchState.doubleTapBinding === b.id} onClick={() => setWatchState((s) => ({ ...s, doubleTapBinding: b.id }))} className={`${BTN_PILL} ${watchState.doubleTapBinding === b.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(b.ko, b.en)}</button>
              ))}
            </div>
            <p className="text-[11px] text-fg-3">GATT Service: <code className="font-mono text-fg-2">{WATCH_BLE_GATT_SPEC.companionServiceUuid}</code></p>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Timer className="h-4 w-4 text-accent" aria-hidden="true" />{pick("안전 작업 시간 · 스트레칭 리마인더", "Work-Timer & Stretch Reminder")}</h3>
              <span data-testid="break-level-badge" className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${breakBadgeClass(breakReport.level)}`}>{pick(breakReport.titleKo, breakReport.titleEn)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 tabular-nums">
              {[25, 44, 52, 90].map((mins) => (
                <button key={mins} type="button" aria-pressed={workMinutes === mins} onClick={() => setWorkMinutes(mins)} className={`${BTN_PILL} ${workMinutes === mins ? BTN_ACTIVE : BTN_IDLE}`}>{pick(`연속 ${mins}분`, `${mins} min`)}</button>
              ))}
            </div>
            <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-3">
              <p data-testid="break-reminder-message" className="font-semibold text-fg">{pick(breakReport.messageKo, breakReport.messageEn)}</p>
              <p className="text-[11px] text-fg-2">{pick(breakReport.stretchGuideKo, breakReport.stretchGuideEn)}</p>
              <p className="text-[10px] text-fg-3">{pick(breakReport.noteKo, breakReport.noteEn)}</p>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "ar-vr-stage" ? (
        <div id={`${uid}-panel-ar-vr-stage`} role="tabpanel" aria-labelledby={`${uid}-tab-ar-vr-stage`} className="grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Glasses className="h-4 w-4 text-accent" aria-hidden="true" />{pick("AR 6DoF 공간 HUD & 실물 OKLCH 스포이드", "AR 6DoF Spatial HUD & OKLCH Eyedropper")}</h3>
              <span data-testid="ar-hud-collision-badge" className="rounded-full bg-good-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-good">{pick(`충돌 ${spatialHud.collisionCount} · 캔버스 침범 ${spatialHud.canvasOverlapCount}`, `Collisions ${spatialHud.collisionCount} · Keepout ${spatialHud.canvasOverlapCount}`)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AR_DEVICE_OPTIONS.map((dev) => (
                <button key={dev.id} type="button" aria-pressed={arDevice === dev.id} onClick={() => setArDevice(dev.id)} className={`${BTN_PILL} ${arDevice === dev.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(dev.ko, dev.en)}</button>
              ))}
              <button type="button" onClick={() => setHudLockMode((m) => (m === "world-locked" ? "head-follow-lazy" : "world-locked"))} className={`${BTN_PILL} ${BTN_IDLE}`}>{hudLockMode === "world-locked" ? pick("월드 고정", "World Locked") : pick("시선 추적", "Head Follow")}</button>
            </div>
            <ul data-testid="ar-hud-anchor-list" className="space-y-1.5 tabular-nums">
              {spatialHud.anchors.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[11px]">
                  <span className="font-semibold text-fg">{pick(a.labelKo, a.labelEn)} ({a.slot})</span>
                  <span className="text-fg-2">({a.positionMeters.x}m, {a.positionMeters.y}m, {a.positionMeters.z}m) · {a.azimuthDeg}°</span>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-line pt-2.5">
              <div className="flex items-center gap-1.5 font-semibold text-fg"><Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("실물 컬러 스포이드 → OKLCH 스와치", "Real-World Eyedropper -> OKLCH")}</div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_REAL_WORLD_COLORS.map((c, idx) => (
                  <button key={c.labelEn ?? idx} type="button" aria-pressed={sampleColorIdx === idx} onClick={() => handleSampleSwatch(idx)} className={`${BTN_PILL} ${sampleColorIdx === idx ? BTN_ACTIVE : BTN_IDLE}`}>{pick(c.labelKo ?? "샘플", c.labelEn ?? "Sample")}</button>
                ))}
              </div>
              <div data-testid="ar-oklch-swatch" className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-2.5 tabular-nums">
                <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg border border-line-strong" style={{ backgroundColor: sampledSwatch.cssOklch }} />
                <div className="min-w-0 text-[11px]">
                  <div className="font-bold text-fg">{pick(sampledSwatch.labelKo, sampledSwatch.labelEn)} · {sampledSwatch.cssOklch}</div>
                  <div className="text-fg-2">{pick(sampledSwatch.hueFamilyKo, sampledSwatch.hueFamilyEn)} · {sampledSwatch.wideGamutOutsideSrgb ? "Display-P3 Wide" : "sRGB Safe"} · {pick(`명암비 ${sampledSwatch.contrastVsLightCanvas}:1`, `Contrast ${sampledSwatch.contrastVsLightCanvas}:1`)}</div>
                </div>
              </div>
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg"><Compass className="h-4 w-4 text-accent" aria-hidden="true" />{pick("VR 3D 배경 스카우팅 & 2D 컷 스냅", "VR 3D Scouting & 2D Cut Snap")}</h3>
              <span data-testid="vr-rig-pose" className="tabular-nums text-[11px] font-semibold text-accent">{vrRig.shotType} · FOV {vrRig.verticalFovDeg}°</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VR_SCENE_OPTIONS.map((sc) => (
                <button key={sc.id} type="button" aria-pressed={vrRig.sceneId === sc.id} onClick={() => handleVrSceneSwitch(sc.id)} className={`${BTN_PILL} ${vrRig.sceneId === sc.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(sc.ko, sc.en)}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => handleVrStep({ moveForwardMeters: 1.5 })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("앞으로 걷기 +1.5m", "Walk Forward +1.5m")}</button>
              <button type="button" onClick={() => handleVrStep({ verticalOffsetMeters: -0.8, pitchDeltaDeg: 16, rollDeltaDeg: 8 })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("로우앵글 · 더치틸트", "Low Angle + Dutch Tilt")}</button>
              <button type="button" onClick={() => handleVrStep({ fovDeltaDeg: -10 })} className={`${BTN_PILL} ${BTN_IDLE}`}>{pick("망원 줌 (FOV -10°)", "Telephoto (FOV -10)")}</button>
              <button type="button" onClick={() => handleVrSceneSwitch(vrRig.sceneId)} className={`${BTN_PILL} ${BTN_IDLE}`}><RotateCcw className="inline h-3 w-3" aria-hidden="true" /> {pick("초기화", "Reset")}</button>
            </div>
            <button type="button" onClick={handleCaptureVrCut} className={BTN_PRIMARY}>{pick("2D 콘티 컷 카메라 스냅 + 공간 음향 산출", "Snap 2D Storyboard Cut + Spatial Audio")}</button>
            <div data-testid="vr-cut-snapshot-card" className="space-y-1.5 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-[11px]">
              <div className="font-bold text-fg">{capturedCut.snapshotId} · {pick(capturedCut.composition.framingNotesKo, capturedCut.composition.framingNotesEn)} · {pick(`드라마 점수 ${capturedCut.composition.dramaScore}`, `Drama ${capturedCut.composition.dramaScore}`)}</div>
              {capturedCut.spatialAudioSources.map((src) => (
                <div key={src.cueId} className="flex items-center justify-between text-fg-2">
                  <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3 text-accent" aria-hidden="true" />{pick(src.labelKo, src.labelEn)}</span>
                  <span>Az {src.azimuthDeg}° · El {src.elevationDeg}° · {src.distanceMeters}m (HRTF)</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

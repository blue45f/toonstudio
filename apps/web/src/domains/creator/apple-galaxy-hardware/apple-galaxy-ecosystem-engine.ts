/**
 * Apple 생태계(ProMotion 120Hz · Display-P3 · Stage Manager/Universal Control · Force Touch ·
 * toonstudio:// 단축어/Handoff · Vision Pro 3-창 공간 배치) 및 Android/Galaxy 생태계(S-Pen 에어 액션 ·
 * Samsung DeX 외부 모니터 분리 · Z Fold DevicePosture Flex Mode · Android PWA Share Target ·
 * Galaxy Watch 회전 베젤) 통합 워크스페이스 오케스트레이션 엔진 (Wave 29).
 * 순수 메모리 결정론적 연산(네트워크·스토리지·원시 색상 코드 없음).
 */

export type AppleFormFactor = "ipad-stage-manager" | "mac-universal-control" | "mac-ipad-sidecar" | "vision-pro-spatial";
export type AppleColorSpace = "display-p3" | "srgb";
export type AppleThermalState = "nominal" | "fair" | "serious" | "critical";
export type AppleInteractionActivity = "drawing" | "panning" | "scrubbing" | "idle";
export type AppleDeepLinkAction = "open-project" | "handoff-resume" | "shortcut-run" | "export-preset" | "review-cut";

export interface AppleDisplaySpec {
  readonly widthPx: number; readonly heightPx: number; readonly scaleFactor: number;
  readonly supportsDisplayP3: boolean; readonly hdrHeadroom?: number; readonly maxRefreshHz: 60 | 120;
}

export interface AppleCompanionDisplaySpec {
  readonly role: "ipad-companion" | "external-studio-display" | "mac-host";
  readonly widthPx: number; readonly heightPx: number; readonly supportsDisplayP3: boolean;
}

export interface ForceTouchInput {
  readonly webkitForce: number; readonly fingerCount?: 1 | 2 | 3;
  readonly modifier?: "none" | "option" | "command"; readonly paintingMode?: boolean;
}

export interface ForceTouchMappingResult {
  readonly stage: 0 | 1 | 2; readonly normalizedPressure: number;
  readonly studioCommand: "hover" | "pressure-stroke" | "eyedropper-loupe" | "pressure-boost" | "quick-look-reference" | "zoom-fit-toggle" | "radial-palette-peek";
  readonly hapticPattern: "none" | "alignment-detent" | "firm-generic";
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface DisplayP3SurfaceConfig {
  readonly colorSpace: AppleColorSpace;
  readonly canvas2dContextOptions: { readonly colorSpace: AppleColorSpace; readonly willReadFrequently: false };
  readonly webGpuFormat: "rgba16float" | "bgra8unorm";
  readonly toneMappingMode: "extended" | "standard";
  readonly hdrHeadroom: number; readonly gamutVolumeVsSrgbPct: number;
  readonly mixedGamutWarning: boolean; readonly fallbackMappingPolicy: "perceptual-clip" | "relative-colorimetric";
}

export interface ProMotionFrameBudget {
  readonly targetHz: 10 | 24 | 30 | 48 | 60 | 80 | 120;
  readonly frameBudgetMs: number; readonly predictedPointerHorizonMs: number;
  readonly useCoalescedEvents: boolean; readonly throttledBySystem: boolean;
  readonly rationaleKo: string; readonly rationaleEn: string;
}

export interface AppleWorkspaceWindow {
  readonly windowId: string; readonly displayTarget: "primary" | "secondary";
  readonly role: "main-canvas" | "tools-layers" | "reference-palette" | "timeline-companion";
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly minTouchTargetPt: number;
}

export interface VisionProSpatialWindow {
  readonly windowId: "main-canvas" | "left-tools-layers" | "right-reference-3d";
  readonly titleKo: string; readonly titleEn: string;
  readonly widthMeters: number; readonly heightMeters: number;
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly yawDeg: number; readonly pitchDeg: number;
  readonly gazeHoverMarginPt: number; readonly colorSpace: AppleColorSpace;
}

export interface VisionProSpatialLayout {
  readonly viewingDistanceMeters: number; readonly totalHorizontalSpanDeg: number;
  readonly withinErgonomicNeckLimit: boolean; readonly windows: readonly VisionProSpatialWindow[];
}

export interface ParsedToonStudioDeepLink {
  readonly valid: boolean; readonly rawUrl: string;
  readonly errorCode?: "invalid-url" | "disallowed-scheme" | "unsupported-action" | "unsafe-character" | "invalid-project-id";
  readonly action?: AppleDeepLinkAction; readonly projectId?: string; readonly episodeId?: string;
  readonly cutIndex?: number; readonly layerId?: string; readonly brushId?: string;
  readonly zoomPct?: number; readonly scrollY?: number;
  readonly sourceDevice?: "mac" | "ipad" | "iphone" | "vision-pro";
  readonly shortcutName?: string; readonly handoffTokenHash?: string;
  readonly restorePlan?: {
    readonly activityType: "cloud.toonstudio.handoff.canvas";
    readonly targetRoute: string; readonly continuityReady: boolean;
    readonly summaryKo: string; readonly summaryEn: string;
  };
}

export interface ToonStudioDeepLinkBuildInput {
  readonly action: AppleDeepLinkAction; readonly projectId: string; readonly episodeId?: string;
  readonly cutIndex?: number; readonly layerId?: string; readonly brushId?: string;
  readonly zoomPct?: number; readonly scrollY?: number;
  readonly sourceDevice?: "mac" | "ipad" | "iphone" | "vision-pro";
  readonly shortcutName?: string; readonly handoffTokenHash?: string;
}

export interface AppleWorkspaceInput {
  readonly formFactor: AppleFormFactor; readonly primaryDisplay: AppleDisplaySpec;
  readonly secondaryDisplay?: AppleCompanionDisplaySpec; readonly thermalState?: AppleThermalState;
  readonly lowPowerMode?: boolean; readonly activeInteraction?: AppleInteractionActivity;
  readonly forceTouchInput?: ForceTouchInput; readonly handoffDeepLink?: string;
  readonly visionProOptions?: { readonly viewingDistanceMeters?: number; readonly canvasWidthMeters?: number; readonly ergonomicTiltDeg?: number };
}

export interface AppleWorkspacePlan {
  readonly formFactor: AppleFormFactor; readonly colorSurface: DisplayP3SurfaceConfig;
  readonly proMotion: ProMotionFrameBudget; readonly forceTouch: ForceTouchMappingResult;
  readonly handoffSession: ParsedToonStudioDeepLink | null; readonly windows: readonly AppleWorkspaceWindow[];
  readonly universalControlBridge: { readonly enabled: boolean; readonly cursorEdge: "right" | "left" | "none"; readonly sharedClipboardDragDrop: boolean };
  readonly visionProLayout: VisionProSpatialLayout | null;
  readonly canvasViewportRatioPct: number; readonly summaryKo: string; readonly summaryEn: string;
}

export type SPenAirActionGesture =
  | "single-press" | "double-press" | "hold-flick-up" | "hold-flick-down"
  | "hold-flick-left" | "hold-flick-right" | "circle-cw" | "circle-ccw" | "hover-preview";

export type SPenStudioCommand =
  | "brush-eraser-toggle" | "radial-quick-menu" | "brush-size-up" | "brush-size-down"
  | "undo" | "redo" | "canvas-rotate-cw" | "canvas-rotate-ccw" | "hover-cursor-preview";

export interface SPenAirActionInput {
  readonly gesture: SPenAirActionGesture; readonly hoverDistanceMm?: number;
  readonly tiltDeg?: number; readonly batteryPct?: number;
  readonly customBindings?: Readonly<Partial<Record<SPenAirActionGesture, SPenStudioCommand>>>;
}

export interface SPenAirActionResult {
  readonly gesture: SPenAirActionGesture; readonly command: SPenStudioCommand;
  readonly bleConnected: boolean; readonly batteryPct: number; readonly lowBatteryWarning: boolean;
  readonly hoverPreviewScale: number; readonly tiltAngleDeg: number;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface SamsungDexMonitorSpec {
  readonly connected: boolean; readonly widthPx: number; readonly heightPx: number; readonly scaleFactor?: number;
}

export interface SamsungDexDualLayout {
  readonly active: boolean;
  readonly externalMonitorCanvas: { readonly widthPx: number; readonly heightPx: number; readonly canvasViewportRatioPct: number; readonly dockMode: "floating-slim" | "hidden" };
  readonly deviceCompanionPad: {
    readonly mode: "spen-digitizer-pad" | "palette-and-layers-deck" | "standalone";
    readonly activeAreaAspectRatio: number; readonly aspectPreserved: boolean;
    readonly palmRejectionActive: boolean; readonly quickKeys: readonly string[];
  };
  readonly summaryKo: string; readonly summaryEn: string;
}

export type DevicePostureState = "continuous" | "folded";
export type FoldableFlexLayoutMode = "cover-screen" | "flex-mode-split" | "unfolded-tablet";

export interface FoldablePostureInput {
  readonly posture: DevicePostureState; readonly hingeAngleDeg: number;
  readonly screenWidthPx: number; readonly screenHeightPx: number;
  readonly creaseThicknessPx?: number; readonly foldOrientation?: "horizontal" | "vertical";
}

export interface FoldableFlexLayoutResult {
  readonly mode: FoldableFlexLayoutMode; readonly posture: DevicePostureState;
  readonly hingeAngleDeg: number; readonly foldOrientation: "horizontal" | "vertical";
  readonly topCanvasRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly creaseExclusionBandPx: { readonly start: number; readonly end: number; readonly thickness: number };
  readonly bottomControllerRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly controllerModules: readonly string[]; readonly canvasViewportRatioPct: number;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface AndroidShareTargetFile {
  readonly name: string; readonly mimeType: string; readonly sizeBytes: number;
}

export interface AndroidShareTargetInput {
  readonly title?: string; readonly text?: string; readonly url?: string;
  readonly sourceApp?: "quick-share" | "gallery" | "browser" | "notes" | "unknown";
  readonly files?: readonly AndroidShareTargetFile[];
}

export type ShareIntakeRoute = "reference-board" | "raster-layer" | "3d-prop-stage" | "bgm-sfx-tray" | "script-memo";

export interface NormalizedShareFile {
  readonly safeName: string; readonly mimeType: string; readonly sizeBytes: number; readonly targetRoute: ShareIntakeRoute;
}

export interface RejectedShareFile {
  readonly originalName: string;
  readonly reasonCode: "unsupported-mime" | "oversized-file" | "unsafe-filename" | "batch-limit-exceeded";
}

export interface NormalizedAndroidSharePayload {
  readonly sourceApp: "quick-share" | "gallery" | "browser" | "notes" | "unknown";
  readonly sanitizedTitle: string; readonly sanitizedText: string;
  readonly safeUrl: string | null; readonly rejectedUrlReason: string | null;
  readonly acceptedFiles: readonly NormalizedShareFile[]; readonly rejectedFiles: readonly RejectedShareFile[];
  readonly primaryRoute: ShareIntakeRoute; readonly summaryKo: string; readonly summaryEn: string;
}

export type GalaxyWatchDialMode = "brush-size" | "canvas-rotate" | "opacity" | "timeline-frame" | "zoom";

export interface GalaxyWatchBezelInput {
  readonly deltaTicks: number; readonly intervalMs: number;
  readonly mode: GalaxyWatchDialMode; readonly currentValue: number; readonly wearOsConnected?: boolean;
}

export interface GalaxyWatchBezelResult {
  readonly accepted: boolean; readonly mode: GalaxyWatchDialMode; readonly accelerationMultiplier: 1 | 2 | 4;
  readonly appliedDelta: number; readonly nextValue: number; readonly unit: string;
  readonly hapticDetents: number; readonly formattedReadout: string;
}

export interface GalaxyWorkspaceInput {
  readonly foldable: FoldablePostureInput; readonly dexMonitor?: SamsungDexMonitorSpec;
  readonly sPenInput?: SPenAirActionInput; readonly sharePayload?: AndroidShareTargetInput;
  readonly watchBezelInput?: GalaxyWatchBezelInput;
}

export interface GalaxyWorkspacePlan {
  readonly activeFormFactor: "samsung-dex-dual" | FoldableFlexLayoutMode;
  readonly flexPosture: FoldableFlexLayoutResult; readonly dexLayout: SamsungDexDualLayout;
  readonly sPenAction: SPenAirActionResult; readonly shareIntake: NormalizedAndroidSharePayload | null;
  readonly watchDial: GalaxyWatchBezelResult; readonly canvasViewportRatioPct: number;
  readonly summaryKo: string; readonly summaryEn: string;
}

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const SAFE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{6,64}$/;
const ALLOWED_DEEP_LINK_ACTIONS: ReadonlySet<AppleDeepLinkAction> = new Set(["open-project", "handoff-resume", "shortcut-run", "export-preset", "review-cut"]);
const ALLOWED_SOURCE_DEVICES = new Set(["mac", "ipad", "iphone", "vision-pro"] as const);
const MAX_SHARE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SHARE_BATCH_FILES = 12;

const ALLOWED_SHARE_MIMES: Readonly<Record<string, ShareIntakeRoute>> = {
  "image/png": "raster-layer", "image/jpeg": "reference-board", "image/webp": "reference-board",
  "image/svg+xml": "raster-layer", "image/openraster": "raster-layer", "image/vnd.adobe.photoshop": "raster-layer",
  "model/gltf-binary": "3d-prop-stage", "audio/mpeg": "bgm-sfx-tray", "audio/wav": "bgm-sfx-tray", "application/json": "script-memo",
};

const DEFAULT_SPEN_BINDINGS: Readonly<Record<SPenAirActionGesture, SPenStudioCommand>> = {
  "single-press": "brush-eraser-toggle", "double-press": "radial-quick-menu",
  "hold-flick-up": "brush-size-up", "hold-flick-down": "brush-size-down",
  "hold-flick-left": "undo", "hold-flick-right": "redo",
  "circle-cw": "canvas-rotate-cw", "circle-ccw": "canvas-rotate-ccw", "hover-preview": "hover-cursor-preview",
};

const WATCH_DIAL_SPECS: Readonly<
  Record<GalaxyWatchDialMode, { readonly step: number; readonly min: number; readonly max: number; readonly wrap?: boolean; readonly unit: string }>
> = {
  "brush-size": { step: 2, min: 1, max: 300, unit: "px" },
  "canvas-rotate": { step: 5, min: 0, max: 360, wrap: true, unit: "deg" },
  opacity: { step: 2, min: 0, max: 100, unit: "%" },
  "timeline-frame": { step: 1, min: 1, max: 999, unit: "f" },
  zoom: { step: 10, min: 10, max: 800, unit: "%" },
};

function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function round2(value: number): number { return Math.round(value * 100) / 100; }

function stripControlChars(raw: string, maxLen: number): string {
  let out = "";
  for (let i = 0; i < raw.length && out.length < maxLen; i += 1) {
    const code = raw.charCodeAt(i);
    if (code >= 32 && code !== 127) out += raw[i];
  }
  return out.trim();
}

/** Display-P3 광색역 캔버스/WebGPU 표면 구성과 혼합 색역 경고를 산출한다. */
export function resolveDisplayP3SurfaceConfig(primary: AppleDisplaySpec, secondary?: AppleCompanionDisplaySpec): DisplayP3SurfaceConfig {
  const useP3 = primary.supportsDisplayP3;
  const colorSpace: AppleColorSpace = useP3 ? "display-p3" : "srgb";
  const hdrHeadroom = useP3 ? round2(clamp(primary.hdrHeadroom ?? 1.6, 1.0, 4.0)) : 1.0;
  const mixedGamutWarning = Boolean(secondary && primary.supportsDisplayP3 !== secondary.supportsDisplayP3);
  return {
    colorSpace, canvas2dContextOptions: { colorSpace, willReadFrequently: false },
    webGpuFormat: useP3 && hdrHeadroom > 1.05 ? "rgba16float" : "bgra8unorm",
    toneMappingMode: useP3 && hdrHeadroom > 1.05 ? "extended" : "standard",
    hdrHeadroom, gamutVolumeVsSrgbPct: useP3 ? 125.5 : 100, mixedGamutWarning,
    fallbackMappingPolicy: mixedGamutWarning ? "perceptual-clip" : "relative-colorimetric",
  };
}

/** ProMotion 120Hz 가변 주사율 프레임 예산과 예측 포인터 수평선을 계산한다. */
export function computeProMotionFrameBudget(
  maxRefreshHz: 60 | 120, activity: AppleInteractionActivity, thermalState: AppleThermalState = "nominal", lowPowerMode = false,
): ProMotionFrameBudget {
  let targetHz: ProMotionFrameBudget["targetHz"] = maxRefreshHz === 120 ? 120 : 60;
  let throttled = false;
  if (activity === "idle") targetHz = maxRefreshHz === 120 ? 24 : 30;
  else if (lowPowerMode || thermalState === "critical") { targetHz = thermalState === "critical" ? 48 : 60; throttled = maxRefreshHz === 120 || thermalState === "critical"; }
  else if (thermalState === "serious") { targetHz = 60; throttled = maxRefreshHz === 120; }
  else if (thermalState === "fair" && activity !== "drawing") { targetHz = maxRefreshHz === 120 ? 80 : 60; throttled = maxRefreshHz === 120; }

  const frameBudgetMs = round2(1000 / targetHz);
  return {
    targetHz, frameBudgetMs, predictedPointerHorizonMs: activity === "drawing" ? frameBudgetMs : 0,
    useCoalescedEvents: activity === "drawing" || activity === "panning", throttledBySystem: throttled,
    rationaleKo: activity === "idle" ? `유휴 구간 ProMotion ${targetHz}Hz 절전 강등 (${frameBudgetMs}ms 예산)` : throttled ? `열/저전력 제한으로 ${targetHz}Hz 안정화 (${frameBudgetMs}ms 예산)` : `ProMotion ${targetHz}Hz 초저지연 스트로크 동기화 (${frameBudgetMs}ms 예산)`,
    rationaleEn: activity === "idle" ? `Idle ProMotion power step-down to ${targetHz}Hz (${frameBudgetMs}ms budget)` : throttled ? `Thermal/low-power cap stabilized at ${targetHz}Hz (${frameBudgetMs}ms budget)` : `ProMotion ${targetHz}Hz low-latency stroke cadence (${frameBudgetMs}ms budget)`,
  };
}

/** macOS Force Touch 트랙패드 압력 단계(0/1/2)를 스튜디오 명령·햅틱 패턴으로 매핑한다. */
export function mapForceTouchTrackpadGesture(input: ForceTouchInput): ForceTouchMappingResult {
  const force = clamp(input.webkitForce, 0, 3);
  const fingers = input.fingerCount ?? 1;
  const modifier = input.modifier ?? "none";
  if (force < 1) return { stage: 0, normalizedPressure: 0, studioCommand: "hover", hapticPattern: "none", summaryKo: "트랙패드 호버 대기 (압력 0%)", summaryEn: "Trackpad hover standby (0% pressure)" };
  if (force < 2) {
    const pressure = round2(clamp(force - 1, 0, 1));
    return { stage: 1, normalizedPressure: pressure, studioCommand: "pressure-stroke", hapticPattern: "alignment-detent", summaryKo: `1단계 클릭 압력 스트로크 (${Math.round(pressure * 100)}%)`, summaryEn: `Stage 1 analog pressure stroke (${Math.round(pressure * 100)}%)` };
  }
  const deepPressure = round2(clamp(0.75 + (force - 2) * 0.25, 0.75, 1));
  if (fingers === 2) return { stage: 2, normalizedPressure: deepPressure, studioCommand: "zoom-fit-toggle", hapticPattern: "firm-generic", summaryKo: "2손가락 딥 포스 클릭 → 캔버스 화면 맞춤 전환", summaryEn: "Two-finger deep Force Click -> Zoom-to-Fit toggle" };
  if (fingers === 3) return { stage: 2, normalizedPressure: deepPressure, studioCommand: "radial-palette-peek", hapticPattern: "firm-generic", summaryKo: "3손가락 딥 포스 클릭 → 원형 팔레트 피크", summaryEn: "Three-finger deep Force Click -> Radial palette peek" };
  if (modifier === "option") return { stage: 2, normalizedPressure: deepPressure, studioCommand: "quick-look-reference", hapticPattern: "firm-generic", summaryKo: "Option + 포스 클릭 → 레퍼런스 Quick Look 미리보기", summaryEn: "Option + Force Click -> Reference Quick Look preview" };
  if (input.paintingMode) return { stage: 2, normalizedPressure: deepPressure, studioCommand: "pressure-boost", hapticPattern: "firm-generic", summaryKo: `딥 포스 클릭 → 브러시 최대 필압 부스트 (${Math.round(deepPressure * 100)}%)`, summaryEn: `Deep Force Click -> Brush max pressure boost (${Math.round(deepPressure * 100)}%)` };
  return { stage: 2, normalizedPressure: deepPressure, studioCommand: "eyedropper-loupe", hapticPattern: "firm-generic", summaryKo: "포스 클릭 → 정밀 스포이드 돋보기 실행", summaryEn: "Force Click -> Precision eyedropper loupe" };
}

/** `toonstudio://` Apple 단축어·Handoff 딥링크를 안전하게 파싱하고 세션 복원 계획을 만든다. */
export function parseToonStudioDeepLink(rawUrl: string): ParsedToonStudioDeepLink {
  const trimmed = rawUrl.trim();
  if (!trimmed || /[<>"'`\\\r\n]/.test(trimmed) || trimmed.includes("..")) {
    return { valid: false, rawUrl, errorCode: "unsafe-character" };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, rawUrl, errorCode: "invalid-url" };
  }
  if (parsed.protocol.toLowerCase() !== "toonstudio:") return { valid: false, rawUrl, errorCode: "disallowed-scheme" };

  const hostAction = parsed.hostname.toLowerCase() as AppleDeepLinkAction;
  if (!ALLOWED_DEEP_LINK_ACTIONS.has(hostAction)) return { valid: false, rawUrl, errorCode: "unsupported-action" };

  const projectId = parsed.searchParams.get("projectId") ?? parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  if (!SAFE_ID_REGEX.test(projectId)) return { valid: false, rawUrl, errorCode: "invalid-project-id" };

  const pickSafeId = (key: string): string | undefined => {
    const val = parsed.searchParams.get(key);
    return val && SAFE_ID_REGEX.test(val) ? val : undefined;
  };
  const pickInt = (key: string, min: number, max: number): number | undefined => {
    const raw = parsed.searchParams.get(key);
    return raw !== null && /^\d+$/.test(raw) ? clamp(Number(raw), min, max) : undefined;
  };

  const episodeId = pickSafeId("episodeId");
  const layerId = pickSafeId("layerId");
  const brushId = pickSafeId("brushId");
  const cutIndex = pickInt("cut", 1, 999);
  const zoomPct = pickInt("zoom", 10, 800);
  const scrollY = pickInt("scrollY", 0, 200000);
  const deviceRaw = parsed.searchParams.get("sourceDevice");
  const sourceDevice =
    deviceRaw && ALLOWED_SOURCE_DEVICES.has(deviceRaw as "mac" | "ipad" | "iphone" | "vision-pro")
      ? (deviceRaw as "mac" | "ipad" | "iphone" | "vision-pro")
      : undefined;
  const shortcutRaw = parsed.searchParams.get("shortcut");
  const shortcutName = shortcutRaw ? stripControlChars(shortcutRaw, 48) : undefined;
  const tokenRaw = parsed.searchParams.get("handoffToken");
  const handoffTokenHash = tokenRaw && SAFE_TOKEN_REGEX.test(tokenRaw) ? tokenRaw : undefined;

  const targetRoute = `/studio/${projectId}${episodeId ? `/episode/${episodeId}` : ""}`;
  return {
    valid: true, rawUrl: trimmed, action: hostAction, projectId, episodeId, cutIndex, layerId, brushId, zoomPct, scrollY,
    sourceDevice, shortcutName, handoffTokenHash,
    restorePlan: {
      activityType: "cloud.toonstudio.handoff.canvas",
      targetRoute,
      continuityReady: hostAction === "handoff-resume" || Boolean(sourceDevice),
      summaryKo: `${sourceDevice ?? "apple"} 세션 복원 준비: ${projectId}${cutIndex ? ` · ${cutIndex}컷` : ""}${zoomPct ? ` · ${zoomPct}%` : ""}`,
      summaryEn: `Restore ready from ${sourceDevice ?? "apple"}: ${projectId}${cutIndex ? ` · Cut ${cutIndex}` : ""}${zoomPct ? ` · ${zoomPct}%` : ""}`,
    },
  };
}

/** 단축어·Handoff용 정규화된 `toonstudio://` 딥링크를 생성한다. */
export function buildToonStudioDeepLink(input: ToonStudioDeepLinkBuildInput): string {
  const params = new URLSearchParams();
  params.set("projectId", SAFE_ID_REGEX.test(input.projectId) ? input.projectId : "studio-default");
  if (input.episodeId && SAFE_ID_REGEX.test(input.episodeId)) params.set("episodeId", input.episodeId);
  if (typeof input.cutIndex === "number" && Number.isFinite(input.cutIndex)) params.set("cut", String(Math.round(clamp(input.cutIndex, 1, 999))));
  if (input.layerId && SAFE_ID_REGEX.test(input.layerId)) params.set("layerId", input.layerId);
  if (input.brushId && SAFE_ID_REGEX.test(input.brushId)) params.set("brushId", input.brushId);
  if (typeof input.zoomPct === "number" && Number.isFinite(input.zoomPct)) params.set("zoom", String(Math.round(clamp(input.zoomPct, 10, 800))));
  if (typeof input.scrollY === "number" && Number.isFinite(input.scrollY)) params.set("scrollY", String(Math.round(clamp(input.scrollY, 0, 200000))));
  if (input.sourceDevice) params.set("sourceDevice", input.sourceDevice);
  if (input.shortcutName) params.set("shortcut", stripControlChars(input.shortcutName, 48));
  if (input.handoffTokenHash && SAFE_TOKEN_REGEX.test(input.handoffTokenHash)) params.set("handoffToken", input.handoffTokenHash);
  return `toonstudio://${input.action}?${params.toString()}`;
}

/** Apple Vision Pro 3-창 공간 배치(중앙 캔버스 · 좌측 도구/레이어 · 우측 3D 레퍼런스)를 계산한다. */
export function buildVisionProSpatialWindows(options?: {
  readonly viewingDistanceMeters?: number; readonly canvasWidthMeters?: number;
  readonly ergonomicTiltDeg?: number; readonly colorSpace?: AppleColorSpace;
}): VisionProSpatialLayout {
  const dist = round2(clamp(options?.viewingDistanceMeters ?? 1.65, 1.0, 2.5));
  const mainWidth = round2(clamp(options?.canvasWidthMeters ?? 1.28, 0.85, 1.8));
  const mainHeight = round2(mainWidth * 0.62);
  const pitch = round2(clamp(options?.ergonomicTiltDeg ?? -5, -14, 6));
  const wingOffsetX = round2(mainWidth * 0.5 + 0.28);
  const wingZ = round2(-(dist - 0.14));
  const colorSpace: AppleColorSpace = options?.colorSpace ?? "display-p3";
  const totalHorizontalSpanDeg = round2((2 * Math.atan2(wingOffsetX + 0.22, dist) * 180) / Math.PI);

  return {
    viewingDistanceMeters: dist,
    totalHorizontalSpanDeg,
    withinErgonomicNeckLimit: totalHorizontalSpanDeg <= 72,
    windows: [
      {
        windowId: "left-tools-layers", titleKo: "좌측 브러시·레이어 공간 레일", titleEn: "Left Brush & Layers Spatial Rail",
        widthMeters: 0.42, heightMeters: round2(mainHeight * 0.9), positionMeters: { x: -wingOffsetX, y: 0, z: wingZ },
        yawDeg: 22, pitchDeg: pitch, gazeHoverMarginPt: 18, colorSpace,
      },
      {
        windowId: "main-canvas", titleKo: "중앙 Display-P3 메인 캔버스", titleEn: "Center Display-P3 Main Canvas",
        widthMeters: mainWidth, heightMeters: mainHeight, positionMeters: { x: 0, y: 0.04, z: -dist },
        yawDeg: 0, pitchDeg: pitch, gazeHoverMarginPt: 16, colorSpace,
      },
      {
        windowId: "right-reference-3d", titleKo: "우측 3D 배경·스토리바이블 스테이지", titleEn: "Right 3D Reference & Story-Bible Stage",
        widthMeters: 0.48, heightMeters: round2(mainHeight * 0.92), positionMeters: { x: wingOffsetX, y: 0, z: wingZ },
        yawDeg: -22, pitchDeg: pitch, gazeHoverMarginPt: 18, colorSpace,
      },
    ],
  };
}

/** Apple 생태계 5종(Stage Manager/Universal Control · Display-P3 · ProMotion · Force Touch · Handoff/Vision Pro) 통합 플랜. */
export function buildAppleWorkspacePlan(input: AppleWorkspaceInput): AppleWorkspacePlan {
  const colorSurface = resolveDisplayP3SurfaceConfig(input.primaryDisplay, input.secondaryDisplay);
  const proMotion = computeProMotionFrameBudget(
    input.primaryDisplay.maxRefreshHz,
    input.activeInteraction ?? "drawing",
    input.thermalState ?? "nominal",
    input.lowPowerMode ?? false,
  );
  const forceTouch = mapForceTouchTrackpadGesture(input.forceTouchInput ?? { webkitForce: 1.45, fingerCount: 1 });
  const handoffSession = input.handoffDeepLink ? parseToonStudioDeepLink(input.handoffDeepLink) : null;

  const w = Math.max(640, Math.round(input.primaryDisplay.widthPx));
  const h = Math.max(480, Math.round(input.primaryDisplay.heightPx));
  const topBarH = 44;
  const windows: AppleWorkspaceWindow[] = [];
  let visionProLayout: VisionProSpatialLayout | null = null;
  let canvasViewportRatioPct: number;

  if (input.formFactor === "vision-pro-spatial") {
    visionProLayout = buildVisionProSpatialWindows({ ...input.visionProOptions, colorSpace: colorSurface.colorSpace });
    canvasViewportRatioPct = 90;
    windows.push({ windowId: "vision-center-stage", displayTarget: "primary", role: "main-canvas", xPx: 0, yPx: topBarH, widthPx: w, heightPx: h - topBarH, minTouchTargetPt: 48 });
  } else if (input.formFactor === "mac-universal-control" || input.formFactor === "mac-ipad-sidecar") {
    const primaryCanvasW = Math.round(w * 0.88);
    windows.push(
      { windowId: "mac-main-canvas", displayTarget: "primary", role: "main-canvas", xPx: 0, yPx: topBarH, widthPx: primaryCanvasW, heightPx: h - topBarH, minTouchTargetPt: 44 },
      { windowId: "mac-tools-rail", displayTarget: "primary", role: "tools-layers", xPx: primaryCanvasW, yPx: topBarH, widthPx: w - primaryCanvasW, heightPx: h - topBarH, minTouchTargetPt: 44 },
    );
    if (input.secondaryDisplay) {
      windows.push({
        windowId: "ipad-companion-deck", displayTarget: "secondary",
        role: input.formFactor === "mac-ipad-sidecar" ? "main-canvas" : "reference-palette",
        xPx: 0, yPx: 0, widthPx: Math.round(input.secondaryDisplay.widthPx), heightPx: Math.round(input.secondaryDisplay.heightPx), minTouchTargetPt: 44,
      });
    }
    canvasViewportRatioPct = round2(((primaryCanvasW * (h - topBarH)) / (w * h)) * 100);
  } else {
    const canvasW = input.secondaryDisplay ? w : Math.round(w * 0.86);
    windows.push({ windowId: "ipad-stage-canvas", displayTarget: "primary", role: "main-canvas", xPx: 0, yPx: topBarH, widthPx: canvasW, heightPx: h - topBarH, minTouchTargetPt: 44 });
    if (input.secondaryDisplay) {
      windows.push({ windowId: "stage-external-reference", displayTarget: "secondary", role: "reference-palette", xPx: 0, yPx: 0, widthPx: Math.round(input.secondaryDisplay.widthPx), heightPx: Math.round(input.secondaryDisplay.heightPx), minTouchTargetPt: 44 });
    } else {
      windows.push({ windowId: "ipad-stage-palette", displayTarget: "primary", role: "tools-layers", xPx: canvasW, yPx: topBarH, widthPx: w - canvasW, heightPx: h - topBarH, minTouchTargetPt: 44 });
    }
    canvasViewportRatioPct = round2(((canvasW * (h - topBarH)) / (w * h)) * 100);
  }

  const universalControlEnabled = input.formFactor === "mac-universal-control" && Boolean(input.secondaryDisplay);
  return {
    formFactor: input.formFactor, colorSurface, proMotion, forceTouch, handoffSession, windows,
    universalControlBridge: { enabled: universalControlEnabled, cursorEdge: universalControlEnabled ? "right" : "none", sharedClipboardDragDrop: universalControlEnabled },
    visionProLayout, canvasViewportRatioPct,
    summaryKo: `${input.formFactor} · ${colorSurface.colorSpace} · ProMotion ${proMotion.targetHz}Hz · 캔버스 ${canvasViewportRatioPct}%`,
    summaryEn: `${input.formFactor} · ${colorSurface.colorSpace} · ProMotion ${proMotion.targetHz}Hz · Canvas ${canvasViewportRatioPct}%`,
  };
}

/** S-Pen 에어 액션 BLE 제스처와 호버 거리·기울기를 스튜디오 명령으로 매핑한다. */
export function mapSPenAirActionGesture(input: SPenAirActionInput): SPenAirActionResult {
  const command = input.customBindings?.[input.gesture] ?? DEFAULT_SPEN_BINDINGS[input.gesture];
  const batteryPct = Math.round(clamp(input.batteryPct ?? 88, 0, 100));
  const hoverMm = clamp(input.hoverDistanceMm ?? 6, 0, 18);
  const tiltAngleDeg = round2(clamp(input.tiltDeg ?? 28, 0, 65));
  return {
    gesture: input.gesture, command, bleConnected: batteryPct > 0, batteryPct, lowBatteryWarning: batteryPct <= 15,
    hoverPreviewScale: round2(clamp(1.25 - hoverMm * 0.03 + tiltAngleDeg * 0.004, 0.7, 1.55)),
    tiltAngleDeg,
    summaryKo: `S-Pen [${input.gesture}] → ${command} (배터리 ${batteryPct}% · 기울기 ${tiltAngleDeg}°)`,
    summaryEn: `S-Pen [${input.gesture}] -> ${command} (Battery ${batteryPct}% · Tilt ${tiltAngleDeg}deg)`,
  };
}

/** Samsung DeX 외부 모니터 분리 레이아웃과 단말 S-Pen 디지타이저 패드 비율을 계산한다. */
export function buildSamsungDexDualLayout(
  monitor: SamsungDexMonitorSpec | undefined,
  deviceWidthPx: number,
  deviceHeightPx: number,
): SamsungDexDualLayout {
  if (!monitor || !monitor.connected) {
    return {
      active: false,
      externalMonitorCanvas: { widthPx: Math.round(deviceWidthPx), heightPx: Math.round(deviceHeightPx), canvasViewportRatioPct: 84, dockMode: "hidden" },
      deviceCompanionPad: { mode: "standalone", activeAreaAspectRatio: round2(deviceWidthPx / Math.max(1, deviceHeightPx)), aspectPreserved: true, palmRejectionActive: true, quickKeys: ["undo", "redo", "eyedropper"] },
      summaryKo: "Samsung DeX 미연결 — 단일 기기 드로잉 모드",
      summaryEn: "Samsung DeX disconnected — Standalone device drawing mode",
    };
  }
  const extW = Math.max(1280, Math.round(monitor.widthPx));
  const extH = Math.max(720, Math.round(monitor.heightPx));
  const canvasRatio = round2(((extW * (extH - 44)) / (extW * extH)) * 100);
  const companionMode = Math.max(deviceWidthPx, deviceHeightPx) >= 1400 ? "spen-digitizer-pad" : "palette-and-layers-deck";
  return {
    active: true,
    externalMonitorCanvas: { widthPx: extW, heightPx: extH - 44, canvasViewportRatioPct: canvasRatio, dockMode: "floating-slim" },
    deviceCompanionPad: { mode: companionMode, activeAreaAspectRatio: round2(extW / extH), aspectPreserved: true, palmRejectionActive: true, quickKeys: ["undo", "redo", "eyedropper", "space-pan", "flip-horizontal"] },
    summaryKo: `DeX 듀얼스크린 활성: 외부 ${extW}×${extH} 캔버스(${canvasRatio}%) + 단말 S-Pen 패드`,
    summaryEn: `DeX Dual-Screen active: External ${extW}x${extH} canvas (${canvasRatio}%) + Device S-Pen pad`,
  };
}

/** Galaxy Z Fold DevicePosture·힌지 각도 기준 Flex Mode(상단 캔버스/하단 컨트롤러) 자동 전환. */
export function evaluateFoldableFlexPosture(input: FoldablePostureInput): FoldableFlexLayoutResult {
  const angle = round2(clamp(input.hingeAngleDeg, 0, 180));
  const width = Math.max(360, Math.round(input.screenWidthPx));
  const height = Math.max(600, Math.round(input.screenHeightPx));
  const crease = Math.round(clamp(input.creaseThicknessPx ?? 28, 12, 64));
  const foldOrientation = input.foldOrientation ?? "horizontal";

  if (angle < 25) {
    return {
      mode: "cover-screen", posture: "folded", hingeAngleDeg: angle, foldOrientation,
      topCanvasRect: { x: 0, y: 44, width, height: height - 44 },
      creaseExclusionBandPx: { start: 0, end: 0, thickness: 0 }, bottomControllerRect: null,
      controllerModules: ["quick-memo-pen", "undo"],
      canvasViewportRatioPct: round2(((height - 44) / height) * 100),
      summaryKo: `커버 화면 퀵 메모 모드 (힌지 ${angle}°)`, summaryEn: `Cover screen quick-memo mode (Hinge ${angle}deg)`,
    };
  }

  if ((angle >= 25 && angle <= 145) || (input.posture === "folded" && angle <= 155)) {
    const creaseStart = Math.round(height / 2) - Math.floor(crease / 2);
    const creaseEnd = creaseStart + crease;
    const topHeight = Math.max(200, creaseStart - 44);
    const bottomHeight = Math.max(180, height - creaseEnd);
    return {
      mode: "flex-mode-split", posture: "folded", hingeAngleDeg: angle, foldOrientation,
      topCanvasRect: { x: 0, y: 44, width, height: topHeight },
      creaseExclusionBandPx: { start: creaseStart, end: creaseEnd, thickness: crease },
      bottomControllerRect: { x: 0, y: creaseEnd, width, height: bottomHeight },
      controllerModules: ["color-wheel", "brush-size-opacity", "timeline-scrub", "spen-quick-keys"],
      canvasViewportRatioPct: round2((topHeight / height) * 100),
      summaryKo: `Z Fold Flex Mode 활성 (${angle}°): 상단 캔버스 ${topHeight}px · 힌지 보호대 ${crease}px · 하단 컨트롤러 ${bottomHeight}px`,
      summaryEn: `Z Fold Flex Mode active (${angle}deg): Top canvas ${topHeight}px · Crease guard ${crease}px · Bottom deck ${bottomHeight}px`,
    };
  }

  const canvasW = width - Math.round(width * 0.14);
  const canvasH = height - 44;
  const ratio = round2(((canvasW * canvasH) / (width * height)) * 100);
  return {
    mode: "unfolded-tablet", posture: "continuous", hingeAngleDeg: angle, foldOrientation,
    topCanvasRect: { x: 0, y: 44, width: canvasW, height: canvasH },
    creaseExclusionBandPx: { start: 0, end: 0, thickness: 0 }, bottomControllerRect: null,
    controllerModules: ["floating-side-rail"], canvasViewportRatioPct: ratio,
    summaryKo: `완전 펼침 태블릿 캔버스 (${angle}° · 캔버스 ${ratio}%)`, summaryEn: `Unfolded tablet canvas (${angle}deg · Canvas ${ratio}%)`,
  };
}

/** Android PWA Share Target / Quick Share 수신 페이로드를 보안 검증·정규화한다. */
export function normalizeAndroidShareTargetPayload(input: AndroidShareTargetInput): NormalizedAndroidSharePayload {
  const sourceApp = input.sourceApp ?? "quick-share";
  const sanitizedTitle = stripControlChars(input.title ?? "", 120);
  const sanitizedText = stripControlChars(input.text ?? "", 2000);
  let safeUrl: string | null = null;
  let rejectedUrlReason: string | null = null;

  if (input.url && input.url.trim().length > 0) {
    const candidate = input.url.trim();
    try {
      const proto = new URL(candidate).protocol.toLowerCase();
      if (proto === "https:" || proto === "toonstudio:") safeUrl = candidate;
      else rejectedUrlReason = `disallowed-url-scheme:${proto}`;
    } catch {
      rejectedUrlReason = "invalid-url";
    }
  }

  const acceptedFiles: NormalizedShareFile[] = [];
  const rejectedFiles: RejectedShareFile[] = [];
  for (const file of input.files ?? []) {
    if (acceptedFiles.length >= MAX_SHARE_BATCH_FILES) { rejectedFiles.push({ originalName: file.name, reasonCode: "batch-limit-exceeded" }); continue; }
    const cleanName = stripControlChars(file.name, 140);
    if (!cleanName || cleanName.includes("..") || cleanName.includes("/") || cleanName.includes("\\")) { rejectedFiles.push({ originalName: file.name, reasonCode: "unsafe-filename" }); continue; }
    const normalizedMime = file.mimeType.trim().toLowerCase();
    const targetRoute = ALLOWED_SHARE_MIMES[normalizedMime];
    if (!targetRoute) { rejectedFiles.push({ originalName: file.name, reasonCode: "unsupported-mime" }); continue; }
    if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > MAX_SHARE_FILE_BYTES) { rejectedFiles.push({ originalName: file.name, reasonCode: "oversized-file" }); continue; }
    acceptedFiles.push({ safeName: cleanName, mimeType: normalizedMime, sizeBytes: Math.round(file.sizeBytes), targetRoute });
  }

  const primaryRoute: ShareIntakeRoute = acceptedFiles[0]?.targetRoute ?? (safeUrl || sanitizedText ? "script-memo" : "reference-board");
  return {
    sourceApp, sanitizedTitle, sanitizedText, safeUrl, rejectedUrlReason, acceptedFiles, rejectedFiles, primaryRoute,
    summaryKo: `${sourceApp} 수신 완료: 허용 ${acceptedFiles.length}건 · 차단 ${rejectedFiles.length}건 → ${primaryRoute}`,
    summaryEn: `${sourceApp} intake complete: Accepted ${acceptedFiles.length} · Blocked ${rejectedFiles.length} -> ${primaryRoute}`,
  };
}

/** Galaxy Watch 회전 베젤 틱 입력을 속도 가중 스튜디오 다이얼 제어로 변환한다. */
export function mapGalaxyWatchBezelTick(input: GalaxyWatchBezelInput): GalaxyWatchBezelResult {
  const spec = WATCH_DIAL_SPECS[input.mode];
  if (!(input.wearOsConnected ?? true) || input.deltaTicks === 0 || !Number.isFinite(input.deltaTicks) || input.intervalMs < 12) {
    return { accepted: false, mode: input.mode, accelerationMultiplier: 1, appliedDelta: 0, nextValue: input.currentValue, unit: spec.unit, hapticDetents: 0, formattedReadout: `${round2(input.currentValue)}${spec.unit}` };
  }
  const ticks = Math.trunc(clamp(input.deltaTicks, -24, 24));
  const accelerationMultiplier: 1 | 2 | 4 = input.intervalMs < 45 ? 4 : input.intervalMs < 110 ? 2 : 1;
  const appliedDelta = ticks * spec.step * accelerationMultiplier;
  const rawNext = spec.wrap ? (((input.currentValue + appliedDelta) % 360) + 360) % 360 : clamp(input.currentValue + appliedDelta, spec.min, spec.max);
  const nextValue = round2(rawNext);
  return {
    accepted: true, mode: input.mode, accelerationMultiplier, appliedDelta, nextValue, unit: spec.unit,
    hapticDetents: Math.min(6, Math.abs(ticks)), formattedReadout: `${nextValue}${spec.unit}`,
  };
}

/** Android · Galaxy 5종(S-Pen · DeX · Z Fold Flex · Share Target · Watch 베젤) 통합 워크스페이스 플랜. */
export function buildGalaxyWorkspacePlan(input: GalaxyWorkspaceInput): GalaxyWorkspacePlan {
  const flexPosture = evaluateFoldableFlexPosture(input.foldable);
  const dexLayout = buildSamsungDexDualLayout(input.dexMonitor, input.foldable.screenWidthPx, input.foldable.screenHeightPx);
  const sPenAction = mapSPenAirActionGesture(input.sPenInput ?? { gesture: "single-press", batteryPct: 92 });
  const shareIntake = input.sharePayload ? normalizeAndroidShareTargetPayload(input.sharePayload) : null;
  const watchDial = mapGalaxyWatchBezelTick(input.watchBezelInput ?? { deltaTicks: 1, intervalMs: 95, mode: "brush-size", currentValue: 24 });
  const activeFormFactor = dexLayout.active ? "samsung-dex-dual" : flexPosture.mode;
  const canvasViewportRatioPct = dexLayout.active ? dexLayout.externalMonitorCanvas.canvasViewportRatioPct : flexPosture.canvasViewportRatioPct;
  return {
    activeFormFactor, flexPosture, dexLayout, sPenAction, shareIntake, watchDial, canvasViewportRatioPct,
    summaryKo: `${activeFormFactor} · S-Pen(${sPenAction.command}) · 캔버스 ${canvasViewportRatioPct}%`,
    summaryEn: `${activeFormFactor} · S-Pen(${sPenAction.command}) · Canvas ${canvasViewportRatioPct}%`,
  };
}

export const DEFAULT_APPLE_WORKSPACE_INPUT: AppleWorkspaceInput = {
  formFactor: "mac-universal-control",
  primaryDisplay: { widthPx: 2560, heightPx: 1440, scaleFactor: 2, supportsDisplayP3: true, hdrHeadroom: 1.8, maxRefreshHz: 120 },
  secondaryDisplay: { role: "ipad-companion", widthPx: 1366, heightPx: 1024, supportsDisplayP3: true },
  thermalState: "nominal",
  activeInteraction: "drawing",
  forceTouchInput: { webkitForce: 2.2, fingerCount: 1, modifier: "none" },
  handoffDeepLink: "toonstudio://handoff-resume?projectId=rain-contract&episodeId=ep03&cut=14&zoom=145&sourceDevice=ipad",
};

export const DEFAULT_GALAXY_WORKSPACE_INPUT: GalaxyWorkspaceInput = {
  foldable: { posture: "folded", hingeAngleDeg: 112, screenWidthPx: 1856, screenHeightPx: 2160, creaseThicknessPx: 28, foldOrientation: "horizontal" },
  dexMonitor: { connected: false, widthPx: 2560, heightPx: 1440, scaleFactor: 1 },
  sPenInput: { gesture: "hold-flick-left", hoverDistanceMm: 5, tiltDeg: 32, batteryPct: 86 },
  sharePayload: {
    sourceApp: "quick-share",
    title: "3화 옥상 배경 레퍼런스",
    text: "비 오는 네온 골목 조명 참고",
    url: "https://refs.toonstudio.cloud/boards/rain-alley",
    files: [
      { name: "rooftop-ref.webp", mimeType: "image/webp", sizeBytes: 1_480_000 },
      { name: "street-lamp.glb", mimeType: "model/gltf-binary", sizeBytes: 4_200_000 },
    ],
  },
  watchBezelInput: { deltaTicks: 2, intervalMs: 80, mode: "brush-size", currentValue: 22 },
};

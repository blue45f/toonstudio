/**
 * macOS / Apple Silicon / iPad ProMotion·Display-P3 프로파일러,
 * Mac 포스터치 트랙패드·Sidecar·Continuity Camera 핸드오프 및
 * Apple Watch / Wear OS / 스마트 링 Web Bluetooth BLE 컴패니언 엔진 (Wave 28).
 * 실전 웹 표준 전용 · 순수 메모리 상태 전용 · 비의료 작업시간 휴식 안내 전용.
 */

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const roundTo = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeAngleSigned = (deg: number): number => {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = (((deg + 180) % 360) + 360) % 360 - 180;
  return roundTo(wrapped === -180 ? 180 : wrapped, 1);
};

// === 1. macOS / Apple Silicon / iPad 환경 최적화 프로파일러 ===

export type AppleDeviceClass = "mac-apple-silicon" | "mac-intel" | "ipad-pro-air" | "desktop-generic" | "mobile-generic";
export type DisplayColorGamut = "rec2020" | "display-p3" | "srgb";
export type CanvasColorSpaceId = "display-p3" | "srgb";
export type StrokeCoalescingMode = "coalesced-120hz" | "standard-60hz" | "power-save-60hz";

export interface MediaQueryProbeResult { readonly matches: boolean; }
export interface AppleCreativeProbeEnv {
  readonly userAgent?: string; readonly platform?: string; readonly maxTouchPoints?: number;
  readonly devicePixelRatio?: number; readonly hardwareConcurrency?: number; readonly measuredRefreshHz?: number;
  readonly webGpuAvailable?: boolean; readonly webBluetoothAvailable?: boolean; readonly captureCameraAvailable?: boolean;
  readonly matchMedia?: (query: string) => MediaQueryProbeResult;
}
export interface AppleCreativeCapabilities {
  readonly deviceClass: AppleDeviceClass; readonly isAppleSiliconLikely: boolean; readonly isIpadOs: boolean;
  readonly colorGamut: DisplayColorGamut; readonly displayP3Supported: boolean; readonly canvasColorSpace: CanvasColorSpaceId;
  readonly hdrDynamicRange: "high" | "standard"; readonly refreshRateHz: number; readonly isProMotion120Hz: boolean;
  readonly frameBudgetMs: number; readonly tileFlushBudgetMs: number; readonly inkPredictionLeadMs: number;
  readonly strokeCoalescingMode: StrokeCoalescingMode; readonly recommendedBrushBufferDepth: number;
  readonly devicePixelRatio: number; readonly reducedMotionPreferred: boolean;
  readonly supportsForceTouchTrackpad: boolean; readonly supportsApplePencilHover: boolean;
  readonly supportsSidecarExtendedCanvas: boolean; readonly supportsContinuityCameraHandoff: boolean;
  readonly webBluetoothSupported: boolean; readonly webGpuSupported: boolean;
  readonly profileSummaryKo: string; readonly profileSummaryEn: string;
}

export const APPLE_CREATIVE_PRESET_ENVS: Readonly<Record<"macbook-pro-m4" | "ipad-pro-m4" | "standard-60hz", AppleCreativeProbeEnv>> = {
  "macbook-pro-m4": {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 Version/18.2 Safari/605.1.15",
    platform: "MacIntel", maxTouchPoints: 0, devicePixelRatio: 2, hardwareConcurrency: 12, measuredRefreshHz: 120,
    webGpuAvailable: true, webBluetoothAvailable: true, captureCameraAvailable: true,
    matchMedia: (q) => ({ matches: q.includes("color-gamut: p3") || q.includes("dynamic-range: high") }),
  },
  "ipad-pro-m4": {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1",
    platform: "MacIntel", maxTouchPoints: 5, devicePixelRatio: 2, hardwareConcurrency: 10, measuredRefreshHz: 120,
    webGpuAvailable: true, webBluetoothAvailable: false, captureCameraAvailable: true,
    matchMedia: (q) => ({ matches: q.includes("color-gamut: p3") || q.includes("dynamic-range: high") }),
  },
  "standard-60hz": {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    platform: "Win32", maxTouchPoints: 0, devicePixelRatio: 1, hardwareConcurrency: 8, measuredRefreshHz: 60,
    webGpuAvailable: true, webBluetoothAvailable: true, captureCameraAvailable: true,
    matchMedia: () => ({ matches: false }),
  },
};

/** requestAnimationFrame 프레임 간격 표본(ms)에서 실제 주사율(60/90/120Hz)을 보정 산출한다. */
export function calibrateRefreshRateFromFrameDeltas(frameDeltasMs: readonly number[]): number {
  const valid = frameDeltasMs.filter((dt) => Number.isFinite(dt) && dt >= 3 && dt <= 50).sort((a, b) => a - b);
  if (valid.length === 0) return 60;
  const median = valid[Math.floor(valid.length / 2)] ?? 16.67;
  const rawHz = 1000 / median;
  if (rawHz >= 108) return 120;
  if (rawHz >= 82) return 90;
  return 60;
}

function readBrowserEnvFallback(): AppleCreativeProbeEnv {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  const nav = hasNavigator ? (navigator as Navigator & { readonly gpu?: unknown; readonly bluetooth?: unknown }) : undefined;
  return {
    userAgent: hasNavigator ? navigator.userAgent : "",
    platform: hasNavigator ? navigator.platform : "",
    maxTouchPoints: hasNavigator ? navigator.maxTouchPoints : 0,
    devicePixelRatio: hasWindow ? window.devicePixelRatio : 1,
    hardwareConcurrency: hasNavigator ? navigator.hardwareConcurrency : 4,
    webGpuAvailable: Boolean(nav?.gpu),
    webBluetoothAvailable: Boolean(nav?.bluetooth),
    captureCameraAvailable: Boolean(hasNavigator && navigator.mediaDevices),
    matchMedia: hasWindow && typeof window.matchMedia === "function" ? (q) => ({ matches: window.matchMedia(q).matches }) : undefined,
  };
}

/** macOS / Apple Silicon / iPad 광색역(Display-P3)과 ProMotion 60/120Hz 프레임 버짓을 프로파일링한다. */
export function detectAppleCreativeCapabilities(env?: AppleCreativeProbeEnv): AppleCreativeCapabilities {
  const resolved: AppleCreativeProbeEnv = { ...readBrowserEnvFallback(), ...env };
  const ua = resolved.userAgent ?? "";
  const platform = resolved.platform ?? "";
  const maxTouchPoints = Math.max(0, Math.round(resolved.maxTouchPoints ?? 0));
  const dpr = roundTo(clamp(resolved.devicePixelRatio ?? 1, 1, 4), 2);
  const cores = Math.max(1, Math.round(resolved.hardwareConcurrency ?? 4));
  const queryMedia = (q: string): boolean => {
    try { return Boolean(resolved.matchMedia?.(q)?.matches); } catch { return false; }
  };

  const rec2020 = queryMedia("(color-gamut: rec2020)");
  const displayP3 = rec2020 || queryMedia("(color-gamut: p3)");
  const hdrHigh = queryMedia("(dynamic-range: high)");
  const reducedMotionPreferred = queryMedia("(prefers-reduced-motion: reduce)");

  const isIpadOs = /iPad/i.test(ua) || ((/Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(platform)) && maxTouchPoints > 1);
  const isMac = !isIpadOs && (/Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(platform));
  const isMobileOther = !isIpadOs && !isMac && (/iPhone|Android|Mobile/i.test(ua) || maxTouchPoints >= 2);
  const isAppleSiliconLikely =
    isIpadOs ||
    (isMac && (/arm64|Apple/i.test(ua) || (cores >= 8 && (displayP3 || Boolean(resolved.webGpuAvailable) || (resolved.measuredRefreshHz ?? 60) >= 110))));

  let deviceClass: AppleDeviceClass = "desktop-generic";
  if (isIpadOs) deviceClass = "ipad-pro-air";
  else if (isMac) deviceClass = isAppleSiliconLikely ? "mac-apple-silicon" : "mac-intel";
  else if (isMobileOther) deviceClass = "mobile-generic";

  const inferredHz =
    resolved.measuredRefreshHz !== undefined
      ? clamp(Math.round(resolved.measuredRefreshHz), 30, 240)
      : isIpadOs && displayP3
        ? 120
        : isMac && isAppleSiliconLikely && hdrHigh
          ? 120
          : 60;

  const effectiveHz = reducedMotionPreferred ? Math.min(inferredHz, 60) : inferredHz;
  const isProMotion120Hz = effectiveHz >= 115;
  const frameBudgetMs = roundTo(1000 / effectiveHz, 2);
  const tileFlushBudgetMs = roundTo(frameBudgetMs * (isProMotion120Hz ? 0.54 : 0.62), 2);
  const strokeCoalescingMode: StrokeCoalescingMode = reducedMotionPreferred
    ? "power-save-60hz"
    : isProMotion120Hz
      ? "coalesced-120hz"
      : "standard-60hz";
  const colorGamut: DisplayColorGamut = rec2020 ? "rec2020" : displayP3 ? "display-p3" : "srgb";
  const canvasColorSpace: CanvasColorSpaceId = displayP3 ? "display-p3" : "srgb";

  return {
    deviceClass, isAppleSiliconLikely, isIpadOs, colorGamut, displayP3Supported: displayP3, canvasColorSpace,
    hdrDynamicRange: hdrHigh ? "high" : "standard", refreshRateHz: effectiveHz, isProMotion120Hz, frameBudgetMs,
    tileFlushBudgetMs, inkPredictionLeadMs: isProMotion120Hz ? 4.2 : 8.5, strokeCoalescingMode,
    recommendedBrushBufferDepth: isProMotion120Hz ? 3 : 2, devicePixelRatio: dpr, reducedMotionPreferred,
    supportsForceTouchTrackpad: isMac, supportsApplePencilHover: isIpadOs,
    supportsSidecarExtendedCanvas: isMac || isIpadOs,
    supportsContinuityCameraHandoff: isMac || isIpadOs || Boolean(resolved.captureCameraAvailable),
    webBluetoothSupported: Boolean(resolved.webBluetoothAvailable), webGpuSupported: Boolean(resolved.webGpuAvailable),
    profileSummaryKo: `${displayP3 ? "Display-P3 광색역" : "sRGB 표준 색역"} · ${isProMotion120Hz ? `ProMotion ${effectiveHz}Hz` : `${effectiveHz}Hz`} (${frameBudgetMs}ms 버짓)`,
    profileSummaryEn: `${displayP3 ? "Display-P3 Wide Gamut" : "sRGB Standard"} · ${isProMotion120Hz ? `ProMotion ${effectiveHz}Hz` : `${effectiveHz}Hz`} (${frameBudgetMs}ms budget)`,
  };
}

// === 2. Mac 포스터치 트랙패드 제스처 라우팅 ===

export type MacTrackpadGestureKind =
  | "pinch-zoom" | "wheel-pinch" | "two-finger-rotate" | "two-finger-pan"
  | "force-click" | "three-finger-swipe-left" | "three-finger-swipe-right"
  | "three-finger-swipe-up" | "three-finger-swipe-down";

export type MacTrackpadRoutedAction =
  | "canvas-zoom" | "canvas-rotate" | "canvas-pan" | "force-eyedropper-peek"
  | "history-undo" | "history-redo" | "toggle-focus-canvas" | "toggle-reference-tray" | "noop";

export interface MacTrackpadGestureEvent {
  readonly kind: MacTrackpadGestureKind; readonly scaleFactor?: number; readonly wheelDeltaY?: number;
  readonly rotationDeltaDeg?: number; readonly deltaX?: number; readonly deltaY?: number;
  readonly forcePressure?: number; readonly snapRotationStepDeg?: number;
}
export interface MacTrackpadCanvasState {
  readonly zoomPercent: number; readonly rotationDeg: number; readonly panX: number; readonly panY: number;
  readonly focusCanvasMode: boolean; readonly referenceTrayOpen: boolean; readonly eyedropperPeekActive: boolean;
  readonly undoCount: number; readonly redoCount: number;
}
export interface MacTrackpadGestureRoutingResult {
  readonly action: MacTrackpadRoutedAction; readonly nextState: MacTrackpadCanvasState;
  readonly hapticFeedbackHint: "detent-light" | "detent-medium" | "none";
  readonly preventDefaultRecommended: boolean; readonly deltaSummaryKo: string; readonly deltaSummaryEn: string;
}

export const DEFAULT_TRACKPAD_CANVAS_STATE: MacTrackpadCanvasState = {
  zoomPercent: 100, rotationDeg: 0, panX: 0, panY: 0,
  focusCanvasMode: false, referenceTrayOpen: false, eyedropperPeekActive: false, undoCount: 6, redoCount: 1,
};

/** Mac 포스터치 트랙패드 핀치·회전·포스클릭·세손가락 제스처를 캔버스 액션으로 결정적 라우팅한다. */
export function mapMacTrackpadGesture(
  event: MacTrackpadGestureEvent,
  currentState: MacTrackpadCanvasState = DEFAULT_TRACKPAD_CANVAS_STATE,
): MacTrackpadGestureRoutingResult {
  if (event.kind === "pinch-zoom" || event.kind === "wheel-pinch") {
    const rawScale = event.kind === "wheel-pinch"
      ? Math.exp(-clamp(event.wheelDeltaY ?? 0, -120, 120) * 0.008)
      : clamp(event.scaleFactor ?? 1, 0.25, 4);
    const nextZoom = Math.round(clamp(currentState.zoomPercent * rawScale, 10, 1600));
    const snappedZoom = Math.abs(nextZoom - 100) <= 3 ? 100 : nextZoom;
    return {
      action: "canvas-zoom", nextState: { ...currentState, zoomPercent: snappedZoom },
      hapticFeedbackHint: snappedZoom === 100 && currentState.zoomPercent !== 100 ? "detent-light" : "none",
      preventDefaultRecommended: true,
      deltaSummaryKo: `핀치 줌 ${currentState.zoomPercent}% → ${snappedZoom}%`,
      deltaSummaryEn: `Pinch zoom ${currentState.zoomPercent}% -> ${snappedZoom}%`,
    };
  }
  if (event.kind === "two-finger-rotate") {
    const step = clamp(event.snapRotationStepDeg ?? 0, 0, 45);
    const rawNext = normalizeAngleSigned(currentState.rotationDeg + (event.rotationDeltaDeg ?? 0));
    const nextRot = step > 0 ? normalizeAngleSigned(Math.round(rawNext / step) * step) : Math.abs(rawNext) <= 2.5 ? 0 : rawNext;
    return {
      action: "canvas-rotate", nextState: { ...currentState, rotationDeg: nextRot },
      hapticFeedbackHint: nextRot === 0 && currentState.rotationDeg !== 0 ? "detent-light" : "none",
      preventDefaultRecommended: true,
      deltaSummaryKo: `캔버스 회전 ${nextRot}°`, deltaSummaryEn: `Canvas rotation ${nextRot} deg`,
    };
  }
  if (event.kind === "two-finger-pan") {
    const nextPanX = roundTo(clamp(currentState.panX + (event.deltaX ?? 0), -8000, 8000), 1);
    const nextPanY = roundTo(clamp(currentState.panY + (event.deltaY ?? 0), -8000, 8000), 1);
    return {
      action: "canvas-pan", nextState: { ...currentState, panX: nextPanX, panY: nextPanY },
      hapticFeedbackHint: "none", preventDefaultRecommended: true,
      deltaSummaryKo: `캔버스 이동 (${nextPanX}, ${nextPanY})`, deltaSummaryEn: `Canvas pan (${nextPanX}, ${nextPanY})`,
    };
  }
  if (event.kind === "force-click") {
    const pressure = clamp(event.forcePressure ?? 0.85, 0, 1);
    if (pressure < 0.7) {
      return {
        action: "noop", nextState: currentState, hapticFeedbackHint: "none", preventDefaultRecommended: false,
        deltaSummaryKo: "포스터치 압력 임계치(0.70) 미만 — 대기", deltaSummaryEn: "Below Force Touch threshold (0.70) — idle",
      };
    }
    const nextPeek = !currentState.eyedropperPeekActive;
    return {
      action: "force-eyedropper-peek", nextState: { ...currentState, eyedropperPeekActive: nextPeek },
      hapticFeedbackHint: "detent-medium", preventDefaultRecommended: true,
      deltaSummaryKo: nextPeek ? "포스클릭: 스포이드 퀵 피크 활성" : "포스클릭: 스포이드 퀵 피크 해제",
      deltaSummaryEn: nextPeek ? "Force click: Eyedropper quick peek on" : "Force click: Eyedropper quick peek off",
    };
  }
  if (event.kind === "three-finger-swipe-left") {
    if (currentState.undoCount <= 0) {
      return {
        action: "noop", nextState: currentState, hapticFeedbackHint: "none", preventDefaultRecommended: true,
        deltaSummaryKo: "세손가락 왼쪽 스와이프: 되돌릴 내역 없음", deltaSummaryEn: "3-finger swipe left: nothing to undo",
      };
    }
    return {
      action: "history-undo",
      nextState: { ...currentState, undoCount: currentState.undoCount - 1, redoCount: currentState.redoCount + 1 },
      hapticFeedbackHint: "detent-light", preventDefaultRecommended: true,
      deltaSummaryKo: `세손가락 왼쪽 스와이프: 실행 취소 (남은 단계 ${currentState.undoCount - 1})`,
      deltaSummaryEn: `3-finger swipe left: Undo (${currentState.undoCount - 1} steps left)`,
    };
  }
  if (event.kind === "three-finger-swipe-right") {
    if (currentState.redoCount <= 0) {
      return {
        action: "noop", nextState: currentState, hapticFeedbackHint: "none", preventDefaultRecommended: true,
        deltaSummaryKo: "세손가락 오른쪽 스와이프: 다시 실행할 내역 없음", deltaSummaryEn: "3-finger swipe right: nothing to redo",
      };
    }
    return {
      action: "history-redo",
      nextState: { ...currentState, undoCount: currentState.undoCount + 1, redoCount: currentState.redoCount - 1 },
      hapticFeedbackHint: "detent-light", preventDefaultRecommended: true,
      deltaSummaryKo: `세손가락 오른쪽 스와이프: 다시 실행 (남은 단계 ${currentState.redoCount - 1})`,
      deltaSummaryEn: `3-finger swipe right: Redo (${currentState.redoCount - 1} steps left)`,
    };
  }
  if (event.kind === "three-finger-swipe-up") {
    const nextFocus = !currentState.focusCanvasMode;
    return {
      action: "toggle-focus-canvas", nextState: { ...currentState, focusCanvasMode: nextFocus },
      hapticFeedbackHint: "detent-light", preventDefaultRecommended: true,
      deltaSummaryKo: nextFocus ? "세손가락 위 스와이프: 캔버스 집중 모드 켜짐" : "세손가락 위 스와이프: 기본 툴바 복원",
      deltaSummaryEn: nextFocus ? "3-finger swipe up: Focus canvas enabled" : "3-finger swipe up: Standard chrome restored",
    };
  }
  const nextRef = !currentState.referenceTrayOpen;
  return {
    action: "toggle-reference-tray", nextState: { ...currentState, referenceTrayOpen: nextRef },
    hapticFeedbackHint: "detent-light", preventDefaultRecommended: true,
    deltaSummaryKo: nextRef ? "세손가락 아래 스와이프: 레퍼런스 트레이 열기" : "세손가락 아래 스와이프: 레퍼런스 트레이 닫기",
    deltaSummaryEn: nextRef ? "3-finger swipe down: Reference tray opened" : "3-finger swipe down: Reference tray closed",
  };
}

// === 3. iPad Sidecar / Continuity Camera 원클릭 사진→캔버스 핸드오프 ===

export type AppleHandoffMode = "ipad-sidecar-canvas" | "continuity-camera-photo";
export type ContinuityLayerRole = "reference-overlay" | "sketch-trace" | "background-photo-plate";

export interface AppleHandoffSessionInput {
  readonly mode: AppleHandoffMode; readonly canvasWidthPx: number; readonly canvasHeightPx: number;
  readonly capabilities: AppleCreativeCapabilities; readonly targetLayerRole?: ContinuityLayerRole; readonly nowMs?: number;
}
export interface AppleHandoffSession {
  readonly sessionId: string; readonly mode: AppleHandoffMode; readonly targetLayerRole: ContinuityLayerRole;
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly preferredColorSpace: CanvasColorSpaceId;
  readonly sidecarViewportRatioPercent: number; readonly captureAcceptMime: string;
  readonly captureAttribute: "environment" | "user"; readonly expiresAtMs: number;
  readonly statusKo: string; readonly statusEn: string;
}
export interface ContinuityPhotoPayload {
  readonly filename: string; readonly mimeType: string; readonly byteSize: number;
  readonly widthPx: number; readonly heightPx: number; readonly colorSpace?: CanvasColorSpaceId;
}
export interface ContinuityPhotoPlacementReceipt {
  readonly accepted: boolean; readonly reasonCode: "ok" | "unsupported-mime" | "file-too-large" | "invalid-dimensions";
  readonly sessionId: string; readonly sanitizedFilename: string; readonly targetLayerRole: ContinuityLayerRole;
  readonly colorSpace: CanvasColorSpaceId; readonly fitScale: number;
  readonly placedWidthPx: number; readonly placedHeightPx: number; readonly offsetXPx: number; readonly offsetYPx: number;
  readonly summaryKo: string; readonly summaryEn: string;
}

const ALLOWED_CONTINUITY_MIMES = new Set<string>(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"]);
const MAX_CONTINUITY_PHOTO_BYTES = 25 * 1024 * 1024;

function buildRejectedPhotoReceipt(
  session: AppleHandoffSession, sanitizedFilename: string,
  reasonCode: "unsupported-mime" | "file-too-large" | "invalid-dimensions", summaryKo: string, summaryEn: string,
): ContinuityPhotoPlacementReceipt {
  return {
    accepted: false, reasonCode, sessionId: session.sessionId, sanitizedFilename,
    targetLayerRole: session.targetLayerRole, colorSpace: session.preferredColorSpace,
    fitScale: 0, placedWidthPx: 0, placedHeightPx: 0, offsetXPx: 0, offsetYPx: 0, summaryKo, summaryEn,
  };
}

/** iPad Sidecar 확장 캔버스 또는 Continuity Camera 사진→캔버스 핸드오프 세션을 생성한다. */
export function createAppleHandoffSession(input: AppleHandoffSessionInput): AppleHandoffSession {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : 1_760_000_000_000;
  const canvasWidthPx = Math.max(320, Math.round(input.canvasWidthPx));
  const canvasHeightPx = Math.max(320, Math.round(input.canvasHeightPx));
  const targetLayerRole: ContinuityLayerRole = input.targetLayerRole ?? "reference-overlay";
  const preferredColorSpace: CanvasColorSpaceId = input.capabilities.displayP3Supported ? "display-p3" : "srgb";
  const prefix = input.mode === "ipad-sidecar-canvas" ? "sidecar" : "continuity";
  return {
    sessionId: `${prefix}-${(nowMs % 10_000_000).toString(36)}-${canvasWidthPx}x${canvasHeightPx}`,
    mode: input.mode, targetLayerRole, canvasWidthPx, canvasHeightPx, preferredColorSpace,
    sidecarViewportRatioPercent: input.mode === "ipad-sidecar-canvas" ? 90 : 86,
    captureAcceptMime: "image/jpeg,image/png,image/webp,image/heic,image/avif",
    captureAttribute: "environment", expiresAtMs: nowMs + 10 * 60 * 1000,
    statusKo: input.mode === "ipad-sidecar-canvas"
      ? `iPad Sidecar 확장 펜 캔버스 준비 완료 (${preferredColorSpace}, 뷰포트 90%)`
      : `Continuity Camera 사진 촬영 대기 (${preferredColorSpace} · 대상 레이어: ${targetLayerRole})`,
    statusEn: input.mode === "ipad-sidecar-canvas"
      ? `iPad Sidecar extended pen canvas ready (${preferredColorSpace}, 90% viewport)`
      : `Continuity Camera photo handoff ready (${preferredColorSpace}, target: ${targetLayerRole})`,
  };
}

/** Continuity Camera에서 촬영된 사진을 검증하고 캔버스 맞춤 배치 영수증을 생성한다. */
export function ingestContinuityPhotoToCanvas(
  session: AppleHandoffSession,
  payload: ContinuityPhotoPayload,
): ContinuityPhotoPlacementReceipt {
  const mime = payload.mimeType.trim().toLowerCase();
  const sanitizedFilename = payload.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "continuity-capture.jpg";
  if (!ALLOWED_CONTINUITY_MIMES.has(mime)) {
    return buildRejectedPhotoReceipt(
      session, sanitizedFilename, "unsupported-mime",
      `차단됨: 허용되지 않은 파일 형식(${mime || "unknown"})입니다.`,
      `Blocked: unsupported MIME type (${mime || "unknown"}).`,
    );
  }
  if (!Number.isFinite(payload.byteSize) || payload.byteSize <= 0 || payload.byteSize > MAX_CONTINUITY_PHOTO_BYTES) {
    return buildRejectedPhotoReceipt(
      session, sanitizedFilename, "file-too-large",
      "차단됨: 사진 용량이 25MB 제한을 초과했거나 비어 있습니다.",
      "Blocked: photo exceeds the 25MB limit or is empty.",
    );
  }
  if (!Number.isFinite(payload.widthPx) || !Number.isFinite(payload.heightPx) || payload.widthPx < 16 || payload.heightPx < 16) {
    return buildRejectedPhotoReceipt(
      session, sanitizedFilename, "invalid-dimensions",
      "차단됨: 사진 해상도가 유효 범위 미만입니다.",
      "Blocked: invalid photo dimensions.",
    );
  }
  const fitScale = roundTo(Math.min((session.canvasWidthPx * 0.88) / payload.widthPx, (session.canvasHeightPx * 0.88) / payload.heightPx, 1), 3);
  const placedWidthPx = Math.round(payload.widthPx * fitScale);
  const placedHeightPx = Math.round(payload.heightPx * fitScale);
  const colorSpace: CanvasColorSpaceId = payload.colorSpace ?? session.preferredColorSpace;
  return {
    accepted: true, reasonCode: "ok", sessionId: session.sessionId, sanitizedFilename,
    targetLayerRole: session.targetLayerRole, colorSpace, fitScale, placedWidthPx, placedHeightPx,
    offsetXPx: Math.round((session.canvasWidthPx - placedWidthPx) / 2),
    offsetYPx: Math.round((session.canvasHeightPx - placedHeightPx) / 2),
    summaryKo: `${sanitizedFilename} (${placedWidthPx}×${placedHeightPx}px, ${colorSpace}) → ${session.targetLayerRole} 배치 완료`,
    summaryEn: `Placed ${sanitizedFilename} (${placedWidthPx}x${placedHeightPx}px, ${colorSpace}) on ${session.targetLayerRole}`,
  };
}

// === 4. Apple Watch / Wear OS / 스마트 링 Web Bluetooth BLE 컴패니언 컨트롤러 ===

export type WatchDeviceKind = "apple-watch" | "wear-os" | "smart-ring";
export type WatchCrownMode = "brush-size" | "canvas-zoom" | "timeline-scrub" | "layer-opacity";
export type WatchDoubleTapBinding = "undo" | "toggle-layer-visibility" | "cycle-crown-mode";
export type WatchCompanionEventKind = "crown-delta" | "double-tap" | "mode-cycle" | "long-press-redo";
export type WatchCompanionRoutedAction =
  | "adjust-brush-size" | "adjust-canvas-zoom" | "scrub-timeline" | "adjust-layer-opacity"
  | "history-undo" | "history-redo" | "toggle-layer-visibility" | "cycle-crown-mode" | "noop";

export const WATCH_BLE_GATT_SPEC = {
  companionServiceUuid: "7a4b2c10-9f31-4d8a-8c20-5e1a0b740001",
  crownControlCharUuid: "7a4b2c10-9f31-4d8a-8c20-5e1a0b740002",
  gestureNotifyCharUuid: "7a4b2c10-9f31-4d8a-8c20-5e1a0b740003",
  standardHidServiceUuid: 0x1812,
  standardBatteryServiceUuid: 0x180f,
} as const;

export interface WatchBleScanRequestOptions {
  readonly filters: readonly { readonly services: readonly (string | number)[] }[];
  readonly optionalServices: readonly (string | number)[];
}
export interface WatchCompanionInputEvent {
  readonly kind: WatchCompanionEventKind; readonly deviceKind: WatchDeviceKind;
  readonly deltaTicks?: number; readonly velocityMultiplier?: number; readonly batteryPercent?: number;
}
export interface WatchCompanionStudioState {
  readonly crownMode: WatchCrownMode; readonly doubleTapBinding: WatchDoubleTapBinding;
  readonly brushSizePx: number; readonly canvasZoomPercent: number;
  readonly timelineFrame: number; readonly totalTimelineFrames: number;
  readonly layerOpacityPercent: number; readonly activeLayerVisible: boolean;
  readonly undoDepth: number; readonly redoDepth: number; readonly connectedBatteryPercent: number;
}
export interface WatchCompanionRouteResult {
  readonly handled: boolean; readonly action: WatchCompanionRoutedAction; readonly deviceKind: WatchDeviceKind;
  readonly nextState: WatchCompanionStudioState;
  readonly hapticCue: "crown-tick" | "tap-confirm" | "mode-click" | "none";
  readonly summaryKo: string; readonly summaryEn: string;
}

export const DEFAULT_WATCH_COMPANION_STATE: WatchCompanionStudioState = {
  crownMode: "brush-size", doubleTapBinding: "undo", brushSizePx: 24, canvasZoomPercent: 100,
  timelineFrame: 12, totalTimelineFrames: 96, layerOpacityPercent: 90, activeLayerVisible: true,
  undoDepth: 8, redoDepth: 1, connectedBatteryPercent: 84,
};

const CROWN_MODE_ORDER: readonly WatchCrownMode[] = ["brush-size", "canvas-zoom", "timeline-scrub", "layer-opacity"];

/** Web Bluetooth `navigator.bluetooth.requestDevice()` 표준 필터 옵션을 반환한다. */
export function createWatchBleScanRequestOptions(): WatchBleScanRequestOptions {
  return {
    filters: [{ services: [WATCH_BLE_GATT_SPEC.companionServiceUuid] }, { services: [WATCH_BLE_GATT_SPEC.standardHidServiceUuid] }],
    optionalServices: [WATCH_BLE_GATT_SPEC.standardBatteryServiceUuid],
  };
}

/** BLE GATT 알림 패킷(4바이트: [opcode, int8 delta, modeIdx, battery%])을 컴패니언 이벤트로 복호화한다. */
export function parseWatchBleCharacteristicPacket(
  bytes: Uint8Array, deviceKind: WatchDeviceKind = "wear-os",
): WatchCompanionInputEvent | null {
  if (bytes.length < 2) return null;
  const opcode = bytes[0] ?? 0;
  const rawSigned = bytes[1] ?? 0;
  const deltaTicks = rawSigned > 127 ? rawSigned - 256 : rawSigned;
  const batteryPercent = bytes.length >= 4 ? clamp(bytes[3] ?? 100, 0, 100) : undefined;
  if (opcode === 0x01) return { kind: "crown-delta", deviceKind, deltaTicks, batteryPercent };
  if (opcode === 0x02) return { kind: "double-tap", deviceKind, batteryPercent };
  if (opcode === 0x03) return { kind: "mode-cycle", deviceKind, batteryPercent };
  if (opcode === 0x04) return { kind: "long-press-redo", deviceKind, batteryPercent };
  return null;
}

/** 워치 디지털 크라운·회전 베젤·더블탭 입력을 브러시·줌·타임라인·Undo/레이어 액션으로 라우팅한다. */
export function routeWatchCompanionEvent(
  event: WatchCompanionInputEvent,
  currentState: WatchCompanionStudioState = DEFAULT_WATCH_COMPANION_STATE,
): WatchCompanionRouteResult {
  const base: WatchCompanionStudioState = {
    ...currentState,
    connectedBatteryPercent: event.batteryPercent !== undefined ? clamp(Math.round(event.batteryPercent), 0, 100) : currentState.connectedBatteryPercent,
  };

  if (event.kind === "crown-delta") {
    const ticks = clamp(event.deltaTicks ?? 0, -40, 40);
    const vel = clamp(event.velocityMultiplier ?? 1, 0.5, 3);
    if (ticks === 0) {
      return { handled: false, action: "noop", deviceKind: event.deviceKind, nextState: base, hapticCue: "none", summaryKo: "크라운 변화량 0 — 대기", summaryEn: "Zero crown delta — idle" };
    }
    if (base.crownMode === "brush-size") {
      const step = Math.max(1, Math.round(base.brushSizePx * 0.08 * vel));
      const nextBrush = Math.round(clamp(base.brushSizePx + ticks * step, 1, 500));
      return { handled: true, action: "adjust-brush-size", deviceKind: event.deviceKind, nextState: { ...base, brushSizePx: nextBrush }, hapticCue: "crown-tick", summaryKo: `크라운 브러시 크기 ${base.brushSizePx}px → ${nextBrush}px`, summaryEn: `Crown brush size ${base.brushSizePx}px -> ${nextBrush}px` };
    }
    if (base.crownMode === "canvas-zoom") {
      const nextZoom = Math.round(clamp(base.canvasZoomPercent + ticks * Math.round(5 * vel), 10, 1600));
      return { handled: true, action: "adjust-canvas-zoom", deviceKind: event.deviceKind, nextState: { ...base, canvasZoomPercent: nextZoom }, hapticCue: "crown-tick", summaryKo: `크라운 캔버스 줌 ${base.canvasZoomPercent}% → ${nextZoom}%`, summaryEn: `Crown canvas zoom ${base.canvasZoomPercent}% -> ${nextZoom}%` };
    }
    if (base.crownMode === "timeline-scrub") {
      const nextFrame = Math.round(clamp(base.timelineFrame + ticks, 0, Math.max(0, base.totalTimelineFrames - 1)));
      return { handled: true, action: "scrub-timeline", deviceKind: event.deviceKind, nextState: { ...base, timelineFrame: nextFrame }, hapticCue: "crown-tick", summaryKo: `크라운 타임라인 ${nextFrame} / ${base.totalTimelineFrames} 프레임`, summaryEn: `Crown timeline frame ${nextFrame} / ${base.totalTimelineFrames}` };
    }
    const nextOpacity = Math.round(clamp(base.layerOpacityPercent + ticks * 2, 0, 100));
    return { handled: true, action: "adjust-layer-opacity", deviceKind: event.deviceKind, nextState: { ...base, layerOpacityPercent: nextOpacity }, hapticCue: "crown-tick", summaryKo: `크라운 레이어 불투명도 ${nextOpacity}%`, summaryEn: `Crown layer opacity ${nextOpacity}%` };
  }

  if (event.kind === "mode-cycle" || (event.kind === "double-tap" && base.doubleTapBinding === "cycle-crown-mode")) {
    const nextMode = CROWN_MODE_ORDER[(CROWN_MODE_ORDER.indexOf(base.crownMode) + 1) % CROWN_MODE_ORDER.length] ?? "brush-size";
    return { handled: true, action: "cycle-crown-mode", deviceKind: event.deviceKind, nextState: { ...base, crownMode: nextMode }, hapticCue: "mode-click", summaryKo: `크라운 제어 대상 전환 → ${nextMode}`, summaryEn: `Crown target switched -> ${nextMode}` };
  }

  if (event.kind === "double-tap") {
    if (base.doubleTapBinding === "toggle-layer-visibility") {
      const nextVisible = !base.activeLayerVisible;
      return { handled: true, action: "toggle-layer-visibility", deviceKind: event.deviceKind, nextState: { ...base, activeLayerVisible: nextVisible }, hapticCue: "tap-confirm", summaryKo: nextVisible ? "더블탭: 현재 레이어 표시" : "더블탭: 현재 레이어 숨김", summaryEn: nextVisible ? "Double tap: Active layer visible" : "Double tap: Active layer hidden" };
    }
    if (base.undoDepth <= 0) {
      return { handled: false, action: "noop", deviceKind: event.deviceKind, nextState: base, hapticCue: "none", summaryKo: "더블탭 실행 취소: 되돌릴 단계 없음", summaryEn: "Double tap Undo: no steps remaining" };
    }
    return { handled: true, action: "history-undo", deviceKind: event.deviceKind, nextState: { ...base, undoDepth: base.undoDepth - 1, redoDepth: base.redoDepth + 1 }, hapticCue: "tap-confirm", summaryKo: `더블탭: 실행 취소 (남은 단계 ${base.undoDepth - 1})`, summaryEn: `Double tap: Undo (${base.undoDepth - 1} steps left)` };
  }

  if (base.redoDepth <= 0) {
    return { handled: false, action: "noop", deviceKind: event.deviceKind, nextState: base, hapticCue: "none", summaryKo: "길게 누르기 다시 실행: 내역 없음", summaryEn: "Long press Redo: nothing to redo" };
  }
  return { handled: true, action: "history-redo", deviceKind: event.deviceKind, nextState: { ...base, undoDepth: base.undoDepth + 1, redoDepth: base.redoDepth - 1 }, hapticCue: "tap-confirm", summaryKo: `길게 누르기: 다시 실행 (남은 단계 ${base.redoDepth - 1})`, summaryEn: `Long press: Redo (${base.redoDepth - 1} steps left)` };
}

// === 5. 비의료 작업 시간 휴식·스트레칭 리마인더 ===

export type BreakReminderLevel = "steady" | "upcoming" | "break-recommended" | "extended-break-recommended";
export type BreakStretchPresetId = "wrist-roll-and-open" | "neck-shoulder-release" | "far-focus-20-20" | "stand-and-hydrate";

export interface CreatorBreakReminderInput {
  readonly continuousWorkMinutes: number; readonly totalSessionMinutes?: number;
  readonly intervalMinutes?: number; readonly preAlertLeadMinutes?: number;
}
export interface CreatorBreakReminderReport {
  readonly category: "work-timer-wellness"; readonly isNonMedicalGuidance: true; readonly level: BreakReminderLevel;
  readonly shouldNotifyWatch: boolean; readonly continuousWorkMinutes: number; readonly intervalMinutes: number;
  readonly minutesUntilNextBreak: number; readonly suggestedBreakDurationMinutes: number;
  readonly stretchPresetId: BreakStretchPresetId; readonly titleKo: string; readonly titleEn: string;
  readonly messageKo: string; readonly messageEn: string; readonly stretchGuideKo: string; readonly stretchGuideEn: string;
  readonly noteKo: string; readonly noteEn: string;
}

const WELLNESS_NOTE_KO = "작업 타이머 기준 일반 휴식·스트레칭 알림입니다.";
const WELLNESS_NOTE_EN = "General work-timer break and stretching reminder for creative sessions.";

/** 연속 작업 시간만을 기준으로 안전한 휴식·스트레칭 워치 알림을 산출한다(비의료·비진단 안내). */
export function evaluateCreatorBreakReminder(input: CreatorBreakReminderInput): CreatorBreakReminderReport {
  const workMin = Math.max(0, Math.round(Number.isFinite(input.continuousWorkMinutes) ? input.continuousWorkMinutes : 0));
  const interval = clamp(Math.round(input.intervalMinutes ?? 50), 20, 90);
  const preLead = clamp(Math.round(input.preAlertLeadMinutes ?? 10), 5, Math.max(5, interval - 10));
  const totalMin = Math.max(workMin, Math.round(Number.isFinite(input.totalSessionMinutes) ? Number(input.totalSessionMinutes) : workMin));
  const minutesUntilNextBreak = Math.max(0, interval - workMin);

  if (workMin >= interval + 35 || totalMin >= 150) {
    return {
      category: "work-timer-wellness", isNonMedicalGuidance: true, level: "extended-break-recommended", shouldNotifyWatch: true,
      continuousWorkMinutes: workMin, intervalMinutes: interval, minutesUntilNextBreak: 0, suggestedBreakDurationMinutes: 10,
      stretchPresetId: "stand-and-hydrate", titleKo: "10분 자리 일어나기 휴식 시간", titleEn: "10-Minute Stand & Stretch Break",
      messageKo: `연속 ${workMin}분 작업이 지났습니다. 잠시 펜을 내려놓고 물 한 잔과 가벼운 스트레칭을 권장합니다.`,
      messageEn: `${workMin} minutes of continuous work elapsed. Step away for water and a light stretch.`,
      stretchGuideKo: "자리에서 일어나 어깨를 천천히 5회 돌리고 먼 창밖을 20초 바라보세요.",
      stretchGuideEn: "Stand up, roll both shoulders slowly 5 times, and look at a distant point for 20 seconds.",
      noteKo: WELLNESS_NOTE_KO, noteEn: WELLNESS_NOTE_EN,
    };
  }
  if (workMin >= interval) {
    return {
      category: "work-timer-wellness", isNonMedicalGuidance: true, level: "break-recommended", shouldNotifyWatch: true,
      continuousWorkMinutes: workMin, intervalMinutes: interval, minutesUntilNextBreak: 0, suggestedBreakDurationMinutes: 5,
      stretchPresetId: "wrist-roll-and-open", titleKo: "5분 손목·어깨 휴식 알림", titleEn: "5-Minute Wrist & Shoulder Break",
      messageKo: `설정한 ${interval}분 작업 주기에 도달했습니다(현재 ${workMin}분). 5분간 손목을 풀어 주세요.`,
      messageEn: `You reached your ${interval}-minute work block (${workMin} min elapsed). Take a 5-minute break.`,
      stretchGuideKo: "손가락을 활짝 폈다 접기 5회, 손목 원을 양방향으로 천천히 5회 돌려 주세요.",
      stretchGuideEn: "Open and gently relax your fingers 5 times, then roll each wrist slowly in both directions.",
      noteKo: WELLNESS_NOTE_KO, noteEn: WELLNESS_NOTE_EN,
    };
  }
  if (workMin >= interval - preLead) {
    return {
      category: "work-timer-wellness", isNonMedicalGuidance: true, level: "upcoming", shouldNotifyWatch: false,
      continuousWorkMinutes: workMin, intervalMinutes: interval, minutesUntilNextBreak, suggestedBreakDurationMinutes: 5,
      stretchPresetId: "far-focus-20-20", titleKo: `휴식 예고 (${minutesUntilNextBreak}분 남음)`, titleEn: `Break Coming Up (${minutesUntilNextBreak} min left)`,
      messageKo: `${minutesUntilNextBreak}분 뒤 정기 휴식 시간입니다. 지금 컷 저장 지점을 맞춰 두면 편합니다.`,
      messageEn: `Scheduled break in ${minutesUntilNextBreak} minutes. Wrap up your current cut checkpoint.`,
      stretchGuideKo: "20초 동안 화면에서 시선을 떼고 6m 이상 먼 곳을 바라보세요.",
      stretchGuideEn: "Look away from the canvas toward a distant object for 20 seconds.",
      noteKo: WELLNESS_NOTE_KO, noteEn: WELLNESS_NOTE_EN,
    };
  }
  return {
    category: "work-timer-wellness", isNonMedicalGuidance: true, level: "steady", shouldNotifyWatch: false,
    continuousWorkMinutes: workMin, intervalMinutes: interval, minutesUntilNextBreak, suggestedBreakDurationMinutes: 5,
    stretchPresetId: "neck-shoulder-release", titleKo: "안정적 작업 구간", titleEn: "Steady Work Block",
    messageKo: `연속 ${workMin}분 진행 중입니다. 다음 휴식 알림까지 ${minutesUntilNextBreak}분 남았습니다.`,
    messageEn: `${workMin} minutes into this block. Next scheduled break in ${minutesUntilNextBreak} minutes.`,
    stretchGuideKo: "작업 중 어깨 힘을 가볍게 풀고 바른 시선 높이를 유지하세요.",
    stretchGuideEn: "Keep your shoulders relaxed and maintain comfortable screen eye height.",
    noteKo: WELLNESS_NOTE_KO, noteEn: WELLNESS_NOTE_EN,
  };
}

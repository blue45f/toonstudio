import type {
  ArGlassesHudOptions, SpatialDeviceId, SpatialWearableSessionSnapshot,
  SyncTransportMode, WearableDialActionInput, WearableStudioControlState,
} from "./spatial-wearable-engine";

export const MAX_SPATIAL_JSON_CHARS = 1048576;
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("설정 객체가 필요합니다.");
  return value as Record<string, unknown>;
}
function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.some(item => item === value);
}
function choice<T extends string>(values: readonly T[], value: unknown): T {
  if (!member(values, value)) throw new TypeError("지원하지 않는 설정 값입니다.");
  return value;
}
function number(source: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RangeError("설정 수치가 유한 지원 범위를 벗어났습니다.");
  return value;
}
function flag(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") throw new TypeError("설정 플래그는 boolean이어야 합니다.");
  return value;
}
export function validateSpatialDeviceIds(value: unknown, allowed: readonly SpatialDeviceId[]): readonly SpatialDeviceId[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new RangeError("지원 기기 수를 초과했습니다.");
  const entries: readonly unknown[] = value;
  const result: SpatialDeviceId[] = [];
  const seen = new Set<SpatialDeviceId>();
  for (const id of entries) {
    if (!member(allowed, id) || seen.has(id)) throw new TypeError("미지원 기기 또는 중복 기기 ID입니다.");
    seen.add(id); result.push(id);
  }
  return result;
}
export function validateSpatialTransport(value: unknown): SyncTransportMode {
  return choice(["lan-webrtc", "usb-tether-hybrid", "cloud-relay"] as const, value);
}

/** 외부 config만 검증·복사한다. computed·프로필·개인 metadata는 신뢰하거나 내보내지 않는다. */
export function validateSpatialSnapshot(value: unknown, allowed: readonly SpatialDeviceId[]): SpatialWearableSessionSnapshot {
  const cfg = record(value);
  const rig = record(cfg.spatialRigInput);
  const state = record(cfg.wearableState);
  const hud = record(cfg.arHudOptions);
  const maxFrames = number(state, "timelineMaxFrames", 1, 3600);
  const maxHistory = number(state, "historyMaxIndex", 1, 200);
  if (!Number.isInteger(maxFrames) || !Number.isInteger(maxHistory)) throw new RangeError("프레임·히스토리 상한은 정수여야 합니다.");
  return {
    activeDeviceIds: validateSpatialDeviceIds(cfg.activeDeviceIds, allowed), syncTransportMode: validateSpatialTransport(cfg.syncTransportMode),
    availableLinkBandwidthMbps: number(cfg, "availableLinkBandwidthMbps", 5, 2000),
    spatialRigInput: {
      eyeHeightM: number(rig, "eyeHeightM", 0.9, 1.95), viewingDistanceM: number(rig, "viewingDistanceM", 0.7, 2.8),
      horizontalFovDeg: number(rig, "horizontalFovDeg", 45, 120), verticalFovDeg: number(rig, "verticalFovDeg", 35, 95),
      gazePitchDeg: number(rig, "gazePitchDeg", -35, 20), panelCurvatureDeg: number(rig, "panelCurvatureDeg", 0, 60),
    },
    wearableMode: choice(["brush-size", "canvas-zoom", "timeline-scrub", "undo-redo"] as const, cfg.wearableMode),
    wearableState: {
      brushSizePx: number(state, "brushSizePx", 1, 300), canvasZoomPct: number(state, "canvasZoomPct", 10, 800),
      timelineFrame: number(state, "timelineFrame", 0, maxFrames), timelineMaxFrames: maxFrames,
      historyIndex: number(state, "historyIndex", 0, maxHistory), historyMaxIndex: maxHistory,
    },
    elapsedWorkMinutes: number(cfg, "elapsedWorkMinutes", 0, 720), breakIntervalMinutes: number(cfg, "breakIntervalMinutes", 15, 120),
    hapticNudgeEnabled: flag(cfg, "hapticNudgeEnabled"),
    arHudOptions: {
      presetId: choice(["perspective-grid-minimal", "pose-silhouette-whisper", "deadline-focus-only"] as const, hud.presetId),
      perspectiveGridType: choice(["none", "1-point", "2-point", "3-point"] as const, hud.perspectiveGridType),
      gridOpacityPct: number(hud, "gridOpacityPct", 5, 45), showDeadlineTimer: flag(hud, "showDeadlineTimer"),
      deadlineRemainingMinutes: number(hud, "deadlineRemainingMinutes", 0, 720),
      peripheralCorner: choice(["top-right", "top-left", "bottom-right"] as const, hud.peripheralCorner),
    },
  };
}

/** 직접 계산 API는 기존 clamp 경로를 유지하되 상한·큰 detent의 산술도 유한하게 만든다. */
export function normalizeWearableState(state: WearableStudioControlState): WearableStudioControlState {
  const bounded = (v: number, min: number, max: number, fallback: number): number =>
    Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;
  const maxFrames = bounded(Math.trunc(state.timelineMaxFrames), 1, 3600, 120);
  const maxHistory = bounded(Math.trunc(state.historyMaxIndex), 1, 200, 40);
  return { brushSizePx: bounded(state.brushSizePx, 1, 300, 18), canvasZoomPct: bounded(state.canvasZoomPct, 10, 800, 100),
    timelineFrame: bounded(state.timelineFrame, 0, maxFrames, 0), timelineMaxFrames: maxFrames,
    historyIndex: bounded(state.historyIndex, 0, maxHistory, 0), historyMaxIndex: maxHistory };
}
export function assertWearableAction(input: WearableDialActionInput): void {
  choice(["brush-size", "canvas-zoom", "timeline-scrub", "undo-redo"] as const, input.mode);
  choice(["crown-rotate", "ring-pinch-twist", "double-tap", "crown-press"] as const, input.gesture);
  if (input.precisionModifier !== undefined && typeof input.precisionModifier !== "boolean") throw new TypeError("정밀 모드 플래그가 유효하지 않습니다.");
}
export function assertHudEnums(options: ArGlassesHudOptions): void {
  if (options.presetId !== undefined) choice(["perspective-grid-minimal", "pose-silhouette-whisper", "deadline-focus-only"] as const, options.presetId);
  if (options.perspectiveGridType !== undefined) choice(["none", "1-point", "2-point", "3-point"] as const, options.perspectiveGridType);
  if (options.peripheralCorner !== undefined) choice(["top-right", "top-left", "bottom-right"] as const, options.peripheralCorner);
  if (options.showDeadlineTimer !== undefined && typeof options.showDeadlineTimer !== "boolean") throw new TypeError("HUD 타이머 플래그가 유효하지 않습니다.");
}

/**
 * 3D 스테이지 원클릭 4뷰/6뷰 턴테이블 캐릭터 일관성 앵커 자동 캡처·검증 브리지.
 *
 * `anchor-capture-spec.ts` 정본 카메라 규약(눈높이 0°, 30° FOV, 2:3 세로 프레임, 중간 회색 배경)을
 * 렌더러 중립 어댑터에 순차 적용해 정면·반측면·측면·후면 앵커 시트를 생성하고,
 * 해상도·비율·용량·중복 프레임(카메라 정지 오류)을 자동 검증한다.
 */
import {
  ANCHOR_ANGLE_IDS,
  ANCHOR_CAPTURE_CONVENTION,
  ANCHOR_LIMITS,
  ANCHOR_MIRROR_PAIRS,
  ANCHOR_SET_SCHEMA,
  ANCHOR_SPEC_VERSION,
  anchorCameraPose,
  isValidAnchorCharacterId,
  isValidAnchorId,
  sortAnchorAngles,
  type AnchorAngleId,
  type AnchorCameraPose,
  type AnchorImageMimeType,
  type AnchorSubjectPlacement,
} from "./anchor-capture-spec";

/** 기본 4뷰 턴테이블: 정면 · 좌 3/4 · 좌측 · 후면. */
export const ANCHOR_FOUR_VIEW_TURNTABLE_ANGLES: readonly AnchorAngleId[] = Object.freeze([
  "front",
  "left-34",
  "left",
  "back",
]);

/** 좌우 대칭 완전 6뷰 턴테이블. */
export const ANCHOR_SIX_VIEW_TURNTABLE_ANGLES: readonly AnchorAngleId[] = ANCHOR_ANGLE_IDS;

export type Anchor3dTurntableMode = "four-view" | "six-view";

export interface Anchor3dCapturedRawFrame {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: AnchorImageMimeType;
}

export interface Anchor3dStageRendererAdapter {
  readonly applyNeutralStudioLighting: () => Promise<void> | void;
  readonly applyCameraPose: (pose: AnchorCameraPose) => Promise<void> | void;
  readonly captureFrame: (request: {
    readonly angleId: AnchorAngleId;
    readonly width: number;
    readonly height: number;
    readonly format: "png";
    readonly backgroundHex: string;
  }) => Promise<Anchor3dCapturedRawFrame>;
  /** 캡처 성공·실패·중단 여부와 무관하게 스테이지 조명·카메라를 복구한다. */
  readonly restoreStageState: () => Promise<void> | void;
}

export interface Anchor3dCapturePlanStep {
  readonly index: number;
  readonly angleId: AnchorAngleId;
  readonly pose: AnchorCameraPose;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly backgroundHex: string;
}

export interface Anchor3dCapturePlan {
  readonly anchorId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly mode: Anchor3dTurntableMode;
  readonly steps: readonly Anchor3dCapturePlanStep[];
  readonly maxSetBytes: number;
  readonly errors: readonly string[];
}

export interface Anchor3dCapturedAngleRecord {
  readonly angleId: AnchorAngleId;
  readonly pose: AnchorCameraPose;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly mimeType: AnchorImageMimeType;
  readonly contentHashHex: string;
  readonly capturedAtIso: string;
  readonly bytes: Uint8Array;
}

export type Anchor3dVerificationIssueCode =
  | "missing-required-angle"
  | "unbalanced-mirror-pair"
  | "below-min-edge"
  | "above-max-edge"
  | "aspect-ratio-drift"
  | "frame-empty"
  | "frame-too-large"
  | "set-too-large"
  | "duplicate-frame-detected";

export interface Anchor3dVerificationIssue {
  readonly code: Anchor3dVerificationIssueCode;
  readonly severity: "error" | "warning";
  readonly angleId?: AnchorAngleId;
  readonly messageKo: string;
}

export interface Anchor3dSheetCellLayout {
  readonly angleId: AnchorAngleId;
  readonly col: number;
  readonly row: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface Anchor3dSheetLayout {
  readonly columns: number;
  readonly rows: number;
  readonly sheetWidthPx: number;
  readonly sheetHeightPx: number;
  readonly cells: readonly Anchor3dSheetCellLayout[];
}

export interface Anchor3dVerificationResult {
  readonly valid: boolean;
  readonly completenessScore01: number;
  readonly totalBytes: number;
  readonly issues: readonly Anchor3dVerificationIssue[];
}

export interface Anchor3dAutoCaptureReport {
  readonly schema: typeof ANCHOR_SET_SCHEMA;
  readonly specVersion: typeof ANCHOR_SPEC_VERSION;
  readonly status: "ok" | "partial" | "failed";
  readonly anchorId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly mode: Anchor3dTurntableMode;
  readonly frames: readonly Anchor3dCapturedAngleRecord[];
  readonly verification: Anchor3dVerificationResult;
  readonly sheetLayout: Anchor3dSheetLayout;
  readonly stageRestored: boolean;
  readonly failureReasonKo?: string;
}

export interface Anchor3dAutoCaptureOptions {
  readonly anchorId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly subject: AnchorSubjectPlacement;
  readonly mode?: Anchor3dTurntableMode;
  readonly customAngles?: readonly AnchorAngleId[];
  readonly signal?: AbortSignal;
  readonly nowIso?: () => string;
  readonly onStepProgress?: (progress: {
    readonly completed: number;
    readonly total: number;
    readonly angleId: AnchorAngleId;
  }) => void;
}

/** 결정적 FNV-1a 64-bit 근사 2×32-bit 해시(외부 crypto 의존 없이 동기 동작). */
export function computeDeterministicFrameHashHex(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (b + i) & 0xff;
    h2 = Math.imul(h2, 0x27d4eb2d) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function resolveAnchorAnglesForMode(
  mode: Anchor3dTurntableMode,
  customAngles?: readonly AnchorAngleId[],
): readonly AnchorAngleId[] {
  if (customAngles && customAngles.length > 0) {
    return sortAnchorAngles(customAngles);
  }
  return mode === "six-view"
    ? ANCHOR_SIX_VIEW_TURNTABLE_ANGLES
    : ANCHOR_FOUR_VIEW_TURNTABLE_ANGLES;
}

/** 캡처 전에 카메라 궤도·입력 유효성·프레임 규격을 순수 계획으로 산출한다. */
export function planAnchor3dTurntableCapture(
  options: Omit<Anchor3dAutoCaptureOptions, "signal" | "onStepProgress" | "nowIso">,
): Anchor3dCapturePlan {
  const mode = options.mode ?? "four-view";
  const errors: string[] = [];
  if (!isValidAnchorId(options.anchorId)) {
    errors.push("앵커 식별자는 소문자·숫자·하이픈(1~40자) 형식이어야 합니다.");
  }
  if (!isValidAnchorCharacterId(options.characterId)) {
    errors.push("캐릭터 식별자 형식이 올바르지 않습니다.");
  }
  if (
    options.displayName.trim().length === 0 ||
    options.displayName.trim().length > ANCHOR_LIMITS.maxDisplayNameLength
  ) {
    errors.push("캐릭터 표시 이름은 1~40자여야 합니다.");
  }
  if (!Number.isFinite(options.subject.height) || options.subject.height <= 0) {
    errors.push("캐릭터 신장은 0보다 큰 유한한 값이어야 합니다.");
  }

  const angles = resolveAnchorAnglesForMode(mode, options.customAngles);
  const steps: Anchor3dCapturePlanStep[] =
    errors.length === 0
      ? angles.map((angleId, index) => ({
          index,
          angleId,
          pose: anchorCameraPose(angleId, options.subject),
          frameWidth: ANCHOR_CAPTURE_CONVENTION.frame.width,
          frameHeight: ANCHOR_CAPTURE_CONVENTION.frame.height,
          backgroundHex: ANCHOR_CAPTURE_CONVENTION.background.hex,
        }))
      : [];

  return {
    anchorId: options.anchorId,
    characterId: options.characterId,
    displayName: options.displayName.trim(),
    mode,
    steps,
    maxSetBytes: ANCHOR_LIMITS.maxSetBytes,
    errors,
  };
}

/** 2×2(4뷰) 또는 3×2(6뷰) 캐릭터 턴테이블 컨택트 시트 셀 좌표를 계산한다. */
export function buildAnchor3dSheetLayout(
  angles: readonly AnchorAngleId[],
  cellWidthPx = ANCHOR_CAPTURE_CONVENTION.frame.width,
  cellHeightPx = ANCHOR_CAPTURE_CONVENTION.frame.height,
  gutterPx = 16,
): Anchor3dSheetLayout {
  const ordered = sortAnchorAngles(angles);
  const columns = ordered.length <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(ordered.length / columns));
  const cells: Anchor3dSheetCellLayout[] = ordered.map((angleId, idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    return {
      angleId,
      col,
      row,
      xPx: col * (cellWidthPx + gutterPx),
      yPx: row * (cellHeightPx + gutterPx),
      widthPx: cellWidthPx,
      heightPx: cellHeightPx,
    };
  });
  return {
    columns,
    rows,
    sheetWidthPx: columns * cellWidthPx + Math.max(0, columns - 1) * gutterPx,
    sheetHeightPx: rows * cellHeightPx + Math.max(0, rows - 1) * gutterPx,
    cells,
  };
}

/** 캡처된 앵커 프레임 세트의 규격 준수·비율·중복 해시·좌우 대칭을 검증한다. */
export function verifyAnchor3dCaptureFrames(
  frames: readonly Anchor3dCapturedAngleRecord[],
  expectedAngles: readonly AnchorAngleId[],
  mode: Anchor3dTurntableMode,
): Anchor3dVerificationResult {
  const issues: Anchor3dVerificationIssue[] = [];
  const presentAngles = new Set(frames.map((frame) => frame.angleId));
  const targetAspect =
    ANCHOR_CAPTURE_CONVENTION.frame.width / ANCHOR_CAPTURE_CONVENTION.frame.height;
  const seenHashes = new Map<string, AnchorAngleId>();
  let totalBytes = 0;

  for (const required of expectedAngles) {
    if (!presentAngles.has(required)) {
      issues.push({
        code: "missing-required-angle",
        severity: "error",
        angleId: required,
        messageKo: `${required} 각도 앵커 캡처가 누락되었습니다.`,
      });
    }
  }

  if (mode === "six-view") {
    for (const [leftId, rightId] of ANCHOR_MIRROR_PAIRS) {
      if (presentAngles.has(leftId) !== presentAngles.has(rightId)) {
        issues.push({
          code: "unbalanced-mirror-pair",
          severity: "warning",
          angleId: presentAngles.has(leftId) ? rightId : leftId,
          messageKo: `반측·측면 좌우 쌍(${leftId}/${rightId}) 중 한쪽이 비어 있습니다.`,
        });
      }
    }
  }

  for (const frame of frames) {
    totalBytes += frame.byteLength;
    if (frame.byteLength === 0) {
      issues.push({
        code: "frame-empty",
        severity: "error",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 프레임 데이터가 비어 있습니다.`,
      });
    }
    if (frame.byteLength > ANCHOR_LIMITS.maxImageBytes) {
      issues.push({
        code: "frame-too-large",
        severity: "error",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 이미지 용량이 단일 한도(8MiB)를 초과했습니다.`,
      });
    }
    const minEdge = Math.min(frame.width, frame.height);
    const maxEdge = Math.max(frame.width, frame.height);
    if (minEdge < ANCHOR_LIMITS.minEdgePx) {
      issues.push({
        code: "below-min-edge",
        severity: "error",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 해상도가 최소 규격(256px)보다 작습니다.`,
      });
    }
    if (maxEdge > ANCHOR_LIMITS.maxEdgePx || frame.width * frame.height > ANCHOR_LIMITS.maxPixels) {
      issues.push({
        code: "above-max-edge",
        severity: "error",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 해상도가 최대 허용 규격을 초과했습니다.`,
      });
    }
    const ratio = frame.height > 0 ? frame.width / frame.height : 0;
    if (Math.abs(ratio - targetAspect) > ANCHOR_LIMITS.aspectTolerance) {
      issues.push({
        code: "aspect-ratio-drift",
        severity: "warning",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 비율(${ratio.toFixed(2)})이 2:3 앵커 규약과 차이가 있습니다.`,
      });
    }
    const prior = seenHashes.get(frame.contentHashHex);
    if (prior) {
      issues.push({
        code: "duplicate-frame-detected",
        severity: "error",
        angleId: frame.angleId,
        messageKo: `${frame.angleId} 캡처가 ${prior} 프레임과 동일합니다(카메라 회전 미반영 의심).`,
      });
    } else if (frame.byteLength > 0) {
      seenHashes.set(frame.contentHashHex, frame.angleId);
    }
  }

  if (totalBytes > ANCHOR_LIMITS.maxSetBytes) {
    issues.push({
      code: "set-too-large",
      severity: "error",
      messageKo: "앵커 세트 전체 용량이 30MiB 한도를 초과했습니다.",
    });
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const matchedCount = expectedAngles.filter((angleId) => presentAngles.has(angleId)).length;
  const completenessScore01 =
    expectedAngles.length > 0 ? Math.round((matchedCount / expectedAngles.length) * 1000) / 1000 : 0;

  return {
    valid: !hasError && frames.length > 0,
    completenessScore01,
    totalBytes,
    issues,
  };
}

/**
 * 3D 스테이지에서 4뷰/6뷰 캐릭터 앵커 시트를 원클릭 자동 캡처하고,
 * 예외나 취소 시에도 반드시 원래 조명·카메라 상태를 복구한다.
 */
export async function executeAnchor3dAutoCapture(
  adapter: Anchor3dStageRendererAdapter,
  options: Anchor3dAutoCaptureOptions,
): Promise<Anchor3dAutoCaptureReport> {
  const plan = planAnchor3dTurntableCapture(options);
  const expectedAngles = plan.steps.map((step) => step.angleId);
  const sheetLayout = buildAnchor3dSheetLayout(expectedAngles);

  if (plan.errors.length > 0) {
    return {
      schema: ANCHOR_SET_SCHEMA,
      specVersion: ANCHOR_SPEC_VERSION,
      status: "failed",
      anchorId: plan.anchorId,
      characterId: plan.characterId,
      displayName: plan.displayName,
      mode: plan.mode,
      frames: [],
      verification: {
        valid: false,
        completenessScore01: 0,
        totalBytes: 0,
        issues: [],
      },
      sheetLayout,
      stageRestored: true,
      failureReasonKo: plan.errors.join(" "),
    };
  }

  const captured: Anchor3dCapturedAngleRecord[] = [];
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  let failureReasonKo: string | undefined;
  let stageRestored = false;

  try {
    await adapter.applyNeutralStudioLighting();
    for (const step of plan.steps) {
      if (options.signal?.aborted) {
        failureReasonKo = "사용자가 턴테이블 자동 캡처를 취소했습니다.";
        break;
      }
      await adapter.applyCameraPose(step.pose);
      const raw = await adapter.captureFrame({
        angleId: step.angleId,
        width: step.frameWidth,
        height: step.frameHeight,
        format: "png",
        backgroundHex: step.backgroundHex,
      });
      captured.push({
        angleId: step.angleId,
        pose: step.pose,
        width: raw.width,
        height: raw.height,
        byteLength: raw.bytes.byteLength,
        mimeType: raw.mimeType,
        contentHashHex: computeDeterministicFrameHashHex(raw.bytes),
        capturedAtIso: nowIso(),
        bytes: raw.bytes,
      });
      options.onStepProgress?.({
        completed: captured.length,
        total: plan.steps.length,
        angleId: step.angleId,
      });
    }
  } catch (error) {
    failureReasonKo =
      error instanceof Error ? error.message : "3D 앵커 자동 캡처 중 알 수 없는 오류가 발생했습니다.";
  } finally {
    try {
      await adapter.restoreStageState();
      stageRestored = true;
    } catch {
      // 스테이지 복원 실패 시 기본값(false)을 유지한다.
    }
  }

  const verification = verifyAnchor3dCaptureFrames(captured, expectedAngles, plan.mode);
  const status: Anchor3dAutoCaptureReport["status"] =
    !failureReasonKo && verification.valid
      ? "ok"
      : captured.length > 0
        ? "partial"
        : "failed";

  return {
    schema: ANCHOR_SET_SCHEMA,
    specVersion: ANCHOR_SPEC_VERSION,
    status,
    anchorId: plan.anchorId,
    characterId: plan.characterId,
    displayName: plan.displayName,
    mode: plan.mode,
    frames: captured,
    verification,
    sheetLayout,
    stageRestored,
    ...(failureReasonKo ? { failureReasonKo } : {}),
  };
}

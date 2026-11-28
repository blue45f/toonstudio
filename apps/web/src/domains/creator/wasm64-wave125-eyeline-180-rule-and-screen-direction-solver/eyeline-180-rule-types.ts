/**
 * Wave 125 — 웹툰 대화·추격 컷 180도 액션 축(Line-of-Action)·시선 매치(Eyeline Match) 및
 * 스크린 방향 일관성 교정 솔버 공용 타입·상수·순수 ES2017 FIPS 180-4 SHA-256 모듈.
 */

export interface Vec2XZ {
  readonly x: number;
  readonly z: number;
}

export interface StageCharacterSpec {
  readonly characterId: string;
  readonly labelKo: string;
  readonly positionXZ: Vec2XZ;
  readonly eyeHeightM: number;
}

export type CameraShotKind =
  | "dialogue-ots"
  | "closeup"
  | "two-shot"
  | "neutral-axis-on"
  | "top-down-establishing"
  | "camera-dolly-bridge"
  | "chase-travel";

export type ScreenFacingDirection = "screen-left" | "screen-right" | "front";

export type MotionTravelDirection = "left-to-right" | "right-to-left";

export type HalfPlaneSign = -1 | 0 | 1;

export interface CameraCutSpec {
  readonly cutId: string;
  readonly shotKind: CameraShotKind;
  readonly cameraXZ: Vec2XZ;
  readonly subjectCharacterId: string;
  readonly lookTargetCharacterId?: string;
  readonly drawnEyelinePitchDeg?: number;
  readonly drawnScreenFacing?: ScreenFacingDirection;
  readonly motionDirection?: MotionTravelDirection;
  readonly labelKo?: string;
  readonly fovDeg?: number;
}

export interface DialogueActionSceneSpec {
  readonly sceneId: string;
  readonly titleKo: string;
  readonly characters: readonly StageCharacterSpec[];
  readonly axisAnchorPair: readonly [string, string];
  readonly cuts: readonly CameraCutSpec[];
}

export type EyelineViolationKind =
  | "axis-180-crossing"
  | "eyeline-horizontal-clash"
  | "eyeline-pitch-mismatch"
  | "screen-direction-reversal";

export type EyelineViolationSeverity = "blocker" | "warning";

export interface EyelineViolation {
  readonly violationId: string;
  readonly kind: EyelineViolationKind;
  readonly severity: EyelineViolationSeverity;
  readonly cutIndex: number;
  readonly cutId: string;
  readonly relatedCutId?: string;
  readonly summaryKo: string;
  readonly fixHintKo: string;
  readonly expectedHalfPlaneSign?: HalfPlaneSign;
  readonly actualHalfPlaneSign?: HalfPlaneSign;
  readonly expectedScreenFacing?: ScreenFacingDirection;
  readonly actualScreenFacing?: ScreenFacingDirection;
  readonly expectedPitchDeg?: number;
  readonly actualPitchDeg?: number;
  readonly pitchErrorDeg?: number;
  readonly expectedMotionDirection?: MotionTravelDirection;
  readonly actualMotionDirection?: MotionTravelDirection;
}

export interface LegalAxisTransitionRecord {
  readonly bridgeCutIndex: number;
  readonly bridgeCutId: string;
  readonly bridgeShotKind: CameraShotKind;
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly fromHalfPlaneSign: HalfPlaneSign;
  readonly toHalfPlaneSign: HalfPlaneSign;
}

export interface LegalScreenDirectionTransitionRecord {
  readonly bridgeCutIndex: number;
  readonly bridgeCutId: string;
  readonly bridgeShotKind: CameraShotKind;
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly fromDirection: MotionTravelDirection;
  readonly toDirection: MotionTravelDirection;
}

export interface CutGeometryAnalysis {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly shotKind: CameraShotKind;
  readonly isBridgeShot: boolean;
  readonly signedCross2D: number;
  readonly signedDistanceToAxisM: number;
  readonly rawHalfPlaneSign: HalfPlaneSign;
  readonly activeSafeHalfPlaneSign: HalfPlaneSign;
  readonly crossedAxisIllegally: boolean;
  readonly legalAxisTransitionApplied: boolean;
  readonly safeReferenceCameraXZ: Vec2XZ;
  readonly projectedScreenFacingFromActualCamera: ScreenFacingDirection | null;
  readonly expectedScreenFacing: ScreenFacingDirection | null;
  readonly expectedEyelinePitchDeg: number | null;
  readonly eyelinePitchErrorDeg: number | null;
  readonly expectedMotionDirection: MotionTravelDirection | null;
  readonly violationIds: readonly string[];
}

export interface AxisGeometrySummary {
  readonly anchorAId: string;
  readonly anchorBId: string;
  readonly anchorALabelKo: string;
  readonly anchorBLabelKo: string;
  readonly anchorAXZ: Vec2XZ | null;
  readonly anchorBXZ: Vec2XZ | null;
  readonly axisLengthM: number;
  readonly isAxisValid: boolean;
  readonly initialSafeHalfPlaneSign: HalfPlaneSign;
  readonly finalSafeHalfPlaneSign: HalfPlaneSign;
}

export interface AuditEyeline180Options {
  readonly pitchToleranceDeg?: number;
  readonly axisOnLineToleranceM?: number;
  readonly frontFacingDeadzoneDeg?: number;
}

export interface Eyeline180AuditResult {
  readonly sceneId: string;
  readonly titleKo: string;
  readonly axisSummary: AxisGeometrySummary;
  readonly cutAnalyses: readonly CutGeometryAnalysis[];
  readonly violations: readonly EyelineViolation[];
  readonly legalAxisTransitions: readonly LegalAxisTransitionRecord[];
  readonly legalScreenDirectionTransitions: readonly LegalScreenDirectionTransitionRecord[];
  readonly totalViolationCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly pitchToleranceDeg: number;
  readonly continuityScore: number;
  readonly passed: boolean;
  readonly remediationHintsKo: readonly string[];
  readonly fingerprintSha256: string;
}

export type CameraBlockingFixActionKind =
  | "reflect-camera-across-axis"
  | "align-screen-facing"
  | "align-eyeline-pitch"
  | "align-motion-direction";

export interface CameraBlockingFixRecord {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly actions: readonly CameraBlockingFixActionKind[];
  readonly originalCameraXZ: Vec2XZ;
  readonly fixedCameraXZ: Vec2XZ;
  readonly distanceToAnchorAPreservedErrorM: number;
  readonly distanceToAnchorBPreservedErrorM: number;
  readonly originalScreenFacing?: ScreenFacingDirection;
  readonly fixedScreenFacing?: ScreenFacingDirection;
  readonly originalEyelinePitchDeg?: number;
  readonly fixedEyelinePitchDeg?: number;
  readonly originalMotionDirection?: MotionTravelDirection;
  readonly fixedMotionDirection?: MotionTravelDirection;
  readonly noteKo: string;
}

export interface SafeCameraBlockingFixResult {
  readonly originalScene: DialogueActionSceneSpec;
  readonly fixedScene: DialogueActionSceneSpec;
  readonly beforeAudit: Eyeline180AuditResult;
  readonly afterAudit: Eyeline180AuditResult;
  readonly fixesApplied: readonly CameraBlockingFixRecord[];
  readonly isFullyResolved: boolean;
  readonly beforeFingerprintSha256: string;
  readonly afterFingerprintSha256: string;
}

export const DEFAULT_EYELINE_PITCH_TOLERANCE_DEG = 15;
export const DEFAULT_AXIS_ON_LINE_TOLERANCE_M = 0.05;
export const DEFAULT_FRONT_FACING_DEADZONE_DEG = 1.5;
export const GEOMETRY_EPSILON = 1e-6;

export const LEGAL_AXIS_BRIDGE_SHOT_KINDS: readonly CameraShotKind[] = [
  "neutral-axis-on",
  "top-down-establishing",
  "camera-dolly-bridge",
];

export const CAMERA_SHOT_KIND_LABELS_KO: Readonly<Record<CameraShotKind, string>> = {
  "dialogue-ots": "어깨너머 대화 컷(OTS)",
  closeup: "클로즈업",
  "two-shot": "투샷",
  "neutral-axis-on": "액션 축 정면 중립 컷",
  "top-down-establishing": "부감 전경 컷",
  "camera-dolly-bridge": "카메라 돌리 이동 브리지",
  "chase-travel": "추격·이동 컷",
};

export const SCREEN_FACING_LABELS_KO: Readonly<Record<ScreenFacingDirection, string>> = {
  "screen-left": "화면 왼쪽",
  "screen-right": "화면 오른쪽",
  front: "정면",
};

export const MOTION_DIRECTION_LABELS_KO: Readonly<Record<MotionTravelDirection, string>> = {
  "left-to-right": "왼쪽→오른쪽",
  "right-to-left": "오른쪽→왼쪽",
};

export const VIOLATION_KIND_LABELS_KO: Readonly<Record<EyelineViolationKind, string>> = {
  "axis-180-crossing": "180도 액션 축 침범",
  "eyeline-horizontal-clash": "좌우 시선 방향 충돌",
  "eyeline-pitch-mismatch": "시선 고도(피치) 불일치",
  "screen-direction-reversal": "추격·이동 스크린 방향 반전",
};

export function isLegalAxisBridgeShot(shotKind: CameraShotKind): boolean {
  return (
    shotKind === "neutral-axis-on" ||
    shotKind === "top-down-establishing" ||
    shotKind === "camera-dolly-bridge"
  );
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 해시. */
export function sha256EyelineHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const kVal = SHA256_K[i] ?? 0;
      const wVal = w[i] ?? 0;
      const temp1 = (h + s1 + ch + kVal + wVal) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 결정론적 JSON 문자열을 만든다. */
export function canonicalizeBlockingJson(value: unknown): string {
  if (value === null) return "null";
  const valueType = typeof value;
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    const normalized = Math.round(num * 1e6) / 1e6;
    return Object.is(normalized, -0) ? "0" : JSON.stringify(normalized);
  }
  if (valueType === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? "null" : canonicalizeBlockingJson(item),
    );
    return `[${items.join(",")}]`;
  }
  if (valueType === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key !== undefined && rec[key] !== undefined) {
        parts.push(`${JSON.stringify(key)}:${canonicalizeBlockingJson(rec[key])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

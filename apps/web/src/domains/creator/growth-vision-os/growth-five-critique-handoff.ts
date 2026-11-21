/**
 * 성장 단계 엔진 3·4:
 * - 학원·대학·멘토링 라이브 첨삭 교실 (원본 보호 · 레드라인 · Before/After 리플레이)
 * - 아이패드·갤럭시탭·PC 오프라인 이어 그리기 핸드오프 (TSHO1 직렬화 · 무손실 복원)
 */

import {
  base64UrlToUtf8,
  clampNumber,
  constantTimeEquals,
  deterministicDigest,
  utf8ToBase64Url,
} from "./growth-five-crypto";

// ---------------------------------------------------------------------------
// 3. 학원·대학·멘토링 라이브 첨삭 교실
// ---------------------------------------------------------------------------

export interface CritiquePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export type CritiqueToolKind =
  | "redline-pen"
  | "anatomy-guide"
  | "perspective-line"
  | "highlight-marker";

export interface CritiqueStroke {
  readonly id: string;
  readonly authorName: string;
  readonly timestampMs: number;
  readonly tool: CritiqueToolKind;
  readonly points: readonly CritiquePoint[];
  readonly note: string;
}

export interface CreateCritiqueSessionInput {
  readonly sessionId: string;
  readonly classTitle: string;
  readonly studentName: string;
  readonly instructorName: string;
  readonly episodeLabel: string;
  readonly originalStrokes: readonly CritiqueStroke[];
  readonly initialRedlines?: readonly CritiqueStroke[];
  readonly createdAtMs: number;
}

export interface LiveCritiqueSession {
  readonly sessionId: string;
  readonly classTitle: string;
  readonly studentName: string;
  readonly instructorName: string;
  readonly episodeLabel: string;
  readonly studentOriginalLayer: {
    readonly id: "student-original";
    readonly locked: true;
    readonly readonly: true;
    readonly strokeCount: number;
    readonly strokes: readonly CritiqueStroke[];
    readonly integrityHash: string;
  };
  readonly redlineLayer: {
    readonly id: "instructor-redline";
    readonly colorToken: "oklch(0.62 0.22 25)";
    readonly strokes: readonly CritiqueStroke[];
  };
  readonly createdAtMs: number;
}

export interface CritiqueReplayFrame {
  readonly mode: "before" | "replaying" | "after";
  readonly progressPct: number;
  readonly originalProtected: boolean;
  readonly originalIntegrityHash: string;
  readonly studentStrokeCount: number;
  readonly visibleRedlineStrokes: readonly CritiqueStroke[];
  readonly totalRedlineCount: number;
  readonly activeNote: string;
}

function cloneFrozenStroke(stroke: CritiqueStroke): CritiqueStroke {
  return Object.freeze({
    ...stroke,
    points: Object.freeze(stroke.points.map((pt) => Object.freeze({ ...pt }))),
  });
}

function hashCritiqueStrokes(strokes: readonly CritiqueStroke[]): string {
  const canonical = strokes
    .map(
      (stroke) =>
        `${stroke.id}|${stroke.authorName}|${stroke.timestampMs}|${stroke.tool}|${stroke.points
          .map((p) => `${p.x},${p.y},${p.pressure}`)
          .join(";")}`,
    )
    .join("||");
  return deterministicDigest(canonical, "student-original-lock");
}

export function createLiveCritiqueSession(input: CreateCritiqueSessionInput): LiveCritiqueSession {
  const frozenOriginals = Object.freeze(input.originalStrokes.map(cloneFrozenStroke));
  const integrityHash = hashCritiqueStrokes(frozenOriginals);
  const redlines = [...(input.initialRedlines ?? [])]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map(cloneFrozenStroke);

  return Object.freeze({
    sessionId: input.sessionId,
    classTitle: input.classTitle,
    studentName: input.studentName,
    instructorName: input.instructorName,
    episodeLabel: input.episodeLabel,
    studentOriginalLayer: Object.freeze({
      id: "student-original" as const,
      locked: true as const,
      readonly: true as const,
      strokeCount: frozenOriginals.length,
      strokes: frozenOriginals,
      integrityHash,
    }),
    redlineLayer: Object.freeze({
      id: "instructor-redline" as const,
      colorToken: "oklch(0.62 0.22 25)" as const,
      strokes: Object.freeze(redlines),
    }),
    createdAtMs: input.createdAtMs,
  });
}

export function appendCritiqueRedlineStroke(
  session: LiveCritiqueSession,
  stroke: CritiqueStroke,
): LiveCritiqueSession {
  const nextRedlines = [...session.redlineLayer.strokes, cloneFrozenStroke(stroke)].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );
  return Object.freeze({
    ...session,
    redlineLayer: Object.freeze({
      ...session.redlineLayer,
      strokes: Object.freeze(nextRedlines),
    }),
  });
}

export function buildCritiqueReplayFrame(
  session: LiveCritiqueSession,
  progressPct: number,
): CritiqueReplayFrame {
  const clamped = Math.round(clampNumber(progressPct, 0, 100));
  const recomputedHash = hashCritiqueStrokes(session.studentOriginalLayer.strokes);
  const originalProtected =
    session.studentOriginalLayer.locked &&
    session.studentOriginalLayer.readonly &&
    constantTimeEquals(recomputedHash, session.studentOriginalLayer.integrityHash);

  const totalRedlineCount = session.redlineLayer.strokes.length;
  if (clamped === 0 || totalRedlineCount === 0) {
    return {
      mode: "before",
      progressPct: clamped,
      originalProtected,
      originalIntegrityHash: session.studentOriginalLayer.integrityHash,
      studentStrokeCount: session.studentOriginalLayer.strokeCount,
      visibleRedlineStrokes: [],
      totalRedlineCount,
      activeNote: "수강생 원본 상태(Before)입니다. 원본 레이어는 읽기 전용으로 잠겨 있습니다.",
    };
  }

  const visibleCount =
    clamped >= 100
      ? totalRedlineCount
      : Math.max(1, Math.min(totalRedlineCount, Math.ceil((clamped / 100) * totalRedlineCount)));
  const visibleRedlineStrokes = session.redlineLayer.strokes.slice(0, visibleCount);
  const latestStroke = visibleRedlineStrokes[visibleRedlineStrokes.length - 1];

  return {
    mode: clamped >= 100 ? "after" : "replaying",
    progressPct: clamped,
    originalProtected,
    originalIntegrityHash: session.studentOriginalLayer.integrityHash,
    studentStrokeCount: session.studentOriginalLayer.strokeCount,
    visibleRedlineStrokes,
    totalRedlineCount,
    activeNote: latestStroke?.note ?? "강사 레드라인 시연 완료(After)",
  };
}

export const DEFAULT_CRITIQUE_SESSION_INPUT: CreateCritiqueSessionInput = {
  sessionId: "critique-seoul-class-07",
  classTitle: "웹툰 연출·인체 동세 실전반",
  studentName: "김하늘 수강생",
  instructorName: "박서준 메인 멘토",
  episodeLabel: "과제 3화 · 12컷 액션 포즈",
  createdAtMs: 1_763_740_000_000,
  originalStrokes: [
    {
      id: "stu-1",
      authorName: "김하늘 수강생",
      timestampMs: 1_763_739_000_000,
      tool: "anatomy-guide",
      points: [
        { x: 120, y: 80, pressure: 0.6 },
        { x: 145, y: 180, pressure: 0.7 },
      ],
      note: "상체 러프 선화",
    },
    {
      id: "stu-2",
      authorName: "김하늘 수강생",
      timestampMs: 1_763_739_060_000,
      tool: "perspective-line",
      points: [
        { x: 40, y: 310, pressure: 0.5 },
        { x: 420, y: 260, pressure: 0.5 },
      ],
      note: "바닥 시선선",
    },
  ],
  initialRedlines: [
    {
      id: "red-1",
      authorName: "박서준 메인 멘토",
      timestampMs: 1_763_740_010_000,
      tool: "anatomy-guide",
      points: [
        { x: 132, y: 74, pressure: 0.85 },
        { x: 168, y: 195, pressure: 0.9 },
      ],
      note: "무게중심을 오른발 쪽으로 8도 기울이면 도약감이 살아납니다.",
    },
    {
      id: "red-2",
      authorName: "박서준 메인 멘토",
      timestampMs: 1_763_740_035_000,
      tool: "perspective-line",
      points: [
        { x: 25, y: 340, pressure: 0.75 },
        { x: 460, y: 230, pressure: 0.75 },
      ],
      note: "소실점을 컷 오른쪽 밖으로 빼면 검격 속도가 배가 됩니다.",
    },
    {
      id: "red-3",
      authorName: "박서준 메인 멘토",
      timestampMs: 1_763_740_060_000,
      tool: "highlight-marker",
      points: [
        { x: 190, y: 120, pressure: 0.92 },
        { x: 260, y: 155, pressure: 0.92 },
      ],
      note: "어깨 실루엣 바깥선에 굵기 대비를 주면 모바일 세로 화면에서 즉시 읽힙니다.",
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. 아이패드·갤럭시탭·PC 오프라인 이어 그리기 핸드오프
// ---------------------------------------------------------------------------

export type HandoffDeviceKind = "ipad-pro" | "galaxy-tab" | "desktop-pc";

export interface DeviceHandoffBrush {
  readonly id: string;
  readonly name: string;
  readonly sizePx: number;
  readonly opacityPct: number;
  readonly pressureCurve: "soft" | "linear" | "firm";
}

export interface DeviceHandoffViewport {
  readonly zoomPct: number;
  readonly rotationDeg: number;
  readonly panX: number;
  readonly panY: number;
}

export interface DeviceHandoffLayerState {
  readonly layerId: string;
  readonly visible: boolean;
  readonly opacityPct: number;
}

export interface DeviceUnsavedDeltaOp {
  readonly opId: string;
  readonly layerId: string;
  readonly strokePoints: number;
  readonly checksum: string;
}

export interface DeviceHandoffState {
  readonly sourceDevice: HandoffDeviceKind;
  readonly targetDevice: HandoffDeviceKind;
  readonly projectId: string;
  readonly episodeNumber: number;
  readonly activeBrush: DeviceHandoffBrush;
  readonly viewport: DeviceHandoffViewport;
  readonly selectedLayerId: string;
  readonly layerVisibility: readonly DeviceHandoffLayerState[];
  readonly unsavedDeltaOps: readonly DeviceUnsavedDeltaOp[];
  readonly capturedAtMs: number;
}

export interface DeviceHandoffSnapshot {
  readonly token: string;
  readonly formatVersion: "TSHO1";
  readonly byteLength: number;
  readonly unsavedDeltaHash: string;
  readonly checksum: string;
  readonly offlineReady: true;
  readonly qrPayloadSafe: boolean;
  readonly summary: {
    readonly sourceDevice: HandoffDeviceKind;
    readonly targetDevice: HandoffDeviceKind;
    readonly brushName: string;
    readonly zoomPct: number;
    readonly rotationDeg: number;
    readonly selectedLayerId: string;
    readonly deltaOpCount: number;
  };
}

export type DeviceHandoffRestoreResult =
  | {
      readonly ok: true;
      readonly state: DeviceHandoffState;
      readonly restoredOnDevice: HandoffDeviceKind;
      readonly unsavedDeltaHash: string;
      readonly unsavedDeltaVerified: true;
      readonly deltaOpCount: number;
      readonly losslessMatched: true;
    }
  | {
      readonly ok: false;
      readonly errorCode: "invalid-format" | "checksum-mismatch" | "delta-hash-mismatch";
      readonly messageKo: string;
    };

interface CompactHandoffWirePayload {
  readonly v: 1;
  readonly s: DeviceHandoffState;
  readonly dh: string;
}

function computeDeltaHash(ops: readonly DeviceUnsavedDeltaOp[]): string {
  const canonical = ops
    .map((op) => `${op.opId}|${op.layerId}|${op.strokePoints}|${op.checksum}`)
    .join(";");
  return deterministicDigest(canonical, "handoff-delta-v1");
}

function isHandoffDevice(value: unknown): value is HandoffDeviceKind {
  return value === "ipad-pro" || value === "galaxy-tab" || value === "desktop-pc";
}

function isValidWirePayload(parsed: unknown): parsed is CompactHandoffWirePayload {
  if (typeof parsed !== "object" || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  if (record.v !== 1 || typeof record.dh !== "string") return false;
  if (typeof record.s !== "object" || record.s === null) return false;
  const state = record.s as Record<string, unknown>;
  if (
    !isHandoffDevice(state.sourceDevice) ||
    !isHandoffDevice(state.targetDevice) ||
    typeof state.projectId !== "string" ||
    typeof state.episodeNumber !== "number" ||
    typeof state.selectedLayerId !== "string" ||
    typeof state.capturedAtMs !== "number" ||
    !Array.isArray(state.layerVisibility) ||
    !Array.isArray(state.unsavedDeltaOps)
  ) {
    return false;
  }
  const brush = state.activeBrush as Record<string, unknown> | null;
  const viewport = state.viewport as Record<string, unknown> | null;
  if (!brush || typeof brush.id !== "string" || typeof brush.name !== "string" || typeof brush.sizePx !== "number") {
    return false;
  }
  if (
    !viewport ||
    typeof viewport.zoomPct !== "number" ||
    typeof viewport.rotationDeg !== "number" ||
    typeof viewport.panX !== "number" ||
    typeof viewport.panY !== "number"
  ) {
    return false;
  }
  return true;
}

export function createDeviceHandoffSnapshot(state: DeviceHandoffState): DeviceHandoffSnapshot {
  const unsavedDeltaHash = computeDeltaHash(state.unsavedDeltaOps);
  const wire: CompactHandoffWirePayload = {
    v: 1,
    s: {
      ...state,
      activeBrush: { ...state.activeBrush },
      viewport: { ...state.viewport },
      layerVisibility: state.layerVisibility.map((item) => ({ ...item })),
      unsavedDeltaOps: state.unsavedDeltaOps.map((op) => ({ ...op })),
    },
    dh: unsavedDeltaHash,
  };
  const encodedPayload = utf8ToBase64Url(JSON.stringify(wire));
  const checksum = deterministicDigest(encodedPayload, "tsho1-crc").slice(6, 22);
  const token = `TSHO1.${encodedPayload}.${checksum}`;

  return {
    token,
    formatVersion: "TSHO1",
    byteLength: token.length,
    unsavedDeltaHash,
    checksum,
    offlineReady: true,
    qrPayloadSafe: token.length <= 2048,
    summary: {
      sourceDevice: state.sourceDevice,
      targetDevice: state.targetDevice,
      brushName: state.activeBrush.name,
      zoomPct: state.viewport.zoomPct,
      rotationDeg: state.viewport.rotationDeg,
      selectedLayerId: state.selectedLayerId,
      deltaOpCount: state.unsavedDeltaOps.length,
    },
  };
}

export function restoreDeviceHandoff(
  token: string,
  targetDevice?: HandoffDeviceKind,
): DeviceHandoffRestoreResult {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "TSHO1") {
    return {
      ok: false,
      errorCode: "invalid-format",
      messageKo: "핸드오프 토큰 형식이 올바르지 않습니다. TSHO1 QR 또는 복사 문자열을 확인해 주세요.",
    };
  }
  const encodedPayload = parts[1] ?? "";
  const suppliedChecksum = parts[2] ?? "";
  const expectedChecksum = deterministicDigest(encodedPayload, "tsho1-crc").slice(6, 22);
  if (!constantTimeEquals(suppliedChecksum, expectedChecksum)) {
    return {
      ok: false,
      errorCode: "checksum-mismatch",
      messageKo: "토큰 무결성 체크섬이 손상되었습니다. 출발 기기에서 핸드오프를 다시 발급해 주세요.",
    };
  }

  const decodedText = base64UrlToUtf8(encodedPayload);
  if (decodedText === null) {
    return {
      ok: false,
      errorCode: "invalid-format",
      messageKo: "핸드오프 페이로드를 해독할 수 없습니다.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedText);
  } catch {
    return {
      ok: false,
      errorCode: "invalid-format",
      messageKo: "핸드오프 JSON 구문이 깨졌습니다.",
    };
  }

  if (!isValidWirePayload(parsed)) {
    return {
      ok: false,
      errorCode: "invalid-format",
      messageKo: "필수 브러시·뷰포트·레이어 필드가 누락되었습니다.",
    };
  }

  const recomputedDeltaHash = computeDeltaHash(parsed.s.unsavedDeltaOps);
  if (!constantTimeEquals(recomputedDeltaHash, parsed.dh)) {
    return {
      ok: false,
      errorCode: "delta-hash-mismatch",
      messageKo: "미저장 차분 스트로크 해시가 불일치하여 손실 방지를 위해 복원을 중단했습니다.",
    };
  }

  return {
    ok: true,
    state: parsed.s,
    restoredOnDevice: targetDevice ?? parsed.s.targetDevice,
    unsavedDeltaHash: recomputedDeltaHash,
    unsavedDeltaVerified: true,
    deltaOpCount: parsed.s.unsavedDeltaOps.length,
    losslessMatched: true,
  };
}

export const DEFAULT_DEVICE_HANDOFF_STATE: DeviceHandoffState = {
  sourceDevice: "ipad-pro",
  targetDevice: "desktop-pc",
  projectId: "proj-silver-clocktower",
  episodeNumber: 24,
  activeBrush: {
    id: "brush-gpen-pro-03",
    name: "G펜 프로 선화(필압 민감)",
    sizePx: 6.5,
    opacityPct: 96,
    pressureCurve: "firm",
  },
  viewport: {
    zoomPct: 162.5,
    rotationDeg: -14.5,
    panX: 340,
    panY: 1280,
  },
  selectedLayerId: "layer-ink-hero",
  layerVisibility: [
    { layerId: "layer-bg-palace", visible: true, opacityPct: 85 },
    { layerId: "layer-ink-hero", visible: true, opacityPct: 100 },
    { layerId: "layer-speech-ep24", visible: false, opacityPct: 100 },
  ],
  unsavedDeltaOps: [
    { opId: "delta-101", layerId: "layer-ink-hero", strokePoints: 48, checksum: "91f2a0" },
    { opId: "delta-102", layerId: "layer-ink-hero", strokePoints: 32, checksum: "44bc19" },
    { opId: "delta-103", layerId: "layer-ink-hero", strokePoints: 61, checksum: "70de83" },
  ],
  capturedAtMs: 1_763_740_120_000,
};

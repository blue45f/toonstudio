/**
 * Studio BG3D 임의 각도 일괄 캡처 세트.
 *
 * 기존에는 컷(샷)을 하나씩만 기록할 수 있었다: 카메라를 각도마다 직접 돌려 가며
 * "현재 컷 기록"을 반복해야 해서, 한 포즈·씬의 정면·측면·하이·로우 후보를 뽑는 데
 * 각도 수만큼의 수동 왕복이 필요했다. 이 모듈은 각도 프리셋 세트(기본 4각도·
 * 둘러보기 8각도·연출 6각도)를 정의하고, 현재 카메라의 타깃·거리를 기준으로
 * 세트 전체를 한 번에 샷으로 캡처해 후보 그리드로 제시하며, 후보 선택 시
 * 기존 샷 적용 경로(applyStudioBg3dShot)로 그 컷을 씬에 삽입한다.
 *
 * 캡처는 기존 captureStudioBg3dShot을 각도 카메라로 순차 적용하는 방식으로만
 * 이뤄지므로, 각 후보 샷은 카메라뿐 아니라 표시·조명·배경·LT 설정을 그 순간의
 * 씬 상태로 동결한 정식 샷이다. 전체 세트가 하나의 결과로만 반환되고(부분 캡처
 * 금지), 캡처 후 문서 카메라는 원래 카메라·활성 샷으로 복원된다 — 후보를
 * 둘러보는 동안 작업 중이던 시점이 흔들리지 않는다.
 */

import {
  createStudioBg3dCameraUpForDutchRoll,
  resolveStudioBg3dCameraUpVector,
} from "./studio-bg3d-camera-orientation";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
  STUDIO_BG3D_SHOT_ID_MAX_LENGTH,
  STUDIO_BG3D_SHOT_NAME_MAX_LENGTH,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  parseStudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
  type StudioBg3dSceneDocument,
  type StudioBg3dShot,
} from "./studio-bg3d-scene-document";

export type StudioBg3dMultiAngleId =
  | "front"
  | "front-right"
  | "right"
  | "back-right"
  | "back"
  | "back-left"
  | "left"
  | "front-left"
  | "high"
  | "low"
  | "top"
  | "dutch-right"
  | "dutch-left";

export type StudioBg3dMultiAngleSetId = "basic-4" | "orbit-8" | "drama-6";

/** 각도 1개. 방위는 현재 카메라 방위에 대한 상대 오프셋, 고도는 절대값(없으면 현재 고도 유지). */
export interface StudioBg3dMultiAngle {
  readonly id: StudioBg3dMultiAngleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly azimuthOffsetDeg: number;
  /** 절대 고도(°). null이면 현재 카메라 고도를 유지한다. */
  readonly elevationDeg: number | null;
  readonly dutchRollDeg: number;
}

export interface StudioBg3dMultiAngleSet {
  readonly id: StudioBg3dMultiAngleSetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly angleIds: readonly StudioBg3dMultiAngleId[];
}

/** 후보 그리드 1칸: 캡처될(또는 캡처된) 샷과 그 카메라·썸네일 각도. */
export interface StudioBg3dMultiAngleCandidate {
  readonly angleId: StudioBg3dMultiAngleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shotId: string;
  readonly name: string;
  readonly camera: StudioBg3dCameraSettings;
  /** 썸네일 다이어그램용 절대 방위(°, -180~180). */
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
}

export interface StudioBg3dMultiAngleCapturePlan {
  readonly setId: StudioBg3dMultiAngleSetId;
  readonly batchId: string;
  readonly candidates: readonly StudioBg3dMultiAngleCandidate[];
}

export interface StudioBg3dMultiAngleCaptureResult {
  readonly document: StudioBg3dSceneDocument;
  readonly plan: StudioBg3dMultiAngleCapturePlan;
}

const ANGLE = (
  id: StudioBg3dMultiAngleId,
  labelKo: string,
  labelEn: string,
  azimuthOffsetDeg: number,
  elevationDeg: number | null,
  dutchRollDeg = 0,
): StudioBg3dMultiAngle =>
  Object.freeze({ id, labelKo, labelEn, azimuthOffsetDeg, elevationDeg, dutchRollDeg });

export const STUDIO_BG3D_MULTI_ANGLES: readonly StudioBg3dMultiAngle[] = Object.freeze([
  ANGLE("front", "정면", "Front", 0, null),
  ANGLE("front-right", "우측 3/4", "Front-right three-quarter", 45, null),
  ANGLE("right", "측면 (우)", "Right side", 90, null),
  ANGLE("back-right", "후면 우측", "Back-right", 135, null),
  ANGLE("back", "후면", "Back", 180, null),
  ANGLE("back-left", "후면 좌측", "Back-left", -135, null),
  ANGLE("left", "측면 (좌)", "Left side", -90, null),
  ANGLE("front-left", "좌측 3/4", "Front-left three-quarter", -45, null),
  ANGLE("high", "하이앵글", "High angle", 0, 55),
  ANGLE("low", "로우앵글", "Low angle", 0, -22),
  ANGLE("top", "탑뷰", "Top view", 0, 80),
  ANGLE("dutch-right", "더치 (우)", "Dutch (right)", 35, null, -16),
  ANGLE("dutch-left", "더치 (좌)", "Dutch (left)", -35, null, 16),
]);

export const STUDIO_BG3D_MULTI_ANGLE_SETS: readonly StudioBg3dMultiAngleSet[] = Object.freeze([
  Object.freeze({
    id: "basic-4",
    labelKo: "기본 4각도",
    labelEn: "Basic 4 angles",
    descriptionKo: "정면·측면·하이·로우 — 컷 후보를 빠르게 훑는 최소 세트",
    descriptionEn: "Front, side, high, and low — the quick candidate sweep.",
    angleIds: Object.freeze(["front", "right", "high", "low"] as const),
  }),
  Object.freeze({
    id: "orbit-8",
    labelKo: "둘러보기 8각도",
    labelEn: "Orbit 8 angles",
    descriptionKo: "45° 간격으로 한 바퀴 — 공간 파악과 뒷모습 후보까지",
    descriptionEn: "A full 45° orbit, including back views.",
    angleIds: Object.freeze([
      "front",
      "front-right",
      "right",
      "back-right",
      "back",
      "back-left",
      "left",
      "front-left",
    ] as const),
  }),
  Object.freeze({
    id: "drama-6",
    labelKo: "연출 6각도",
    labelEn: "Drama 6 angles",
    descriptionKo: "하이·로우·탑뷰·더치 — 감정과 긴장을 만드는 연출 각도",
    descriptionEn: "High, low, top, and dutch angles for dramatic cuts.",
    angleIds: Object.freeze([
      "front",
      "high",
      "low",
      "top",
      "dutch-right",
      "dutch-left",
    ] as const),
  }),
]);

const BATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;
const MIN_ELEVATION_DEG = -80;
const MAX_ELEVATION_DEG = 85;

export function listStudioBg3dMultiAngleSets(): readonly StudioBg3dMultiAngleSet[] {
  return STUDIO_BG3D_MULTI_ANGLE_SETS;
}

export function getStudioBg3dMultiAngleSet(
  setId: string,
): StudioBg3dMultiAngleSet | null {
  return STUDIO_BG3D_MULTI_ANGLE_SETS.find((set) => set.id === setId) ?? null;
}

export function getStudioBg3dMultiAngle(
  angleId: string,
): StudioBg3dMultiAngle | null {
  return STUDIO_BG3D_MULTI_ANGLES.find((angle) => angle.id === angleId) ?? null;
}

export function studioBg3dMultiAngleShotId(batchId: string, angleId: string): string {
  return `${batchId}-${angleId}`;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeAzimuthDeg(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return round3(wrapped);
}

function canonicalDocument(raw: unknown): StudioBg3dSceneDocument | null {
  if (typeof raw === "string") return parseStudioBg3dSceneDocument(raw);
  let json: string | undefined;
  try {
    json = JSON.stringify(raw);
  } catch {
    return null;
  }
  return typeof json === "string" ? parseStudioBg3dSceneDocument(json) : null;
}

/**
 * 현재 카메라의 타깃·거리를 유지한 채 각도만 바꾼 카메라를 계산한다.
 * 방위는 현재 방위 + 오프셋, 고도는 각도의 절대 고도(없으면 현재 고도)를
 * 특이점 방지 범위(-80°~85°)로 제한한다. 유효하지 않은 카메라는 null.
 */
export function buildStudioBg3dMultiAngleCamera(
  baseCamera: StudioBg3dCameraSettings,
  angle: StudioBg3dMultiAngle,
): StudioBg3dCameraSettings | null {
  const dx = baseCamera.position[0] - baseCamera.target[0];
  const dy = baseCamera.position[1] - baseCamera.target[1];
  const dz = baseCamera.position[2] - baseCamera.target[2];
  const distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance < 1e-6) return null;
  const baseAzimuthDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
  const baseElevationDeg =
    (Math.asin(Math.min(1, Math.max(-1, dy / distance))) * 180) / Math.PI;
  const azimuthDeg = baseAzimuthDeg + angle.azimuthOffsetDeg;
  const elevationDeg = Math.min(
    MAX_ELEVATION_DEG,
    Math.max(MIN_ELEVATION_DEG, angle.elevationDeg ?? baseElevationDeg),
  );
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  const position = Object.freeze([
    round3(baseCamera.target[0] + Math.sin(azimuth) * horizontal),
    round3(baseCamera.target[1] + Math.sin(elevation) * distance),
    round3(baseCamera.target[2] + Math.cos(azimuth) * horizontal),
  ] as const);
  const up =
    angle.dutchRollDeg !== 0
      ? createStudioBg3dCameraUpForDutchRoll(
          { position, target: baseCamera.target },
          angle.dutchRollDeg,
        )
      : resolveStudioBg3dCameraUpVector({
          position,
          target: baseCamera.target,
          up: baseCamera.up,
        });
  if (!up) return null;
  return Object.freeze({ ...baseCamera, position, up });
}

interface PlannedBatch {
  readonly document: StudioBg3dSceneDocument;
  readonly plan: StudioBg3dMultiAngleCapturePlan;
}

function planBatch(
  raw: unknown,
  setId: string,
  batchId: string,
): PlannedBatch | null {
  const set = getStudioBg3dMultiAngleSet(setId);
  if (!set || !BATCH_ID_PATTERN.test(batchId)) return null;
  const document = canonicalDocument(raw);
  if (!document) return null;
  const existing = document.shots ?? [];
  if (existing.length + set.angleIds.length > STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS) {
    return null;
  }
  const existingIds = new Set(existing.map((shot) => shot.id));
  const candidates: StudioBg3dMultiAngleCandidate[] = [];
  for (const angleId of set.angleIds) {
    const angle = getStudioBg3dMultiAngle(angleId);
    if (!angle) return null;
    const shotId = studioBg3dMultiAngleShotId(batchId, angleId);
    if (shotId.length > STUDIO_BG3D_SHOT_ID_MAX_LENGTH || existingIds.has(shotId)) {
      return null;
    }
    const name = `${set.labelKo} · ${angle.labelKo}`;
    if (name.length > STUDIO_BG3D_SHOT_NAME_MAX_LENGTH) return null;
    const camera = buildStudioBg3dMultiAngleCamera(document.camera, angle);
    if (!camera) return null;
    const dx = camera.position[0] - camera.target[0];
    const dy = camera.position[1] - camera.target[1];
    const dz = camera.position[2] - camera.target[2];
    const distance = Math.hypot(dx, dy, dz);
    candidates.push(
      Object.freeze({
        angleId,
        labelKo: angle.labelKo,
        labelEn: angle.labelEn,
        shotId,
        name,
        camera,
        azimuthDeg: normalizeAzimuthDeg((Math.atan2(dx, dz) * 180) / Math.PI),
        elevationDeg: round3((Math.asin(dy / distance) * 180) / Math.PI),
        distance: round3(distance),
      }),
    );
  }
  return {
    document,
    plan: Object.freeze({
      setId: set.id,
      batchId,
      candidates: Object.freeze(candidates),
    }),
  };
}

/** 일괄 캡처 계획만 계산한다(문서 무변경). 만들 수 없으면 null. */
export function planStudioBg3dMultiAngleCapture(
  raw: unknown,
  setId: string,
  batchId: string,
): StudioBg3dMultiAngleCapturePlan | null {
  return planBatch(raw, setId, batchId)?.plan ?? null;
}

/**
 * 각도 세트 전체를 한 번에 샷으로 캡처한다. 하나라도 실패하면 전체가 null
 * (부분 캡처 없음). 반환 문서의 카메라·활성 샷은 캡처 전 상태 그대로이며,
 * 새 샷들은 문서 shots 끝에 세트 순서대로 붙는다.
 */
export function captureStudioBg3dMultiAngleSet(
  raw: unknown,
  setId: string,
  batchId: string,
): StudioBg3dMultiAngleCaptureResult | null {
  const planned = planBatch(raw, setId, batchId);
  if (!planned) return null;
  let acc: StudioBg3dSceneDocument = planned.document;
  for (const candidate of planned.plan.candidates) {
    const next = captureStudioBg3dShot(
      { ...acc, camera: candidate.camera },
      { id: candidate.shotId, name: candidate.name },
    );
    if (!next) return null;
    acc = next;
  }
  const { activeShotId: _droppedActiveShotId, ...withoutActive } = acc;
  const restored: StudioBg3dSceneDocument = planned.document.activeShotId
    ? { ...acc, camera: planned.document.camera }
    : { ...withoutActive, camera: planned.document.camera };
  const validated = canonicalDocument(restored);
  if (!validated) return null;
  return Object.freeze({ document: validated, plan: planned.plan });
}

/**
 * 이미 캡처된 배치에서 후보 목록을 다시 읽는다(그리드 재표시용).
 * 샷에 동결된 카메라 오버라이드를 문서 카메라와 합쳐 후보 카메라로 돌려준다.
 */
export function listStudioBg3dMultiAngleCandidates(
  raw: unknown,
  batchId: string,
): readonly StudioBg3dMultiAngleCandidate[] {
  const document = canonicalDocument(raw);
  if (!document || !BATCH_ID_PATTERN.test(batchId)) return Object.freeze([]);
  const prefix = `${batchId}-`;
  const candidates: StudioBg3dMultiAngleCandidate[] = [];
  for (const shot of document.shots ?? []) {
    if (!shot.id.startsWith(prefix)) continue;
    const angle = getStudioBg3dMultiAngle(shot.id.slice(prefix.length));
    if (!angle) continue;
    const camera = buildCandidateCamera(document.camera, shot);
    const dx = camera.position[0] - camera.target[0];
    const dy = camera.position[1] - camera.target[1];
    const dz = camera.position[2] - camera.target[2];
    const distance = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(distance) || distance < 1e-6) continue;
    candidates.push(
      Object.freeze({
        angleId: angle.id,
        labelKo: angle.labelKo,
        labelEn: angle.labelEn,
        shotId: shot.id,
        name: shot.name,
        camera,
        azimuthDeg: normalizeAzimuthDeg((Math.atan2(dx, dz) * 180) / Math.PI),
        elevationDeg: round3((Math.asin(dy / distance) * 180) / Math.PI),
        distance: round3(distance),
      }),
    );
  }
  return Object.freeze(candidates);
}

function buildCandidateCamera(
  baseCamera: StudioBg3dCameraSettings,
  shot: StudioBg3dShot,
): StudioBg3dCameraSettings {
  if (!shot.camera) return baseCamera;
  return Object.freeze({
    ...baseCamera,
    ...(shot.camera.position ? { position: shot.camera.position } : {}),
    ...(shot.camera.target ? { target: shot.camera.target } : {}),
    ...(shot.camera.fovDegrees !== undefined
      ? { fovDegrees: shot.camera.fovDegrees }
      : {}),
    ...(shot.camera.projection ? { projection: shot.camera.projection } : {}),
    ...(shot.camera.zoom !== undefined ? { zoom: shot.camera.zoom } : {}),
    ...(shot.camera.lensShift ? { lensShift: shot.camera.lensShift } : {}),
    ...(shot.camera.nearClip !== undefined ? { nearClip: shot.camera.nearClip } : {}),
    ...(shot.camera.up ? { up: shot.camera.up } : {}),
  });
}

/**
 * 후보 선택 → 삽입: 후보 샷을 기존 샷 적용 경로로 씬에 적용(활성 샷 지정)한다.
 * 문서에 없는 샷 id면 null.
 */
export function insertStudioBg3dMultiAngleCandidate(
  raw: unknown,
  shotId: string,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocument(raw);
  if (!document) return null;
  if (!(document.shots ?? []).some((shot) => shot.id === shotId)) return null;
  return applyStudioBg3dShot(document, shotId);
}

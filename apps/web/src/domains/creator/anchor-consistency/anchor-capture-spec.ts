/**
 * 3D 캐릭터 앵커 캡처 세트 사양 — 정/반측 턴테이블의 각도, 카메라, 배경, 해상도 규약.
 *
 * 상태: current(사양과 순수 계산만). 3D 스테이지에서 이 규약대로 자동 캡처하는 연결은 아직 없다
 * (docs/features/anchor-consistency.md 의 "현재와 목표" 참고). 이 모듈은 DOM·React·네트워크에 닿지 않는다.
 *
 * 각도 규약: `azimuthDeg` 는 캐릭터가 카메라 쪽(정면)을 볼 때를 0°로 하고, 캐릭터 몸의 세로축 주위로 카메라를 돌린
 * 각도다. +90° 는 카메라가 캐릭터의 오른쪽 옆에 있어 캐릭터의 오른쪽 면이 보이는 컷이고, ±180° 는 후면이다.
 * "좌/우" 는 항상 캐릭터 몸 기준이다(보는 사람 기준이 아니다).
 *
 * 반측 쌍 규칙: 3/4(반측면)과 옆(정측면)은 좌우가 한 쌍이다. 한쪽만 있으면 비대칭 소품·헤어·의상이 한쪽에서만 보여
 * 참조 이미지가 한쪽으로 치우치므로 세트 완전성 검사가 쌍이 깨진 것을 알린다.
 */

export const ANCHOR_SPEC_VERSION = 1 as const;
export const ANCHOR_SET_SCHEMA = "toonstudio.anchor-capture-set" as const;

/** 정면, 좌 3/4, 좌측, 후면, 우측, 우 3/4 — 캡처와 표시의 정본 순서. */
export const ANCHOR_ANGLE_IDS = ["front", "left-34", "left", "back", "right", "right-34"] as const;
export type AnchorAngleId = (typeof ANCHOR_ANGLE_IDS)[number];

export type AnchorAngleKind = "frontal" | "half-side" | "side" | "rear";

export interface AnchorAngleSpec {
  readonly id: AnchorAngleId;
  readonly kind: AnchorAngleKind;
  /** 캐릭터 기준 카메라 방위(도). 0=정면, +=캐릭터의 오른쪽, -=왼쪽, 180=후면. */
  readonly azimuthDeg: number;
  /** 눈높이 고정. 앵커는 하이/로우 앵글을 쓰지 않는다. */
  readonly elevationDeg: 0;
  /** 좌우 짝. 정면·후면은 짝이 없다. */
  readonly mirrorOf: AnchorAngleId | null;
  /** 0부터 시작하는 정본 순서. */
  readonly order: number;
}

function angle(
  id: AnchorAngleId,
  kind: AnchorAngleKind,
  azimuthDeg: number,
  mirrorOf: AnchorAngleId | null,
): AnchorAngleSpec {
  return Object.freeze({
    id,
    kind,
    azimuthDeg,
    elevationDeg: 0,
    mirrorOf,
    order: ANCHOR_ANGLE_IDS.indexOf(id),
  });
}

export const ANCHOR_ANGLE_SPECS: readonly AnchorAngleSpec[] = Object.freeze([
  angle("front", "frontal", 0, null),
  angle("left-34", "half-side", -45, "right-34"),
  angle("left", "side", -90, "right"),
  angle("back", "rear", 180, null),
  angle("right", "side", 90, "left"),
  angle("right-34", "half-side", 45, "left-34"),
]);

const ANGLE_BY_ID: ReadonlyMap<AnchorAngleId, AnchorAngleSpec> = new Map(
  ANCHOR_ANGLE_SPECS.map((spec) => [spec.id, spec]),
);

/** 좌우 쌍 — 반측면(3/4)과 정측면(옆)이 각각 한 쌍이다. */
export const ANCHOR_MIRROR_PAIRS: readonly (readonly [AnchorAngleId, AnchorAngleId])[] = Object.freeze([
  Object.freeze(["left-34", "right-34"] as const),
  Object.freeze(["left", "right"] as const),
]);

export function isAnchorAngleId(value: unknown): value is AnchorAngleId {
  return typeof value === "string" && ANGLE_BY_ID.has(value as AnchorAngleId);
}

export function anchorAngleSpec(id: AnchorAngleId): AnchorAngleSpec {
  const spec = ANGLE_BY_ID.get(id);
  if (!spec) throw new RangeError(`알 수 없는 앵커 각도예요: ${String(id)}`);
  return spec;
}

/** 좌우 짝 각도. 정면·후면은 null. */
export function anchorMirrorOf(id: AnchorAngleId): AnchorAngleId | null {
  return anchorAngleSpec(id).mirrorOf;
}

/** 정본 순서로 정렬한 각도 목록(중복 제거). */
export function sortAnchorAngles(ids: Iterable<AnchorAngleId>): AnchorAngleId[] {
  const wanted = new Set(ids);
  return ANCHOR_ANGLE_IDS.filter((id) => wanted.has(id));
}

// ── 캡처 규약 ────────────────────────────────────────────────────────────────

/**
 * 스테이지에서 캡처할 때 지키는 값. 파일을 끌어다 놓는 경로에서는 강제하지 않고 어긋남을 알리기만 한다.
 * 수치는 사람이 정한 기본값이며 실측으로 검증한 최적값이 아니다(docs/features/anchor-consistency.md).
 */
export const ANCHOR_CAPTURE_CONVENTION = Object.freeze({
  /** 2:3 세로 프레임. 전신 + 위아래 여백. */
  frame: Object.freeze({ width: 768, height: 1152 }),
  camera: Object.freeze({
    projection: "perspective" as const,
    /** 좁은 시야각으로 원근 왜곡을 줄인다. */
    verticalFovDeg: 30,
    elevationDeg: 0,
    rollDeg: 0,
    /** 카메라 목표점 높이 = 캐릭터 키 × 이 값(몸 중앙). */
    targetHeightRatio: 0.5,
    /** 캐릭터 위·아래에 남기는 여백(프레임 높이 대비, 한쪽 기준). */
    framingMargin: 0.06,
  }),
  /** 단색 배경. 흰색·검정은 캐릭터 색과 섞여 구분하기 어려워 중간 회색으로 둔다. */
  background: Object.freeze({
    kind: "flat" as const,
    hex: "#bfbfbf",
    rgb: Object.freeze([191, 191, 191] as const),
  }),
  lighting: "neutral-flat" as const,
  shadows: "none" as const,
  pose: "neutral-a-pose" as const,
  expression: "neutral" as const,
  image: Object.freeze({ format: "png" as const, colorSpace: "srgb" as const, alpha: "none" as const }),
});

/** 앵커 이미지 한도. 참조 팩 한도(studio-ai-reference-images)보다 작게 잡아 여유를 둔다. */
export const ANCHOR_LIMITS = Object.freeze({
  /** 이미지 한 장의 파일 크기. 참조 이미지 한 장 12MiB 한도의 3분의 2. */
  maxImageBytes: 8 * 1024 * 1024,
  /** 세트 전체 파일 크기. 참조 이미지 전체 50MiB 예산 중 앵커 몫. */
  maxSetBytes: 30 * 1024 * 1024,
  /** 한 변이 이보다 작으면 쓸 수 없다. */
  minEdgePx: 256,
  /** 이 아래면 쓸 수는 있지만 작다고 알린다. */
  recommendedLongEdgePx: 512,
  maxEdgePx: 4096,
  maxPixels: 16_777_216,
  maxAnchorIdLength: 40,
  maxCharacterIdLength: 64,
  maxDisplayNameLength: 40,
  /** 세로/가로 비율이 규약(2:3)과 이만큼 넘게 다르면 알린다. */
  aspectTolerance: 0.06,
});

export const ANCHOR_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AnchorImageMimeType = (typeof ANCHOR_IMAGE_MIME_TYPES)[number];

export function isAnchorImageMimeType(value: unknown): value is AnchorImageMimeType {
  return typeof value === "string" && (ANCHOR_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function anchorImageExtension(mimeType: AnchorImageMimeType): "png" | "jpg" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType === "image/webp" ? "webp" : "png";
}

/** 소문자·숫자·하이픈 1~40자, 하이픈으로 시작하거나 끝나지 않는다. 파일 이름 구분자(.)를 쓰지 않는다. */
export const ANCHOR_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
/** 원본 캐릭터 식별자(프로젝트의 캐릭터 id 등). */
export const ANCHOR_CHARACTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export function isValidAnchorId(value: unknown): value is string {
  return typeof value === "string" && ANCHOR_ID_PATTERN.test(value);
}

export function isValidAnchorCharacterId(value: unknown): value is string {
  return typeof value === "string" && ANCHOR_CHARACTER_ID_PATTERN.test(value);
}

// ── 카메라 계산(스테이지 어댑터용) ──────────────────────────────────────────────

/**
 * 캐릭터 키가 프레임에서 (1 − 2×여백) 만큼 차지하도록 하는 카메라 거리.
 * 거리 = 키 ÷ (2 × tan(시야각 ÷ 2) × (1 − 2×여백)).
 */
export interface AnchorFramingParams {
  readonly verticalFovDeg: number;
  readonly framingMargin: number;
}

export function anchorCameraDistance(
  subjectHeight: number,
  camera: AnchorFramingParams = ANCHOR_CAPTURE_CONVENTION.camera,
): number {
  if (!Number.isFinite(subjectHeight) || subjectHeight <= 0) {
    throw new RangeError("캐릭터 키는 0보다 큰 유한한 수여야 해요.");
  }
  const usable = 1 - 2 * camera.framingMargin;
  const halfFov = (camera.verticalFovDeg * Math.PI) / 360;
  if (!(usable > 0) || !(halfFov > 0) || !(halfFov < Math.PI / 2)) {
    throw new RangeError("카메라 규약 값이 올바르지 않아요.");
  }
  return subjectHeight / (2 * Math.tan(halfFov) * usable);
}

export type AnchorVec3 = readonly [number, number, number];

export interface AnchorCameraPose {
  readonly angleId: AnchorAngleId;
  readonly position: AnchorVec3;
  readonly target: AnchorVec3;
  readonly up: AnchorVec3;
  readonly verticalFovDeg: number;
  readonly aspect: number;
}

export interface AnchorSubjectPlacement {
  /** 캐릭터 키(월드 단위). */
  readonly height: number;
  /** 발바닥 높이(y). 기본 0. */
  readonly baseY?: number;
  /** 캐릭터 몸 중심의 수평 위치(x, z). 기본 (0, 0). */
  readonly center?: readonly [number, number];
}

function roundMicro(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 한 각도의 카메라 자세. 오른손 좌표계(+y 위)에서 캐릭터가 +z 를 향한다고 가정한다 — 정면 카메라는 +z 쪽에 있고,
 * +90°(캐릭터의 오른쪽)는 -x 쪽이다. 다른 축 규약을 쓰는 스테이지는 어댑터에서 변환한다.
 */
export function anchorCameraPose(angleId: AnchorAngleId, subject: AnchorSubjectPlacement): AnchorCameraPose {
  const spec = anchorAngleSpec(angleId);
  const { camera, frame } = ANCHOR_CAPTURE_CONVENTION;
  const distance = anchorCameraDistance(subject.height);
  const [centerX, centerZ] = subject.center ?? [0, 0];
  const targetY = (subject.baseY ?? 0) + subject.height * camera.targetHeightRatio;
  const azimuth = (spec.azimuthDeg * Math.PI) / 180;
  return Object.freeze({
    angleId,
    position: Object.freeze([
      roundMicro(centerX - Math.sin(azimuth) * distance),
      roundMicro(targetY),
      roundMicro(centerZ + Math.cos(azimuth) * distance),
    ] as const),
    target: Object.freeze([roundMicro(centerX), roundMicro(targetY), roundMicro(centerZ)] as const),
    up: Object.freeze([0, 1, 0] as const),
    verticalFovDeg: camera.verticalFovDeg,
    aspect: frame.width / frame.height,
  });
}

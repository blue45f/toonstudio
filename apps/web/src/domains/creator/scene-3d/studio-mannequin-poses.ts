/**
 * Studio 3D 데생 인형 — 포즈 프리셋 라이브러리 + 미러 유틸 + 직렬화(순수 데이터 계층).
 *
 * 포즈는 관절 오일러(rad) 맵과 골반 오프셋(m)만으로 표현되어 체형 파라미터와 독립적으로
 * 재사용된다. 직렬화는 다른 Studio 문서와 같은 버전드 + 방어적 정규화 계약을 따른다:
 * 알 수 없는 관절은 버리고, 각도는 표준 범위 접기 + 관절 한계 클램프를 거친다.
 * Three.js import 없음 — 결정적이고 단위 테스트 가능하다.
 */

import {
  STUDIO_MANNEQUIN_JOINT_IDS,
  canonicalizeStudioMannequinAngle,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";

import { STUDIO_MANNEQUIN_POSE_PRESETS } from "./studio-mannequin-pose-presets";

import type { StudioMannequinPoseGroundSpec } from "./studio-mannequin-pose-ground-contact";

export { STUDIO_MANNEQUIN_POSE_PRESETS };

type JointMap = Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;

export interface StudioMannequinPose {
  /** 관절 오일러(XYZ, rad). 항등 회전 관절은 생략 가능. */
  readonly joints: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>;
  /** rest 골반 위치에 더하는 오프셋(m) — 앉기/점프/눕기용. */
  readonly pelvisOffset: StudioMannequinVec3;
}

export type StudioMannequinPoseCategory =
  | "basic"
  | "action"
  | "daily"
  | "dialogue"
  | "couple"
  | "sitting"
  | "sports"
  | "webtoon"
  | "emotion"
  | "hand";

export const STUDIO_MANNEQUIN_POSE_CATEGORIES: readonly {
  id: StudioMannequinPoseCategory;
  label: string;
}[] = Object.freeze([
  { id: "basic", label: "기본" },
  { id: "daily", label: "일상" },
  { id: "dialogue", label: "대화" },
  { id: "couple", label: "커플·2인" },
  { id: "sitting", label: "앉기" },
  { id: "action", label: "액션·전투" },
  { id: "sports", label: "스포츠·동작" },
  { id: "webtoon", label: "웹툰 연출" },
  { id: "emotion", label: "감정 표현" },
  { id: "hand", label: "손 전용" },
]);

/** 프리셋 적용 범위. "hand-only"는 손목 관절만 바꾸고 몸 포즈는 건드리지 않는다. */
export type StudioMannequinPoseScope = "full-body" | "hand-only";

export interface StudioMannequinPosePreset {
  readonly id: string;
  readonly label: string;
  readonly category: StudioMannequinPoseCategory;
  readonly pose: StudioMannequinPose;
  /** 검색·탐색용 한글 키워드. 없으면 라벨·카테고리로만 검색된다. */
  readonly tags?: readonly string[];
  /** 목록에서 포즈 용도를 한 줄로 설명한다. */
  readonly description?: string;
  /** 적용 범위. 없으면 카테고리가 "hand"일 때 손 전용, 아니면 전신으로 본다. */
  readonly scope?: StudioMannequinPoseScope;
  /** 연출에 필요한 인원수. 없으면 1인. 커플 포즈는 2. */
  readonly figures?: 1 | 2;
  /**
   * 지지 방식(서기·앉기·무릎·바닥·눕기·공중)과 바닥에 닿아야 하는 부위. 없으면 발로 선 자세다.
   * 적용 시점에 현재 체형으로 골반 높이를 다시 계산하는 근거이자 품질 검사의 기준이다.
   */
  readonly ground?: StudioMannequinPoseGroundSpec;
  /** 좌우 대칭 포즈 — 미러해도 같아야 한다(품질 검사가 대칭 오차를 잰다). */
  readonly symmetric?: boolean;
}

/** 프리셋의 실제 적용 범위(기본값 규칙 적용). */
export function studioMannequinPosePresetScope(
  preset: StudioMannequinPosePreset,
): StudioMannequinPoseScope {
  return preset.scope ?? (preset.category === "hand" ? "hand-only" : "full-body");
}

const PELVIS_OFFSET_LIMIT = 2;

export function createStudioMannequinRestPose(): StudioMannequinPose {
  return { joints: {}, pelvisOffset: [0, 0, 0] };
}

export function findStudioMannequinPosePreset(id: unknown): StudioMannequinPosePreset | null {
  if (typeof id !== "string") return null;
  return STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === id) ?? null;
}

// ── 탐색(카테고리·범위·인원·검색) ─────────────────────────────────────────────

/** 손 전용 프리셋만 모은 분리 라이브러리. 전신 포즈와 섞지 않고 따로 탐색·적용한다. */
export const STUDIO_MANNEQUIN_HAND_POSE_PRESETS: readonly StudioMannequinPosePreset[] =
  Object.freeze(
    STUDIO_MANNEQUIN_POSE_PRESETS.filter(
      (preset) => studioMannequinPosePresetScope(preset) === "hand-only",
    ),
  );

export interface StudioMannequinPosePresetFilter {
  /** "all"이면 카테고리 무관. */
  readonly category?: StudioMannequinPoseCategory | "all";
  /** "all"이면 전신·손 전용 무관. */
  readonly scope?: StudioMannequinPoseScope | "all";
  /** "all"이면 인원수 무관. */
  readonly figures?: 1 | 2 | "all";
  /** 라벨·id·태그·설명·카테고리 이름 부분 일치(대소문자·공백 무시). */
  readonly query?: string;
}

function normalizePoseSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

const POSE_CATEGORY_LABEL_BY_ID = new Map(
  STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, meta.label] as const),
);

/**
 * 포즈 프리셋 탐색. 카테고리 × 범위 × 인원수 × 검색어를 AND로 적용한다.
 * 기존 패널의 라벨 부분 일치 검색을 태그·설명·카테고리 이름까지 넓힌 것이며,
 * 빈 필터는 전체 프리셋을 원래 순서로 돌려준다.
 */
export function filterStudioMannequinPosePresets(
  filter: StudioMannequinPosePresetFilter = {},
): StudioMannequinPosePreset[] {
  const category = filter.category ?? "all";
  const scope = filter.scope ?? "all";
  const figures = filter.figures ?? "all";
  const query = normalizePoseSearchText(filter.query ?? "");
  return STUDIO_MANNEQUIN_POSE_PRESETS.filter((preset) => {
    if (category !== "all" && preset.category !== category) return false;
    if (scope !== "all" && studioMannequinPosePresetScope(preset) !== scope) return false;
    if (figures !== "all" && (preset.figures ?? 1) !== figures) return false;
    if (query) {
      const haystack = normalizePoseSearchText(
        [
          preset.label,
          preset.id,
          preset.description ?? "",
          POSE_CATEGORY_LABEL_BY_ID.get(preset.category) ?? "",
          ...(preset.tags ?? []),
        ].join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** 카테고리 칩에 개수를 함께 보여주기 위한 집계. 없는 카테고리는 0. */
export function countStudioMannequinPosePresetsByCategory(): Readonly<
  Record<StudioMannequinPoseCategory, number>
> {
  const counts = Object.fromEntries(
    STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, 0]),
  ) as Record<StudioMannequinPoseCategory, number>;
  for (const preset of STUDIO_MANNEQUIN_POSE_PRESETS) counts[preset.category] += 1;
  return Object.freeze(counts);
}

// ── 손 분리 적용 ─────────────────────────────────────────────────────────────

export type StudioMannequinHandSide = "left" | "right" | "both";

const HAND_JOINT_BY_SIDE: Readonly<Record<"left" | "right", StudioMannequinJointId>> = {
  left: "leftHand",
  right: "rightHand",
};

/**
 * 포즈에서 손목 관절만 뽑는다. 손 전용 프리셋을 지금 포즈 위에 얹을 때
 * 몸 관절이 따라 바뀌지 않게 하는 분리 경계다.
 */
export function extractStudioMannequinHandPose(
  poseInput: StudioMannequinPose,
  side: StudioMannequinHandSide = "both",
): StudioMannequinPose {
  const joints: JointMap = {};
  const sides = side === "both" ? (["left", "right"] as const) : [side];
  for (const oneSide of sides) {
    const jointId = HAND_JOINT_BY_SIDE[oneSide];
    const rotation = poseInput.joints[jointId];
    if (rotation) joints[jointId] = rotation;
  }
  return { joints, pelvisOffset: [0, 0, 0] };
}

/**
 * 손 전용 프리셋을 기존 포즈에 합친다. 손목 관절(선택한 쪽)만 프리셋 값으로
 * 교체하고 나머지 관절·골반 오프셋은 base를 그대로 유지한다.
 * handPreset이 손 전용이 아니어도 손 관절만 취하므로 안전하다.
 */
export function applyStudioMannequinHandPreset(
  base: StudioMannequinPose,
  handPreset: StudioMannequinPosePreset,
  side: StudioMannequinHandSide = "both",
): StudioMannequinPose {
  const handJoints = extractStudioMannequinHandPose(handPreset.pose, side).joints;
  return {
    joints: { ...base.joints, ...handJoints },
    pelvisOffset: base.pelvisOffset,
  };
}

// ── 미러 ────────────────────────────────────────────────────────────────────

function mirrorJointId(jointId: StudioMannequinJointId): StudioMannequinJointId {
  if (jointId.startsWith("left")) {
    return `right${jointId.slice("left".length)}` as StudioMannequinJointId;
  }
  if (jointId.startsWith("right")) {
    return `left${jointId.slice("right".length)}` as StudioMannequinJointId;
  }
  return jointId;
}

function mirrorRotation(rotation: StudioMannequinVec3): StudioMannequinVec3 {
  // 하우스 미러 계약: YZ 평면 반사 = X 유지, Y/Z 부호 반전.
  return [rotation[0], -rotation[1], -rotation[2]];
}

/** 좌우 반전 포즈(관절 스왑 + Y/Z 부호 반전 + 골반 X 오프셋 반전). 두 번 적용하면 원본. */
export function mirrorStudioMannequinPose(input: StudioMannequinPose): StudioMannequinPose {
  const joints: JointMap = {};
  for (const [jointId, rotation] of Object.entries(input.joints)) {
    if (!isStudioMannequinJointId(jointId) || !rotation) continue;
    joints[mirrorJointId(jointId)] = mirrorRotation(rotation);
  }
  return {
    joints,
    pelvisOffset: [-input.pelvisOffset[0], input.pelvisOffset[1], input.pelvisOffset[2]],
  };
}

// ── 정규화 + 직렬화 ─────────────────────────────────────────────────────────

export const STUDIO_MANNEQUIN_POSE_DOC_KIND = "studio-mannequin-pose" as const;
export const STUDIO_MANNEQUIN_POSE_DOC_VERSION = 1 as const;
export const STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES = 16 * 1024;

function clampOffsetAxis(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const clamped = Math.min(PELVIS_OFFSET_LIMIT, Math.max(-PELVIS_OFFSET_LIMIT, value));
  const quantized = Math.round(clamped * 1e6) / 1e6;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function normalizePelvisOffset(value: unknown): StudioMannequinVec3 {
  const source = Array.isArray(value) ? value : [];
  return [clampOffsetAxis(source[0]), clampOffsetAxis(source[1]), clampOffsetAxis(source[2])];
}

function isIdentityRotation(rotation: StudioMannequinVec3): boolean {
  return rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0;
}

/**
 * 알 수 없는 입력을 항상 유효한 포즈로 정규화한다. 알 수 없는 관절 키는 버리고, 각도는
 * 표준 범위 접기 + 관절 한계 클램프, 항등 회전은 생략해 표현을 canonical 하게 만든다.
 */
export function normalizeStudioMannequinPose(input: unknown): StudioMannequinPose {
  const source = (typeof input === "object" && input !== null ? input : {}) as {
    joints?: unknown;
    pelvisOffset?: unknown;
  };
  const joints: JointMap = {};
  const sourceJoints = (typeof source.joints === "object" && source.joints !== null
    ? source.joints
    : {}) as Record<string, unknown>;
  // 순서를 관절 정의 순으로 고정해 직렬화 출력을 결정적으로 만든다.
  for (const jointId of STUDIO_MANNEQUIN_JOINT_IDS) {
    if (!Object.hasOwn(sourceJoints, jointId)) continue;
    const rotation = clampStudioMannequinJointRotation(jointId, sourceJoints[jointId]);
    if (isIdentityRotation(rotation)) continue;
    joints[jointId] = rotation;
  }
  return { joints, pelvisOffset: normalizePelvisOffset(source.pelvisOffset) };
}

export function serializeStudioMannequinPose(input: StudioMannequinPose): string {
  const normalized = normalizeStudioMannequinPose(input);
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_POSE_DOC_KIND,
    version: STUDIO_MANNEQUIN_POSE_DOC_VERSION,
    joints: normalized.joints,
    pelvisOffset: normalized.pelvisOffset,
  });
}

/** JSON 문자열/객체 어느 쪽이든 안전하게 파싱한다. 계약 위반이면 null. */
export function parseStudioMannequinPose(raw: unknown): StudioMannequinPose | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as { kind?: unknown; version?: unknown };
  if (doc.kind !== STUDIO_MANNEQUIN_POSE_DOC_KIND) return null;
  if (doc.version !== STUDIO_MANNEQUIN_POSE_DOC_VERSION) return null;
  return normalizeStudioMannequinPose(value);
}

// ── 세션 상태(체형 + 포즈) 영속 계약 ─────────────────────────────────────────

/**
 * Explicit pre-V12 localStorage import/test seam. Product boot must not probe this key; users may
 * move an old value only through an explicit import flow.
 */
export const STUDIO_MANNEQUIN_STATE_STORAGE_KEY = "toonstudio-studio-mannequin-state:v1";
export const STUDIO_MANNEQUIN_STATE_DOC_KIND = "studio-mannequin-state" as const;
export const STUDIO_MANNEQUIN_STATE_DOC_VERSION = 1 as const;
/** 2인 구도 상대 인형을 담은 문서 버전. 상대가 없으면 v1 그대로(바이트 동일) 저장한다. */
export const STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION = 2 as const;
export const STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES = 24 * 1024;
/** 상대 루트 위치 한계(m) — 주인공 로컬 프레임 기준. */
const PARTNER_OFFSET_LIMIT = 5;

/** 2인 구도의 상대 인형 — 체형·포즈와 주인공 로컬 프레임 기준 배치. */
export interface StudioMannequinPersistentPartner {
  readonly params: StudioMannequinBodyParams;
  readonly pose: StudioMannequinPose;
  /** 상대 루트 위치(m). 주인공 원점·+Z 응시 프레임. */
  readonly offset: StudioMannequinVec3;
  /** 상대 루트 요(rad). 0 = 같은 방향, π = 마주 보기. */
  readonly yawRad: number;
}

export interface StudioMannequinPersistentState {
  readonly params: StudioMannequinBodyParams;
  readonly pose: StudioMannequinPose;
  /** 2인 구도의 상대 인형. 구버전(v1) 문서와 1인 작업에는 없다. */
  readonly partner?: StudioMannequinPersistentPartner;
}

function quantizePartnerAxis(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const clamped = Math.min(PARTNER_OFFSET_LIMIT, Math.max(-PARTNER_OFFSET_LIMIT, value));
  const quantized = Math.round(clamped * 1e6) / 1e6;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function canonicalPartner(source: {
  readonly params?: unknown;
  readonly pose?: unknown;
  readonly offset?: unknown;
  readonly yawRad?: unknown;
}): StudioMannequinPersistentPartner {
  const offset: readonly unknown[] = Array.isArray(source.offset) ? source.offset : [];
  const yaw = canonicalizeStudioMannequinAngle(source.yawRad);
  return {
    params: clampStudioMannequinBodyParams(source.params),
    pose: normalizeStudioMannequinPose(source.pose),
    offset: [quantizePartnerAxis(offset[0]), quantizePartnerAxis(offset[1]), quantizePartnerAxis(offset[2])],
    // −π 근처는 1e-6 격자 양자화와 [−π, π) 접기가 서로를 뒤집어 왕복이 흔들린다 —
    // 같은 마주 보기 방향인 +π 쪽 격자점으로 고정해 정규화를 멱등하게 만든다.
    yawRad: yaw <= -Math.PI + 1e-6 ? canonicalizeStudioMannequinAngle(Math.PI - 1e-6) : yaw,
  };
}

/** 알 수 없는 입력을 유효한 상대 인형으로 정규화한다. 객체가 아니면 null(상대 없음). */
export function normalizeStudioMannequinPartner(input: unknown): StudioMannequinPersistentPartner | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  return canonicalPartner(input as Record<string, unknown>);
}

/** 이미 상대 인형 모양인 값을 직렬화 정본(클램프·양자화)으로 맞춘다. 저장 계약의 엄격 검사를 통과하는 값이다. */
export function canonicalizeStudioMannequinPartner(
  partner: StudioMannequinPersistentPartner,
): StudioMannequinPersistentPartner {
  return canonicalPartner(partner);
}

export function serializeStudioMannequinState(input: StudioMannequinPersistentState): string {
  const partner = input.partner ? normalizeStudioMannequinPartner(input.partner) : null;
  if (!partner) {
    return JSON.stringify({
      kind: STUDIO_MANNEQUIN_STATE_DOC_KIND,
      version: STUDIO_MANNEQUIN_STATE_DOC_VERSION,
      params: clampStudioMannequinBodyParams(input.params),
      pose: normalizeStudioMannequinPose(input.pose),
    });
  }
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_STATE_DOC_KIND,
    version: STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION,
    params: clampStudioMannequinBodyParams(input.params),
    pose: normalizeStudioMannequinPose(input.pose),
    partner,
  });
}

export function parseStudioMannequinState(raw: unknown): StudioMannequinPersistentState | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as {
    kind?: unknown;
    version?: unknown;
    params?: unknown;
    pose?: unknown;
    partner?: unknown;
  };
  if (doc.kind !== STUDIO_MANNEQUIN_STATE_DOC_KIND) return null;
  if (doc.version === STUDIO_MANNEQUIN_STATE_DOC_VERSION) {
    // 구버전 문서: 상대 인형이 없다(1인 작업).
    return {
      params: clampStudioMannequinBodyParams(doc.params),
      pose: normalizeStudioMannequinPose(doc.pose),
    };
  }
  if (doc.version !== STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION) return null;
  const partner = normalizeStudioMannequinPartner(doc.partner);
  return {
    params: clampStudioMannequinBodyParams(doc.params),
    pose: normalizeStudioMannequinPose(doc.pose),
    ...(partner ? { partner } : {}),
  };
}

// ── 공유 내보내기/가져오기 + 클립보드 해시 ────────────────────────────────

export function exportStudioMannequinStateToJSON(input: StudioMannequinPersistentState): string {
  return serializeStudioMannequinState(input);
}

export function importStudioMannequinStateFromJSON(raw: unknown): StudioMannequinPersistentState | null {
  return parseStudioMannequinState(raw);
}

export function encodeStudioMannequinShareHash(input: StudioMannequinPersistentState): string {
  const json = serializeStudioMannequinState(input);
  try {
    return `#mannequin=${encodeURIComponent(btoa(json))}`;
  } catch {
    return "";
  }
}

export function parseStudioMannequinShareHash(hash: string): StudioMannequinPersistentState | null {
  if (!hash.includes("mannequin=")) return null;
  const match = /mannequin=([^&]+)/.exec(hash);
  if (!match || !match[1]) return null;
  try {
    const json = atob(decodeURIComponent(match[1]));
    return parseStudioMannequinState(json);
  } catch {
    return null;
  }
}

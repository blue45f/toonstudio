/**
 * 3D 배경 시그니처 웹툰 카메라 앵글 12종 프리셋 & 사용자 북마크 엔진.
 *
 * 웹툰 연출에서 가장 빈번하게 쓰이는 12종 카메라 구도(FOV·피치·요·롤·카메라 거리·타깃 오프셋)를
 * `StudioBg3dCameraSettings`(위치·주시점·업벡터·화각)로 정확히 변환하고,
 * 현재 3D 뷰를 사용자 북마크로 역추출·저장·전환할 수 있도록 지원한다(₩0 로컬 저장).
 */

import {
  createStudioBg3dCameraUpForDutchRoll,
  readStudioBg3dCameraDutchRollDegrees,
} from "../bg3d/studio-bg3d-camera-orientation";
import type { StudioBg3dCameraSettings, StudioBg3dVec3 } from "../bg3d/studio-bg3d-scene-document";

export type WebtoonCameraAngleCategory = "action" | "dialogue" | "drama" | "establishing";

export type WebtoonSignatureAngleId =
  | "diagonal-action"
  | "over-the-shoulder"
  | "low-angle-dominance"
  | "high-angle-isolation"
  | "birds-eye-intro"
  | "worms-eye"
  | "first-person-pov"
  | "two-shot-eye-level"
  | "closeup-eye-level"
  | "wide-establishing"
  | "dutch-tilt-tension"
  | "silhouette-backlight";

export interface WebtoonCameraAnglePose {
  /** 수직 시야각(도, 15 ~ 110). */
  readonly fovDeg: number;
  /** 상하 앙각/부감각(도, -85 ~ 85; 양수는 위에서 내려다봄, 음수는 아래에서 올려다봄). */
  readonly pitchDeg: number;
  /** 수평 회전 방위각(도, -180 ~ 180; 0은 정면 +Z축). */
  readonly yawDeg: number;
  /** 더치 틸트 롤 회전(도, -45 ~ 45). */
  readonly rollDeg: number;
  /** 타깃에서 카메라까지의 거리(m, 0.5 ~ 80). */
  readonly distance: number;
  /** 기준 주시점에서의 타깃 오프셋 [x, y, z] (m). */
  readonly targetOffset: StudioBg3dVec3;
}

export interface WebtoonSignatureCameraPreset extends WebtoonCameraAnglePose {
  readonly id: WebtoonSignatureAngleId;
  readonly nameKo: string;
  readonly category: WebtoonCameraAngleCategory;
  readonly descriptionKo: string;
  readonly sceneCueKo: string;
}

export interface WebtoonCameraAngleBookmark extends WebtoonCameraAnglePose {
  readonly id: string;
  readonly name: string;
  readonly cutLabel: string;
  readonly sourcePresetId: WebtoonSignatureAngleId | null;
  readonly savedAtIso: string;
}

export const WEBTOON_CAMERA_CATEGORY_LABELS: Readonly<
  Record<"all" | WebtoonCameraAngleCategory, string>
> = Object.freeze({
  all: "전체 12종",
  action: "액션·역동",
  dialogue: "대화·시선",
  drama: "심리·강조",
  establishing: "공간·도입",
});

/** 웹툰 실전 시그니처 3D 배경 카메라 앵글 12종 정본 프리셋. */
export const WEBTOON_SIGNATURE_CAMERA_ANGLES: readonly WebtoonSignatureCameraPreset[] = Object.freeze([
  {
    id: "diagonal-action",
    nameKo: "대각선 액션",
    category: "action",
    descriptionKo: "사선 광각과 약한 롤로 돌진·타격의 속도감을 극대화합니다.",
    sceneCueKo: "전투 돌입 · 추격 컷",
    fovDeg: 62,
    pitchDeg: -14,
    yawDeg: 38,
    rollDeg: -14,
    distance: 4.2,
    targetOffset: [0.15, 0.2, 0],
  },
  {
    id: "over-the-shoulder",
    nameKo: "오버더숄더 대화",
    category: "dialogue",
    descriptionKo: "앞 인물의 어깨 너머로 상대 표정과 공간 깊이를 함께 잡습니다.",
    sceneCueKo: "대치 · 감정 대화",
    fovDeg: 42,
    pitchDeg: 4,
    yawDeg: 32,
    rollDeg: 0,
    distance: 2.6,
    targetOffset: [0.35, 0.35, -0.1],
  },
  {
    id: "low-angle-dominance",
    nameKo: "로우앵글 위압",
    category: "drama",
    descriptionKo: "낮은 위치에서 올려다봐 인물의 카리스마와 압도감을 키웁니다.",
    sceneCueKo: "보스 등장 · 선언 컷",
    fovDeg: 58,
    pitchDeg: -28,
    yawDeg: 14,
    rollDeg: 0,
    distance: 3.4,
    targetOffset: [0, 0.45, 0],
  },
  {
    id: "high-angle-isolation",
    nameKo: "하이앵글 고립",
    category: "drama",
    descriptionKo: "위에서 비스듬히 내려다봐 인물의 고독과 압박감을 전달합니다.",
    sceneCueKo: "좌절 · 추궁 · 독백",
    fovDeg: 48,
    pitchDeg: 36,
    yawDeg: -22,
    rollDeg: 0,
    distance: 5.2,
    targetOffset: [0, -0.15, 0],
  },
  {
    id: "birds-eye-intro",
    nameKo: "버드아이 도입 컷",
    category: "establishing",
    descriptionKo: "수직에 가까운 부감으로 동선과 배경 배치를 한눈에 설명합니다.",
    sceneCueKo: "장소 전환 · 군중 배치",
    fovDeg: 54,
    pitchDeg: 76,
    yawDeg: 0,
    rollDeg: 0,
    distance: 11.5,
    targetOffset: [0, -0.3, 0],
  },
  {
    id: "worms-eye",
    nameKo: "웜즈아이",
    category: "action",
    descriptionKo: "지면 바로 위 초광각 올려보기로 거대 건축물과 도약을 강조합니다.",
    sceneCueKo: "고층 빌딩 · 공중 도약",
    fovDeg: 74,
    pitchDeg: -54,
    yawDeg: 18,
    rollDeg: 4,
    distance: 2.9,
    targetOffset: [0, 0.9, 0],
  },
  {
    id: "first-person-pov",
    nameKo: "1인칭 POV",
    category: "dialogue",
    descriptionKo: "인물 눈높이에서 직접 바라보는 듯한 현장감 있는 주관 시점입니다.",
    sceneCueKo: "시선 마주침 · 단서 발견",
    fovDeg: 68,
    pitchDeg: -2,
    yawDeg: 0,
    rollDeg: 0,
    distance: 1.35,
    targetOffset: [0, 0.55, -0.25],
  },
  {
    id: "two-shot-eye-level",
    nameKo: "투샷 아이레벨",
    category: "dialogue",
    descriptionKo: "두 인물의 거리감과 관계 균형을 안정적인 눈높이로 담습니다.",
    sceneCueKo: "일상 대화 · 동행 컷",
    fovDeg: 46,
    pitchDeg: 0,
    yawDeg: 8,
    rollDeg: 0,
    distance: 3.8,
    targetOffset: [0, 0.25, 0],
  },
  {
    id: "closeup-eye-level",
    nameKo: "클로즈업 눈높이",
    category: "dialogue",
    descriptionKo: "망원 압축 원근으로 배경을 정리하고 표정과 눈빛에 집중합니다.",
    sceneCueKo: "감정 클라이맥스 · 독백",
    fovDeg: 28,
    pitchDeg: 2,
    yawDeg: -6,
    rollDeg: 0,
    distance: 1.9,
    targetOffset: [0, 0.48, 0],
  },
  {
    id: "wide-establishing",
    nameKo: "와이드 에스태블리싱",
    category: "establishing",
    descriptionKo: "넓은 화각과 여유 거리로 공간 전체의 분위기와 시간대를 제시합니다.",
    sceneCueKo: "화 도입부 · 배경 스케치",
    fovDeg: 78,
    pitchDeg: 12,
    yawDeg: -34,
    rollDeg: 0,
    distance: 12.8,
    targetOffset: [0, 0.6, 0],
  },
  {
    id: "dutch-tilt-tension",
    nameKo: "더치 틸트 긴장",
    category: "drama",
    descriptionKo: "수평선을 과감히 기울여 불안·광기·반전 직전의 긴장감을 만듭니다.",
    sceneCueKo: "반전 · 심리 붕괴",
    fovDeg: 44,
    pitchDeg: -8,
    yawDeg: 24,
    rollDeg: 21,
    distance: 3.1,
    targetOffset: [0.1, 0.3, 0],
  },
  {
    id: "silhouette-backlight",
    nameKo: "실루엣 역광",
    category: "establishing",
    descriptionKo: "배경 광원을 등진 역방향 망원 구도로 인물의 실루엣 윤곽을 살립니다.",
    sceneCueKo: "엔딩 여운 · 정체 암시",
    fovDeg: 34,
    pitchDeg: -12,
    yawDeg: 165,
    rollDeg: 0,
    distance: 5.6,
    targetOffset: [0, 0.35, 0],
  },
]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeAngleDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return round3(normalized);
}

export function normalizeCameraAnglePose(pose: WebtoonCameraAnglePose): WebtoonCameraAnglePose {
  return Object.freeze({
    fovDeg: round3(clamp(pose.fovDeg, 15, 110)),
    pitchDeg: round3(clamp(pose.pitchDeg, -85, 85)),
    yawDeg: normalizeAngleDeg(pose.yawDeg),
    rollDeg: round3(clamp(pose.rollDeg, -45, 45)),
    distance: round3(clamp(pose.distance, 0.5, 80)),
    targetOffset: Object.freeze([
      round3(clamp(pose.targetOffset[0], -50, 50)),
      round3(clamp(pose.targetOffset[1], -50, 50)),
      round3(clamp(pose.targetOffset[2], -50, 50)),
    ] as const),
  });
}

export function getSignatureCameraAnglePreset(
  id: WebtoonSignatureAngleId,
): WebtoonSignatureCameraPreset | undefined {
  return WEBTOON_SIGNATURE_CAMERA_ANGLES.find((preset) => preset.id === id);
}

/**
 * 구면 앵글 파라미터(FOV·피치·요·롤·거리·타깃 오프셋)를 3D 배경 편집기의
 * `StudioBg3dCameraSettings`(위치·주시점·업벡터·화각)로 결정론적으로 변환한다.
 */
export function resolveCameraSettingsFromAnglePose(
  pose: WebtoonCameraAnglePose,
  baseCamera: StudioBg3dCameraSettings,
  anchorTarget?: StudioBg3dVec3,
): StudioBg3dCameraSettings {
  const safe = normalizeCameraAnglePose(pose);
  const anchor = anchorTarget ?? baseCamera.target;
  const target: StudioBg3dVec3 = [
    round3(anchor[0] + safe.targetOffset[0]),
    round3(anchor[1] + safe.targetOffset[1]),
    round3(anchor[2] + safe.targetOffset[2]),
  ];

  const pitchRad = (safe.pitchDeg * Math.PI) / 180;
  const yawRad = (safe.yawDeg * Math.PI) / 180;
  const horizontal = safe.distance * Math.cos(pitchRad);

  const position: StudioBg3dVec3 = [
    round3(target[0] + horizontal * Math.sin(yawRad)),
    round3(target[1] + safe.distance * Math.sin(pitchRad)),
    round3(target[2] + horizontal * Math.cos(yawRad)),
  ];

  const up =
    createStudioBg3dCameraUpForDutchRoll({ position, target }, safe.rollDeg)
    ?? ([0, 1, 0] as const);

  return {
    ...baseCamera,
    position,
    target,
    fovDegrees: safe.fovDeg,
    projection: "perspective",
    zoom: 1,
    lensShift: [0, 0],
    up,
  };
}

/**
 * 현재 3D 배경 카메라(`StudioBg3dCameraSettings`)에서 FOV·피치·요·롤·거리·타깃 오프셋을
 * 역추출해 사용자 북마크로 저장할 수 있게 만든다.
 */
export function extractCameraAnglePose(
  camera: StudioBg3dCameraSettings,
  anchorTarget: StudioBg3dVec3 = [0, 0, 0],
): WebtoonCameraAnglePose {
  const dx = camera.position[0] - camera.target[0];
  const dy = camera.position[1] - camera.target[1];
  const dz = camera.position[2] - camera.target[2];
  const distance = Math.max(0.5, Math.hypot(dx, dy, dz));
  const horizontal = Math.hypot(dx, dz);
  const pitchDeg = (Math.atan2(dy, Math.max(1e-6, horizontal)) * 180) / Math.PI;
  const yawDeg = horizontal < 1e-6 ? 0 : (Math.atan2(dx, dz) * 180) / Math.PI;
  const rollDeg = readStudioBg3dCameraDutchRollDegrees(camera);

  return normalizeCameraAnglePose({
    fovDeg: camera.fovDegrees,
    pitchDeg,
    yawDeg,
    rollDeg,
    distance,
    targetOffset: [
      camera.target[0] - anchorTarget[0],
      camera.target[1] - anchorTarget[1],
      camera.target[2] - anchorTarget[2],
    ],
  });
}

let customBookmarkCounter = 0;

export function createCameraAngleBookmark(
  input: {
    readonly id?: string;
    readonly name: string;
    readonly cutLabel?: string;
    readonly pose: WebtoonCameraAnglePose;
    readonly sourcePresetId?: WebtoonSignatureAngleId | null;
  },
  nowIso: () => string = () => new Date().toISOString(),
): WebtoonCameraAngleBookmark {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error("북마크 이름을 입력해 주세요.");
  }
  customBookmarkCounter += 1;
  const safePose = normalizeCameraAnglePose(input.pose);
  return Object.freeze({
    id: input.id?.trim() || `cam-bm-${customBookmarkCounter}-${Date.now().toString(36)}`,
    name: trimmedName,
    cutLabel: input.cutLabel?.trim() || "공통 컷",
    sourcePresetId: input.sourcePresetId ?? null,
    savedAtIso: nowIso(),
    ...safePose,
  });
}

export function upsertCameraAngleBookmark(
  bookmarks: readonly WebtoonCameraAngleBookmark[],
  bookmark: WebtoonCameraAngleBookmark,
): readonly WebtoonCameraAngleBookmark[] {
  const filtered = bookmarks.filter((entry) => entry.id !== bookmark.id);
  return Object.freeze([bookmark, ...filtered].slice(0, 64));
}

export function removeCameraAngleBookmark(
  bookmarks: readonly WebtoonCameraAngleBookmark[],
  bookmarkId: string,
): readonly WebtoonCameraAngleBookmark[] {
  return Object.freeze(bookmarks.filter((entry) => entry.id !== bookmarkId));
}

const CAMERA_BOOKMARKS_STORAGE_KEY = "toonstudio.camera-angles-pro.bookmarks.v1";

function isValidBookmarkRecord(value: unknown): value is WebtoonCameraAngleBookmark {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.fovDeg === "number"
    && typeof candidate.pitchDeg === "number"
    && typeof candidate.yawDeg === "number"
    && typeof candidate.rollDeg === "number"
    && typeof candidate.distance === "number"
    && Array.isArray(candidate.targetOffset)
    && candidate.targetOffset.length === 3
    && candidate.targetOffset.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function loadCameraAngleBookmarks(): readonly WebtoonCameraAngleBookmark[] {
  if (typeof globalThis.localStorage === "undefined") return [];
  try {
    const raw = globalThis.localStorage.getItem(CAMERA_BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Object.freeze(parsed.filter(isValidBookmarkRecord).slice(0, 64));
  } catch {
    return [];
  }
}

export function saveCameraAngleBookmarks(
  bookmarks: readonly WebtoonCameraAngleBookmark[],
): boolean {
  if (typeof globalThis.localStorage === "undefined") return false;
  try {
    globalThis.localStorage.setItem(
      CAMERA_BOOKMARKS_STORAGE_KEY,
      JSON.stringify(bookmarks.slice(0, 64)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Character Shaper — 멀티캐릭터 2인/군상 씬 스테이징 & 한국 웹툰 상황별 2인 상호작용 포즈 팩.
 *
 * PoseMy.Art(멀티 모델 씬) + Tooning 3D Asset Store(한국 웹툰 2인 대결·오피스 상황 포즈)를
 * 초월해, 1차 주연 VRM과 2~3차 상대역 VRM의 상대 좌표·시선 교차·표정 페어·카메라 프레이밍을
 * 단일 순수 상태로 관리한다. (전량 lazy 경계 내부 → studio-eager-graph +0B)
 */
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

export type DuoSceneGenre = "romance" | "action" | "school" | "office" | "fantasy";

export interface DuoActorPlacement {
  readonly id: string;
  readonly labelKo: string;
  readonly role: "primary" | "partner" | "support";
  /** 모델 에셋 ID (기본: 현재 셰이퍼 라이브러리 또는 Hero VRM 1.0 ID) */
  readonly modelId: string;
  /** 월드 좌표 오프셋 (m) */
  readonly position: readonly [number, number, number];
  /** Y축 회전 (rad) */
  readonly rotationY: number;
  /** 키/체격 스케일 배율 */
  readonly scale: number;
  /** 적용 포즈 프리셋 ID */
  readonly poseId: string;
  /** 적용 표정 프리셋 ID */
  readonly expressionId: string;
}

export interface CharacterShaperDuoPosePack {
  readonly id: string;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly genre: DuoSceneGenre;
  /** 권장 카메라 프리셋 ID */
  readonly recommendedCameraId: string;
  /** 두 캐릭터 간 기본 간격 (m) */
  readonly defaultSpacingMeters: number;
  /** 2인 또는 3인(군상) 배치 */
  readonly actors: readonly DuoActorPlacement[];
}

export const CHARACTER_SHAPER_DUO_POSE_PACKS: readonly CharacterShaperDuoPosePack[] = Object.freeze([
  {
    id: "duo:romance-eye-contact",
    labelKo: "로맨스 근접 눈맞춤",
    summaryKo: "키 차이를 살려 마주 보는 로맨스 웹툰 클로즈업 2인 구도",
    genre: "romance",
    recommendedCameraId: "bust",
    defaultSpacingMeters: 0.62,
    actors: [
      { id: "lead-a", labelKo: "주연 A", role: "primary", modelId: "active", position: [-0.31, 0, 0], rotationY: Math.PI * 0.44, scale: 1.0, poseId: "stand", expressionId: "smile" },
      { id: "lead-b", labelKo: "상대역 B", role: "partner", modelId: "hero-female-romance", position: [0.31, 0, 0.04], rotationY: -Math.PI * 0.46, scale: 0.94, poseId: "shy", expressionId: "shy" },
    ],
  },
  {
    id: "duo:action-blade-clash",
    labelKo: "액션 대치 · 검술 격돌",
    summaryKo: "대각선 동세로 서로를 겨누는 액션·판타지 2인 대결 구도",
    genre: "action",
    recommendedCameraId: "full",
    defaultSpacingMeters: 1.25,
    actors: [
      { id: "lead-a", labelKo: "주연 A", role: "primary", modelId: "active", position: [-0.62, 0, 0.1], rotationY: Math.PI * 0.38, scale: 1.0, poseId: "action", expressionId: "angry" },
      { id: "lead-b", labelKo: "라이벌 B", role: "partner", modelId: "hero-male-action", position: [0.62, 0, -0.1], rotationY: -Math.PI * 0.62, scale: 1.03, poseId: "combat", expressionId: "serious" },
    ],
  },
  {
    id: "duo:school-hallway-walk",
    labelKo: "학원 복도 나란히 걷기",
    summaryKo: "등하굣길·복도 대화를 자연스럽게 담는 2인 나란한 보행 구도",
    genre: "school",
    recommendedCameraId: "full",
    defaultSpacingMeters: 0.78,
    actors: [
      { id: "lead-a", labelKo: "주연 A", role: "primary", modelId: "active", position: [-0.39, 0, 0], rotationY: 0.14, scale: 1.0, poseId: "walk", expressionId: "happy" },
      { id: "lead-b", labelKo: "친구 B", role: "partner", modelId: "hero-youth-academy", position: [0.39, 0, -0.06], rotationY: -0.18, scale: 0.96, poseId: "walk", expressionId: "smile" },
    ],
  },
  {
    id: "duo:office-briefing",
    labelKo: "오피스 서류 브리핑",
    summaryKo: "현대 직장물에서 태블릿·서류를 두고 대화하는 2인 비즈니스 구도",
    genre: "office",
    recommendedCameraId: "waist",
    defaultSpacingMeters: 0.88,
    actors: [
      { id: "lead-a", labelKo: "팀장 A", role: "primary", modelId: "active", position: [-0.44, 0, 0], rotationY: Math.PI * 0.28, scale: 1.02, poseId: "confident", expressionId: "neutral" },
      { id: "lead-b", labelKo: "동료 B", role: "partner", modelId: "hero-male-webtoon", position: [0.44, 0, 0.05], rotationY: -Math.PI * 0.32, scale: 0.98, poseId: "stand", expressionId: "smile" },
    ],
  },
  {
    id: "duo:back-to-back-trust",
    labelKo: "등 맞대기 파트너",
    summaryKo: "포위전·버디물에서 서로의 등을 지키는 카리스마 2인 구도",
    genre: "action",
    recommendedCameraId: "full",
    defaultSpacingMeters: 0.48,
    actors: [
      { id: "lead-a", labelKo: "주연 A", role: "primary", modelId: "active", position: [-0.24, 0, 0.08], rotationY: -Math.PI * 0.18, scale: 1.0, poseId: "confident", expressionId: "serious" },
      { id: "lead-b", labelKo: "파트너 B", role: "partner", modelId: "hero-female-action", position: [0.24, 0, -0.08], rotationY: Math.PI * 0.82, scale: 0.97, poseId: "action", expressionId: "confident" },
    ],
  },
  {
    id: "duo:rescue-support",
    labelKo: "부축 · 구출 드라마",
    summaryKo: "다친 상대역을 부축하거나 끌어올리는 감정선 강조 2인 포즈",
    genre: "romance",
    recommendedCameraId: "waist",
    defaultSpacingMeters: 0.56,
    actors: [
      { id: "lead-a", labelKo: "구출자 A", role: "primary", modelId: "active", position: [-0.28, 0, 0], rotationY: Math.PI * 0.25, scale: 1.02, poseId: "reach", expressionId: "worried" },
      { id: "lead-b", labelKo: "상대역 B", role: "partner", modelId: "hero-female-romance", position: [0.28, -0.08, 0.08], rotationY: -Math.PI * 0.22, scale: 0.95, poseId: "sit", expressionId: "surprised" },
    ],
  },
  {
    id: "duo:rofan-tea-parlor",
    labelKo: "로판 티타임 마주앉기",
    summaryKo: "응접실 테이블을 사이에 두고 대화하는 로맨스 판타지 2인 구도",
    genre: "fantasy",
    recommendedCameraId: "waist",
    defaultSpacingMeters: 1.05,
    actors: [
      { id: "lead-a", labelKo: "영애 A", role: "primary", modelId: "active", position: [-0.52, 0, 0], rotationY: Math.PI * 0.42, scale: 0.98, poseId: "sit", expressionId: "smile" },
      { id: "lead-b", labelKo: "공작 B", role: "partner", modelId: "hero-rofan-duke", position: [0.52, 0, 0], rotationY: -Math.PI * 0.42, scale: 1.05, poseId: "sit", expressionId: "neutral" },
    ],
  },
  {
    id: "ensemble:trio-hero-formation",
    labelKo: "3인 군상 히어로 포메이션",
    summaryKo: "표지·오프닝 컷용 주연 1인 + 좌우 조연 2인 삼각 구도",
    genre: "fantasy",
    recommendedCameraId: "full",
    defaultSpacingMeters: 0.95,
    actors: [
      { id: "lead-a", labelKo: "센터 주연", role: "primary", modelId: "active", position: [0, 0, 0.25], rotationY: 0, scale: 1.0, poseId: "confident", expressionId: "happy" },
      { id: "lead-b", labelKo: "좌측 동료", role: "partner", modelId: "hero-female-romance", position: [-0.95, 0, -0.25], rotationY: 0.22, scale: 0.96, poseId: "stand", expressionId: "smile" },
      { id: "lead-c", labelKo: "우측 동료", role: "support", modelId: "hero-male-action", position: [0.95, 0, -0.25], rotationY: -0.22, scale: 1.03, poseId: "action", expressionId: "serious" },
    ],
  },
]);

export interface CharacterShaperDuoSceneState {
  readonly enabled: boolean;
  readonly activePackId: string;
  /** 주연과 상대역 사이 간격 (0.3m .. 2.4m) */
  readonly spacingMeters: number;
  /** 주연/상대역 위치 좌우 교체 */
  readonly swapped: boolean;
  /** 2인 기본 또는 3인 군상 */
  readonly actorCount: 2 | 3;
  /** 상대역 캐릭터 모델 프리셋 ID */
  readonly partnerModelId: string;
}

export const DUO_PARTNER_MODEL_OPTIONS: readonly { readonly id: string; readonly labelKo: string }[] = Object.freeze([
  { id: "hero-female-romance", labelKo: "로맨스 여주 (Hero VRM)" },
  { id: "hero-male-webtoon", labelKo: "현대 남주 (Hero VRM)" },
  { id: "hero-male-action", labelKo: "액션 남주 (Hero VRM)" },
  { id: "hero-youth-academy", labelKo: "학원 소년/소녀 (Hero VRM)" },
  { id: "hero-rofan-duke", labelKo: "로판 공작 (Hero VRM)" },
  { id: "hero-sd-chibi", labelKo: "SD 치비 마스코트 (Hero VRM)" },
]);

export function createDefaultDuoSceneState(): CharacterShaperDuoSceneState {
  const first = CHARACTER_SHAPER_DUO_POSE_PACKS[0]!;
  return Object.freeze({
    enabled: false,
    activePackId: first.id,
    spacingMeters: first.defaultSpacingMeters,
    swapped: false,
    actorCount: 2,
    partnerModelId: first.actors[1]?.modelId ?? "hero-female-romance",
  });
}

export function getDuoPosePackById(id: string): CharacterShaperDuoPosePack {
  return CHARACTER_SHAPER_DUO_POSE_PACKS.find((pack) => pack.id === id) ?? CHARACTER_SHAPER_DUO_POSE_PACKS[0]!;
}

export function resolveDuoSceneActors(state: CharacterShaperDuoSceneState): readonly DuoActorPlacement[] {
  const pack = getDuoPosePackById(state.activePackId);
  const ratio = pack.defaultSpacingMeters > 0 ? state.spacingMeters / pack.defaultSpacingMeters : 1;
  const swapSign = state.swapped ? -1 : 1;

  const baseActors = pack.actors.map((actor, index) => ({
    ...actor,
    modelId: index === 1 ? state.partnerModelId : actor.modelId,
    position: [
      Number((actor.position[0] * ratio * swapSign).toFixed(3)),
      actor.position[1],
      actor.position[2],
    ] as const,
    rotationY: Number((actor.rotationY * swapSign).toFixed(4)),
  }));

  if (state.actorCount === 3 && baseActors.length < 3) {
    baseActors.push({
      id: "support-c",
      labelKo: "조연 C",
      role: "support",
      modelId: "hero-youth-academy",
      position: [Number((state.spacingMeters * 0.9 * swapSign).toFixed(3)), 0, -0.35],
      rotationY: Number((-0.25 * swapSign).toFixed(4)),
      scale: 0.95,
      poseId: "stand",
      expressionId: "smile",
    });
  }
  return Object.freeze(baseActors);
}

/**
 * 선택한 2인 상호작용 포즈 팩의 1차 주연(Primary) 회전·포즈·카메라를 현재 셰이퍼 호스트에 즉시 적용한다.
 */
export function applyDuoPosePackToPrimaryHost(
  host: StudioVrmPoserHost,
  state: CharacterShaperDuoSceneState,
): { readonly primaryActor: DuoActorPlacement; readonly partnerCount: number } {
  const actors = resolveDuoSceneActors(state);
  const primary = actors[0]!;
  const pack = getDuoPosePackById(state.activePackId);

  if (typeof host.setBodyRotation === "function") {
    host.setBodyRotation(primary.rotationY);
  }
  if (typeof host.handlePoseSelect === "function") {
    host.handlePoseSelect(primary.poseId);
  }
  if (typeof host.setActiveCameraId === "function" && pack.recommendedCameraId) {
    host.setActiveCameraId(pack.recommendedCameraId);
  }
  return Object.freeze({
    primaryActor: primary,
    partnerCount: Math.max(0, actors.length - 1),
  });
}

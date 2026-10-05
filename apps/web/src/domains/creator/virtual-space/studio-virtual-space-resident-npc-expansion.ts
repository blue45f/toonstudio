import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldNpcDefinition,
} from "./studio-virtual-space-world-manifest";

/**
 * 월드 상주 NPC 확장 배치 (VS 120 웨이브 2 · 단위 3 — 배치 준비 모듈)
 *
 * 기본 월드의 상주 NPC 8명은 방 14개 중 8개만 커버한다. 남은 6개 방
 * (글쓰기·스토리보드·품질·출고·협업·비서)에도 상주 NPC가 있어야 공간이 비지 않는다.
 * 이 모듈은 그 6명의 배치(홈·순찰 2점·활동 앵커 3개)를 기본 매니페스트와
 * 정확히 같은 패턴으로 코드로 준비한다.
 *
 * 왜 기본 매니페스트에 바로 합치지 않는가 (채택 전제):
 * - 매니페스트 검증의 캐스트 게이트는 드로잉 스킨(STUDIO_NPC_CAST)만 허용한다.
 *   아래 6명은 프로시저럴 스킨(npc-cast의 코드 생성 스킨)을 쓰므로, 캔버스의 NPC 비주얼
 *   해석(studioNpcCastSkinByKey)이 프로시저럴 스킨까지 넓어지고 캐스트 게이트가
 *   그 스킨들을 인정해야 라이브로 켤 수 있다. npc-cast v1~v4 구세대 아트 부활이 아니다.
 * - 앵커 애니메이션 클립 가용성도 프로시저럴 스킨 기준으로 재검증해야 한다
 *   (검증기는 드로잉 스킨 기준으로만 판정한다).
 * 채택 절차는 mergeStudioResidentNpcExpansion으로 합친 매니페스트를 검증하는 것부터이며,
 * 이 모듈의 테스트가 "캐스트·클립 게이트 오류 외에는 검증 오류가 없음"을 고정한다.
 *
 * 좌표 원칙: 방 스폰·기존 NPC 앵커로 이미 검증된 지점을 우선 쓰고, 벽에 붙은 지점은
 * 기존 EXTRA 앵커와 같은 세로 오프셋(approach 위·exit 아래) 방식을 쓴다.
 */

interface ResidentNpcPoint {
  readonly x: number;
  readonly y: number;
  /** 벽에 붙은 지점 — 접근/이탈 오프셋을 세로(±12)로 잡는다. */
  readonly vertical?: boolean;
}

interface ResidentNpcProfile {
  readonly id: string;
  readonly roomId: StudioWorldNpcDefinition["roomId"];
  readonly skinKey: string;
  readonly facing: StudioVirtualSpaceFacing;
  readonly speed: number;
  /** [홈, 순찰1, 순찰2] — 기본 프로필과 같은 3점 구성. */
  readonly points: readonly [ResidentNpcPoint, ResidentNpcPoint, ResidentNpcPoint];
  /** 앵커 3개의 애니메이션 [작업, 점검, 휴식]. */
  readonly animations: readonly [StudioWorldNpcActivityAnchor["animation"], StudioWorldNpcActivityAnchor["animation"], StudioWorldNpcActivityAnchor["animation"]];
}

const RESIDENT_NPC_PROFILES: readonly ResidentNpcProfile[] = Object.freeze([
  Object.freeze({
    id: "studio-writer", roomId: "writers", skinKey: "npc-mentor", facing: "left", speed: 56,
    points: Object.freeze([
      Object.freeze({ x: 290, y: 485, vertical: true }),
      Object.freeze({ x: 120, y: 485 }),
      Object.freeze({ x: 270, y: 345 }),
    ]),
    animations: Object.freeze(["review", "talk", "idle"] as const),
  }),
  Object.freeze({
    id: "studio-docent", roomId: "storyboard", skinKey: "npc-guide", facing: "left", speed: 60,
    points: Object.freeze([
      Object.freeze({ x: 590, y: 205, vertical: true }),
      Object.freeze({ x: 390, y: 205 }),
      Object.freeze({ x: 560, y: 130 }),
    ]),
    animations: Object.freeze(["talk", "idle", "idle"] as const),
  }),
  Object.freeze({
    id: "studio-inspector", roomId: "quality", skinKey: "npc-guard", facing: "left", speed: 58,
    points: Object.freeze([
      Object.freeze({ x: 1210, y: 485, vertical: true }),
      Object.freeze({ x: 1040, y: 485 }),
      Object.freeze({ x: 1210, y: 335, vertical: true }),
    ]),
    animations: Object.freeze(["review", "review", "idle"] as const),
  }),
  Object.freeze({
    id: "studio-courier", roomId: "release", skinKey: "npc-shopkeeper", facing: "left", speed: 62,
    points: Object.freeze([
      Object.freeze({ x: 1210, y: 205, vertical: true }),
      Object.freeze({ x: 1040, y: 205 }),
      Object.freeze({ x: 1210, y: 80, vertical: true }),
    ]),
    animations: Object.freeze(["idle", "talk", "idle"] as const),
  }),
  Object.freeze({
    id: "studio-barista", roomId: "teams", skinKey: "npc-barista", facing: "right", speed: 55,
    points: Object.freeze([
      Object.freeze({ x: 300, y: 800 }),
      Object.freeze({ x: 120, y: 800 }),
      Object.freeze({ x: 300, y: 650 }),
    ]),
    animations: Object.freeze(["talk", "idle", "idle"] as const),
  }),
  Object.freeze({
    id: "studio-helper", roomId: "assistant", skinKey: "npc-cleaner", facing: "left", speed: 57,
    points: Object.freeze([
      // 스폰(590,890)에서 서쪽·위쪽으로 살짝 비킨 지점 — 남벽(y908)에 세로 이탈(±12)이 걸리지 않는 자리.
      Object.freeze({ x: 580, y: 885, vertical: true }),
      Object.freeze({ x: 430, y: 890 }),
      Object.freeze({ x: 560, y: 820 }),
    ]),
    animations: Object.freeze(["review", "talk", "idle"] as const),
  }),
]);

const ACTIVITIES: readonly StudioWorldNpcActivityAnchor["activity"][] = Object.freeze(["work", "inspect", "rest"]);

function anchorFor(profile: ResidentNpcProfile, point: ResidentNpcPoint, index: number): StudioWorldNpcActivityAnchor {
  const approachPoint: StudioVirtualSpacePoint = point.vertical
    ? { x: point.x, y: point.y - 12 }
    : { x: point.x - 18, y: point.y };
  const exitPoint: StudioVirtualSpacePoint = point.vertical
    ? { x: point.x, y: point.y + 12 }
    : { x: point.x + 18, y: point.y };
  return Object.freeze({
    id: `${profile.id}-${index}`,
    roomId: profile.roomId,
    approachPoint,
    anchorPoint: { x: point.x, y: point.y },
    exitPoint,
    facing: index === 2 ? "down" : profile.facing,
    activity: ACTIVITIES[index]!,
    animation: profile.animations[index]!,
    minDurationMs: index === 0 ? 18_000 : 7_000,
    maxDurationMs: index === 0 ? 36_000 : 16_000,
  });
}

/** 확장 상주 NPC 6명의 활동 앵커 18개 (NPC당 3개, 기본 프로필과 같은 구성). */
export const STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS: readonly StudioWorldNpcActivityAnchor[] = Object.freeze(
  RESIDENT_NPC_PROFILES.flatMap((profile) => profile.points.map((point, index) => anchorFor(profile, point, index))),
);

/** 확장 상주 NPC 6명의 정의. 홈=1번 지점, 순찰=2·3번 지점, 앵커 id는 -0~-2. */
export const STUDIO_RESIDENT_NPC_EXPANSION: readonly StudioWorldNpcDefinition[] = Object.freeze(
  RESIDENT_NPC_PROFILES.map((profile) => Object.freeze({
    id: profile.id,
    skinKey: profile.skinKey,
    point: { x: profile.points[0].x, y: profile.points[0].y },
    roomId: profile.roomId,
    facing: profile.facing,
    scale: 0.94,
    speed: profile.speed,
    behavior: "patrol" as const,
    patrol: Object.freeze([
      Object.freeze({ x: profile.points[1].x, y: profile.points[1].y }),
      Object.freeze({ x: profile.points[2].x, y: profile.points[2].y }),
    ]),
    activityAnchorIds: Object.freeze([`${profile.id}-0`, `${profile.id}-1`, `${profile.id}-2`]),
  })),
);

/** 기본 매니페스트에 없던 방 id 목록 — 확장이 메우는 대상. */
export function studioResidentNpcUncoveredRoomIds(
  manifest: StudioVirtualSpaceWorldManifest = DEFAULT_STUDIO_WORLD_MANIFEST,
): readonly string[] {
  const covered = new Set(manifest.npcs.map((npc) => npc.roomId));
  return Object.freeze(manifest.rooms.map((room) => room.id).filter((roomId) => !covered.has(roomId)));
}

/**
 * 채택용 합본 매니페스트를 만든다 (입력은 바꾸지 않는다).
 * 라이브 기본 매니페스트에는 적용하지 않는다 — 위 헤더의 채택 전제가 먼저다.
 */
export function mergeStudioResidentNpcExpansion(
  manifest: StudioVirtualSpaceWorldManifest = DEFAULT_STUDIO_WORLD_MANIFEST,
): StudioVirtualSpaceWorldManifest {
  return Object.freeze({
    ...manifest,
    npcs: Object.freeze([...manifest.npcs, ...STUDIO_RESIDENT_NPC_EXPANSION]),
    npcActivityAnchors: Object.freeze([
      ...(manifest.npcActivityAnchors ?? []),
      ...STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS,
    ]),
  });
}

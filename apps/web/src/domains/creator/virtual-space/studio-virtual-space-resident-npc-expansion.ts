import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  STUDIO_RESIDENT_NPC_EXPANSION,
  STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

export { STUDIO_RESIDENT_NPC_EXPANSION, STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS };

/**
 * 월드 상주 NPC 확장 배치 (VS 120 웨이브 2 준비 → 웨이브 3 · 2026-10-06 기본 매니페스트 채택 완료)
 *
 * 배치 데이터(프로필 표·앵커 빌더·파생 상수)의 정본은 world-manifest.ts다.
 * 이 모듈이 기본 매니페스트를 값으로 import하므로, 데이터가 여기에 있으면 순환 import가 된다.
 * 여기에는 채택 이후에도 의미가 있는 두 가지만 남긴다: 미커버 방 조회와,
 * 확장을 아직 적용하지 않은 매니페스트(가져온 월드 등)에 대한 멱등 합본.
 *
 * 채택 전제였던 세 가지 — 캐스트 게이트의 프로시저럴 인정, 비주얼 해석
 * (studioNpcCastSkinByKey)의 프로시저럴 해석, 클립 가용성의 구조 판정 — 은
 * 2026-10-06에 해소됐고, 기본 매니페스트는 이제 상주 NPC 14명으로 전 방을 커버한다.
 * npc-cast v1~v4 구세대 아트와는 무관하다.
 */

/** 주어진 매니페스트에서 상주 NPC가 없는 방 id 목록 (매니페스트 방 순서). */
export function studioResidentNpcUncoveredRoomIds(
  manifest: StudioVirtualSpaceWorldManifest = DEFAULT_STUDIO_WORLD_MANIFEST,
): readonly string[] {
  const covered = new Set(manifest.npcs.map((npc) => npc.roomId));
  return Object.freeze(manifest.rooms.map((room) => room.id).filter((roomId) => !covered.has(roomId)));
}

/**
 * 확장을 아직 적용하지 않은 매니페스트에 상주 NPC 6명을 합친다 (입력은 바꾸지 않는다).
 * 이미 있는 NPC·앵커는 id 기준으로 건너뛰므로, 채택 완료된 기본 매니페스트에
 * 적용해도 결과가 그대로다(멱등).
 */
export function mergeStudioResidentNpcExpansion(
  manifest: StudioVirtualSpaceWorldManifest = DEFAULT_STUDIO_WORLD_MANIFEST,
): StudioVirtualSpaceWorldManifest {
  const npcIds = new Set(manifest.npcs.map((npc) => npc.id));
  const anchorIds = new Set((manifest.npcActivityAnchors ?? []).map((anchor) => anchor.id));
  return Object.freeze({
    ...manifest,
    npcs: Object.freeze([
      ...manifest.npcs,
      ...STUDIO_RESIDENT_NPC_EXPANSION.filter((npc) => !npcIds.has(npc.id)),
    ]),
    npcActivityAnchors: Object.freeze([
      ...(manifest.npcActivityAnchors ?? []),
      ...STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS.filter((anchor) => !anchorIds.has(anchor.id)),
    ]),
  });
}

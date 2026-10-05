import { describe, expect, it } from "vitest";

import { validateStudioNpcActivityAnchors } from "./studio-virtual-space-npc-activity";
import { STUDIO_NPC_CAST, studioProceduralNpcHasKey } from "./studio-virtual-space-npc-cast";
import {
  STUDIO_RESIDENT_NPC_EXPANSION,
  STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS,
  mergeStudioResidentNpcExpansion,
  studioResidentNpcUncoveredRoomIds,
} from "./studio-virtual-space-resident-npc-expansion";
import {
  StudioWorldConnectivityIndex,
  studioWorldCircleCanOccupy,
} from "./studio-virtual-space-world-connectivity";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldCollisionRects,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";

const ACTOR_RADIUS = 9;
const colliders = studioWorldCollisionRects(DEFAULT_STUDIO_WORLD_MANIFEST);
const connectivity = new StudioWorldConnectivityIndex(DEFAULT_STUDIO_WORLD_MANIFEST, colliders, ACTOR_RADIUS);
const geometry = {
  canOccupy: (point: { x: number; y: number }) =>
    studioWorldCircleCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, colliders, point, ACTOR_RADIUS),
  connected: (a: { x: number; y: number }, b: { x: number; y: number }) => connectivity.connected(a, b),
};

describe("상주 NPC 확장 — 대상 방", () => {
  it("기본 월드가 비워 둔 방은 정확히 6개다 (매니페스트 방 순서)", () => {
    expect(studioResidentNpcUncoveredRoomIds()).toEqual([
      "storyboard", "release", "writers", "quality", "teams", "assistant",
    ]);
  });

  it("확장 6명은 그 6개 방을 하나씩 메우고 id가 기존과 겹치지 않는다", () => {
    expect(STUDIO_RESIDENT_NPC_EXPANSION.map((npc) => npc.roomId)).toEqual([
      "writers", "storyboard", "quality", "release", "teams", "assistant",
    ]);
    const existingIds = new Set(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map((npc) => npc.id));
    for (const npc of STUDIO_RESIDENT_NPC_EXPANSION) {
      expect(existingIds.has(npc.id)).toBe(false);
      expect(npc.behavior).toBe("patrol");
      expect(npc.patrol).toHaveLength(2);
    }
    const merged = mergeStudioResidentNpcExpansion();
    expect(studioResidentNpcUncoveredRoomIds(merged)).toEqual([]);
  });

  it("스킨은 전부 실재하는 프로시저럴 스킨이고 드로잉 캐스트에는 없다(채택 전제의 근거)", () => {
    const drawingKeys = new Set(STUDIO_NPC_CAST.map((skin) => skin.key));
    for (const npc of STUDIO_RESIDENT_NPC_EXPANSION) {
      expect(studioProceduralNpcHasKey(npc.skinKey)).toBe(true);
      expect(drawingKeys.has(npc.skinKey)).toBe(false);
    }
    // 방문객(npc-visitor)은 상주가 아니라 남겨 둔다.
    expect(STUDIO_RESIDENT_NPC_EXPANSION.some((npc) => npc.skinKey === "npc-visitor")).toBe(false);
  });
});

describe("상주 NPC 확장 — 앵커·기하 검증", () => {
  it("앵커는 NPC당 3개씩 18개이고 정의의 참조와 일치한다", () => {
    expect(STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS).toHaveLength(18);
    for (const npc of STUDIO_RESIDENT_NPC_EXPANSION) {
      expect(npc.activityAnchorIds).toEqual([`${npc.id}-0`, `${npc.id}-1`, `${npc.id}-2`]);
      const own = STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS.filter((anchor) => npc.activityAnchorIds!.includes(anchor.id));
      expect(own).toHaveLength(3);
      expect(own.map((anchor) => anchor.activity)).toEqual(["work", "inspect", "rest"]);
      expect(own.every((anchor) => anchor.roomId === npc.roomId)).toBe(true);
    }
  });

  it("확장 앵커는 매니페스트 검증기와 같은 기하로 전부 통과한다", () => {
    const merged = mergeStudioResidentNpcExpansion();
    const errors = validateStudioNpcActivityAnchors(STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS, merged, geometry);
    expect(errors).toEqual([]);
  });

  it("홈·순찰 지점은 전부 설 수 있고 순찰 다리가 모두 연결된다", () => {
    for (const npc of STUDIO_RESIDENT_NPC_EXPANSION) {
      expect(geometry.canOccupy(npc.point)).toBe(true);
      const legs = [npc.point, ...npc.patrol!, npc.patrol![0]!];
      for (const point of legs) expect(geometry.canOccupy(point)).toBe(true);
      for (let index = 1; index < legs.length; index += 1) {
        expect(connectivity.connected(legs[index - 1]!, legs[index]!)).toBe(true);
      }
    }
  });

  it("합본 매니페스트는 앵커 예산(64) 안에 있고 기본 매니페스트는 바뀌지 않는다", () => {
    const merged = mergeStudioResidentNpcExpansion();
    expect(merged.npcActivityAnchors).toHaveLength(58);
    expect(merged.npcs).toHaveLength(14);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs).toHaveLength(8);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcActivityAnchors).toHaveLength(40);
  });

  it("합본 검증 오류는 캐스트·클립 게이트뿐이다 (채택 전제 그 자체를 고정)", () => {
    const errors = validateStudioWorldManifest(mergeStudioResidentNpcExpansion());
    const expansionIds = STUDIO_RESIDENT_NPC_EXPANSION.map((npc) => npc.id);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      const owner = expansionIds.find((id) => error.includes(id));
      expect(owner, `확장과 무관한 검증 오류: ${error}`).toBeDefined();
      expect(
        error.includes("references missing cast") || error.includes("activity clip is unavailable"),
        `게이트 외 오류: ${error}`,
      ).toBe(true);
    }
    // 6명 전원이 캐스트 게이트에 걸린다 — 게이트 확장이 채택의 선행 조건이다.
    for (const id of expansionIds) {
      expect(errors.some((error) => error.includes(id) && error.includes("references missing cast"))).toBe(true);
    }
  });
});

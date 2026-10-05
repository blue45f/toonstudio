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

// 이 파일은 원래 채택 이전 상태(기본 8명·빈 방 6개·합본 시 게이트 오류만 발생)를 고정했다.
// 2026-10-06 채택이 끝나면서 고정 대상 사실이 바뀌었다 — 단언을 약화한 게 아니라
// "채택됨"이라는 새 사실을 같은 강도로 고정한다.

describe("상주 NPC 확장 — 대상 방", () => {
  it("채택된 기본 월드는 전 방을 커버하고, 확장을 빼면 정확히 6개 방이 빈다 (매니페스트 방 순서)", () => {
    expect(studioResidentNpcUncoveredRoomIds()).toEqual([]);
    const expansionIds = new Set(STUDIO_RESIDENT_NPC_EXPANSION.map((npc) => npc.id));
    const stripped = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      npcs: DEFAULT_STUDIO_WORLD_MANIFEST.npcs.filter((npc) => !expansionIds.has(npc.id)),
    };
    expect(studioResidentNpcUncoveredRoomIds(stripped)).toEqual([
      "storyboard", "release", "writers", "quality", "teams", "assistant",
    ]);
    expect(studioResidentNpcUncoveredRoomIds(mergeStudioResidentNpcExpansion(stripped))).toEqual([]);
  });

  it("확장 6명은 그 6개 방을 하나씩 메우고 기본 매니페스트에 그대로 포함돼 있다", () => {
    expect(STUDIO_RESIDENT_NPC_EXPANSION.map((npc) => npc.roomId)).toEqual([
      "writers", "storyboard", "quality", "release", "teams", "assistant",
    ]);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs).toHaveLength(14);
    const defaultIds = DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map((npc) => npc.id);
    expect(new Set(defaultIds).size).toBe(14);
    for (const npc of STUDIO_RESIDENT_NPC_EXPANSION) {
      expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs).toContain(npc);
      expect(npc.behavior).toBe("patrol");
      expect(npc.patrol).toHaveLength(2);
    }
  });

  it("스킨은 전부 실재하는 프로시저럴 스킨이고 드로잉 캐스트에는 없다(통합 레지스트리로 인정된다)", () => {
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
    const errors = validateStudioNpcActivityAnchors(STUDIO_RESIDENT_NPC_EXPANSION_ANCHORS, DEFAULT_STUDIO_WORLD_MANIFEST, geometry);
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

  it("기본 매니페스트는 NPC 14명·앵커 58개로 앵커 예산(64) 안에 있고 합본은 멱등이다", () => {
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs).toHaveLength(14);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcActivityAnchors).toHaveLength(58);
    const merged = mergeStudioResidentNpcExpansion();
    expect(merged.npcs).toHaveLength(14);
    expect(merged.npcActivityAnchors).toHaveLength(58);
    const mergedTwice = mergeStudioResidentNpcExpansion(merged);
    expect(mergedTwice.npcs).toHaveLength(14);
    expect(mergedTwice.npcActivityAnchors).toHaveLength(58);
  });

  it("채택된 기본 매니페스트는 검증 오류가 없고, 게이트는 미지 스킨을 계속 거부한다", () => {
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
    expect(validateStudioWorldManifest(mergeStudioResidentNpcExpansion())).toEqual([]);
    // 게이트를 끈 게 아니다: 레지스트리에 없는 스킨으로 바꾸면 캐스트·클립 게이트가 그대로 걸린다.
    const ghost = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      npcs: DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map((npc) => (
        npc.id === "studio-writer" ? { ...npc, skinKey: "npc-ghost" } : npc
      )),
    };
    const errors = validateStudioWorldManifest(ghost);
    expect(errors).toContain("npc references missing cast: studio-writer");
    expect(errors.some((error) => error.includes("activity clip is unavailable") && error.includes("studio-writer"))).toBe(true);
  });
});

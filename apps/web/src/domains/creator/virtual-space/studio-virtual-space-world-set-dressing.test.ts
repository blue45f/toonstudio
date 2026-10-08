import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { StudioWorldConnectivityIndex } from "./studio-virtual-space-world-connectivity";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { studioWorldCollisionRects } from "./studio-virtual-space-world-manifest";
import { createOfficeZone } from "./studio-virtual-space-office-zones";
import { resolveStudioVirtualBuiltinWorld } from "./studio-virtual-space-campus-world";
import { STUDIO_FLOOR_DECAL_DEPTH, STUDIO_OFFICE_ZONE_LANDMARKS, studioVirtualOfficeZoneLandmarks, studioVirtualPlaceSetDressing, studioVirtualSetDressingBounds, studioVirtualSetDressingColliders, studioVirtualSetDressingPlacement, studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";

describe("장소별 랜드마크와 바닥 충돌 계약", () => {
  it.each(STUDIO_VIRTUAL_PLACES.map((place) => place.id))("%s의 건축물·식생·업무 가구가 월드 안에 있고 렌더링과 물리가 같은 배치를 쓴다", (placeId) => {
    const world = studioVirtualPlaceWorldManifest(placeId);
    const scenery = studioVirtualWorldSetDressing(world);
    expect(scenery).toBe(studioVirtualPlaceSetDressing(placeId));
    expect(scenery.length).toBeGreaterThanOrEqual(25);
    expect(new Set(scenery.map((item) => item.id)).size).toBe(scenery.length);
    expect(scenery.filter((item) => item.id.includes("hero-"))).toHaveLength(2);
    expect(scenery.some((item) => item.atlas === "furniture")).toBe(true);
    expect(scenery.some((item) => item.frame === 12 && item.atlas === "landmarks")).toBe(true);
    for (const item of scenery) {
      expect(item.frame).toBeGreaterThanOrEqual(0);
      expect(item.frame).toBeLessThan(16);
      const bounds = studioVirtualSetDressingBounds(item);
      expect(bounds.x, item.id).toBeGreaterThanOrEqual(0);
      expect(bounds.y, item.id).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, item.id).toBeLessThanOrEqual(world.width);
      expect(bounds.y + bounds.height, item.id).toBeLessThanOrEqual(world.height);
      for (const collider of item.colliders) {
        expect(world.colliders).toContain(collider);
        expect(collider.x, item.id).toBeGreaterThanOrEqual(bounds.x);
        expect(collider.y, item.id).toBeGreaterThanOrEqual(bounds.y);
        expect(collider.x + collider.width, item.id).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(collider.y + collider.height, item.id).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
    expect(world.colliders.slice(5)).toEqual(studioVirtualSetDressingColliders(placeId));
  });

  it.each(STUDIO_VIRTUAL_PLACES.map((place) => place.id))("%s에서 입장·좌석·NPC·업무 지점이 가려지지 않고 서로 연결된다", (placeId) => {
    const world = studioVirtualPlaceWorldManifest(placeId);
    const points = [
      ...world.spawns.map((spawn) => spawn.point),
      ...world.portals.map((portal) => portal.point),
      ...world.interactions.map((interaction) => interaction.point),
      ...world.npcs.flatMap((npc) => [npc.point, ...npc.patrol ?? []]),
      ...world.interactionSlots?.flatMap((slot) => [slot.approachPoint, slot.anchorPoint, slot.exitPoint]) ?? [],
      ...world.npcActivityAnchors?.flatMap((anchor) => [anchor.approachPoint, anchor.anchorPoint, anchor.exitPoint]) ?? [],
    ];
    const connectivity = new StudioWorldConnectivityIndex(world, studioWorldCollisionRects(world), 9);
    for (const point of points) {
      expect(studioWorldCanOccupy(world, point), `${placeId} ${point.x},${point.y}`).toBe(true);
      expect(connectivity.connected({ x: 480, y: 540 }, point), `${placeId} ${point.x},${point.y}`).toBe(true);
    }
  });

  it("기본 월드와 id가 같더라도 사용자 맵에는 기본 랜드마크를 주입하지 않는다", () => {
    const world = studioVirtualPlaceWorldManifest("personal-atelier");
    const customMap = JSON.parse(JSON.stringify(world));
    expect(studioVirtualWorldSetDressing(customMap)).toEqual([]);
    expect(studioVirtualPlaceSetDressing("user-workshop")).toEqual([]);
  });

  it("14개 장소의 주 건축물과 업무 도구 조합이 서로 구별된다", () => {
    const signatures = STUDIO_VIRTUAL_PLACES.map((place) => studioVirtualPlaceSetDressing(place.id)
      .filter((item) => /hero-|workstation-|purpose-center/u.test(item.id))
      .map(({ atlas, frame, width, height }) => `${atlas}:${frame}:${width}:${height}`).join("|"));
    expect(new Set(signatures).size).toBe(STUDIO_VIRTUAL_PLACES.length);
  });

  it("아치 기둥 사이와 다리 난간 사이의 보이는 통로는 열려 있다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    for (let y = 542; y <= 614; y += 6) expect(studioWorldCanOccupy(world, { x: 480, y })).toBe(true);
    for (let x = 40; x <= 172; x += 6) expect(studioWorldCanOccupy(world, { x, y: 320 })).toBe(true);
    const arch = studioVirtualWorldSetDressing(world).find((item) => item.id.endsWith("arrival-arch"));
    const pillar = arch?.colliders[0];
    expect(pillar).toBeDefined();
    if (pillar) expect(studioWorldCanOccupy(world, { x: pillar.x + pillar.width / 2, y: pillar.y + pillar.height / 2 })).toBe(false);
  });
});

describe("오피스 존 랜드마크 (Track D)", () => {
  it("10개 존 종류 모두에 랜드마크 프레임이 매핑된다", () => {
    expect(Object.keys(STUDIO_OFFICE_ZONE_LANDMARKS)).toHaveLength(10);
    for (const frame of Object.values(STUDIO_OFFICE_ZONE_LANDMARKS)) {
      expect(Number.isInteger(frame)).toBe(true);
    }
  });

  it("존 목록에서 랜드마크 배치를 만든다", () => {
    const zone = createOfficeZone({
      id: "test-cafe", type: "cafe", labelKo: "카페", labelEn: "Cafe",
      descriptionKo: "카페", descriptionEn: "Cafe",
      shape: { kind: "rect", x: 490, y: 590, width: 120, height: 180 },
      roomId: "lounge",
      rules: [{ id: "order", severity: "suggestion", labelKo: "주문", labelEn: "Order" }],
      ambientHintKo: "커피 향", ambientHintEn: "Coffee aroma",
    });
    const placed = studioVirtualOfficeZoneLandmarks(zone ? [zone] : []);
    expect(placed).toHaveLength(1);
    const item = placed[0]!;
    expect(item.id).toBe("zone-test-cafe-landmark");
    expect(item.frame).toBe(1); // cafe frame
    expect(item.x).toBe(490 + 120 / 2);
    expect(item.y).toBe(590 + 180);
    expect(item.width).toBeLessThanOrEqual(72);
  });

  it("존이 없으면 빈 배치를 반환한다", () => {
    expect(studioVirtualOfficeZoneLandmarks(undefined)).toEqual([]);
    expect(studioVirtualOfficeZoneLandmarks([])).toEqual([]);
  });
});

describe("바닥 장식(러그) 깊이 계약", () => {
  it("캠퍼스 러그는 어떤 캐릭터보다도 아래에 그려져 지나가는 캐릭터를 덮지 않는다", () => {
    const campus = resolveStudioVirtualBuiltinWorld("skyport", true).manifest;
    const items = studioVirtualWorldSetDressing(campus);
    const rugs = items.filter((item) => item.atlas === "furniture" && item.frame === 8);
    // 로비·카페 라운지·팀 미팅·게임 구역의 러그 4개가 바닥 깊이를 받는다.
    expect(rugs.map((rug) => rug.id).sort()).toEqual(["campus-cafe-lounge-rug", "campus-game-rug", "campus-lobby-rug", "campus-talk-rug"]);
    for (const rug of rugs) {
      expect(rug.depth, rug.id).toBe(STUDIO_FLOOR_DECAL_DEPTH);
      // 러그 윗변(가장 먼 쪽)에 선 캐릭터의 깊이(y + 1001)도 러그보다 위다. 예전에는 러그가 y+1000이라 캐릭터를 덮었다.
      expect(Math.round(rug.y - rug.height) + 1_001, rug.id).toBeGreaterThan(rug.depth as number);
    }
    // 러그가 아닌 가구와 건물은 그대로 y 정렬이다(가구 뒤로 걷는 가려짐은 유지).
    const sorted = items.filter((item) => !(item.atlas === "furniture" && item.frame === 8));
    expect(sorted.length).toBeGreaterThan(20);
    expect(sorted.every((item) => item.depth === "y-sort" || typeof item.depth === "number")).toBe(true);
    expect(sorted.filter((item) => item.depth === "y-sort").length).toBeGreaterThan(20);
  });

  it("러그만 바닥 깊이가 되고 명시한 깊이와 다른 가구·랜드마크의 y 정렬은 바뀌지 않는다", () => {
    expect(studioVirtualSetDressingPlacement("rug", "furniture", 8, 100, 100, 200, 90).depth).toBe(STUDIO_FLOOR_DECAL_DEPTH);
    // 같은 프레임 번호라도 랜드마크 아틀라스의 8(나무)은 키가 있는 물체라 y 정렬이다.
    expect(studioVirtualSetDressingPlacement("tree", "landmarks", 8, 100, 100, 160, 200).depth).toBe("y-sort");
    expect(studioVirtualSetDressingPlacement("sofa", "furniture", 15, 100, 100, 118, 88).depth).toBe("y-sort");
    // 호출 측이 숫자 깊이를 명시하면 존중한다.
    expect(studioVirtualSetDressingPlacement("rug-custom", "furniture", 8, 100, 100, 200, 90, -50).depth).toBe(-50);
  });
});

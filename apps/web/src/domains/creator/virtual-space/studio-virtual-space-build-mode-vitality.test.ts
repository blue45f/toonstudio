import { describe, expect, it } from "vitest";

import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import {
  studioBuildFurnitureInteractableKind,
  studioBuildGhostReactionFrame,
  studioBuildPlacedFixture,
  studioBuildPlacedFixtures,
} from "./studio-virtual-space-build-mode-vitality";
import { STUDIO_FURNITURE_CATALOG } from "./studio-virtual-space-furniture-catalog";

function furnitureRequest(refId: string, x = 100, y = 200): StudioBuildPlacementRequest {
  return { entryId: `furniture:${refId}`, category: "furniture", refId, point: { x, y }, rotation: 0 };
}

describe("빌드 모드 가구 생동감 — 종류 매핑", () => {
  it("상태 의미가 분명한 가구만 상태 머신 종류로 잇는다", () => {
    expect(studioBuildFurnitureInteractableKind("floor-lamp")).toBe("light-switch");
    expect(studioBuildFurnitureInteractableKind("neon-sign")).toBe("light-switch");
    expect(studioBuildFurnitureInteractableKind("whiteboard")).toBe("whiteboard");
    expect(studioBuildFurnitureInteractableKind("display-screen")).toBe("youtube");
    expect(studioBuildFurnitureInteractableKind("coffee-machine")).toBe("coffee-machine");
    // 책상·의자는 앉기 경로, 장식성 가구는 상태가 없어 잇지 않는다.
    expect(studioBuildFurnitureInteractableKind("desk")).toBeNull();
    expect(studioBuildFurnitureInteractableKind("chair")).toBeNull();
    expect(studioBuildFurnitureInteractableKind("rug")).toBeNull();
    expect(studioBuildFurnitureInteractableKind("sofa")).toBeNull();
    expect(studioBuildFurnitureInteractableKind("plant")).toBeNull();
  });

  it("카탈로그 전수에서 매핑되는 가구는 조명·미디어·커피뿐이다", () => {
    const mapped = new Set(
      STUDIO_FURNITURE_CATALOG
        .map((spec) => studioBuildFurnitureInteractableKind(spec.kind))
        .filter((kind) => kind !== null),
    );
    expect(mapped).toEqual(new Set(["light-switch", "whiteboard", "youtube", "coffee-machine"]));
  });
});

describe("빌드 모드 가구 생동감 — 고스트 미리보기 반응", () => {
  const NOW = 1_700_000_000_000;

  it("조명 가구의 고스트는 켜진 상태의 빛 세기와 배지를 보여 준다", () => {
    const frame = studioBuildGhostReactionFrame("furniture:floor-lamp", NOW, false);
    expect(frame?.glow).toBe(1);
    expect(frame?.label).toEqual({ ko: "● 켜짐", en: "● On" });
    const neon = studioBuildGhostReactionFrame("furniture:neon-sign-open", NOW, false);
    expect(neon?.glow).toBe(1);
  });

  it("미디어 가구의 고스트는 열린 화면(swing)으로 보여 준다", () => {
    const screen = studioBuildGhostReactionFrame("furniture:display-screen", NOW, false);
    expect(screen?.swing).toBe(1);
    expect(screen?.label).toEqual({ ko: "● 열림", en: "● Open" });
    const board = studioBuildGhostReactionFrame("furniture:whiteboard", NOW, false);
    expect(board?.swing).toBe(1);
  });

  it("커피 머신의 고스트는 준비 완료 배지와 맥동을 보여 준다", () => {
    const frame = studioBuildGhostReactionFrame("furniture:coffee-machine", NOW, false);
    expect(frame?.label).toEqual({ ko: "● 준비 완료", en: "● Ready" });
    expect(frame?.progress).toBe(1);
    expect(frame?.pulse).toBeGreaterThan(0);
  });

  it("상태 가구가 아닌 항목·장식·없는 항목은 미리보기 반응이 없다", () => {
    expect(studioBuildGhostReactionFrame("furniture:rug-round", NOW, false)).toBeNull();
    expect(studioBuildGhostReactionFrame("furniture:sofa-two", NOW, false)).toBeNull();
    expect(studioBuildGhostReactionFrame("decor:lamp", NOW, false)).toBeNull();
    expect(studioBuildGhostReactionFrame("furniture:없는가구", NOW, false)).toBeNull();
    expect(studioBuildGhostReactionFrame("light:floor-lamp", NOW, false)).toBeNull();
  });

  it("모션 줄이기에서도 대표 상태는 최종값으로 보인다", () => {
    const frame = studioBuildGhostReactionFrame("furniture:floor-lamp", NOW, true);
    expect(frame?.glow).toBe(1);
  });
});

describe("빌드 모드 가구 생동감 — 배치 고정물 디스크립터", () => {
  it("조명 배치는 결정적 objectId와 바닥 기준 앵커를 가진 고정물이 된다", () => {
    const fixture = studioBuildPlacedFixture(furnitureRequest("floor-lamp", 100, 200));
    expect(fixture).toMatchObject({
      objectId: "build:floor-lamp@100,200",
      kind: "light-switch",
      point: { x: 100, y: 200 },
      anchor: { x: 100, y: 146, baseY: 200 },
      labelKo: "플로어 램프",
    });
    // 같은 배치를 다시 만들어도 같은 디스크립터로 수렴한다.
    expect(studioBuildPlacedFixture(furnitureRequest("floor-lamp", 100, 200))).toEqual(fixture);
    // 좌표가 다르면 다른 고정물이다.
    expect(studioBuildPlacedFixture(furnitureRequest("floor-lamp", 116, 200))?.objectId).toBe("build:floor-lamp@116,200");
  });

  it("미디어 가구는 media 고정물, 커피 머신·비상태 가구·타 카테고리는 제외된다", () => {
    expect(studioBuildPlacedFixture(furnitureRequest("display-screen"))?.kind).toBe("youtube");
    expect(studioBuildPlacedFixture(furnitureRequest("whiteboard"))?.kind).toBe("whiteboard");
    // 커피 머신은 컵·수령 연출이 매니페스트 머신 전용이라 고정물 층에서 제외한다.
    expect(studioBuildPlacedFixture(furnitureRequest("coffee-machine"))).toBeNull();
    expect(studioBuildPlacedFixture(furnitureRequest("rug-round"))).toBeNull();
    expect(studioBuildPlacedFixture({ entryId: "light:floor-lamp", category: "light", refId: "floor-lamp", point: { x: 0, y: 0 }, rotation: 0 })).toBeNull();
    expect(studioBuildPlacedFixture(furnitureRequest("없는가구"))).toBeNull();
  });

  it("묶음 변환은 해당 없는 요청을 빼고 순서대로 바꾼다", () => {
    const fixtures = studioBuildPlacedFixtures([
      furnitureRequest("floor-lamp", 100, 200),
      furnitureRequest("rug-round", 300, 200),
      furnitureRequest("display-screen", 500, 200),
    ]);
    expect(fixtures.map((fixture) => fixture.objectId)).toEqual(["build:floor-lamp@100,200", "build:display-screen@500,200"]);
  });
});

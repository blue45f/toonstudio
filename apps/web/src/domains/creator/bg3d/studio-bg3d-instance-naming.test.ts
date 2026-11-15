import { describe, expect, it } from "vitest";

import {
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  type BgCustomModelInstance,
} from "../studio-background-3d-model";
import {
  createPrimitive,
  duplicatePrimitive,
  type BgPrimitive,
} from "../studio-background-3d-primitives";
import { syncLinkedCloneAppearance } from "./studio-bg3d-linked-clones";
import {
  allocateStudioBg3dNextInstanceName,
  assignUniqueNamesToDuplicatedBatch,
  nameNewStudioBg3dCustomModel,
  nameNewStudioBg3dPrimitive,
  resolveStudioBg3dStableEntityLabels,
} from "./studio-bg3d-instance-naming";

describe("studio-bg3d-instance-naming", () => {
  it("배치·복제 시 충돌 없는 일련번호 이름을 부여하고 80자 상한을 지킨다", () => {
    const occupied = new Set(["상자 1", "상자 2"]);
    expect(
      allocateStudioBg3dNextInstanceName({
        baseName: "상자",
        occupiedNames: occupied,
        alwaysNumber: true,
      }),
    ).toBe("상자 3");
    expect(
      allocateStudioBg3dNextInstanceName({
        baseName: "창가 의자",
        occupiedNames: new Set(["창가 의자"]),
      }),
    ).toBe("창가 의자 2");
    expect(
      allocateStudioBg3dNextInstanceName({
        baseName: "창가 의자 2",
        occupiedNames: new Set(["창가 의자", "창가 의자 2"]),
      }),
    ).toBe("창가 의자 3");

    const veryLong = "가".repeat(90);
    const allocatedLong = allocateStudioBg3dNextInstanceName({
      baseName: veryLong,
      occupiedNames: new Set([veryLong.slice(0, 80)]),
    });
    expect([...allocatedLong].length).toBeLessThanOrEqual(80);
    expect(allocatedLong.endsWith(" 2")).toBe(true);
  });

  it("앞선 인스턴스를 삭제하거나 순서를 바꿔도 남은 인스턴스 이름이 변하지 않는다", () => {
    const primitives: BgPrimitive[] = [];
    const customModels: BgCustomModelInstance[] = [];

    for (let i = 0; i < 3; i += 1) {
      const box = nameNewStudioBg3dPrimitive(
        { ...createPrimitive("box", primitives.length), id: `box-${i + 1}` },
        { primitives, customModels },
      );
      primitives.push(box);
    }

    expect(primitives.map((p) => p.name)).toEqual(["상자 1", "상자 2", "상자 3"]);

    // 첫 번째 인스턴스 삭제 후에도 box-2, box-3의 이름은 상자 2, 상자 3 그대로 유지된다.
    const afterDelete = primitives.filter((p) => p.id !== "box-1");
    const fallbackCache = new Map<string, string>();
    const labels = resolveStudioBg3dStableEntityLabels({
      primitives: afterDelete,
      customModels,
      modelLibrary: [],
      fallbackCache,
    });
    expect(labels.get("box-2")).toBe("상자 2");
    expect(labels.get("box-3")).toBe("상자 3");
  });

  it("이름이 없던 레거시 배치본도 최초 부여된 라벨을 형제 삭제 후까지 유지한다", () => {
    const legacyModels: BgCustomModelInstance[] = [
      { ...createBgCustomModelInstance("chair-glb", 0), id: "m-1" },
      { ...createBgCustomModelInstance("chair-glb", 1), id: "m-2" },
      { ...createBgCustomModelInstance("chair-glb", 2), id: "m-3" },
    ];
    const fallbackCache = new Map<string, string>();
    const modelLibrary = [{ id: "chair-glb", name: "나무 의자" }];

    const initial = resolveStudioBg3dStableEntityLabels({
      primitives: [],
      customModels: legacyModels,
      modelLibrary,
      fallbackCache,
    });
    expect([initial.get("m-1"), initial.get("m-2"), initial.get("m-3")]).toEqual([
      "나무 의자 1",
      "나무 의자 2",
      "나무 의자 3",
    ]);

    const afterRemovingFirst = resolveStudioBg3dStableEntityLabels({
      primitives: [],
      customModels: legacyModels.slice(1),
      modelLibrary,
      fallbackCache,
    });
    expect([afterRemovingFirst.get("m-2"), afterRemovingFirst.get("m-3")]).toEqual([
      "나무 의자 2",
      "나무 의자 3",
    ]);
  });

  it("다중 선택 일괄 복제 시 모든 복제본에 충돌 없는 고유 이름을 부여한다", () => {
    const p1: BgPrimitive = { ...createPrimitive("box", 0), id: "p-1", name: "창가 의자" };
    const m1 = nameNewStudioBg3dCustomModel(
      { ...createBgCustomModelInstance("desk-glb", 0), id: "m-1" },
      "작업 책상",
      { primitives: [p1], customModels: [] },
    );
    const batch = assignUniqueNamesToDuplicatedBatch({
      primitives: [p1],
      customModels: [m1],
      modelLibrary: [{ id: "desk-glb", name: "작업 책상" }],
      primitivePairs: [{ source: p1, clone: { ...duplicatePrimitive(p1), id: "p-copy" } }],
      modelPairs: [{ source: m1, clone: { ...duplicateBgCustomModelInstance(m1), id: "m-copy" } }],
    });

    expect(batch.primitivePairs[0]?.clone.name).toBe("창가 의자 2");
    expect(batch.modelPairs[0]?.clone.name).toBe("작업 책상 2");
  });

  it("연결 복제본에서 일반 복제를 수행하면 linkedSourceId가 해제되고 복제본만 독립 변경된다", () => {
    const baseOverride = {
      colorMode: "original" as const,
      color: "#ffffff",
      colorStrength: 1,
      opacityMultiplier: 1,
      roughness: 0.7,
      metalness: 0.1,
      emissiveColor: "#000000",
      emissiveIntensity: null,
      wireframe: false,
      doubleSided: false,
    };
    const source: BgPrimitive = {
      ...createPrimitive("box", 0),
      id: "prim-src",
      name: "원본 의자",
      color: "#c9a876",
      materialOverride: baseOverride,
    };
    const linkedClone: BgPrimitive = {
      ...duplicatePrimitive(source),
      id: "prim-linked",
      name: "원본 의자 2",
      linkedSourceId: source.id,
    };
    const normalCloneFromLinked: BgPrimitive = {
      ...duplicatePrimitive(linkedClone),
      id: "prim-independent",
      name: "원본 의자 3",
    };

    expect(normalCloneFromLinked.linkedSourceId).toBeUndefined();
    const editedClone: BgPrimitive = {
      ...normalCloneFromLinked,
      color: "#ff2266",
      materialOverride: { ...baseOverride, roughness: 0.2, metalness: 0.8 },
    };
    const synced = syncLinkedCloneAppearance({
      primitives: [source, linkedClone, editedClone],
      customModels: [],
    });
    expect(synced.primitives.find((p) => p.id === "prim-src")?.color).toBe("#c9a876");
    expect(synced.primitives.find((p) => p.id === "prim-linked")?.color).toBe("#c9a876");
    expect(synced.primitives.find((p) => p.id === "prim-independent")?.color).toBe("#ff2266");
    expect(source.materialOverride?.roughness).toBe(0.7);

    // 커스텀 GLB 배치본 복제도 중첩 재질·포즈가 깊은 복사되고 linkedSourceId가 해제된다.
    const modelSource: BgCustomModelInstance = {
      ...createBgCustomModelInstance("glb-chair", 0),
      id: "model-src",
      name: "의자 1",
      linkedSourceId: "model-master",
      materialOverride: {
        ...baseOverride,
        colorMode: "multiply",
        color: "#88aaee",
        roughness: 0.4,
        metalness: 0,
      },
    };
    const modelCopy = duplicateBgCustomModelInstance(modelSource);
    expect(modelCopy.linkedSourceId).toBeUndefined();
    expect(modelCopy.materialOverride).not.toBe(modelSource.materialOverride);
  });
});

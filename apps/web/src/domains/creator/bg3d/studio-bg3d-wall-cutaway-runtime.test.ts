import { describe, expect, it } from "vitest";

import {
  applyShadowPreservingWallCutaway,
  BG3D_CUTAWAY_NODE_NAMES,
  classifyBg3dCutawayWallRole,
  createBg3dWallCutawayRuntime,
  evaluateCameraWallCutaway,
  indexBg3dCutawayTargets,
  type Bg3dCutawayMaterialLike,
  type Bg3dCutawayObjectLike,
} from "./studio-bg3d-wall-cutaway-runtime";

function createMockMesh(name: string, userData?: Record<string, unknown>): Bg3dCutawayObjectLike & {
  material: Bg3dCutawayMaterialLike;
  layers: { mask: number; set: (channel: number) => void };
} {
  const material: Bg3dCutawayMaterialLike = { colorWrite: true, depthWrite: true, needsUpdate: false };
  const layers = {
    mask: 1,
    set(channel: number) {
      this.mask = 1 << channel;
    },
  };
  return {
    name,
    visible: true,
    castShadow: true,
    receiveShadow: true,
    isMesh: true,
    material,
    layers,
    ...(userData ? { userData } : {}),
  };
}

function createCanonicalRoomScene() {
  const floor = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.floor);
  const northWindowFrame = createMockMesh("WindowFrame_North_01");
  const north = {
    ...createMockMesh(BG3D_CUTAWAY_NODE_NAMES.north),
    children: [northWindowFrame],
  };
  const southTrim = createMockMesh("Baseboard_South_01");
  const south = {
    ...createMockMesh(BG3D_CUTAWAY_NODE_NAMES.south),
    children: [southTrim],
  };
  const west = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.west);
  const east = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.east);
  const ceiling = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.ceiling);
  const furniture = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.furnitureHero);
  const props = createMockMesh(BG3D_CUTAWAY_NODE_NAMES.propsClutter);

  const root: Bg3dCutawayObjectLike = {
    name: "BG_Root_kr_modern_apartment_living",
    visible: true,
    children: [floor, north, south, west, east, ceiling, furniture, props],
  };

  return { root, floor, north, northWindowFrame, south, southTrim, west, east, ceiling, furniture, props };
}

describe("studio-bg3d-wall-cutaway-runtime", () => {
  it("classifies canonical 8-node names, userData metadata, and Korean wall names", () => {
    expect(classifyBg3dCutawayWallRole({ name: "BG_Wall_North" })).toBe("north");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Wall_South" })).toBe("south");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Wall_West" })).toBe("west");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Wall_East" })).toBe("east");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Ceiling" })).toBe("ceiling");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Ceiling_Fixtures" })).toBe("ceiling");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Floor" })).toBe("floor");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Cutaway_Front" })).toBe("south");
    expect(classifyBg3dCutawayWallRole({ name: "CustomMesh", userData: { toonstudio_wall_id: "east" } })).toBe("east");
    expect(classifyBg3dCutawayWallRole({ name: "앞벽 벽체" })).toBe("south");
    expect(classifyBg3dCutawayWallRole({ name: "BG_Furniture_Hero" })).toBeNull();
  });

  it("propagates wall ownership from parent wall nodes to child trim/window meshes", () => {
    const scene = createCanonicalRoomScene();
    const indexed = indexBg3dCutawayTargets(scene.root);
    const rolesByName = new Map(indexed.map((entry) => [entry.object.name, entry.role]));

    expect(rolesByName.get("BG_Wall_North")).toBe("north");
    expect(rolesByName.get("WindowFrame_North_01")).toBe("north");
    expect(rolesByName.get("Baseboard_South_01")).toBe("south");
    expect(rolesByName.has("BG_Floor")).toBe(false);
    expect(rolesByName.has("BG_Furniture_Hero")).toBe(false);
  });

  it("hides camera-blocking south wall & ceiling from camera while preserving exterior shadow casting", () => {
    const scene = createCanonicalRoomScene();
    const runtime = createBg3dWallCutawayRuntime(scene.root);

    const room = { center: [0, 1.4, 0] as const, size: [8, 2.8, 6] as const };
    const camera = { position: [0, 4.2, 6.5] as const, target: [0, 1.2, 0] as const };

    const result = runtime.update(camera, room, {
      enabled: true,
      preserveExteriorShadows: true,
      autoHideCeiling: true,
    });

    expect(result.evaluation.hiddenWalls).toContain("south");
    expect(result.evaluation.hiddenWalls).toContain("ceiling");
    expect(result.evaluation.hiddenWalls).not.toContain("north");
    expect(result.shadowCasterPreservedMeshCount).toBeGreaterThanOrEqual(3);

    // 남벽과 그 하위 몰딩: 카메라 출력(colorWrite/depthWrite)은 끄되 shadow cast는 유지
    expect(scene.south.visible).toBe(true);
    expect(scene.south.castShadow).toBe(true);
    expect(scene.south.receiveShadow).toBe(false);
    expect(scene.south.material.colorWrite).toBe(false);
    expect(scene.south.material.depthWrite).toBe(false);
    expect(scene.southTrim.material.colorWrite).toBe(false);
    expect(scene.southTrim.castShadow).toBe(true);

    // 북벽·가구·바닥은 정상 표시
    expect(scene.north.material.colorWrite).toBe(true);
    expect(scene.northWindowFrame.material.colorWrite).toBe(true);
    expect(scene.floor.material.colorWrite).toBe(true);
    expect(scene.furniture.material.colorWrite).toBe(true);

    // restoreAll 호출 시 모든 메시·재질 원복
    runtime.restoreAll();
    expect(scene.south.material.colorWrite).toBe(true);
    expect(scene.south.material.depthWrite).toBe(true);
    expect(scene.south.receiveShadow).toBe(true);
    expect(scene.ceiling.material.colorWrite).toBe(true);
  });

  it("supports shadow-only-layer mode for zero-overdraw camera layer separation", () => {
    const scene = createCanonicalRoomScene();
    const room = { center: [0, 1.5, 0] as const, size: [6, 3, 6] as const };
    const camera = { position: [5.5, 1.6, 0] as const, target: [0, 1.5, 0] as const };

    const res = applyShadowPreservingWallCutaway(scene.root, camera, room, {
      enabled: true,
      preserveExteriorShadows: true,
      renderMode: "shadow-only-layer",
      shadowOnlyLayer: 4,
    });

    expect(res.evaluation.hiddenWalls).toContain("east");
    expect(scene.east.layers.mask).toBe(1 << 4);
    expect(scene.east.castShadow).toBe(true);
    expect(scene.west.layers.mask).toBe(1);
  });

  it("respects manual lockedVisibleWalls and forcedHiddenWalls overrides", () => {
    const evalResult = evaluateCameraWallCutaway({
      camera: { position: [0, 1.5, 6] as const, target: [0, 1.5, 0] as const },
      room: { center: [0, 1.5, 0] as const, size: [6, 3, 6] as const },
      config: {
        enabled: true,
        preserveExteriorShadows: true,
        lockedVisibleWalls: ["south"],
        forcedHiddenWalls: ["west"],
      },
    });

    expect(evalResult.hiddenWalls).not.toContain("south");
    expect(evalResult.hiddenWalls).toContain("west");
  });
});

import { describe, expect, it } from "vitest";

import {
  DYNAMIC_COMPONENT_PRESETS,
  WEBTOON_ARCHETYPE_SCENE_PACKS,
  WEBTOON_SKP_MARKETPLACE_PLATFORMS,
  applyArchetypeCutDirectionPreset,
  batchSetDynamicComponentsValue,
  createDynamicComponent,
  evaluateDynamicComponentTransform,
  getWebtoonArchetypeScenePack,
  inferDynamicComponentFromSkpNode,
  instantiateArchetypeDynamicComponents,
  parseSketchUpOnClickFormula,
  setDynamicComponentValue,
  stepDynamicComponentOnClick,
} from "./studio-3d-dynamic-components";

describe("Studio 3D Dynamic Interactive Components & Webtoon SKP Marketplace Archetype Engine", () => {
  it("provides 14 preconfigured dynamic component presets covering modern, fantasy, and Joseon historical sets", () => {
    expect(DYNAMIC_COMPONENT_PRESETS.length).toBe(14);
    const door = DYNAMIC_COMPONENT_PRESETS.find((p) => p.kind === "door-single-swing");
    expect(door).toBeDefined();
    expect(door?.interactionType).toBe("revolve");
    expect(door?.defaultMaxRange).toBe(90);

    const liftUpWindow = DYNAMIC_COMPONENT_PRESETS.find((p) => p.kind === "window-lift-up");
    expect(liftUpWindow).toBeDefined();
    expect(liftUpWindow?.interactionType).toBe("revolve");
    expect(liftUpWindow?.defaultMaxRange).toBe(85);

    const slidingDoor = DYNAMIC_COMPONENT_PRESETS.find((p) => p.kind === "door-sliding");
    expect(slidingDoor?.interactionType).toBe("slide");
    expect(slidingDoor?.defaultMaxRange).toBe(0.9);
  });

  it("evaluates door rotation at closed, 50% open, and fully open states", () => {
    const compClosed = createDynamicComponent("door-1", "door-single-swing", false);
    const closedRes = evaluateDynamicComponentTransform(compClosed);
    expect(closedRes.rotation[1]).toBe(0);
    expect(closedRes.stateLabel).toBe("닫힘 (Closed)");

    const compHalf = setDynamicComponentValue(compClosed, 0.5);
    const halfRes = evaluateDynamicComponentTransform(compHalf);
    expect(halfRes.rotation[1]).toBe(45);
    expect(halfRes.stateLabel).toBe("50% 개방");

    const compOpen = setDynamicComponentValue(compClosed, 1.0);
    const openRes = evaluateDynamicComponentTransform(compOpen);
    expect(openRes.rotation[1]).toBe(90);
    expect(openRes.isOpen).toBe(true);
    expect(openRes.stateLabel).toBe("완전 개방 (Open)");
  });

  it("evaluates sliding window and sliding door translation along local X axis", () => {
    const compClosed = createDynamicComponent("win-1", "window-sliding", false);
    const compOpen = setDynamicComponentValue(compClosed, 1.0);
    const winRes = evaluateDynamicComponentTransform(compOpen);

    expect(winRes.position[0]).toBe(0.8);
    expect(winRes.rotation[1]).toBe(0);
    expect(winRes.isOpen).toBe(true);

    const slidingDoor = setDynamicComponentValue(
      createDynamicComponent("door-slide-1", "door-sliding", false),
      1.0,
    );
    const slideDoorRes = evaluateDynamicComponentTransform(slidingDoor);
    expect(slideDoorRes.position[0]).toBe(0.9);
    expect(slideDoorRes.stateLabel).toBe("완전 개방 (Open)");
  });

  it("evaluates Joseon lift-up window (들창) negative X rotation and lantern emission", () => {
    const liftWin = setDynamicComponentValue(
      createDynamicComponent("tavern-win", "window-lift-up", false),
      1.0,
    );
    const liftRes = evaluateDynamicComponentTransform(liftWin);
    expect(liftRes.rotation[0]).toBe(-85);
    expect(liftRes.isOpen).toBe(true);

    const lantern = setDynamicComponentValue(
      createDynamicComponent("tavern-lantern", "hearth-lantern", false),
      1.0,
    );
    const lanternRes = evaluateDynamicComponentTransform(lantern);
    expect(lanternRes.emissiveIntensity).toBe(1.0);
    expect(lanternRes.stateLabel).toBe("ON (점등)");
  });

  it("parses SketchUp Dynamic Component OnClick formulas safely without eval", () => {
    const actions = parseSketchUpOnClickFormula(
      'ANIMATESLOW("roty", 0, 45, 90); SET("light", 0, 1); ANIMATECUSTOM("z", 1.2, 0.2, 0.2, 0, 40)',
    );
    expect(actions.length).toBe(3);
    expect(actions[0]?.command).toBe("ANIMATESLOW");
    expect(actions[0]?.targetAttribute).toBe("roty");
    expect(actions[0]?.stateValues).toEqual([0, 45, 90]);
    expect(actions[0]?.durationSeconds).toBe(1.0);
    expect(actions[0]?.inferredInteractionType).toBe("revolve");
    expect(actions[0]?.inferredAxis).toBe("y");

    expect(actions[1]?.command).toBe("SET");
    expect(actions[1]?.durationSeconds).toBe(0);
    expect(actions[1]?.inferredInteractionType).toBe("toggle");

    expect(actions[2]?.command).toBe("ANIMATECUSTOM");
    expect(actions[2]?.durationSeconds).toBe(1.2);
    expect(actions[2]?.stateValues).toEqual([0, 40]);
    expect(actions[2]?.inferredInteractionType).toBe("slide");
    expect(actions[2]?.inferredAxis).toBe("z");
  });

  it("cycles multi-step SketchUp OnClick states (e.g. 0 -> 50% -> 100% -> 0)", () => {
    const packStates = instantiateArchetypeDynamicComponents("fantasy-imperial-palace");
    const grandDoor = packStates.find((s) => s.id === "palace-grand-double-door")!;
    expect(grandDoor.value).toBe(0);

    const step1 = stepDynamicComponentOnClick(grandDoor);
    expect(step1.value).toBe(0.5);
    expect(step1.isOpen).toBe(true);

    const step2 = stepDynamicComponentOnClick(step1);
    expect(step2.value).toBe(1.0);
    expect(step2.isOpen).toBe(true);

    const step3 = stepDynamicComponentOnClick(step2);
    expect(step3.value).toBe(0);
    expect(step3.isOpen).toBe(false);
  });

  it("infers dynamic components from OpenSKP node properties and Korean/English names", () => {
    const skpDrawer = inferDynamicComponentFromSkpNode({
      id: "node-drawer-1",
      name: "책상_서랍_01",
      layer: "자취방_가구",
      properties: {
        onclick: 'ANIMATEFAST("z", 0, 40)',
      },
    });
    expect(skpDrawer).not.toBeNull();
    expect(skpDrawer?.kind).toBe("furniture-drawer");
    expect(skpDrawer?.maxRange).toBe(0.4); // 40cm normalized to 0.4m
    expect(skpDrawer?.durationSeconds).toBe(0.25);

    const skpTavernWin = inferDynamicComponentFromSkpNode({
      id: "node-tavern-win",
      name: "주막_대청_들어열개_들창",
      layer: "저막_창호",
    });
    expect(skpTavernWin?.kind).toBe("window-lift-up");
    expect(skpTavernWin?.maxRange).toBe(85);
  });

  it("models all 4 canonical webtoon marketplace archetypes (판타지 황실, 현대 고등학교 교실, 주인공 자취방, 조선시대 저막) and applies cut direction presets", () => {
    expect(WEBTOON_SKP_MARKETPLACE_PLATFORMS.map((p) => p.id)).toEqual([
      "tumblbug",
      "acon3d",
      "pixel",
      "internal-bundle",
    ]);
    expect(WEBTOON_ARCHETYPE_SCENE_PACKS.map((p) => p.title)).toEqual([
      "판타지 황실",
      "현대 고등학교 교실",
      "주인공 자취방",
      "조선시대 저막",
    ]);

    const tavernPack = getWebtoonArchetypeScenePack("joseon-dynasty-tavern");
    expect(tavernPack.title).toBe("조선시대 저막");
    const initialTavernStates = instantiateArchetypeDynamicComponents("joseon-dynasty-tavern");

    const nightStates = applyArchetypeCutDirectionPreset(
      initialTavernStates,
      "joseon-dynasty-tavern",
      "night-secret-meeting",
    );
    const screenState = nightStates.find((s) => s.id === "tavern-folding-screen")!;
    const lanternState = nightStates.find((s) => s.id === "tavern-oil-lantern")!;
    const gateState = nightStates.find((s) => s.id === "tavern-brushwood-gate")!;
    expect(screenState.value).toBe(1.0);
    expect(lanternState.value).toBe(1.0);
    expect(gateState.value).toBe(0.0);

    const allOpen = batchSetDynamicComponentsValue(nightStates, 1.0);
    expect(allOpen.every((s) => s.value === 1.0 && s.isOpen)).toBe(true);
  });
});

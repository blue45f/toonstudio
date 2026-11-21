// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MToonMaterialLike, SceneTraverseObjectLike } from "../../studio-3d-pro/kwebtoon-npr-ink-contract";
import { StudioScene3dCutPanel } from "../../scene3d/StudioScene3dCutPanel";
import { StudioScene3dCutSession, type StudioScene3dCutHost } from "../../scene3d/studio-scene3d-cut-session";
import { createStudioScene3dDocument } from "../../scene3d/studio-scene3d-document";
import { parseStudioScene3dCutSource } from "../../scene3d/studio-scene3d-shot-versions";
import { StudioWebAuthoringProjectV3Repository } from "../../studio-web-runtime/studio-web-authoring-project-v3-repository";
import { Studio3dBgCharacterCompositorPanel } from "../Studio3dBgCharacterCompositorPanel";
import {
  COMPOSITE_BAKE_PASS_ORDER,
  STAGE_BACKGROUND_SLOTS,
  STAGE_TIME_OF_DAY_LIST,
  WEBTOON_COMPOSITE_FRAMING_PRESETS,
  addStageCharacter,
  applyCompositeFramingPreset,
  applySmartAutoHarmonize,
  applyStageInkContractToVrmNodes,
  buildCompositeCutLayerPlan,
  computeCharacterClearanceRadiusM,
  createInitialStageCompositeState,
  createStageCharacterSlot,
  generateStageCrowdExtras,
  getStageBackgroundSlot,
  harmonizeStageLightingAndInk,
  removeStageCharacter,
  resolveCharacterSlotCollisions,
  setStageManualGroundOffset,
  snapCharacterToStageFloor,
  switchStageBackground,
  updateStageCharacterSlot,
  type CompositeCutLayerPlan,
  type StageAspectRatioId,
} from "../stage-3d-bg-character-compositor";

const RAW_HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/u;
const RAW_RGB_PATTERN = /\brgba?\(/u;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 13D: 통합 3D 배경 슬롯(10종) · 바닥/계단 접지(오차 0.000m) · 3인 충돌 이격", () => {
  it("Blender 5.3 히어로 4종과 기존 BG3D 세트 6종을 합쳐 총 10종 배경 슬롯을 제공한다", () => {
    expect(STAGE_BACKGROUND_SLOTS).toHaveLength(10);
    const heroIds = STAGE_BACKGROUND_SLOTS.filter((s) => s.sourceKind === "blender-hero-glb").map((s) => s.id);
    const richIds = STAGE_BACKGROUND_SLOTS.filter((s) => s.sourceKind === "bg3d-rich-preset").map((s) => s.id);
    expect(heroIds).toEqual([
      "rofan-imperial-arch-chandelier",
      "seoul-rooftop-cafe-terrace",
      "murim-jade-sword-altar",
      "kwebtoon-bust-mannequin-atelier",
    ]);
    expect(richIds).toHaveLength(6);
    for (const slot of STAGE_BACKGROUND_SLOTS) {
      expect(slot.elevationZones.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("평지 좌표에서는 기본 바닥 Y=0.000m 에 오차 0.000m 로 자동 접지 잠금한다", () => {
    const bg = getStageBackgroundSlot("rofan-imperial-arch-chandelier");
    const snap = snapCharacterToStageFloor(bg, 0, 2.2);
    expect(snap.surfaceY).toBe(0);
    expect(snap.resolvedRootY).toBe(0);
    expect(snap.footWorldY).toBe(0);
    expect(snap.groundingErrorMeters).toBe(0);
    expect(snap.surfaceKind).toBe("floor");
  });

  it("로판 계단과 루프탑 우드 데크 단차 위 좌표에 정확한 높이로 오차 0.000m 접지한다", () => {
    const rofan = getStageBackgroundSlot("rofan-imperial-arch-chandelier");
    const step1 = snapCharacterToStageFloor(rofan, 0, -0.9);
    const step2 = snapCharacterToStageFloor(rofan, 0.3, -1.75);
    const landing = snapCharacterToStageFloor(rofan, -0.5, -2.85);
    expect(step1.surfaceY).toBe(0.18);
    expect(step2.surfaceY).toBe(0.36);
    expect(landing.surfaceY).toBe(0.54);
    expect([step1, step2, landing].every((s) => s.groundingErrorMeters === 0)).toBe(true);

    const rooftop = getStageBackgroundSlot("seoul-rooftop-cafe-terrace");
    const deck = snapCharacterToStageFloor(rooftop, 0.4, -0.6);
    const lounge = snapCharacterToStageFloor(rooftop, 0, -2.35);
    expect(deck.surfaceY).toBe(0.16);
    expect(lounge.surfaceY).toBe(0.32);
    expect(deck.groundingErrorMeters).toBe(0);
    expect(lounge.groundingErrorMeters).toBe(0);
  });

  it("무협 청옥보검 3단 팔각 원형 제단의 중첩 구역에서 가장 높은 단차를 자동 선택한다", () => {
    const altar = getStageBackgroundSlot("murim-jade-sword-altar");
    const tier1 = snapCharacterToStageFloor(altar, 2.0, -1.1);
    const tier2 = snapCharacterToStageFloor(altar, 1.2, -1.1);
    const tier3 = snapCharacterToStageFloor(altar, 0.1, -1.1);
    expect(tier1.surfaceY).toBe(0.22);
    expect(tier2.surfaceY).toBe(0.44);
    expect(tier3.surfaceY).toBe(0.66);
    expect(tier3.surfaceKind).toBe("altar");
    expect(tier3.groundingErrorMeters).toBe(0);
  });

  it("기존 BG3D 세트(네온 골목 보도블록·황궁 대연회장 단상)도 단차 높이에 정확히 스냅한다", () => {
    const alley = getStageBackgroundSlot("seoul-neon-alley");
    const curb = snapCharacterToStageFloor(alley, -2.5, 0.2);
    expect(curb.surfaceY).toBe(0.15);
    expect(curb.surfaceKind).toBe("curb");
    expect(curb.groundingErrorMeters).toBe(0);

    const banquet = getStageBackgroundSlot("rofan-imperial-banquet");
    const dais = snapCharacterToStageFloor(banquet, 0, -4.0);
    expect(dais.surfaceY).toBe(0.6);
    expect(dais.groundingErrorMeters).toBe(0);
  });

  it("VRM 모델의 발바닥 로컬 오프셋(+0.09m / -0.04m)을 상쇄해 실제 발끝을 계단 표면에 0.000m 밀착한다", () => {
    const rofan = getStageBackgroundSlot("rofan-imperial-arch-chandelier");
    const floatingVrm = snapCharacterToStageFloor(rofan, 0, -1.75, { footSoleLocalY: 0.09 });
    expect(floatingVrm.surfaceY).toBe(0.36);
    expect(floatingVrm.resolvedRootY).toBeCloseTo(0.27, 4);
    expect(floatingVrm.footWorldY).toBeCloseTo(0.36, 4);
    expect(floatingVrm.groundingErrorMeters).toBe(0);

    const sunkVrm = snapCharacterToStageFloor(rofan, 0, -1.75, { footSoleLocalY: -0.04 });
    expect(sunkVrm.resolvedRootY).toBeCloseTo(0.4, 4);
    expect(sunkVrm.footWorldY).toBeCloseTo(0.36, 4);
    expect(sunkVrm.groundingErrorMeters).toBe(0);
  });

  it("수동 접지 오프셋 조절은 안전 범위로 클램프되며 모든 캐릭터에 일괄 반영된다", () => {
    const initial = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    const lifted = setStageManualGroundOffset(initial, 0.14);
    expect(lifted.manualGroundOffsetM).toBe(0.14);
    expect(lifted.characters[0].positionM[1]).toBeGreaterThan(initial.characters[0].positionM[1]);
    expect(lifted.characters.every((c) => c.groundingErrorMeters === 0)).toBe(true);

    const clamped = setStageManualGroundOffset(initial, 9.9);
    expect(clamped.manualGroundOffsetM).toBe(0.5);
  });

  it("같은 지점에 겹친 3인 캐릭터의 어깨 관통을 자동 이격하고 잔여 충돌 0건으로 해소한다", () => {
    const bg = getStageBackgroundSlot("academy-sunset-rooftop");
    const crowded = [
      createStageCharacterSlot("c1", "kwebtoon-academy-heroine", bg, { positionXZ: [0, 0] }),
      createStageCharacterSlot("c2", "kwebtoon-academy-hero", bg, { positionXZ: [0.05, 0.02] }),
      createStageCharacterSlot("c3", "kwebtoon-srank-healer", bg, { positionXZ: [-0.04, 0.01] }),
    ];
    const resolved = resolveCharacterSlotCollisions(crowded, bg);
    expect(resolved.hadCollision).toBe(true);
    expect(resolved.resolvedPairCount).toBeGreaterThanOrEqual(2);
    expect(resolved.adjustments.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < resolved.characters.length; i += 1) {
      for (let j = i + 1; j < resolved.characters.length; j += 1) {
        const a = resolved.characters[i];
        const b = resolved.characters[j];
        const dist = Math.hypot(a.positionM[0] - b.positionM[0], a.positionM[2] - b.positionM[2]);
        const required = computeCharacterClearanceRadiusM(a) + computeCharacterClearanceRadiusM(b);
        expect(dist).toBeGreaterThanOrEqual(required - 0.005);
      }
    }
  });

  it("장검/무기를 든 아키타입은 비무장 캐릭터보다 더 넓은 충돌 이격 반경을 확보한다", () => {
    const bg = getStageBackgroundSlot("murim-jade-sword-altar");
    const armed = createStageCharacterSlot("a", "kwebtoon-murim-swordsman", bg, { positionXZ: [0, 0] });
    const unarmed = createStageCharacterSlot("b", "kwebtoon-modern-heroine", bg, { positionXZ: [0, 0] });
    expect(computeCharacterClearanceRadiusM(armed)).toBeGreaterThan(computeCharacterClearanceRadiusM(unarmed) + 0.25);

    const resolved = resolveCharacterSlotCollisions([armed, unarmed], bg);
    const dist = Math.hypot(
      resolved.characters[0].positionM[0] - resolved.characters[1].positionM[0],
      resolved.characters[0].positionM[2] - resolved.characters[1].positionM[2],
    );
    expect(dist).toBeGreaterThanOrEqual(computeCharacterClearanceRadiusM(armed) + computeCharacterClearanceRadiusM(unarmed) - 0.005);
  });

  it("충돌 이격 후에도 캐릭터는 배경 반경 안에 머물며 계단/바닥 접지 오차 0.000m 를 유지한다", () => {
    const bg = getStageBackgroundSlot("murim-jade-sword-altar");
    const chars = [
      createStageCharacterSlot("c1", "kwebtoon-murim-swordsman", bg, { positionXZ: [0, -1.1] }),
      createStageCharacterSlot("c2", "kwebtoon-srank-hunter", bg, { positionXZ: [0.1, -1.1] }),
      createStageCharacterSlot("c3", "kwebtoon-northern-duke", bg, { positionXZ: [-0.1, -1.1] }),
    ];
    const resolved = resolveCharacterSlotCollisions(chars, bg);
    const maxHalfW = bg.footprintMeters[0] * 0.44 + 0.01;
    const maxHalfD = bg.footprintMeters[2] * 0.44 + 0.01;
    for (const c of resolved.characters) {
      expect(Math.abs(c.positionM[0])).toBeLessThanOrEqual(maxHalfW);
      expect(Math.abs(c.positionM[2])).toBeLessThanOrEqual(maxHalfD);
      expect(c.groundingErrorMeters).toBe(0);
    }
  });

  it("이미 충분히 떨어진 캐릭터들은 충돌 이격 시 이동하지 않는다", () => {
    const bg = getStageBackgroundSlot("modern-webtoon-office");
    const spaced = [
      createStageCharacterSlot("c1", "kwebtoon-office-ceo", bg, { positionXZ: [-1.5, 0.5] }),
      createStageCharacterSlot("c2", "kwebtoon-modern-heroine", bg, { positionXZ: [1.5, -0.5] }),
    ];
    const resolved = resolveCharacterSlotCollisions(spaced, bg);
    expect(resolved.hadCollision).toBe(false);
    expect(resolved.resolvedPairCount).toBe(0);
    expect(resolved.adjustments).toHaveLength(0);
  });
});

describe("Wave 13D: 단일 등방성 잉크 · 색온도 연동 조명/접지 그림자 · 구도/군중/5레이어 베이크", () => {
  it("16:9 · 9:16 · 4:5 모든 화면비에서 배경과 캐릭터 외곽선이 동일 디바이스 픽셀(등방성 1.000x)로 일치한다", () => {
    const state = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    const bg = getStageBackgroundSlot(state.backgroundId);
    const ratios: readonly StageAspectRatioId[] = ["16:9", "9:16", "4:5"];

    for (const aspectRatio of ratios) {
      const harmony = harmonizeStageLightingAndInk({
        background: bg,
        characters: state.characters,
        timeOfDay: "sunset",
        celPresetId: "rofan-pastel",
        inkPx: 1.6,
        aspectRatio,
      });
      expect(harmony.backgroundMeasuredInkPx).toBeCloseTo(1.6, 3);
      expect(harmony.characterMeasuredInkPx).toBeCloseTo(1.6, 3);
      expect(harmony.isotropicRatio).toBeCloseTo(1.0, 3);
    }
  });

  it("VRM WebGL MToonMaterial 과 WebGPU MToonNodeMaterial 에 단일 잉크 계약을 일괄 적용한다", () => {
    const state = createInitialStageCompositeState("seoul-rooftop-cafe-terrace");
    const harmony = harmonizeStageLightingAndInk({
      background: getStageBackgroundSlot(state.backgroundId),
      characters: state.characters,
      timeOfDay: "sunset",
      celPresetId: "daily-warm-sun",
      inkPx: 1.8,
      aspectRatio: "16:9",
    });
    const webglMat: MToonMaterialLike = { isMToonMaterial: true, isOutline: true, outlineWidthMode: "worldCoordinates" };
    const webgpuMat: MToonMaterialLike = { isMToonNodeMaterial: true, isOutline: true, outlineWidthMode: "worldCoordinates" };
    const scene: SceneTraverseObjectLike = { children: [{ material: webglMat }, { material: webgpuMat }] };

    const report = applyStageInkContractToVrmNodes(scene, harmony);
    expect(report.convertedCount).toBe(2);
    expect(report.webglMaterialCount).toBe(1);
    expect(report.webgpuNodeMaterialCount).toBe(1);
    expect(webglMat.outlineWidthMode).toBe("screenCoordinates");
    expect(webgpuMat.needsUpdate).toBe(true);
    expect(webglMat.outlineWidthFactor).toBeCloseTo(harmony.unifiedOutlineWidthFactor, 8);
  });

  it("낮/노을/야경/새벽 4시간대 모두 원시 HEX/RGB 없는 OKLCH 색상으로 림라이트·바운스·그림자를 동기화한다", () => {
    const state = createInitialStageCompositeState("seoul-rooftop-cafe-terrace");
    const bg = getStageBackgroundSlot(state.backgroundId);
    for (const profile of STAGE_TIME_OF_DAY_LIST) {
      const harmony = harmonizeStageLightingAndInk({
        background: bg,
        characters: state.characters,
        timeOfDay: profile.id,
        celPresetId: "daily-warm-sun",
        inkPx: 1.6,
        aspectRatio: "4:5",
      });
      for (const css of [
        harmony.keyLightOklchCss,
        harmony.rimLightOklchCss,
        harmony.floorBounceOklchCss,
        harmony.atmosphereOklchCss,
        ...harmony.contactShadows.map((s) => s.shadowOklchCss),
      ]) {
        expect(css).toContain("oklch(");
        expect(css).not.toMatch(RAW_HEX_PATTERN);
        expect(css).not.toMatch(RAW_RGB_PATTERN);
      }
    }
  });

  it("노을(낮은 태양고도)은 정오(높은 태양고도)보다 더 긴 투영 그림자와 강한 림라이트를 만든다", () => {
    const state = createInitialStageCompositeState("seoul-rooftop-cafe-terrace");
    const bg = getStageBackgroundSlot(state.backgroundId);
    const day = harmonizeStageLightingAndInk({ background: bg, characters: state.characters, timeOfDay: "day", celPresetId: "daily-warm-sun", inkPx: 1.6, aspectRatio: "16:9" });
    const sunset = harmonizeStageLightingAndInk({ background: bg, characters: state.characters, timeOfDay: "sunset", celPresetId: "daily-warm-sun", inkPx: 1.6, aspectRatio: "16:9" });

    expect(sunset.contactShadows[0].projectionLengthM).toBeGreaterThan(day.contactShadows[0].projectionLengthM);
    expect(sunset.rimIntensity).toBeGreaterThan(day.rimIntensity);
    expect(sunset.kelvin).toBeLessThan(day.kelvin);
  });

  it("광택 대리석 바닥은 거친 옥상 바닥보다 더 높은 바닥 바운스 강도를 전달한다", () => {
    const marbleBg = getStageBackgroundSlot("rofan-imperial-arch-chandelier");
    const concreteBg = getStageBackgroundSlot("academy-sunset-rooftop");
    const c1 = createInitialStageCompositeState(marbleBg.id);
    const c2 = createInitialStageCompositeState(concreteBg.id);
    const marbleH = harmonizeStageLightingAndInk({ background: marbleBg, characters: c1.characters, timeOfDay: "day", celPresetId: "rofan-pastel", inkPx: 1.5, aspectRatio: "9:16" });
    const concreteH = harmonizeStageLightingAndInk({ background: concreteBg, characters: c2.characters, timeOfDay: "day", celPresetId: "daily-warm-sun", inkPx: 1.5, aspectRatio: "9:16" });
    expect(marbleH.floorBounceStrength).toBeGreaterThan(concreteH.floorBounceStrength);
  });

  it("접지 그림자 타원의 앵커가 캐릭터의 실제 스냅된 계단 높이 Y와 정확히 일치한다", () => {
    const state = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    const bg = getStageBackgroundSlot(state.backgroundId);
    const harmony = harmonizeStageLightingAndInk({
      background: bg, characters: state.characters, timeOfDay: "dawn",
      celPresetId: "rofan-pastel", inkPx: 1.5, aspectRatio: "9:16",
    });
    expect(harmony.contactShadows).toHaveLength(state.characters.length);
    for (let i = 0; i < state.characters.length; i += 1) {
      const char = state.characters[i];
      const shadow = harmony.contactShadows[i];
      expect(shadow.characterId).toBe(char.id);
      expect(shadow.anchorM[1]).toBeCloseTo(char.positionM[1] + char.footSoleLocalY, 4);
    }
  });

  it("8종 한국 웹툰 대표 구도 프리셋 모두 충돌 0건 · 접지 오차 0.000m 로 원클릭 적용된다", () => {
    expect(WEBTOON_COMPOSITE_FRAMING_PRESETS).toHaveLength(8);
    const base = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    for (const preset of WEBTOON_COMPOSITE_FRAMING_PRESETS) {
      const next = applyCompositeFramingPreset(base, preset.id);
      expect(next.framingId).toBe(preset.id);
      expect(next.characters).toHaveLength(preset.recommendedActorCount);
      expect(next.characters.every((c) => c.groundingErrorMeters === 0)).toBe(true);
    }
  });

  it("AI 추천 구도·조명 자동 맞추기는 1인·2인·3인에 맞춰 최적 구도·조명·접지 잠금을 일괄 동기화한다", () => {
    let one = removeStageCharacter(createInitialStageCompositeState("seoul-rooftop-cafe-terrace"), "stage-char-2");
    one = setStageManualGroundOffset(one, 0.2);
    const autoOne = applySmartAutoHarmonize(one);
    expect(autoOne.framingId).toBe("solo-hero-establishing");
    expect(autoOne.manualGroundOffsetM).toBe(0);
    expect(autoOne.timeOfDay).toBe("sunset");

    const three = addStageCharacter(createInitialStageCompositeState("rofan-imperial-banquet"), "kwebtoon-srank-healer");
    const autoThree = applySmartAutoHarmonize(three);
    expect(autoThree.framingId).toBe("banquet-high-overview");
    expect(autoThree.characters).toHaveLength(3);
    expect(autoThree.characters.every((c) => c.groundingErrorMeters === 0)).toBe(true);
  });

  it("캐릭터 추가/삭제는 최소 1인 ~ 최대 3인 경계를 지키고, 배경 전환/VRM 전환 시 재접지한다", () => {
    let state = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    expect(state.characters).toHaveLength(2);
    state = addStageCharacter(state, "kwebtoon-sd-mascot");
    expect(state.characters).toHaveLength(3);
    state = addStageCharacter(state, "kwebtoon-office-ceo");
    expect(state.characters).toHaveLength(3);

    state = updateStageCharacterSlot(state, "stage-char-1", { sourceKind: "vrm-avatar" });
    expect(state.characters[0].sourceKind).toBe("vrm-avatar");
    expect(state.characters[0].vrmUrl).toContain(".vrm");

    state = switchStageBackground(state, "murim-jade-sword-altar");
    expect(state.backgroundId).toBe("murim-jade-sword-altar");
    expect(state.characters.every((c) => c.groundingErrorMeters === 0)).toBe(true);

    state = removeStageCharacter(state, "stage-char-3");
    state = removeStageCharacter(state, "stage-char-2");
    state = removeStageCharacter(state, "stage-char-1");
    expect(state.characters).toHaveLength(1);
  });

  it("자동 3D 군중 엑스트라는 밀도별 정확한 인원(0/4/8/14)을 생성하고 주연과 겹치지 않으며 바닥에 0.000m 접지한다", () => {
    const state = createInitialStageCompositeState("rofan-imperial-banquet");
    const bg = getStageBackgroundSlot(state.backgroundId);
    const expected: readonly [Parameters<typeof generateStageCrowdExtras>[0]["density"], number][] = [
      ["none", 0], ["sparse", 4], ["medium", 8], ["bustling", 14],
    ];
    for (const [density, count] of expected) {
      const extras = generateStageCrowdExtras({ background: bg, characters: state.characters, framingId: state.framingId, density });
      expect(extras).toHaveLength(count);
      expect(extras.every((e) => e.groundingErrorMeters === 0)).toBe(true);
    }
    const a = generateStageCrowdExtras({ background: bg, characters: state.characters, framingId: state.framingId, density: "medium" });
    const b = generateStageCrowdExtras({ background: bg, characters: state.characters, framingId: state.framingId, density: "medium" });
    expect(a).toEqual(b);
  });

  it("5개 분리 레이어 베이크 계획이 정본 패스 코드·블렌드 모드·순수 OKLCH SVG 프리뷰를 생성한다", () => {
    const state = createInitialStageCompositeState("murim-jade-sword-altar");
    const bg = getStageBackgroundSlot(state.backgroundId);
    const harmony = harmonizeStageLightingAndInk({
      background: bg, characters: state.characters, timeOfDay: state.timeOfDay,
      celPresetId: state.celPresetId, inkPx: state.inkPx, aspectRatio: state.aspectRatio,
    });
    const extras = generateStageCrowdExtras({ background: bg, characters: state.characters, framingId: state.framingId, density: "sparse" });
    const plan = buildCompositeCutLayerPlan({ state, harmony, crowdExtras: extras });

    expect(plan.layers.map((l) => l.passCode)).toEqual(COMPOSITE_BAKE_PASS_ORDER);
    expect(plan.layers.find((l) => l.passCode === "40_CONTACT_SHADOW")?.blendMode).toBe("multiply");
    expect(plan.layers.find((l) => l.passCode === "50_RIM_ATMOSPHERE")?.blendMode).toBe("screen");
    expect(plan.enabledCount).toBe(5);
    expect(plan.pngManifest.groundingVerified).toBe(true);
    expect(plan.pngManifest.passFiles).toHaveLength(5);
    expect(plan.compositeSvgMarkup).toContain("<svg");
    expect(plan.compositeSvgMarkup).not.toMatch(RAW_HEX_PATTERN);
    expect(plan.compositeSvgMarkup).not.toMatch(RAW_RGB_PATTERN);
  });

  it("특정 베이크 레이어를 끄면 SVG 합성과 PNG 매니페스트에서 해당 패스가 제외된다", () => {
    const base = createInitialStageCompositeState("seoul-rooftop-cafe-terrace");
    const toggled = {
      ...base,
      enabledPasses: { ...base.enabledPasses, "40_CONTACT_SHADOW": false, "50_RIM_ATMOSPHERE": false },
    };
    const bg = getStageBackgroundSlot(toggled.backgroundId);
    const harmony = harmonizeStageLightingAndInk({
      background: bg, characters: toggled.characters, timeOfDay: toggled.timeOfDay,
      celPresetId: toggled.celPresetId, inkPx: toggled.inkPx, aspectRatio: toggled.aspectRatio,
    });
    const plan = buildCompositeCutLayerPlan({ state: toggled, harmony, crowdExtras: [] });

    expect(plan.enabledCount).toBe(3);
    expect(plan.pngManifest.passFiles).toEqual(["10_BG_3D_LT.png", "20_CHAR_LINEART.png", "30_CHAR_FLAT.png"]);
    expect(plan.compositeSvgMarkup).not.toContain('data-pass="40_CONTACT_SHADOW"');
    expect(plan.compositeSvgMarkup).not.toContain('data-pass="50_RIM_ATMOSPHERE"');
  });
});

describe("Wave 13D: UI 렌더링 · 점진적 공개 · 접근성 · StudioScene3dCutPanel 지연 마운트", () => {
  it("필수 선택 2개(① 3D 배경 고르기 · ② 캐릭터 배치)와 SVG 프리뷰를 표시하고 상세 설정은 기본 접힘 상태다", () => {
    render(<Studio3dBgCharacterCompositorPanel />);
    expect(screen.getByLabelText("3D 배경 고르기")).toBeDefined();
    expect(screen.getByRole("button", { name: /인물 추가/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /AI 추천 구도·조명 자동 맞추기/ })).toBeDefined();
    expect(screen.getByTestId("stage-3d-compositor-preview")).toBeDefined();

    const advanced = screen.getByTestId("stage-3d-compositor-advanced");
    if (!(advanced instanceof HTMLDetailsElement)) throw new Error("details 요소 필요");
    expect(advanced.open).toBe(false);
  });

  it("배경 변경 · 인물 추가(3인) · AI 자동 맞추기 · 5레이어 분리 컷 굽기 상호작용이 즉시 반영된다", () => {
    const onBake = vi.fn<(plan: CompositeCutLayerPlan) => void>();
    render(<Studio3dBgCharacterCompositorPanel onBakeCompositeCut={onBake} />);

    fireEvent.change(screen.getByLabelText("3D 배경 고르기"), {
      target: { value: "seoul-rooftop-cafe-terrace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /인물 추가/ }));
    expect(screen.getByText(/② 캐릭터 배치 \(3\/3인\)/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /AI 추천 구도·조명 자동 맞추기/ }));
    expect(screen.getByRole("status").textContent).toContain("자동 동기화했습니다");

    fireEvent.click(screen.getByRole("button", { name: /5레이어 분리 컷 굽기/ }));
    expect(onBake).toHaveBeenCalledOnce();
    const bakedPlan = onBake.mock.calls[0]?.[0];
    expect(bakedPlan?.layers).toHaveLength(5);
    expect(bakedPlan?.pngManifest.groundingVerified).toBe(true);
  });

  it("상세 설정(<details>)을 열어 잉크 굵기 · 레이어 토글 · 군중 밀도를 조작하면 SVG 프리뷰가 실시간 갱신된다", () => {
    render(<Studio3dBgCharacterCompositorPanel />);
    const advanced = screen.getByTestId("stage-3d-compositor-advanced");
    if (!(advanced instanceof HTMLDetailsElement)) throw new Error("details 요소 필요");
    fireEvent.click(screen.getByText(/상세 설정/));

    const shadowCheckbox = screen.getByRole("checkbox", { name: /40_CONTACT_SHADOW/ });
    expect(screen.getByTestId("preview-pass-40_CONTACT_SHADOW")).toBeDefined();
    fireEvent.click(shadowCheckbox);
    expect(screen.queryByTestId("preview-pass-40_CONTACT_SHADOW")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "붐빔 (14명)" }));
    expect(screen.getByText(/군중 14명/)).toBeDefined();

    const inkSlider = screen.getByLabelText("배경·캐릭터 단일 잉크 굵기");
    fireEvent.change(inkSlider, { target: { value: "2.4" } });
    expect(screen.getByText(/배경 2\.40px = 캐릭터 2\.40px/)).toBeDefined();
  });

  it("UI 소스 파일에 원시 HEX · any · transition-all 이 0건이고 min-h-11 · tabular-nums · keep-all · motion-reduce 를 준수한다", () => {
    const panelPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/stage-3d-compositor/Studio3dBgCharacterCompositorPanel.tsx",
    );
    const source = readFileSync(panelPath, "utf8");
    expect(source).not.toMatch(RAW_HEX_PATTERN);
    expect(source).not.toMatch(/\bany\b/u);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("min-h-11");
    expect(source).toContain("tabular-nums");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("motion-reduce:transition-none");
  });

  it("StudioScene3dCutPanel 에서 접이식 지연 마운트로 연결되어 기본 접힘을 유지하고 열 때 합성 스테이지를 로드한다", async () => {
    const cutPanelPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/scene3d/StudioScene3dCutPanel.tsx",
    );
    const cutPanelSrc = readFileSync(cutPanelPath, "utf8");
    expect(cutPanelSrc).toContain('import("../stage-3d-compositor/Studio3dBgCharacterCompositorPanel")');
    expect(cutPanelSrc).not.toMatch(/^import\s+.*stage-3d-compositor/mu);

    const rows = new Map<string, string>();
    const projectId = "project:wave13d-lazy-compositor";
    const source = parseStudioScene3dCutSource({
      scene: createStudioScene3dDocument(projectId, "2026-11-21T00:00:00.000Z"),
      characters: {},
    });
    const host: StudioScene3dCutHost = {
      projectId,
      readSource: () => source,
      blockedReason: () => null,
      applySource: () => undefined,
    };
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => ({
        get: async (k) => rows.get(k) ?? null,
        set: async (k, v) => { rows.set(k, v); },
        delete: async (k) => { rows.delete(k); },
      }),
      lockProvider: { request: async (_n, _o, op) => op() },
    });
    const session = new StudioScene3dCutSession(host, repository);
    await session.restore();

    try {
      render(<StudioScene3dCutPanel session={session} />);
      const entry = screen.getByTestId("scene3d-cut-bg-char-compositor-details");
      if (!(entry instanceof HTMLDetailsElement)) throw new Error("접이식 details 필요");
      expect(entry.open).toBe(false);
      expect(screen.queryByTestId("studio-3d-bg-char-compositor-panel")).toBeNull();

      entry.open = true;
      fireEvent(entry, new Event("toggle"));

      await waitFor(() => {
        expect(screen.getByTestId("studio-3d-bg-char-compositor-panel")).toBeDefined();
      });
    } finally {
      session.dispose();
    }
  });
});

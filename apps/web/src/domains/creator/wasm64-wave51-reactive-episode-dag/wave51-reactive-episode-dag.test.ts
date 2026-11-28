import { describe, expect, it } from "vitest";

import {
  buildCrossCutPropagationPlan,
  buildPropagationPreviewSummary,
  computeOklchContrastRatio,
  computeOklchDeltaE,
  EpisodeSceneDependencyDag,
  MAX_SKIN_HUE_SHIFT_DEG,
  MIN_CEL_SHADOW_LIGHTNESS_GAP,
  MIN_SPEECH_BUBBLE_CONTRAST_RATIO,
  previewPartialCutSelection,
  ReactivePropagationCommitManager,
  SCENE_LIGHTING_PRESETS,
  shortestHueDeltaDeg,
  toggleCutSelectionInPlan,
  validateAcyclicDag,
  type CutLayerNode,
  type OklchColor,
} from "./index";

const JACKET_NAVY: OklchColor = { l: 0.38, c: 0.11, hDeg: 255 };
const JACKET_CRIMSON: OklchColor = { l: 0.52, c: 0.19, hDeg: 24 };
const HAIR_CHESTNUT: OklchColor = { l: 0.34, c: 0.08, hDeg: 48 };
const HAIR_SILVER: OklchColor = { l: 0.76, c: 0.025, hDeg: 240 };
const ACCESSORY_GOLD: OklchColor = { l: 0.78, c: 0.14, hDeg: 85 };
const ACCESSORY_EMERALD: OklchColor = { l: 0.64, c: 0.16, hDeg: 152 };
const SKIN_WARM: OklchColor = { l: 0.82, c: 0.06, hDeg: 58 };
const SHADOW_NAVY: OklchColor = { l: 0.24, c: 0.08, hDeg: 262 };
const BUBBLE_PAPER: OklchColor = { l: 0.96, c: 0.01, hDeg: 90 };
const BUBBLE_INK: OklchColor = { l: 0.14, c: 0.01, hDeg: 260 };

function createTwoSceneEpisodeFixture(): EpisodeSceneDependencyDag {
  const dag = new EpisodeSceneDependencyDag();
  const daylight = SCENE_LIGHTING_PRESETS.daylight;

  dag.addNode({
    kind: "character-palette-token", nodeId: "tok:sceneA:hana:costume", sceneId: "scene-A",
    characterId: "hana", slot: "costume", labelKo: "하나 재킷 기본색", colorOklch: JACKET_NAVY,
  });
  dag.addNode({
    kind: "character-palette-token", nodeId: "tok:sceneA:hana:hair", sceneId: "scene-A",
    characterId: "hana", slot: "hair", labelKo: "하나 머리색", colorOklch: HAIR_CHESTNUT,
  });
  dag.addNode({
    kind: "character-palette-token", nodeId: "tok:sceneA:hana:accessory", sceneId: "scene-A",
    characterId: "hana", slot: "accessory", labelKo: "하나 브로치", colorOklch: ACCESSORY_GOLD,
  });
  dag.addNode({
    kind: "scene-lighting-preset", nodeId: "light:sceneA", sceneId: "scene-A",
    labelKo: "씬 A 낮 조명", lighting: daylight,
  });
  dag.addNode({
    kind: "bg3d-camera-mood", nodeId: "bg3d-mood:sceneA", sceneId: "scene-A",
    labelKo: "씬 A 카페 3D 카메라 무드",
    mood: {
      cameraFovMm: 35, azimuthDeg: 45, elevationDeg: 18,
      fogDensity: 0.12, rimGlowStrength: 0.2, fogTintOklch: daylight.moodTintOklch,
    },
  });

  const addCutSet = (sceneId: string, cutId: string, cutIndex: number): void => {
    const base = { kind: "cut-layer" as const, sceneId, cutId, cutIndex, pinnedByArtist: false };
    const flat = `${cutId}:costume-flat`;
    const shadow = `${cutId}:costume-shadow`;
    const hair = `${cutId}:hair-flat`;
    const acc = `${cutId}:accessory-flat`;
    const skin = `${cutId}:skin-flat`;
    const bg3d = `${cutId}:bg3d-light`;
    const bubble = `${cutId}:bubble-tone`;
    const nodes: CutLayerNode[] = [
      { ...base, nodeId: flat, layerId: "layer-costume-flat", layerKind: "base-flat", labelKo: "의상 밑색", characterId: "hana", slot: "costume", colorOklch: JACKET_NAVY },
      { ...base, nodeId: shadow, layerId: "layer-costume-shadow", layerKind: "cel-shadow", labelKo: "의상 명암", characterId: "hana", slot: "costume", colorOklch: SHADOW_NAVY, shadowAngleDeg: daylight.shadowAzimuthDeg },
      { ...base, nodeId: hair, layerId: "layer-hair-flat", layerKind: "base-flat", labelKo: "머리 밑색", characterId: "hana", slot: "hair", colorOklch: HAIR_CHESTNUT },
      { ...base, nodeId: acc, layerId: "layer-accessory-flat", layerKind: "base-flat", labelKo: "액세서리 밑색", characterId: "hana", slot: "accessory", colorOklch: ACCESSORY_GOLD },
      { ...base, nodeId: skin, layerId: "layer-skin-flat", layerKind: "base-flat", labelKo: "피부 밑색", characterId: "hana", slot: "skin", colorOklch: SKIN_WARM },
      {
        ...base, nodeId: bg3d, layerId: "layer-bg3d-lighting", layerKind: "bg3d-lighting", labelKo: "배경 3D 조명", colorOklch: daylight.moodTintOklch,
        bg3dLighting: { keyKelvin: daylight.keyKelvin, ambientKelvin: daylight.ambientKelvin, sunAzimuthDeg: daylight.shadowAzimuthDeg, sunElevationDeg: daylight.shadowElevationDeg, shadowHardness: daylight.shadowIntensity, fogDensity: 0.12, rimGlowStrength: 0.2, fogTintOklch: daylight.moodTintOklch },
      },
      {
        ...base, nodeId: bubble, layerId: "layer-bubble-tone", layerKind: "speech-bubble-tone", labelKo: "말풍선 톤", colorOklch: BUBBLE_PAPER,
        speechBubbleTone: { fillOklch: BUBBLE_PAPER, borderOklch: { l: 0.24, c: 0.01, hDeg: 260 }, inkOklch: BUBBLE_INK },
      },
    ];
    for (const node of nodes) dag.addNode(node);
    const edges = [
      ["tok:sceneA:hana:costume", flat, "palette-binding"],
      [flat, shadow, "derived-layer"],
      ["tok:sceneA:hana:hair", hair, "palette-binding"],
      ["tok:sceneA:hana:accessory", acc, "palette-binding"],
      ["light:sceneA", flat, "lighting-preset"],
      ["light:sceneA", shadow, "lighting-preset"],
      ["light:sceneA", skin, "lighting-preset"],
      ["light:sceneA", bg3d, "lighting-preset"],
      ["light:sceneA", bubble, "lighting-preset"],
      ["bg3d-mood:sceneA", bg3d, "bg3d-mood"],
    ] as const;
    for (const [fromNodeId, toNodeId, relation] of edges) dag.addEdge({ fromNodeId, toNodeId, relation });
  };

  addCutSet("scene-A", "cut-A1", 1);
  addCutSet("scene-A", "cut-A2", 2);
  addCutSet("scene-A", "cut-A3", 3);
  addCutSet("scene-A", "cut-A4", 4);
  addCutSet("scene-B", "cut-B1", 1);
  addCutSet("scene-B", "cut-B2", 2);
  return dag;
}

function getCutLayer(dag: EpisodeSceneDependencyDag, nodeId: string): CutLayerNode {
  const node = dag.getNode(nodeId);
  if (!node || node.kind !== "cut-layer") throw new Error(`테스트 레이어를 찾을 수 없습니다: ${nodeId}`);
  return node;
}

describe("Wave 51: 반응형 에피소드 의존성 DAG 및 씬 연쇄 전파 엔진", () => {
  it("1. Kahn 위상 정렬이 토큰 -> 밑색 -> 명암 순서를 결정적으로 보장한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const sorted = dag.getTopologicalOrder();
    expect(sorted.hasCycle).toBe(false);
    expect(sorted.cyclePath).toEqual([]);
    const idxToken = sorted.topologicalOrder.indexOf("tok:sceneA:hana:costume");
    const idxFlat = sorted.topologicalOrder.indexOf("cut-A2:costume-flat");
    const idxShadow = sorted.topologicalOrder.indexOf("cut-A2:costume-shadow");
    expect(idxToken).toBeGreaterThanOrEqual(0);
    expect(idxToken).toBeLessThan(idxFlat);
    expect(idxFlat).toBeLessThan(idxShadow);
  });

  it("2. 자기 자신을 가리키는 직접 순환 간선을 즉시 차단한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const res = dag.addEdge({ fromNodeId: "cut-A2:costume-flat", toNodeId: "cut-A2:costume-flat", relation: "derived-layer" });
    expect(res.ok).toBe(false);
    expect(res.cyclePath).toEqual(["cut-A2:costume-flat", "cut-A2:costume-flat"]);
  });

  it("3. 간접 3노드 순환 참조(A->B->C->A) 추가를 거부하고 기존 DAG를 보존한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const beforeEdges = dag.listEdges().length;
    const res = dag.addEdge({ fromNodeId: "cut-A2:costume-shadow", toNodeId: "tok:sceneA:hana:costume", relation: "derived-layer" });
    expect(res.ok).toBe(false);
    expect(res.cyclePath?.length).toBeGreaterThanOrEqual(3);
    expect(dag.listEdges().length).toBe(beforeEdges);
    expect(dag.getTopologicalOrder().hasCycle).toBe(false);
  });

  it("4. validateAcyclicDag가 사전 구성된 순환 간선 집합에서 사이클 경로를 정확히 보고한다", () => {
    const result = validateAcyclicDag(["n1", "n2", "n3"], [
      { fromNodeId: "n1", toNodeId: "n2", relation: "derived-layer" },
      { fromNodeId: "n2", toNodeId: "n3", relation: "derived-layer" },
      { fromNodeId: "n3", toNodeId: "n1", relation: "derived-layer" },
    ]);
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toEqual(["n1", "n2", "n3", "n1"]);
  });

  it("5. 1컷 의상 팔레트 변경이 동일 씬 2~4컷의 밑색·명암 레이어에 연쇄 전파된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-costume-crimson", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    expect(plan.cutPatches.map((c) => c.cutId)).toEqual(["cut-A2", "cut-A3", "cut-A4"]);
    for (const cut of plan.cutPatches) {
      expect(cut.layerPatches.map((l) => l.layerId)).toEqual(["layer-costume-flat", "layer-costume-shadow"]);
      expect(cut.maxDeltaEOklch).toBeGreaterThan(20);
    }
  });

  it("6. 머리색·액세서리 동시 수정 시 해당 슬롯 레이어에만 정확히 매칭 전파된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-hair-acc", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [
        { tokenNodeId: "tok:sceneA:hana:hair", previousOklch: HAIR_CHESTNUT, nextOklch: HAIR_SILVER },
        { tokenNodeId: "tok:sceneA:hana:accessory", previousOklch: ACCESSORY_GOLD, nextOklch: ACCESSORY_EMERALD },
      ],
    });
    const cut2 = plan.cutPatches.find((c) => c.cutId === "cut-A2");
    expect(cut2?.layerPatches.map((l) => l.layerId).sort()).toEqual(["layer-accessory-flat", "layer-hair-flat"]);
  });

  it("7. 씬 A 변경 시 타 씬(scene-B) 컷들은 철저히 격리되고 격리 목록으로 보고된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-scene-isolation", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    expect(plan.cutPatches.some((c) => c.cutId.startsWith("cut-B"))).toBe(false);
    expect(plan.isolatedOtherSceneCutIds).toEqual(["cut-B1", "cut-B2"]);
  });

  it("8. 작가 수동 핀(pinnedByArtist) 설정된 컷 레이어는 자동 전파에서 보호된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    dag.setLayerArtistPin("cut-A3:costume-flat", true, "3컷 클로즈업 수동 보정 유지");
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-artist-pin", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    const cut3 = plan.cutPatches.find((c) => c.cutId === "cut-A3");
    expect(cut3?.layerPatches).toHaveLength(0);
    expect(cut3?.skippedPinnedLayers).toHaveLength(1);
    expect(cut3?.skippedPinnedLayers[0]?.reasonKo).toContain("클로즈업");
    expect(plan.totalPinnedConflictCount).toBe(1);
  });

  it("9. 특정 토큰만 핀 고정(pinnedTokenIds)된 레이어는 의상은 보호되고 조명은 정상 전파된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    dag.setLayerArtistPin("cut-A2:costume-flat", false, undefined, ["tok:sceneA:hana:costume"]);
    const costumePlan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-token-pin-costume", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    const lightPlan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-token-pin-light", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.sunset,
      },
    });
    expect(costumePlan.cutPatches[0]?.skippedPinnedLayers.some((p) => p.nodeId === "cut-A2:costume-flat")).toBe(true);
    expect(lightPlan.cutPatches[0]?.layerPatches.some((p) => p.nodeId === "cut-A2:costume-flat")).toBe(true);
  });

  it("10. 낮 -> 노을 일괄 조명 전파가 밑색·명암·배경 3D 조명·말풍선 톤과 OKLCH ΔE를 계산한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-day-to-sunset", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.sunset,
      },
    });
    const cut2 = plan.cutPatches.find((c) => c.cutId === "cut-A2");
    expect(cut2?.layerPatches).toHaveLength(5);
    const bg3d = cut2?.layerPatches.find((p) => p.layerKind === "bg3d-lighting");
    const shadow = cut2?.layerPatches.find((p) => p.layerKind === "cel-shadow");
    expect(bg3d?.afterBg3dLighting?.keyKelvin).toBe(3_200);
    expect(bg3d?.afterBg3dLighting?.sunAzimuthDeg).toBe(215);
    expect(bg3d?.afterBg3dLighting?.sunElevationDeg).toBe(16);
    expect(shadow?.afterShadowAngleDeg).toBe(215);
    expect(cut2?.maxDeltaEOklch).toBeGreaterThan(8);
  });

  it("11. 낮 -> 야간 및 실내 형광 전환 시 색온도와 그림자 강도 방향이 물리적으로 일관된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const nightPlan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-day-to-night", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.night,
      },
    });
    const indoorPlan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-day-to-indoor", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS["indoor-fluorescent"],
      },
    });
    const nightBg = nightPlan.cutPatches[0]?.layerPatches.find((p) => p.layerKind === "bg3d-lighting");
    const indoorBg = indoorPlan.cutPatches[0]?.layerPatches.find((p) => p.layerKind === "bg3d-lighting");
    expect(nightBg?.afterBg3dLighting?.keyKelvin).toBe(9_200);
    expect(nightBg?.afterBg3dLighting?.shadowHardness).toBeGreaterThan(0.6);
    expect(indoorBg?.afterBg3dLighting?.keyKelvin).toBe(4_300);
    expect(indoorBg?.afterBg3dLighting?.sunElevationDeg).toBe(72);
  });

  it("12. 강한 야간 조명 전파 중에도 피부 레이어의 OKLCH 색상각 편차가 4도 이내로 고정된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-skin-guard", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.night,
      },
    });
    const skinPatch = plan.cutPatches[0]?.layerPatches.find((p) => p.nodeId === "cut-A2:skin-flat");
    expect(skinPatch).toBeDefined();
    if (!skinPatch) return;
    const hueDrift = Math.abs(shortestHueDeltaDeg(skinPatch.beforeColorOklch.hDeg, skinPatch.afterColorOklch.hDeg));
    expect(hueDrift).toBeLessThanOrEqual(MAX_SKIN_HUE_SHIFT_DEG + 0.01);
    expect(skinPatch.skinHueProtected).toBe(true);
  });

  it("13. 어두운 말풍선 톤이 야간 조명과 합성되어도 WCAG 가독성 명암비(>= 7.0:1)로 자동 보정된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const bubbleNode = getCutLayer(dag, "cut-A2:bubble-tone");
    dag.updateNode({
      ...bubbleNode,
      colorOklch: { l: 0.72, c: 0.04, hDeg: 240 },
      speechBubbleTone: { fillOklch: { l: 0.72, c: 0.04, hDeg: 240 }, borderOklch: { l: 0.25, c: 0.02, hDeg: 250 }, inkOklch: BUBBLE_INK },
    });
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-bubble-contrast", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.night,
      },
    });
    const patch = plan.cutPatches[0]?.layerPatches.find((p) => p.layerKind === "speech-bubble-tone");
    expect(patch?.contrastSafety.adjusted).toBe(true);
    expect(patch?.contrastSafety.correctedContrastRatio).toBeGreaterThanOrEqual(MIN_SPEECH_BUBBLE_CONTRAST_RATIO);
    if (patch?.afterSpeechBubbleTone) {
      expect(computeOklchContrastRatio(patch.afterSpeechBubbleTone.fillOklch, patch.afterSpeechBubbleTone.inkOklch))
        .toBeGreaterThanOrEqual(MIN_SPEECH_BUBBLE_CONTRAST_RATIO);
    }
  });

  it("14. 밑색과 셀 그림자 명도차가 좁아지면 최소 명도차(0.08)가 유지되도록 자동 보정된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    dag.updateNode({ ...getCutLayer(dag, "cut-A2:costume-shadow"), colorOklch: { l: 0.48, c: 0.06, hDeg: 255 } });
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-shadow-gap", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS["indoor-fluorescent"],
      },
    });
    const basePatch = plan.cutPatches[0]?.layerPatches.find((p) => p.nodeId === "cut-A2:costume-flat");
    const shadowPatch = plan.cutPatches[0]?.layerPatches.find((p) => p.nodeId === "cut-A2:costume-shadow");
    expect(shadowPatch?.contrastSafety.adjusted).toBe(true);
    if (basePatch && shadowPatch) {
      expect(basePatch.afterColorOklch.l - shadowPatch.afterColorOklch.l).toBeGreaterThanOrEqual(MIN_CEL_SHADOW_LIGHTNESS_GAP - 0.001);
    }
  });

  it("15. 배경 3D 카메라·무드 노드의 안개 밀도·림 글로우 델타가 씬 전 컷 3D 조명에 전파된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-bg3d-mood", sceneId: "scene-A", sourceCutId: "cut-A1",
      bg3dMoodDelta: {
        moodNodeId: "bg3d-mood:sceneA",
        previousMood: { cameraFovMm: 35, azimuthDeg: 45, elevationDeg: 18, fogDensity: 0.12, rimGlowStrength: 0.2, fogTintOklch: SCENE_LIGHTING_PRESETS.daylight.moodTintOklch },
        nextMood: { cameraFovMm: 50, azimuthDeg: 45, elevationDeg: 18, fogDensity: 0.42, rimGlowStrength: 0.65, fogTintOklch: SCENE_LIGHTING_PRESETS.sunset.moodTintOklch },
      },
    });
    expect(plan.cutPatches).toHaveLength(3);
    const bgPatch = plan.cutPatches[1]?.layerPatches[0];
    expect(bgPatch?.afterBg3dLighting?.fogDensity).toBeCloseTo(0.42, 2);
    expect(bgPatch?.afterBg3dLighting?.rimGlowStrength).toBeCloseTo(0.65, 2);
  });

  it("16. 미리보기 요약기가 컷별 영향 레이어 수·OKLCH ΔE·예상 렌더링 ms·잠금 충돌 건수를 집계한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    dag.setLayerArtistPin("cut-A4:costume-flat", true, "4컷 강조색 고정");
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-preview-summary", sceneId: "scene-A", sourceCutId: "cut-A1",
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.sunset,
      },
    });
    const summary = buildPropagationPreviewSummary(plan);
    expect(summary.selectedCutCount).toBe(3);
    expect(summary.totalAffectedLayerCount).toBe(14);
    expect(summary.totalPinnedConflictCount).toBe(1);
    expect(summary.totalEstimatedRenderMs).toBeGreaterThan(30);
    expect(summary.overallMaxDeltaEOklch).toBeGreaterThan(5);
    expect(summary.isolatedOtherSceneCutCount).toBe(2);
    expect(summary.summaryBannerKo).toContain("3개 컷");
  });

  it("17. 선택 컷 제외(toggleCutSelectionInPlan · previewPartialCutSelection)와 부분 커밋이 정확히 동작한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const basePlan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-partial-select", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    const partialPlan = toggleCutSelectionInPlan(basePlan, "cut-A3", false);
    const preview = previewPartialCutSelection(basePlan, ["cut-A2", "cut-A4"]);
    expect(preview.selectedCutCount).toBe(2);
    expect(preview.excludedCutCount).toBe(1);

    const manager = new ReactivePropagationCommitManager();
    const commit = manager.commitPlan(dag, partialPlan);
    expect(commit.ok).toBe(true);
    expect(commit.appliedCutIds).toEqual(["cut-A2", "cut-A4"]);
    expect(commit.skippedCutIds).toEqual(["cut-A3"]);
    expect(computeOklchDeltaE(getCutLayer(dag, "cut-A2:costume-flat").colorOklch, JACKET_CRIMSON)).toBe(0);
    expect(computeOklchDeltaE(getCutLayer(dag, "cut-A3:costume-flat").colorOklch, JACKET_NAVY)).toBe(0);
    expect(computeOklchDeltaE(getCutLayer(dag, "cut-B1:costume-flat").colorOklch, JACKET_NAVY)).toBe(0);
  });

  it("18. 커밋 후 RevertToken으로 즉시 원복하면 모든 컷의 색상·3D 조명·말풍선이 잔차 0으로 복구된다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const beforeColorA2 = getCutLayer(dag, "cut-A2:costume-flat").colorOklch;
    const beforeBgA3 = getCutLayer(dag, "cut-A3:bg3d-light").bg3dLighting;
    const beforeBubbleA4 = getCutLayer(dag, "cut-A4:bubble-tone").speechBubbleTone;
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-commit-revert", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.sunset,
      },
    });
    const manager = new ReactivePropagationCommitManager();
    const commit = manager.commitPlan(dag, plan);
    expect(commit.ok).toBe(true);
    expect(getCutLayer(dag, "cut-A3:bg3d-light").bg3dLighting?.keyKelvin).toBe(3_200);

    const revert = manager.revertCommit(dag, commit.revertToken?.revertTokenId ?? "");
    expect(revert.ok).toBe(true);
    expect(revert.verifiedZeroResidualDelta).toBe(true);
    expect(revert.restoredCutIds).toEqual(["cut-A2", "cut-A3", "cut-A4"]);
    expect(getCutLayer(dag, "cut-A2:costume-flat").colorOklch).toEqual(beforeColorA2);
    expect(getCutLayer(dag, "cut-A3:bg3d-light").bg3dLighting).toEqual(beforeBgA3);
    expect(getCutLayer(dag, "cut-A4:bubble-tone").speechBubbleTone).toEqual(beforeBubbleA4);
  });

  it("19. 이미 원복된 토큰 재사용 및 미등록 토큰 롤백 요청을 안전하게 거부한다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const plan = buildCrossCutPropagationPlan(dag, {
      planId: "plan-double-revert", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
    });
    const manager = new ReactivePropagationCommitManager();
    const commit = manager.commitPlan(dag, plan);
    const tokenId = commit.revertToken?.revertTokenId ?? "";
    expect(manager.revertCommit(dag, tokenId).ok).toBe(true);
    expect(manager.revertCommit(dag, tokenId).ok).toBe(false);
    expect(manager.revertCommit(dag, "revert-unknown-999").ok).toBe(false);
  });

  it("20. 전파 패치 플랜 생성만으로는 원본 DAG의 어떠한 노드 값도 변경되지 않는다", () => {
    const dag = createTwoSceneEpisodeFixture();
    const snapshotBefore = JSON.stringify(dag.listNodes());
    buildCrossCutPropagationPlan(dag, {
      planId: "plan-non-destructive", sceneId: "scene-A", sourceCutId: "cut-A1",
      paletteDeltas: [{ tokenNodeId: "tok:sceneA:hana:costume", previousOklch: JACKET_NAVY, nextOklch: JACKET_CRIMSON }],
      lightingDelta: {
        presetNodeId: "light:sceneA",
        previousLighting: SCENE_LIGHTING_PRESETS.daylight,
        nextLighting: SCENE_LIGHTING_PRESETS.night,
      },
    });
    expect(JSON.stringify(dag.listNodes())).toBe(snapshotBefore);
  });
});

// @vitest-environment jsdom
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KWEBTOON_ARCHETYPE_STAGE_BRIDGE,
  KWEBTOON_CEL_PRESETS,
  KWEBTOON_CEL_PRESET_LIST,
  KWEBTOON_HERO_GLB_CATALOG,
  applyUnifiedMToonInkContract,
  buildSrgbToonRampDescriptor,
  buildStageBridgePayload,
  computeIsotropicClipSpacePush,
  computeScreenSpaceOutlineFactor,
  createUnifiedInkContract,
  detectMToonMaterialKind,
  linearToSrgbByte,
  measureIsotropicOutlinePxAtAngle,
  posterizeRankHighlightSafe,
  srgbByteToLinear,
  type MToonMaterialLike,
  type SceneTraverseObjectLike,
} from "../kwebtoon-npr-ink-contract";
import {
  FINGER_ORDER,
  HAND_GESTURE_PRESET_LIST,
  WEBTOON_ACTION_POSE_PRESETS,
  applyFalsePerspectiveExaggeration,
  applyHandGesturePreset,
  clampFingerPose,
  computeCenterOfMass,
  computeFulcrumSupportPolygon,
  createInitialTenFingerRig,
  mirrorHandPose,
  readFingerCurlPercent,
  resolveBodySelfCollisions,
  solveCascadeurAutoBalance,
  updateFingerCurlPercent,
} from "../cascadeur-designdoll-rig-pro";
import {
  ARKIT_52_BLENDSHAPES,
  DEFAULT_MODIFIER_STACK,
  INITIAL_DYNAMIC_STAGE_COMPONENTS,
  INITIAL_VROID_SHADER_LAB,
  QUADRUPED_AND_WEAPON_RIG_PRESETS,
  WEBTOON_EXPRESSION_RECIPES,
  bakeClothHairWindPhysics,
  compileVroidShaderLabUniforms,
  computeInferenceSnap,
  createGreasePencil3dStroke,
  evaluateModifierStack,
  generateProceduralScatter,
  resolveSeasonTimeAtmosphere,
  setBlendshapeWeight,
  updateDynamicStageComponents,
  validateVrm1ExportSettings,
} from "../blender-sketchup-vroid-pro-ops";
import { Studio3dWebtoonProPanel } from "../Studio3dWebtoonProPanel";
import {
  StudioBg3dSceneAssistantWorkspace,
  type StudioBg3dSceneAssistantHost,
} from "../../bg3d/StudioBg3dSceneAssistantWorkspace";

vi.mock("../../bg3d/StudioBg3dEditorViewport", () => ({
  StudioBg3dEditorViewport: () => <div data-testid="mock-viewport" />,
}));

afterEach(() => cleanup());

const HERO_MODELS_DIR = resolve(process.cwd(), "apps/web/public/models/kwebtoon-hero");

describe("T-025: 한국 웹툰 NPR 단일 잉크 계약(Single Ink Contract) & 히어로 GLB 브리지", () => {
  it("ScreenCoordinates 공식 INK_PX * 2 / H 로 1080p·2160p 화면 고정 계수를 정확 계산한다", () => {
    expect(computeScreenSpaceOutlineFactor(1.6, 1080)).toBeCloseTo(3.2 / 1080, 8);
    expect(computeScreenSpaceOutlineFactor(2.0, 2160)).toBeCloseTo(4.0 / 2160, 8);
    expect(computeScreenSpaceOutlineFactor(0, 1080)).toBe(0);
  });

  it("3D 배경 프롭 외곽선 norm.x / aspect 보정으로 16:9·21:9·9:16·1:1 전 화면비 1.0000x 등방성을 보장한다", () => {
    const viewports: readonly [number, number][] = [
      [1920, 1080],
      [2560, 1080],
      [1080, 1920],
      [1000, 1000],
    ];
    const targetInkPx = 1.8;

    for (const [w, h] of viewports) {
      const factor = computeScreenSpaceOutlineFactor(targetInkPx, h);
      const widths: number[] = [];
      for (let deg = 0; deg < 360; deg += 15) {
        widths.push(measureIsotropicOutlinePxAtAngle((deg * Math.PI) / 180, w, h, factor));
      }
      const minW = Math.min(...widths);
      const maxW = Math.max(...widths);
      expect(maxW / minW).toBeCloseTo(1.0, 6);
      expect(minW).toBeCloseTo(targetInkPx, 5);
    }
  });

  it("computeIsotropicClipSpacePush 가 pos.w 를 곱해 원거리에서도 화면 선 굵기를 유지한다", () => {
    const near = computeIsotropicClipSpacePush([0, 0, 0, 2], [1, 0, 0, 0], 1920, 1080, 0.003);
    const far = computeIsotropicClipSpacePush([0, 0, 0, 12], [1, 0, 0, 0], 1920, 1080, 0.003);
    expect(near.pushedClip[0] / near.pushedClip[3]).toBeCloseTo(
      far.pushedClip[0] / far.pushedClip[3],
      8,
    );
  });

  it("WebGL MToonMaterial 과 WebGPU MToonNodeMaterial 모두 플래그 판별로 15/15 변환하고 needsUpdate=true 를 설정한다", () => {
    const createMockVrmScene = (mode: "webgl" | "webgpu"): SceneTraverseObjectLike => {
      const children: SceneTraverseObjectLike[] = [];
      for (let i = 0; i < 15; i += 1) {
        const outlineMat: MToonMaterialLike = {
          ...(mode === "webgl" ? { isMToonMaterial: true } : { isMToonNodeMaterial: true }),
          isOutline: true,
          outlineWidthMode: "worldCoordinates",
          outlineWidthFactor: 0.0005,
          outlineLightingMixFactor: 1,
          needsUpdate: false,
        };
        const surfaceMat: MToonMaterialLike = {
          ...(mode === "webgl" ? { isMToonMaterial: true } : { isMToonNodeMaterial: true }),
          isOutline: false,
          outlineWidthMode: "worldCoordinates",
        };
        children.push({ material: [surfaceMat, outlineMat] });
      }
      return { children };
    };

    const contract = createUnifiedInkContract("hunter-neon", { inkPx: 1.6, lightingMode: "flat" });
    const webglScene = createMockVrmScene("webgl");
    const webgpuScene = createMockVrmScene("webgpu");

    const glReport = applyUnifiedMToonInkContract(webglScene, contract, 1080);
    const gpuReport = applyUnifiedMToonInkContract(webgpuScene, contract, 1080);

    expect(glReport.convertedCount).toBe(15);
    expect(glReport.webglMaterialCount).toBe(15);
    expect(glReport.outlineLightingMixFactor).toBe(0);

    expect(gpuReport.convertedCount).toBe(15);
    expect(gpuReport.webgpuNodeMaterialCount).toBe(15);
    expect(gpuReport.unifiedOutlineWidthFactor).toBeCloseTo((1.6 * 2) / 1080, 8);

    for (const child of webgpuScene.children ?? []) {
      const outline = Array.isArray(child.material) ? child.material[1] : undefined;
      expect(outline?.outlineWidthMode).toBe("screenCoordinates");
      expect(outline?.needsUpdate).toBe(true);
      expect(outline?.outlineLightingMixFactor).toBe(0);
    }
  });

  it("detectMToonMaterialKind 가 WebGL·WebGPU·일반 재질을 정확히 구분한다", () => {
    expect(detectMToonMaterialKind({ isMToonMaterial: true })).toBe("webgl-mtoon");
    expect(detectMToonMaterialKind({ isMToonNodeMaterial: true })).toBe("webgpu-mtoon-node");
    expect(detectMToonMaterialKind({})).toBe("other");
    expect(detectMToonMaterialKind(null)).toBe("other");
  });

  it("원본 VRM 에 outlineWidthMode=none 인 재질은 건너뛰고 한국어 경고를 반환한다", () => {
    const scene: SceneTraverseObjectLike = {
      children: [
        {
          material: {
            isMToonNodeMaterial: true,
            isOutline: true,
            outlineWidthMode: "none",
          },
        },
      ],
    };
    const report = applyUnifiedMToonInkContract(
      scene,
      createUnifiedInkContract("rofan-pastel"),
      1080,
    );
    expect(report.convertedCount).toBe(0);
    expect(report.skippedNoneModeCount).toBe(1);
    expect(report.warningsKo.length).toBeGreaterThanOrEqual(2);
  });

  it("sRGB 툰 램프 바이트가 선형 [0.15, 0.35, 0.60, 1.00] -> [108, 160, 203, 255] 와 RGBAFormat/NearestFilter 를 만족한다", () => {
    const ramp = buildSrgbToonRampDescriptor([0.15, 0.35, 0.6, 1.0]);
    expect(ramp.srgbChannelBytes).toEqual([108, 160, 203, 255]);
    expect(ramp.format).toBe("RGBAFormat");
    expect(ramp.type).toBe("UnsignedByteType");
    expect(ramp.magFilter).toBe("NearestFilter");
    expect(ramp.minFilter).toBe("NearestFilter");
    expect(ramp.colorSpace).toBe("srgb");
    expect(ramp.generateMipmaps).toBe(false);
    expect(ramp.rgbaBytes.length).toBe(16);
    expect(srgbByteToLinear(128)).toBeCloseTo(0.2159, 3);
    expect(linearToSrgbByte(0.5)).toBeGreaterThan(180);
  });

  it("posterizeRankHighlightSafe 가 1.0 하이라이트를 소실시키지 않고 N계조 전 구간을 매핑한다", () => {
    expect(posterizeRankHighlightSafe(0.0, 4)).toBe(0);
    expect(posterizeRankHighlightSafe(0.95, 4)).toBe(1);
    expect(posterizeRankHighlightSafe(1.0, 4)).toBe(1);
    expect(posterizeRankHighlightSafe(0.5, 3)).toBeCloseTo(0.5, 5);
  });

  it("4종 한국 웹툰 셀 프리셋과 10종 K-웹툰 아키타입 ↔ BG3D 브리지 카탈로그가 완비되어 있다", () => {
    expect(KWEBTOON_CEL_PRESET_LIST).toHaveLength(4);
    expect(KWEBTOON_CEL_PRESETS["rofan-pastel"].toneBandCount).toBe(3);
    expect(KWEBTOON_CEL_PRESETS["hunter-neon"].toneBandCount).toBe(4);
    expect(KWEBTOON_ARCHETYPE_STAGE_BRIDGE).toHaveLength(10);

    const dukePayload = buildStageBridgePayload("kwebtoon-northern-duke");
    expect(dukePayload.heroGlbId).toBe("rofan-imperial-arch-chandelier");
    expect(dukePayload.characterHeightScaleMeters).toBeGreaterThan(1.8);

    const sdPayload = buildStageBridgePayload("kwebtoon-sd-mascot");
    expect(sdPayload.characterHeightScaleMeters).toBeLessThan(1.0);
  });

  it("Blender 5.3 으로 실제 생성한 4종 히어로 GLB·512px 프리뷰 PNG·manifest.json 이 디스크에 무결하게 존재한다", () => {
    expect(KWEBTOON_HERO_GLB_CATALOG).toHaveLength(4);
    const manifestPath = resolve(HERO_MODELS_DIR, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      blenderVersion: string;
      assets: Array<{
        slug: string;
        nonManifoldEdges: number;
        wireEdges: number;
        looseVertices: number;
        zeroAreaFaces: number;
        groundedMinZ: number;
        drawCalls: number;
        glbBytes: number;
      }>;
    };
    expect(manifest.blenderVersion).toContain("5.3");
    expect(manifest.assets).toHaveLength(4);

    for (const asset of KWEBTOON_HERO_GLB_CATALOG) {
      const glbFile = resolve(HERO_MODELS_DIR, `${asset.id}.glb`);
      const pngFile = resolve(HERO_MODELS_DIR, `${asset.id}.png`);
      expect(existsSync(glbFile)).toBe(true);
      expect(existsSync(pngFile)).toBe(true);

      const glbBuf = readFileSync(glbFile);
      expect(glbBuf.subarray(0, 4).toString("ascii")).toBe("glTF");
      expect(glbBuf.readUInt32LE(4)).toBe(2);
      expect(statSync(glbFile).size).toBeLessThanOrEqual(1_200_000);
      expect(statSync(glbFile).size).toBe(asset.glbBytes);

      const pngBuf = readFileSync(pngFile);
      expect(pngBuf[0]).toBe(0x89);
      expect(pngBuf.subarray(1, 4).toString("ascii")).toBe("PNG");

      const rec = manifest.assets.find((item) => item.slug === asset.id);
      expect(rec).toBeDefined();
      expect(rec?.nonManifoldEdges).toBe(0);
      expect(rec?.wireEdges).toBe(0);
      expect(rec?.looseVertices).toBe(0);
      expect(rec?.zeroAreaFaces).toBe(0);
      expect(rec?.groundedMinZ).toBe(0);
      expect(rec?.drawCalls).toBeGreaterThanOrEqual(3);
      expect(rec?.drawCalls).toBeLessThanOrEqual(6);
    }
  });
});

describe("T-026 & T-027: Cascadeur 물리 AutoPosing · 관통 해소 · DesignDoll 과장 원근 · 10손가락", () => {
  it("무게중심(CoM) 계산과 지탱발 지지 다각형(Fulcrum) 산출이 정확하다", () => {
    const pose = WEBTOON_ACTION_POSE_PRESETS[0].pose;
    const com = computeCenterOfMass(pose);
    expect(com.y).toBeGreaterThan(0.8);
    expect(com.y).toBeLessThan(1.3);

    const both = computeFulcrumSupportPolygon(pose, "both-feet");
    const leftOnly = computeFulcrumSupportPolygon(pose, "left-foot");
    expect(both.halfWidthX).toBeGreaterThan(leftOnly.halfWidthX);
  });

  it("solveCascadeurAutoBalance 가 기울어진 헌터 도약 포즈의 CoM 을 지탱발 위로 보정한다", () => {
    const hunter = WEBTOON_ACTION_POSE_PRESETS.find((p) => p.id === "hunter-slash");
    expect(hunter).toBeDefined();
    if (!hunter) return;

    const result = solveCascadeurAutoBalance(hunter.pose, { stanceMode: "left-foot" });
    const beforeDist = Math.hypot(
      result.beforeCom.x - result.fulcrum.centerX,
      result.beforeCom.z - result.fulcrum.centerZ,
    );
    const afterDist = Math.hypot(
      result.afterCom.x - result.fulcrum.centerX,
      result.afterCom.z - result.fulcrum.centerZ,
    );
    expect(afterDist).toBeLessThan(beforeDist);
    expect(result.isBalanced).toBe(true);
    expect(result.stabilityScore).toBeGreaterThan(0.75);
  });

  it("resolveBodySelfCollisions 가 가슴을 관통한 손/팔뚝을 최소 안전 거리 밖으로 밀어낸다", () => {
    const base = WEBTOON_ACTION_POSE_PRESETS[0].pose;
    const clipped = {
      ...base,
      leftHand: { ...base.chest },
      rightHand: { x: base.hips.x + 0.01, y: base.hips.y, z: base.hips.z },
    };
    const resolved = resolveBodySelfCollisions(clipped);
    expect(resolved.resolvedCollisionCount).toBeGreaterThanOrEqual(2);
    for (const pair of resolved.pairs) {
      expect(pair.resolvedDistanceMeters).toBeGreaterThan(pair.penetrationMeters);
    }
    const secondPass = resolveBodySelfCollisions(resolved.pose);
    expect(secondPass.resolvedCollisionCount).toBe(0);
  });

  it("applyFalsePerspectiveExaggeration 이 카메라에 가까운 팔을 확대하고 먼 부위를 압축한다", () => {
    const hunter = WEBTOON_ACTION_POSE_PRESETS[1].pose;
    const res = applyFalsePerspectiveExaggeration(hunter, { x: 0.7, y: 1.4, z: 2.0 }, 0.85);
    expect(res.nearLimbBoostRatio).toBeGreaterThan(1.1);
    expect(res.farLimbShrinkRatio).toBeLessThan(1.0);
    expect(res.focalJoint).toBe("rightHand");
  });

  it("DesignDoll 10손가락 컨트롤러가 좌·우 5손가락 독립 조절, 클램핑, 프리셋, 반대손 복사를 수행한다", () => {
    expect(FINGER_ORDER).toHaveLength(5);
    expect(HAND_GESTURE_PRESET_LIST).toHaveLength(6);

    const clamped = clampFingerPose("index", { mcpCurlDeg: 999, pipCurlDeg: -50, splayDeg: 90 });
    expect(clamped.mcpCurlDeg).toBe(95);
    expect(clamped.pipCurlDeg).toBe(0);
    expect(clamped.splayDeg).toBe(25);
    expect(clamped.oppositionDeg).toBe(0);

    let rig = createInitialTenFingerRig();
    rig = applyHandGesturePreset(rig, "right", "sword-grip");
    expect(readFingerCurlPercent("index", rig.right.index)).toBeGreaterThan(60);

    rig = updateFingerCurlPercent(rig, "left", "pinky", 100);
    expect(readFingerCurlPercent("pinky", rig.left.pinky)).toBe(100);
    expect(readFingerCurlPercent("pinky", rig.right.pinky)).not.toBe(100);

    const mirrored = mirrorHandPose(rig, "left");
    expect(mirrored.right.pinky.mcpCurlDeg).toBe(rig.left.pinky.mcpCurlDeg);
    expect(mirrored.right.thumb.splayDeg).toBe(-rig.left.thumb.splayDeg);
  });
});

describe("T-028 ~ T-034: SketchUp · Blender · VRoid 프로 연산", () => {
  it("SketchUp 동적 컴포넌트 개폐 각도·비율·색온도를 안전하게 클램핑 갱신한다", () => {
    const updated = updateDynamicStageComponents(INITIAL_DYNAMIC_STAGE_COMPONENTS, {
      doorOpenDeg: 180,
      windowOpenPercent: -15,
      curtainOpenPercent: 90,
      lampOn: false,
      lampKelvin: 10000,
    });
    expect(updated.doorOpenDeg).toBe(110);
    expect(updated.windowOpenPercent).toBe(0);
    expect(updated.curtainOpenPercent).toBe(90);
    expect(updated.lampOn).toBe(false);
    expect(updated.lampKelvin).toBe(6500);
  });

  it("4계절 × 4시간대 조명 프리셋이 여름 정오와 겨울 밤의 고도·색온도를 현실적으로 구분한다", () => {
    const summerNoon = resolveSeasonTimeAtmosphere("summer", "noon");
    const winterNight = resolveSeasonTimeAtmosphere("winter", "night");
    expect(summerNoon.sunElevationDeg).toBeGreaterThan(winterNight.sunElevationDeg);
    expect(summerNoon.ambientStrength).toBeGreaterThan(winterNight.ambientStrength);
    expect(winterNight.weatherParticleKo).toContain("눈송이");
  });

  it("SketchUp 추론 스냅이 끝점·중점·수선·축선·격자 우선순위로 정확히 흡착한다", () => {
    const targets = [{ id: "wall", start: { x: 0, y: 0, z: 2 }, end: { x: 4, y: 0, z: 2 } }];
    expect(computeInferenceSnap({ x: 0.05, y: 0, z: 2.02 }, targets).kind).toBe("endpoint");
    expect(computeInferenceSnap({ x: 2.04, y: 0, z: 2.01 }, targets).kind).toBe("midpoint");
    expect(computeInferenceSnap({ x: 1.0, y: 0, z: 2.08 }, targets).kind).toBe("perpendicular");
    expect(computeInferenceSnap({ x: 3.1, y: 1.0, z: 0.03 }, targets).kind).toBe("on-axis-x");
    expect(computeInferenceSnap({ x: 1.37, y: 1.12, z: 5.14 }, targets).kind).toBe("grid");
  });

  it("Blender 3D 공간 펜선이 양끝 필압 테이퍼와 총 길이를 생성한다", () => {
    const stroke = createGreasePencil3dStroke(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      { presetId: "aura-ribbon", baseWidthPx: 4 },
    );
    expect(stroke.points.length).toBe(7);
    expect(stroke.totalLengthMeters).toBeCloseTo(2 * Math.SQRT2, 2);
    expect(stroke.points[0].widthPx).toBeLessThan(stroke.points[3].widthPx);
    expect(stroke.points[6].widthPx).toBeLessThan(stroke.points[3].widthPx);
  });

  it("Geometry Nodes 절차적 분산 배치가 시드 결정성과 최소 간격 규칙을 지킨다", () => {
    const a = generateProceduralScatter({
      kind: "crowd-silhouettes",
      count: 14,
      areaWidthMeters: 10,
      areaDepthMeters: 10,
      minSpacingMeters: 1.0,
      seed: 42,
    });
    const b = generateProceduralScatter({
      kind: "crowd-silhouettes",
      count: 14,
      areaWidthMeters: 10,
      areaDepthMeters: 10,
      minSpacingMeters: 1.0,
      seed: 42,
    });
    expect(a).toEqual(b);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        const d = Math.hypot(a[i].position.x - a[j].position.x, a[i].position.z - a[j].position.z);
        expect(d).toBeGreaterThanOrEqual(0.99);
      }
    }
    const lamps = generateProceduralScatter({
      kind: "street-lamps",
      count: 6,
      areaWidthMeters: 6,
      areaDepthMeters: 12,
      minSpacingMeters: 2,
      seed: 1,
    });
    expect(lamps).toHaveLength(6);
    expect(Math.abs(lamps[0].position.x)).toBeCloseTo(2.7, 2);
  });

  it("비파괴 모디파이어 스택과 4족 탈것·무기 리깅 프리셋이 예산을 정확히 계산한다", () => {
    const baseEval = evaluateModifierStack(3000, DEFAULT_MODIFIER_STACK);
    expect(baseEval.withinMobileHeroBudget).toBe(true);

    const heavyStack = DEFAULT_MODIFIER_STACK.map((m) =>
      m.kind === "subsurf" ? { ...m, enabled: true, strength: 2 } : m,
    );
    const heavyEval = evaluateModifierStack(3000, heavyStack);
    expect(heavyEval.estimatedTriangles).toBeGreaterThan(50_000);
    expect(heavyEval.withinMobileHeroBudget).toBe(false);
    expect(QUADRUPED_AND_WEAPON_RIG_PRESETS.some((r) => r.category === "quadruped")).toBe(true);
    expect(QUADRUPED_AND_WEAPON_RIG_PRESETS.some((r) => r.category === "weapon")).toBe(true);
  });

  it("VRoid 바람 물리 베이크, 눈/피부/헤어 셰이더 랩, ARKit 52 표정, VRM 1.0 검증이 정확하다", () => {
    const calm = bakeClothHairWindPhysics({
      windSpeedMps: 0,
      windDirectionDeg: 0,
      stiffness: 0.5,
      drag: 0.3,
      frameCount: 16,
    });
    const windy = bakeClothHairWindPhysics({
      windSpeedMps: 12,
      windDirectionDeg: 0,
      stiffness: 0.5,
      drag: 0.3,
      frameCount: 16,
    });
    expect(calm).toHaveLength(16);
    expect(Math.abs(windy[15].hairSwayDeg)).toBeGreaterThan(Math.abs(calm[15].hairSwayDeg));

    const uniforms = compileVroidShaderLabUniforms({
      ...INITIAL_VROID_SHADER_LAB,
      eyeCatchlight: "heart",
    });
    expect(uniforms.uCatchlightMode).toBe(1);
    expect(uniforms.uHairSpecPower).toBeGreaterThan(20);

    expect(ARKIT_52_BLENDSHAPES).toHaveLength(52);
    expect(new Set(ARKIT_52_BLENDSHAPES).size).toBe(52);
    expect(WEBTOON_EXPRESSION_RECIPES).toHaveLength(6);

    const nextWeights = setBlendshapeWeight({}, "mouthSmileLeft", 1.5);
    expect(nextWeights.mouthSmileLeft).toBe(1);

    const okVrm = validateVrm1ExportSettings({
      title: "은발 황녀",
      author: "작가A",
      commercialUsageAllowed: true,
      bakeUnifiedScreenOutline: true,
      includeSpringBones: true,
      includeArkit52Expressions: true,
      targetMaxTriangles: 32000,
      currentTriangles: 20404,
    });
    expect(okVrm.ready).toBe(true);
    expect(okVrm.specVersion).toBe("VRM-1.0");

    const badVrm = validateVrm1ExportSettings({
      title: "A",
      author: "",
      commercialUsageAllowed: false,
      bakeUnifiedScreenOutline: false,
      includeSpringBones: false,
      includeArkit52Expressions: false,
      targetMaxTriangles: 10000,
      currentTriangles: 25000,
    });
    expect(badVrm.ready).toBe(false);
    expect(badVrm.issuesKo).toHaveLength(3);
  });

  it("createUnifiedInkContract 가 WebGL ↔ WebGPU 패리티 기본값과 lit 조명 모드를 일관 적용한다", () => {
    const litContract = createUnifiedInkContract("daily-warm-sun", {
      inkPx: 2.4,
      lightingMode: "lit",
    });
    expect(litContract.parity.outputColorSpace).toBe("srgb");
    expect(litContract.parity.toneMapping).toBe("NoToneMapping");
    expect(litContract.parity.toneMappingExposure).toBe(1.0);
    expect(litContract.parity.msaaSamples).toBe(4);
    expect(litContract.lightingMode).toBe("lit");
    expect(litContract.inkPx).toBe(2.4);

    const clamped = createUnifiedInkContract("rofan-pastel", { inkPx: 99 });
    expect(clamped.inkPx).toBe(4.0);
  });

  it("SketchUp 추론 스냅이 Z축·바닥 Y축 정렬을 감지하고 빈 스트로크를 안전 처리한다", () => {
    expect(computeInferenceSnap({ x: 0.02, y: 1.2, z: 3.4 }, []).kind).toBe("on-axis-z");
    expect(computeInferenceSnap({ x: 2.1, y: 0.01, z: 3.4 }, []).kind).toBe("on-axis-y");

    const single = createGreasePencil3dStroke([{ x: 0, y: 1, z: 0 }], {
      presetId: "ink-callout",
      baseWidthPx: 2,
    });
    expect(single.totalLengthMeters).toBe(0);
    expect(single.points).toHaveLength(1);
  });

  it("Studio3dWebtoonProPanel 아키타입 선택 변경 및 모디파이어 토글이 실시간 반영된다", () => {
    render(<Studio3dWebtoonProPanel />);

    const select = screen.getByRole("combobox", { name: "주인공 유형 선택" });
    fireEvent.change(select, { target: { value: "kwebtoon-srank-hunter" } });
    expect(screen.getByText(/추천 선 굵기 1\.9px/)).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "VRoid·Blender 프로" }));
    const subsurfBtn = screen.getByRole("button", { name: "곡면 부드럽게" });
    fireEvent.click(subsurfBtn);
    expect(screen.getByText(/활성 4단계/)).toBeDefined();
  });
});

describe("Studio3dWebtoonProPanel UI & BG3D 지연 마운트 통합", () => {
  it("4분할 쉬운 한국어 탭을 렌더링하고 내부 기술 용어를 노출하지 않는다", () => {
    const onApplyCelContract = vi.fn();
    const onPlaceHeroAsset = vi.fn();
    render(
      <Studio3dWebtoonProPanel
        onApplyCelContract={onApplyCelContract}
        onPlaceHeroAsset={onPlaceHeroAsset}
      />,
    );

    expect(screen.getByRole("tab", { name: "웹툰 셰이더·히어로 3D" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "동적 배경·SketchUp" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "포즈·손가락 물리" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "VRoid·Blender 프로" })).toBeDefined();

    // 초보자 UI에 내부 개발자 코드/용어 미노출 검증
    const text = screen.getByTestId("studio-3d-webtoon-pro-panel").textContent ?? "";
    expect(text).not.toMatch(/MToonNodeMaterial|ScreenCoordinates|Geometry Nodes|Grease Pencil|ARKit|Non-Manifold|GLTFLoader/u);

    fireEvent.click(screen.getByRole("button", { name: /장면에 선화·명암 통일 적용/ }));
    expect(onApplyCelContract).toHaveBeenCalledOnce();

    const placeButtons = screen.getAllByRole("button", { name: "장면에 배치" });
    expect(placeButtons).toHaveLength(4);
    fireEvent.click(placeButtons[0]);
    expect(onPlaceHeroAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rofan-imperial-arch-chandelier" }),
    );
  });

  it("동적 배경·포즈 손가락·VRoid/Blender 탭 전환과 인터랙션이 정상 동작한다", () => {
    render(<Studio3dWebtoonProPanel />);

    fireEvent.click(screen.getByRole("tab", { name: "동적 배경·SketchUp" }));
    fireEvent.click(screen.getByRole("button", { name: "겨울" }));
    fireEvent.click(screen.getByRole("button", { name: "밤" }));
    expect(screen.getByText(/겨울 · 밤/)).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "포즈·손가락 물리" }));
    fireEvent.click(screen.getByRole("button", { name: /무게중심 자동 균형/ }));
    expect(screen.getByRole("button", { name: /적용됨/ })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "왼손" }));
    fireEvent.click(screen.getByRole("button", { name: "주먹 쥐기" }));
    expect(screen.getByLabelText("왼손 검지 굽힘")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "VRoid·Blender 프로" }));
    fireEvent.click(screen.getByRole("button", { name: "헌터 각성" }));
    expect(screen.getByText(/표정 근육 52종 지원/)).toBeDefined();
  });

  it("StudioBg3dSceneAssistantWorkspace 에서 접이식 프로 랩을 열 때만 지연 마운트된다", async () => {
    const host: StudioBg3dSceneAssistantHost = {
      open: true,
      operation: "insert",
      primitives: [],
      customModels: [],
      sharedCharacterCaptureElementIds: [],
      selectedIds: new Set<string>(),
      setSelectedIds: vi.fn(),
      modelLibrary: [],
      genericModelClassifications: new Map(),
      transformMode: "translate",
      lineArtPreview: false,
      placementActive: false,
      placementSession: { phase: "idle" },
      addSceneTemplate: vi.fn(() => true),
      addCustomModelToScene: vi.fn().mockResolvedValue(true),
      addPrimitive: vi.fn(),
      applyCameraPreset: vi.fn(),
      zoomCameraBy: vi.fn(),
      setTransformMode: vi.fn(),
      setLineArtPreview: vi.fn(),
      updateLtToneSettings: vi.fn(),
      groundSelectedEntity: vi.fn(),
      focusSelectedEntity: vi.fn(),
      duplicateSelected: vi.fn(),
      deleteSelected: vi.fn(),
      handleSaveToLibrary: vi.fn(),
      handleInsert: vi.fn(),
      setActivePanelTab: vi.fn(),
      setModelsPanelActivated: vi.fn(),
      setViewEditorSection: vi.fn(),
      setLtEditorSection: vi.fn(),
    };

    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    expect(screen.queryByTestId("studio-3d-webtoon-pro-panel")).toBeNull();

    const summary = screen.getByText("한국 웹툰 3D 프로 랩");
    const details = summary.closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("studio-3d-webtoon-pro-panel")).toBeDefined(),
    );
  });
});

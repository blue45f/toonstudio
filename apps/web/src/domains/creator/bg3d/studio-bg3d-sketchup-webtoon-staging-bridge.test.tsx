// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { makeGeometry } from "../studio-background-3d-primitives";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import { StudioBg3dProSuiteRuntimeContext, type StudioBg3dProSuiteRuntimeValue } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dSketchUpWebtoonStagingSection } from "./StudioBg3dSketchUpWebtoonStagingSection";
import {
  buildDynamicComponentArticulatedPrimitives,
  buildSketchUpWebtoonSixPassLtRecipe,
  commitSketchUpDirectModelingToPrimitives,
  computeAbleAtmosphericPostProcessAndGreasePencilGuide,
  computeShadowPreservingRoomCutawayPlan,
  generateDynamicComponentActionShotSequence,
  panSketchUpTwoPointPerspectiveLockedCamera,
  resolveSketchUpStyleAndOutlinerPreset,
  resolveWebtoonSketchUpSolarRig,
} from "./studio-bg3d-sketchup-webtoon-staging-bridge";

describe("SketchUp 3D Background Webtoon Staging Bridge (REA Reverse-Engineered)", () => {
  beforeEach(() => useI18n.setState({ lang: "ko" }));
  afterEach(() => {
    cleanup();
    useI18n.setState({ lang: "ko" });
  });
  it("commits Push/Pull through-hole wall opening, Offset frame, Follow-Me molding, and *N array to BgPrimitive[]", () => {
    const res = commitSketchUpDirectModelingToPrimitives({
      wallWidthMeters: 3.6,
      wallHeightMeters: 2.8,
      wallThicknessMeters: 0.22,
      openingWidthMeters: 1.4,
      openingHeightMeters: 1.3,
      sillHeightMeters: 0.85,
      frameOffsetMeters: 0.06,
      includeCrownMolding: true,
      axisLock: "red-x",
      arrayInputToken: "*2",
      arraySpanMeters: 3.8,
    });

    expect(res.meshTriangleCount).toBeGreaterThan(0);
    expect(res.MoldingQuadCount).toBeGreaterThan(0);
    expect(res.primitives.length).toBe(18);
    expect(res.axisLockColorHex).toBe("#ef4444");
  });

  it.each([
    { axisLock: "red-x", frameOffsetMeters: 0.06 },
    { axisLock: "green-z", frameOffsetMeters: 0.06 },
    { axisLock: "red-x", frameOffsetMeters: 0 },
    { axisLock: "green-z", frameOffsetMeters: -0.2 },
  ] as const)("$axisLock 배열의 모든 창문에서 광선은 개구부를 통과하고 벽체·창틀에는 닿는다 (offset=$frameOffsetMeters)", ({ axisLock, frameOffsetMeters }) => {
    const result = commitSketchUpDirectModelingToPrimitives({
      wallWidthMeters: 3.6,
      wallHeightMeters: 2.8,
      wallThicknessMeters: 0.22,
      openingWidthMeters: 1.4,
      openingHeightMeters: 1.3,
      sillHeightMeters: 0.85,
      frameOffsetMeters,
      includeCrownMolding: true,
      axisLock,
      arrayInputToken: "*3",
      arraySpanMeters: 3.8,
    });
    const material = new THREE.MeshBasicMaterial();
    const meshes = result.primitives.map((primitive) => {
      const mesh = new THREE.Mesh(makeGeometry(primitive.kind), material);
      mesh.name = primitive.id;
      mesh.position.set(...primitive.position);
      mesh.rotation.set(...primitive.rotation);
      mesh.scale.set(...primitive.scale);
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    const raycaster = new THREE.Raycaster();
    const hits = (x: number, y: number, z: number, direction: number) => {
      raycaster.set(new THREE.Vector3(x, y, z + direction), new THREE.Vector3(0, 0, -direction));
      raycaster.far = 2;
      return raycaster.intersectObjects(meshes, false);
    };
    try {
      expect(result.primitives).toHaveLength(27);
      const thickness = Math.max(0.03, frameOffsetMeters);
      for (const placement of [0, 3.8, 7.6]) {
        const x = axisLock === "red-x" ? placement : 0;
        const z = axisLock === "green-z" ? placement : 0;
        for (const direction of [-1, 1]) {
          for (const [innerX, innerY] of [[0, 1.5], [-0.65, 0.9], [0.65, 0.9], [-0.65, 2.1], [0.65, 2.1]] as const) {
            expect(hits(x + innerX, innerY, z, direction)).toHaveLength(0);
          }
          expect(hits(x - 1, 1.5, z, direction).length).toBeGreaterThan(0);
          expect(hits(x + 1, 1.5, z, direction).length).toBeGreaterThan(0);
          for (const [frameX, frameY] of [[-0.7 - thickness / 2, 1.5], [0.7 + thickness / 2, 1.5], [0, 0.85 - thickness / 2], [0, 2.15 + thickness / 2]] as const) {
            expect(hits(x + frameX, frameY, z, direction).some((hit) => hit.object.name.startsWith("skp-dm-offset-frame-") && hit.object.position.z === z)).toBe(true);
          }
        }
        const frames = result.primitives.filter((primitive) => primitive.id.startsWith("skp-dm-offset-frame-") && primitive.position[2] === z && Math.abs(primitive.position[0] - x) < 0.8);
        expect(frames).toHaveLength(4);
        expect(frames.every((frame) => Math.min(frame.scale[0], frame.scale[1]) === thickness)).toBe(true);
      }
    } finally {
      for (const mesh of meshes) mesh.geometry.dispose();
      material.dispose();
    }
  });

  it("locks camera pitch horizontal in Two-Point Perspective while panning vertical lensShiftY", () => {
    const panned = panSketchUpTwoPointPerspectiveLockedCamera(
      {
        position: [3.2, 1.65, 4.8],
        target: [0, 0.9, 0],
        up: [0, 1, 0],
        fovDegrees: 38,
        projection: "perspective",
        lensShift: [0, 0],
      },
      0.05,
      0.18,
    );

    expect(panned.target[1]).toBe(1.65);
    expect(panned.lensShift).toEqual([0.05, 0.18]);
  });

  it("hides camera-facing walls and ceiling while preserving exterior shadow casters", () => {
    const plan = computeShadowPreservingRoomCutawayPlan({
      cameraPosition: [3.8, 2.5, 5.2],
      roomCenter: [0, 1.5, 0],
      roomSize: [6, 3, 6],
      preserveExteriorShadows: true,
    });

    expect(plan.hiddenFromCameraWalls).toContain("south");
    expect(plan.hiddenFromCameraWalls).toContain("east");
    expect(plan.hiddenFromCameraWalls).toContain("ceiling");
    expect(plan.preservedShadowCasters).toEqual(plan.hiddenFromCameraWalls);
  });

  it("resolves Webtoon SketchUp solar shadow rig presets and style/outliner tag sets", () => {
    const solar = resolveWebtoonSketchUpSolarRig({
      presetId: "golden-hour-sunset",
      overrideShadowSoftness: 0.6,
    });
    expect(solar.solar.isDaytime).toBe(true);
    expect(solar.shadowSoftness).toBe(0.6);

    const styleOutliner = resolveSketchUpStyleAndOutlinerPreset(
      "hidden-line",
      "interior-clean-line",
    );
    expect(styleOutliner.resolvedStyle.line.enabled).toBe(true);
    expect(styleOutliner.tagPreset.hiddenTags).toContain("clutter-props");
  });

  it("articulates Dynamic Components and generates 3-cut door opening action sequences", () => {
    const prims = buildDynamicComponentArticulatedPrimitives({
      doorSwingAngleDeg: 90,
      windowSlideOffsetMeters: 0.5,
      drawerPullOffsetMeters: 0.3,
      ceilingLightSwitchOn: true,
    });
    expect(prims).toHaveLength(4);
    expect(prims[0]?.rotation[1]).toBe(-Math.PI / 2);

    const shots = generateDynamicComponentActionShotSequence({
      tabId: "cut-door",
      labelKo: "문 열기",
      camera: {
        position: [2, 1.6, 4],
        target: [0, 1.6, 0],
        up: [0, 1, 0],
        fovDegrees: 40,
        projection: "perspective",
      },
      twoPointPerspectiveLocked: true,
      solarPresetId: "noon-clear",
      stylePresetId: "shaded-with-textures",
      tagPresetId: "interior-clean-line",
      preserveExteriorShadowsOnCutaway: true,
      dynamicComponents: {
        doorSwingAngleDeg: 0,
        windowSlideOffsetMeters: 0.4,
        drawerPullOffsetMeters: 0.2,
        ceilingLightSwitchOn: true,
      },
    });
    expect(shots).toHaveLength(3);
    expect(shots.map((s) => s.dynamicComponents.doorSwingAngleDeg)).toEqual([0, 45, 110]);
  });

  it.each([0, 45, 90, 180])("문 %d°의 실제 변환은 경첩을 고정하고 자유 끝점을 원호 위에 둔다", (angleDegrees) => {
    const primitives = buildDynamicComponentArticulatedPrimitives({
      doorSwingAngleDeg: angleDegrees,
      windowSlideOffsetMeters: 0,
      drawerPullOffsetMeters: 0,
      ceilingLightSwitchOn: false,
    });
    const door = primitives.find((primitive) => primitive.id === "skp-dc-door-leaf");
    if (!door) throw new Error("생성한 문 도형이 필요합니다.");
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...door.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...door.rotation)),
      new THREE.Vector3(...door.scale),
    );
    const hinge = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(transform);
    const freeEnd = new THREE.Vector3(0.5, 0, 0).applyMatrix4(transform);
    const angleRadians = THREE.MathUtils.degToRad(angleDegrees);
    expect(hinge.distanceTo(new THREE.Vector3(-0.45, 1.05, 0))).toBeLessThan(0.001);
    expect(freeEnd.distanceTo(new THREE.Vector3(-0.45 + 0.9 * Math.cos(angleRadians), 1.05, 0.9 * Math.sin(angleRadians)))).toBeLessThan(0.001);
    expect(hinge.distanceTo(freeEnd)).toBeCloseTo(0.9, 6);
  });

  it("builds a non-exclusive 6-pass Webtoon LT layer stack recipe (color + tone + shadow + depth + lines)", () => {
    const recipe = buildSketchUpWebtoonSixPassLtRecipe();
    expect(recipe.map((r) => r.role)).toEqual([
      "color",
      "tone",
      "shadow",
      "depth",
      "texture-line",
      "main-line",
    ]);
  });

  it("renders StudioBg3dSketchUpWebtoonStagingSection and dispatches primitive/camera callbacks", () => {
    const onInsert = vi.fn(() => true);
    const onCamera = vi.fn();
    const onStatus = vi.fn();

    render(
      <StudioBg3dSketchUpWebtoonStagingSection
        onInsertScenePrimitives={onInsert}
        onApplySceneCamera={onCamera}
        onStatusChange={onStatus}
      />,
    );

    fireEvent.click(screen.getByTestId("sketchup-direct-modeling-commit-btn"));
    expect(onInsert).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(onCamera).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketchup-dc-spawn-btn"));
    expect(onInsert).toHaveBeenCalledTimes(2);

    expect(screen.getByTestId("sketchup-role-lens-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sketchup-role-lens-background-assist"));
    expect(screen.getByLabelText("SketchUp 스타일 프리셋")).toHaveProperty("value", "skp-hidden-line-webtoon");
    expect(screen.getByLabelText("Outliner 태그 가시성 프리셋")).toHaveProperty("value", "hide-small-props");
    expect(onInsert).toHaveBeenCalledTimes(2);
    expect(onCamera).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("sketchup-role-lens-storyboard-camera"));
    expect(screen.getByTestId("sketchup-role-lens-storyboard-camera").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(onCamera).toHaveBeenLastCalledWith(expect.objectContaining({ lensShift: [0, 0.15] }), expect.any(String));
    fireEvent.click(screen.getByTestId("sketchup-role-lens-color-lighting"));
    expect(screen.getByTestId("sketchup-solar-preset-select")).toHaveProperty("value", "blue-hour-dusk");
    expect(screen.getByLabelText("그림자 소프트니스")).toHaveProperty("value", "0.7");
  });

  it("장면 삽입이 거절되면 완료 상태를 표시하지 않는다", () => {
    const insert = vi.fn(() => false);
    const status = vi.fn();
    render(<StudioBg3dSketchUpWebtoonStagingSection onInsertScenePrimitives={insert} onStatusChange={status} />);
    fireEvent.click(screen.getByTestId("sketchup-direct-modeling-commit-btn"));
    fireEvent.click(screen.getByTestId("sketchup-dc-spawn-btn"));
    expect(insert).toHaveBeenCalledTimes(2);
    expect(status.mock.calls.map(([message]) => message)).toEqual([
      "현재 장면에 배치하지 못했습니다. 장면 잠금과 삽입 가능 상태를 확인해 주세요.",
      "현재 장면에 배치하지 못했습니다. 장면 잠금과 삽입 가능 상태를 확인해 주세요.",
    ]);
  });

  it("비활성 상태에서는 프리셋과 명시적 장면 명령을 실행하지 않는다", () => {
    const insert = vi.fn(() => true);
    const camera = vi.fn();
    render(<StudioBg3dSketchUpWebtoonStagingSection disabled onInsertScenePrimitives={insert} onApplySceneCamera={camera} />);
    fireEvent.click(screen.getByTestId("sketchup-role-lens-background-assist"));
    expect(screen.getByLabelText("SketchUp 스타일 프리셋")).toHaveProperty("value", "skp-shaded-with-textures");
    fireEvent.click(screen.getByTestId("sketchup-direct-modeling-commit-btn"));
    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(insert).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
  });

  it("영어 모드에서 새 프리셋의 적용 범위를 영어로 안내한다", () => {
    useI18n.setState({ lang: "en" });
    render(<StudioBg3dSketchUpWebtoonStagingSection />);
    expect(screen.getByText("Role-based style, tag, and camera setting presets")).toBeTruthy();
    expect(screen.getByText(/They do not change editing permissions/)).toBeTruthy();
    expect(screen.getByTestId("sketchup-direct-modeling-commit-btn")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("sketchup-lt-recipe-scope").textContent).toContain("Use Add Background to save them to the manuscript");
    expect(screen.queryByText(/REA Verified|1-Click/)).toBeNull();
  });

  it("계산·레시피 설정 변경은 장면 명령을 실행하지 않고 미적용 범위를 표시한다", () => {
    const insert = vi.fn(() => true);
    const camera = vi.fn();
    render(<StudioBg3dSketchUpWebtoonStagingSection onInsertScenePrimitives={insert} onApplySceneCamera={camera} />);
    fireEvent.change(screen.getByTestId("sketchup-solar-preset-select"), { target: { value: "blue-hour-dusk" } });
    fireEvent.change(screen.getByLabelText("SketchUp 스타일 프리셋"), { target: { value: "skp-hidden-line-webtoon" } });
    fireEvent.change(screen.getByTestId("sketchup-outliner-tag-preset-select"), { target: { value: "hide-small-props" } });
    expect(insert).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
    expect(screen.getByTestId("sketchup-staging-scope-notice").textContent).toContain("장면이나 원고에 적용·저장되지 않습니다");
    expect(screen.getByTestId("sketchup-lt-apply-btn")).toHaveProperty("disabled", true);
    expect(screen.getAllByTestId(/^sketchup-lt-pass-chip-/)).toHaveLength(6);
  });

  it("6패스 출력은 기존 문서 명령으로만 적용·해제하고 미지원 렌더러에서는 적용하지 않는다", () => {
    const apply = vi.fn(() => true);
    const runtime: StudioBg3dProSuiteRuntimeValue = {
      disabled: false, baseCamera: createDefaultStudioBg3dSceneDocument().camera, productionShots: [],
      onApplyCameraView: vi.fn(), onCaptureCurrentShot: vi.fn(), onApplyProductionShot: vi.fn(),
      onMoveProductionShot: vi.fn(), onRemoveProductionShot: vi.fn(), onUseCurrentFrameAsAiReference: undefined,
      aiReferenceBusy: false, aiReferenceDisabled: false, onSetSixPassLt: apply,
    };
    const draw = (value: StudioBg3dProSuiteRuntimeValue) => <StudioBg3dProSuiteRuntimeContext.Provider value={value}><StudioBg3dSketchUpWebtoonStagingSection /></StudioBg3dProSuiteRuntimeContext.Provider>;
    const view = render(draw(runtime));
    fireEvent.click(screen.getByTestId("sketchup-lt-apply-btn"));
    expect(apply).toHaveBeenCalledWith(DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS);
    view.rerender(draw({ ...runtime, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS }));
    expect(screen.getByTestId("sketchup-lt-apply-btn").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("sketchup-lt-apply-btn"));
    expect(apply).toHaveBeenLastCalledWith(null);
    view.rerender(draw({ ...runtime, sixPassLtUnavailableReason: "이 렌더러는 지원하지 않습니다." }));
    expect(screen.getByTestId("sketchup-lt-apply-btn")).toHaveProperty("disabled", true);
  });

  it("computes ABLE atmospheric depth fog, AO crease intensity, and Blender Grease Pencil 2D-in-3D planes", () => {
    const guide = computeAbleAtmosphericPostProcessAndGreasePencilGuide("golden-hour-sunset", {
      position: [0, 1.65, 4.0],
      target: [0, 1.65, 0],
      up: [0, 1, 0],
      fovDegrees: 38,
      projection: "perspective",
    });
    expect(guide.fogTintHex).toBe("#fed7aa");
    expect(guide.aoCreaseIntensity).toBe(0.58);
    expect(guide.greasePencilPlanesMeters.midgroundActorPlane).toBe(4);
    render(<StudioBg3dSketchUpWebtoonStagingSection />);
    expect(screen.getByTestId("sketchup-able-grease-pencil-summary").textContent).toContain("ABLE 대기원근");
  });
});

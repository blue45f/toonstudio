import { describe, expect, it } from "vitest";

import {
  buildLivingPanelPreset,
  compileDirectorTimeline,
  evaluateCameraRigAt,
  evaluateDirectorAtTime,
  evaluateTrajectorySpline,
  sampleMotionBrushField,
  type DirectorTimelineDocument,
  type LivingPanelPresetConfig,
  type LivingPanelPresetId,
  type MotionBrushZoneKind,
  type MotionTrajectorySpline,
} from "./studio-motion-trajectory-director";

describe("studio-motion-trajectory-director", () => {
  it("호길이 보정 2D 궤적 스플라인이 등속 진행과 접선 방향 각도를 계산한다", () => {
    const spline: MotionTrajectorySpline = {
      id: "sp-arrow",
      targetLayerId: "layer-sword",
      controlPoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      startTimeRatio: 0,
      endTimeRatio: 1,
      easing: "linear",
      orientToPath: true,
    };

    const start = evaluateTrajectorySpline(spline, 0);
    const mid = evaluateTrajectorySpline(spline, 0.5);
    const end = evaluateTrajectorySpline(spline, 1);

    expect(start.x).toBeCloseTo(0, 2);
    expect(mid.x).toBeCloseTo(100, 1);
    expect(end.x).toBeCloseTo(200, 2);
    expect(mid.headingDeg).toBeCloseTo(0, 1);
    expect(mid.active).toBe(true);
  });

  it("3D 카메라 리그 키프레임 보간이 초점거리·조리개·피사계 심도와 2.5D 패럴랙스를 산출한다", () => {
    const rig = {
      keyframes: [
        {
          timeRatio: 0,
          position: { x: -1, y: 0, z: 6 },
          target: { x: 0, y: 0, z: 0 },
          focalLengthMm: 24,
          apertureFStop: 8,
          rollDeg: -2,
        },
        {
          timeRatio: 1,
          position: { x: 1, y: 0.5, z: 4 },
          target: { x: 0, y: 0, z: 0 },
          focalLengthMm: 85,
          apertureFStop: 1.8,
          rollDeg: 2,
        },
      ],
    };

    const startCam = evaluateCameraRigAt(rig, 0);
    const midCam = evaluateCameraRigAt(rig, 0.5);
    const endCam = evaluateCameraRigAt(rig, 1);

    expect(startCam.focalLengthMm).toBe(24);
    expect(midCam.focalLengthMm).toBeCloseTo(54.5, 1);
    // 85mm f/1.8 끝점이 24mm f/8 시작점보다 피사계 심도 블러가 강해야 한다.
    expect(endCam.dofBlurStrength01).toBeGreaterThan(startCam.dofBlurStrength01);
    expect(startCam.parallaxShift2d.x).toBeLessThan(0);
    expect(endCam.parallaxShift2d.x).toBeGreaterThan(0);
  });

  it("모션 브러시 벡터 필드가 영역 내부에서는 감쇠·난류를 적용하고 외부에서는 0을 반환한다", () => {
    const preset = buildLivingPanelPreset("hair-breeze");
    const insideCenter = sampleMotionBrushField(preset.motionBrushes, 0.5, 0.32, 1.2, 42);
    const insideEdge = sampleMotionBrushField(preset.motionBrushes, 0.72, 0.32, 1.2, 42);
    const outside = sampleMotionBrushField(preset.motionBrushes, 0.05, 0.05, 1.2, 42);

    expect(insideCenter.combinedWeight).toBeGreaterThan(insideEdge.combinedWeight);
    expect(insideCenter.vx).toBeGreaterThan(0);
    expect(outside.combinedWeight).toBe(0);
    expect(outside.vx).toBe(0);
    expect(outside.vy).toBe(0);
  });

  it("씬-샷 계층 타임라인을 컴파일하고 임의 시점 프레임을 결정적으로 평가한다", () => {
    const living = buildLivingPanelPreset("parallax-dolly-in");
    const doc: DirectorTimelineDocument = {
      id: "dir-ep01-trailer",
      title: "1화 숏폼 예고편",
      fps: 24,
      aspectRatio: "9:16",
      deterministicSeed: 9001,
      scenes: [
        {
          id: "scene-1",
          title: "옥상 대치",
          shots: [
            {
              id: "shot-1",
              sceneId: "scene-1",
              label: "도입 패럴랙스",
              durationMs: 2000,
              startAnchor: { assetRef: "cut-01-a", focusPoint: { x: 0.5, y: 0.4 }, exposureEv: 0 },
              endAnchor: { assetRef: "cut-01-b", focusPoint: { x: 0.5, y: 0.35 }, exposureEv: 0.2 },
              cameraRig: living.cameraRig,
              trajectories: [
                {
                  id: "tr-scarf",
                  targetLayerId: "layer-scarf",
                  controlPoints: [
                    { x: 0.2, y: 0.5 },
                    { x: 0.5, y: 0.45 },
                    { x: 0.8, y: 0.5 },
                  ],
                  startTimeRatio: 0.2,
                  endTimeRatio: 0.8,
                  easing: "ease-in-out",
                  orientToPath: true,
                },
              ],
              motionBrushes: living.motionBrushes,
              livingPreset: "parallax-dolly-in",
            },
            {
              id: "shot-2",
              sceneId: "scene-1",
              label: "클로즈업 마무리",
              durationMs: 1500,
              startAnchor: { assetRef: "cut-02-a", focusPoint: { x: 0.5, y: 0.5 }, exposureEv: 0 },
              endAnchor: { assetRef: "cut-02-a", focusPoint: { x: 0.5, y: 0.5 }, exposureEv: 0 },
              cameraRig: buildLivingPanelPreset("subtle-breath").cameraRig,
              trajectories: [],
              motionBrushes: [],
            },
          ],
        },
      ],
    };

    const compiled = compileDirectorTimeline(doc);
    expect(compiled.ok).toBe(true);
    expect(compiled.totalDurationMs).toBe(3500);
    expect(compiled.totalFrames).toBe(84);
    expect(compiled.spans).toHaveLength(2);

    const frameAt1000 = evaluateDirectorAtTime(doc, 1000);
    expect(frameAt1000?.shotId).toBe("shot-1");
    expect(frameAt1000?.localProgress01).toBeCloseTo(0.5, 4);
    expect(frameAt1000?.trajectories[0]?.active).toBe(true);

    const frameAt2750 = evaluateDirectorAtTime(doc, 2750);
    expect(frameAt2750?.shotId).toBe("shot-2");
    expect(frameAt2750?.localProgress01).toBeCloseTo(0.5, 4);
  });

  it("모든 리빙 패널 프리셋이 유효한 MotionBrushZoneKind와 동결된 구성을 반환한다", () => {
    const cases: readonly { id: LivingPanelPresetId; expectedZones: readonly MotionBrushZoneKind[] }[] = [
      { id: "subtle-breath", expectedZones: ["cloth"] },
      { id: "hair-breeze", expectedZones: ["hair", "cloth"] },
      { id: "parallax-dolly-in", expectedZones: [] },
      { id: "rain-drift", expectedZones: ["particles"] },
      { id: "eye-blink", expectedZones: ["custom"] },
    ];

    for (const entry of cases) {
      const config: LivingPanelPresetConfig = buildLivingPanelPreset(entry.id);
      expect(Object.isFrozen(config)).toBe(true);
      expect(config.cameraRig.keyframes.length).toBeGreaterThanOrEqual(2);
      expect(config.motionBrushes.map((brush) => brush.zone)).toEqual(entry.expectedZones);
      expect(config.descriptionKo.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  bakePendulumPhysicsToTimeline,
  buildAutoArtMeshFromPolygon,
  createGridArtMesh,
  createPendulumChainState,
  createWarpDeformer,
  evaluateMeshRigPose,
  stepPendulumChain,
  validateDeformerHierarchy,
  type MeshRigDocument,
  type PendulumChainSpec,
} from "./motion-webtoon-2d-mesh-rig-engine";

describe("motion-webtoon-2d-mesh-rig-engine", () => {
  it("윤곽 폴리곤에서 Bowyer-Watson 삼각화로 유효한 Auto ArtMesh(UV·삼각형)를 생성한다", () => {
    const contour = [
      { x: 20, y: 20 },
      { x: 180, y: 20 },
      { x: 180, y: 180 },
      { x: 100, y: 140 },
      { x: 20, y: 180 },
    ];
    const mesh = buildAutoArtMeshFromPolygon({
      id: "hair-front",
      contour,
      textureWidth: 200,
      textureHeight: 200,
      interiorGridStepPx: 50,
    });

    expect(mesh.vertices.length).toBeGreaterThan(contour.length);
    expect(mesh.triangles.length).toBeGreaterThanOrEqual(4);
    for (const v of mesh.vertices) {
      expect(v.u).toBeGreaterThanOrEqual(0);
      expect(v.u).toBeLessThanOrEqual(1);
      expect(v.v).toBeGreaterThanOrEqual(0);
      expect(v.v).toBeLessThanOrEqual(1);
    }
    for (const [a, b, c] of mesh.triangles) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(mesh.vertices.length);
      expect(c).toBeLessThan(mesh.vertices.length);
    }
  });

  it("Warp + Rotation 중첩 디포머, 2D 키폼 그리드, 가산형 Blend Shape, Glue 이음매 용접을 정확히 평가한다", () => {
    const warp = createWarpDeformer({
      id: "warp-head",
      parentId: "rot-neck",
      originX: 0,
      originY: 0,
      width: 100,
      height: 100,
      cols: 1,
      rows: 1,
    });
    const meshLeft = createGridArtMesh({
      id: "mesh-left",
      parentDeformerId: "warp-head",
      originX: 0,
      originY: 0,
      width: 50,
      height: 50,
      cols: 1,
      rows: 1,
      drawOrder: 1,
    });
    const meshRight = createGridArtMesh({
      id: "mesh-right",
      parentDeformerId: "warp-head",
      originX: 54,
      originY: 0,
      width: 46,
      height: 50,
      cols: 1,
      rows: 1,
      drawOrder: 2,
    });

    const doc: MeshRigDocument = {
      id: "hero-rig",
      parameters: [
        { id: "ParamAngleX", name: "고개 좌우", min: -30, defaultValue: 0, max: 30 },
        { id: "ParamAngleY", name: "고개 상하", min: -30, defaultValue: 0, max: 30 },
        { id: "ParamSmile", name: "미소 가산", min: 0, defaultValue: 0, max: 1 },
      ],
      deformers: [
        {
          kind: "rotation",
          id: "rot-neck",
          name: "목 회전",
          parentId: null,
          pivotX: 50,
          pivotY: 100,
          tx: 0,
          ty: 0,
          angleDeg: 0,
          scaleX: 1,
          scaleY: 1,
        },
        warp,
      ],
      meshes: [meshLeft, meshRight],
      glues: [
        {
          id: "seam-center",
          meshAId: "mesh-left",
          meshBId: "mesh-right",
          intensity: 1,
          pairs: [
            { vertexIndexA: 1, vertexIndexB: 0, weightA: 0.5 },
            { vertexIndexA: 3, vertexIndexB: 2, weightA: 0.5 },
          ],
        },
      ],
      keyformBindings: [
        {
          kind: "grid-2d",
          id: "head-xy",
          paramXId: "ParamAngleX",
          paramYId: "ParamAngleY",
          keysX: [-30, 30],
          keysY: [-30, 30],
          payloads: [
            { rotationDeltas: { "rot-neck": { tx: -10, ty: -6 } } },
            { rotationDeltas: { "rot-neck": { tx: 10, ty: -6 } } },
            { rotationDeltas: { "rot-neck": { tx: -10, ty: 6 } } },
            { rotationDeltas: { "rot-neck": { tx: 10, ty: 6 } } },
          ],
        },
      ],
      additiveBlendShapes: [
        {
          id: "smile-lift",
          name: "입꼬리 상승",
          paramId: "ParamSmile",
          weightScale: 1,
          payload: {
            meshVertexDeltas: {
              "mesh-left": [
                { x: 0, y: -4 },
                { x: 0, y: -4 },
                { x: 0, y: -4 },
                { x: 0, y: -4 },
              ],
            },
          },
        },
      ],
    };

    expect(validateDeformerHierarchy(doc.deformers)).toHaveLength(0);

    const neutral = evaluateMeshRigPose(doc, { ParamAngleX: 0, ParamAngleY: 0, ParamSmile: 0 });
    expect(neutral.maxGlueResidualPx).toBeLessThan(1e-5);
    const neutralRightV0 = neutral.meshes[1]?.vertices[0];
    expect(neutralRightV0?.x).toBeCloseTo(52, 4);

    const posed = evaluateMeshRigPose(doc, { ParamAngleX: 15, ParamAngleY: 30, ParamSmile: 1 });
    // 2D 그리드 보간: tx = lerp(-10, 10, 0.75) = 5, ty = 6; 가산형 Smile로 mesh-left y -4
    const leftV0 = posed.meshes[0]?.vertices[0];
    expect(leftV0?.x).toBeCloseTo(5, 4);
    expect(leftV0?.y).toBeCloseTo(2, 4);
    // 극단 변형 뒤에도 Glue 용접 틈새는 0에 수렴해야 한다.
    expect(posed.maxGlueResidualPx).toBeLessThan(1e-5);
  });

  it("디포머 계층의 순환 참조를 탐지한다", () => {
    const errors = validateDeformerHierarchy([
      {
        kind: "rotation",
        id: "a",
        name: "A",
        parentId: "b",
        pivotX: 0,
        pivotY: 0,
        tx: 0,
        ty: 0,
        angleDeg: 0,
        scaleX: 1,
        scaleY: 1,
      },
      {
        kind: "rotation",
        id: "b",
        name: "B",
        parentId: "a",
        pivotX: 0,
        pivotY: 0,
        tx: 0,
        ty: 0,
        angleDeg: 0,
        scaleX: 1,
        scaleY: 1,
      },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toContain("순환");
  });

  it("다단 2차 진자 물리가 외력에 반응해 흔들리고 감쇠 수렴하며 결정론적 타임라인으로 베이크된다", () => {
    const hairChain: PendulumChainSpec = {
      id: "hair-side",
      outputParamId: "ParamHairSway",
      outputScale: 1.5,
      segments: [
        { length: 0.4, mass: 1, stiffness: 12, damping: 3.2, gravityScale: 1, maxAngleDeg: 55 },
        { length: 0.35, mass: 0.8, stiffness: 8, damping: 2.8, gravityScale: 1, maxAngleDeg: 65 },
      ],
    };

    let state = createPendulumChainState(hairChain);
    let peakOutput = 0;
    for (let i = 0; i < 14; i += 1) {
      state = stepPendulumChain(hairChain, state, { accelX: 14, accelY: 0 }, 1 / 60);
      peakOutput = Math.max(peakOutput, Math.abs(state.outputValue));
    }
    expect(peakOutput).toBeGreaterThan(0.2);

    // 외력 제거 후 4초(240프레임) 감쇠 수렴 확인
    for (let i = 0; i < 240; i += 1) {
      state = stepPendulumChain(hairChain, state, { accelX: 0, accelY: 0 }, 1 / 60);
    }
    expect(Math.abs(state.outputValue)).toBeLessThan(peakOutput * 0.15);

    const bakedA = bakePendulumPhysicsToTimeline({
      chains: [hairChain],
      fps: 24,
      frameCount: 24,
      sampleForceAtTime: (t) => ({ accelX: t < 0.25 ? 10 : 0, accelY: 0 }),
    });
    const bakedB = bakePendulumPhysicsToTimeline({
      chains: [hairChain],
      fps: 24,
      frameCount: 24,
      sampleForceAtTime: (t) => ({ accelX: t < 0.25 ? 10 : 0, accelY: 0 }),
    });
    expect(bakedA.frames).toHaveLength(24);
    expect(bakedA.previewMotionKeyframes).toHaveLength(24);
    expect(bakedA.frames).toEqual(bakedB.frames);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSurfaceBoundStrokeControls } from "./StudioSurfaceBoundStrokeControls";
import {
  DEFAULT_SURFACE_BOUND_STROKE_CONFIG,
  bindPointToMeshSurface,
  buildCameraFacingStrokeRibbon,
  evaluateSurfaceBoundAnchors,
  mirrorSurfaceBoundStrokeAcrossX,
  type SurfaceBoundStroke,
  type SurfaceBoundStrokeAnchor,
  type SurfaceBoundStrokeMeshBuffer,
} from "./studio-surface-bound-stroke-engine";

afterEach(() => {
  cleanup();
});

function createSymmetricQuadMesh(): SurfaceBoundStrokeMeshBuffer {
  // 왼쪽(-X)과 오른쪽(+X) 두 사각형 패치(총 4삼각형)
  const positions = new Float32Array([
    -1, 0, 0, // 0
    0, 0, 0,  // 1
    0, 1, 0,  // 2
    -1, 1, 0, // 3
    1, 0, 0,  // 4
    1, 1, 0,  // 5
  ]);
  const indices = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
    1, 4, 5,
    1, 5, 2,
  ]);
  return { meshId: "face-mesh", positions, indices };
}

describe("studio-surface-bound-stroke-engine", () => {
  it("binds barycentric anchors and tracks skinned mesh deformation exactly", () => {
    const restMesh = createSymmetricQuadMesh();
    const anchor = bindPointToMeshSurface(restMesh, [-0.25, 0.25, 0], {
      normalOffsetMm: 2,
      widthMm: 3,
      pressure: 1,
    });
    expect(anchor).not.toBeNull();
    const [u, v, w] = anchor!.barycentric;
    expect(u + v + w).toBeCloseTo(1, 6);

    // 포즈 변형: 전체 메시를 (+0.5, +0.2, +0.1) 평행 이동하고 +Z 법선 유지
    const deformedPositions = new Float32Array(restMesh.positions.length);
    for (let i = 0; i < restMesh.positions.length; i += 3) {
      deformedPositions[i] = restMesh.positions[i] + 0.5;
      deformedPositions[i + 1] = restMesh.positions[i + 1] + 0.2;
      deformedPositions[i + 2] = restMesh.positions[i + 2] + 0.1;
    }
    const evaluated = evaluateSurfaceBoundAnchors(
      [anchor!],
      { ...restMesh, positions: deformedPositions },
    );

    expect(evaluated.positions[0]).toBeCloseTo(0.25, 5);
    expect(evaluated.positions[1]).toBeCloseTo(0.45, 5);
    // z = 0.1 + normal(+1) * 0.002m = 0.102
    expect(evaluated.positions[2]).toBeCloseTo(0.102, 5);
  });

  it("mirrors a stroke across X=0 onto the symmetric opposite triangles", () => {
    const mesh = createSymmetricQuadMesh();
    const a0 = bindPointToMeshSurface(mesh, [-0.6, 0.2, 0])!;
    const a1 = bindPointToMeshSurface(mesh, [-0.4, 0.7, 0])!;
    const stroke: SurfaceBoundStroke = {
      id: "cheek-line",
      meshId: mesh.meshId,
      labelKo: "볼 홍조 선",
      mirrorX: true,
      colorToken: "ink-primary",
      opacity: 1,
      anchors: [a0, a1],
    };

    const mirrored = mirrorSurfaceBoundStrokeAcrossX(stroke, mesh);
    expect(mirrored.anchors).toHaveLength(2);
    const evaluated = evaluateSurfaceBoundAnchors(mirrored.anchors, mesh);
    expect(evaluated.positions[0]).toBeCloseTo(0.6, 4);
    expect(evaluated.positions[1]).toBeCloseTo(0.2, 4);
    expect(evaluated.positions[3]).toBeCloseTo(0.4, 4);
    expect(evaluated.positions[4]).toBeCloseTo(0.7, 4);
  });

  it("builds a 5,000-segment camera-facing ribbon within fast interactive frame budgets", () => {
    const mesh = createSymmetricQuadMesh();
    const segmentCount = 5000;
    const anchors: SurfaceBoundStrokeAnchor[] = [];
    for (let i = 0; i <= segmentCount; i += 1) {
      const t = i / segmentCount;
      anchors.push({
        meshId: mesh.meshId,
        triangleIndex: 0,
        barycentric: [1 - t, t * 0.5, t * 0.5],
        normalOffsetMm: 0.5,
        widthMm: 2,
        pressure: 0.8,
      });
    }

    const spine = evaluateSurfaceBoundAnchors(anchors, mesh);
    // V8 TurboFan JIT 워밍업 3회 후 재사용 버퍼로 5회 중앙값 측정
    let ribbon = buildCameraFacingStrokeRibbon(spine, [0, 0.5, 3]);
    for (let w = 0; w < 3; w += 1) {
      ribbon = buildCameraFacingStrokeRibbon(spine, [0, 0.5, 3], ribbon);
    }
    const samplesMs: number[] = [];
    for (let r = 0; r < 5; r += 1) {
      const start = performance.now();
      ribbon = buildCameraFacingStrokeRibbon(spine, [0, 0.5, 3], ribbon);
      samplesMs.push(performance.now() - start);
    }
    samplesMs.sort((a, b) => a - b);
    const medianMs = samplesMs[2];

    expect(ribbon.segmentCount).toBe(5000);
    expect(ribbon.vertexCount).toBe(10002);
    expect(ribbon.indexCount).toBe(30000);
    // 5,000 세그먼트 리본 생성 중앙값: 실측 < 1ms, 병렬 부하 하에서도 < 2ms 목표 (CI 안전 상한 5ms)
    expect(medianMs).toBeLessThan(5);
  });

  it("renders StudioSurfaceBoundStrokeControls and fires mirror/undo callbacks", () => {
    const onChangeConfig = vi.fn();
    const onUndoStroke = vi.fn();
    const onClearStrokes = vi.fn();
    const dummyStroke: SurfaceBoundStroke = {
      id: "s1",
      meshId: "face-mesh",
      labelKo: "눈매 선",
      mirrorX: true,
      colorToken: "ink-primary",
      opacity: 1,
      anchors: [
        { meshId: "face-mesh", triangleIndex: 0, barycentric: [1, 0, 0], normalOffsetMm: 0.6, widthMm: 2, pressure: 1 },
        { meshId: "face-mesh", triangleIndex: 0, barycentric: [0, 1, 0], normalOffsetMm: 0.6, widthMm: 2, pressure: 1 },
      ],
    };

    render(
      <StudioSurfaceBoundStrokeControls
        config={DEFAULT_SURFACE_BOUND_STROKE_CONFIG}
        strokes={[dummyStroke]}
        lastBuildTimeMs={0.42}
        onChangeConfig={onChangeConfig}
        onUndoStroke={onUndoStroke}
        onClearStrokes={onClearStrokes}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("고정 선 1개 · 1 세그먼트");
    fireEvent.click(screen.getByRole("switch", { name: /좌우 대칭\(X\) 자동 복제/u }));
    expect(onChangeConfig).toHaveBeenCalledWith(expect.objectContaining({ mirrorX: false }));

    fireEvent.click(screen.getByRole("button", { name: /마지막 선 취소/u }));
    expect(onUndoStroke).toHaveBeenCalledTimes(1);
  });
});

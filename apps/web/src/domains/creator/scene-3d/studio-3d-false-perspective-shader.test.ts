import { describe, expect, it } from "vitest";

import {
  FALSE_PERSPECTIVE_LIMB_TAG_IDS,
  FALSE_PERSPECTIVE_PRESETS,
  buildCameraBasisFromLookAt,
  buildFalsePerspectiveUniforms,
  createDefaultFalsePerspectiveConfig,
  createFalsePerspectiveVertexShaderChunk,
  deformMeshWithFalsePerspective,
  evaluateFalsePerspectiveVertex,
} from "./studio-3d-false-perspective-shader";

describe("studio-3d-false-perspective-shader", () => {
  const camera = buildCameraBasisFromLookAt([0, 1.3, 2.4], [0, 1.3, 0]);

  it("leaves vertices bit-identical when disabled", () => {
    const config = createDefaultFalsePerspectiveConfig();
    const vertex = [0.3, 1.4, 0.6] as const;
    const result = evaluateFalsePerspectiveVertex(vertex, camera, config);
    expect(result.positionWorld).toEqual([0.3, 1.4, 0.6]);
    expect(result.effectiveScale).toBe(1);
    expect(result.clampedByNearPlane).toBe(false);
  });

  it("exaggerates foreground fists while compressing distant points and respecting near-plane clamp", () => {
    const punch = FALSE_PERSPECTIVE_PRESETS["action-punch"].config;
    const fistAnchor = punch.limbTags.rightFist.anchorWorld;
    // 주먹 표면 정점 (앵커에서 X로 +0.06m 떨어진 정점)
    const fistEdge: readonly [number, number, number] = [fistAnchor[0] + 0.06, fistAnchor[1], fistAnchor[2]];
    const headEdge: readonly [number, number, number] = [0.06, 1.58, 0];

    const deformedFist = evaluateFalsePerspectiveVertex(fistEdge, camera, punch);
    const deformedHead = evaluateFalsePerspectiveVertex(headEdge, camera, punch);

    // 전경 주먹은 뚜렷하게 확대, 배경 쪽 머리는 축소/안정
    expect(deformedFist.effectiveScale).toBeGreaterThan(1.4);
    expect(deformedHead.effectiveScale).toBeLessThan(1.0);
    // 주먹이 카메라 쪽(+Z)으로 당겨져야 한다
    expect(deformedFist.positionWorld[2]).toBeGreaterThan(fistEdge[2]);

    // 카메라 바로 앞(깊이 < minNearPlaneM)에 놓인 극단적 정점도 근평면 침범 없이 안전 클램프
    const tooClose = evaluateFalsePerspectiveVertex([0, 1.3, 2.38], camera, punch);
    expect(tooClose.clampedByNearPlane).toBe(true);
    expect(camera.position[2] - tooClose.positionWorld[2]).toBeCloseTo(punch.minNearPlaneM, 4);
  });

  it("deforms Float32Array vertex buffers and builds matching GLSL shader uniforms", () => {
    const kick = FALSE_PERSPECTIVE_PRESETS["dynamic-kick"].config;
    const mesh = new Float32Array([
      0.18, 1.15, 0.72,
      0.24, 1.15, 0.72,
      0.0, 1.6, -0.4,
    ]);
    const deformed = deformMeshWithFalsePerspective(mesh, camera, kick);
    expect(deformed.length).toBe(mesh.length);
    // 발 앵커와 발 외곽 사이 거리가 원래 0.06m보다 커져야 한다
    const expandedWidth = Math.hypot(
      deformed[3] - deformed[0],
      deformed[4] - deformed[1],
      deformed[5] - deformed[2],
    );
    expect(expandedWidth).toBeGreaterThan(0.08);

    const uniforms = buildFalsePerspectiveUniforms(camera, kick);
    expect(uniforms.uFalsePerspEnabled).toBe(1);
    expect(uniforms.uFalsePerspLimbCount).toBe(FALSE_PERSPECTIVE_LIMB_TAG_IDS.length);
    expect(uniforms.uFalsePerspLimbAnchors).toHaveLength(6);
    expect(uniforms.uFalsePerspLimbParams).toHaveLength(6);

    const shader = createFalsePerspectiveVertexShaderChunk();
    expect(shader.uniformDeclarationsGlsl).toContain("applyStudioFalsePerspective");
    expect(shader.vertexTransformGlsl).toContain("applyStudioFalsePerspective");
  });
});

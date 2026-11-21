// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { disposeStudioVrmSceneGpuResources } from "../vrm/studio-vrm-asset-runtime";

import { encodeStudioBg3dLtLayers } from "./studio-bg3d-lt-layer-encoder";
import { convertStudioBg3dSkpBytes } from "./studio-bg3d-skp-conversion-core";
import { normalizeStudioBg3dSkpGlbMetricAndFloor } from "./studio-bg3d-skp-glb-scale";
import {
  analyzeStudioBg3dSkpMesh,
  groundStudioBg3dSkpPrimitivesToFloorY0,
} from "./studio-bg3d-skp-mesh-analysis";
import type { StudioBg3dSkpPrimitive } from "./studio-bg3d-skp-mesh-merge";
import {
  createBoxPrimitive,
  createFakeOpenSkpModule,
  createSkpHeaderBytes,
  createSyntheticGlb,
  readGlbJson,
} from "./studio-bg3d-skp.test-fixture";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC-006 OpenSKP metric/floor grounding, manifold & Z-fighting diagnostics, and GPU disposal", () => {
  it("grounds floating OpenSKP geometry to Y = 0 while preserving 1.0 = 1m metric extents with 0 manifold/Z-fighting defects", async () => {
    const floatingBox = createBoxPrimitive({ size: 2, origin: [0, 3.25, 0], materialIndex: 0 });
    const before = analyzeStudioBg3dSkpMesh([floatingBox], { orientationTriangleBudget: 1000 });
    expect(before.integrity.floorMinYMeters).toBeCloseTo(3.25, 4);
    expect(before.integrity.groundedAtY0).toBe(false);
    expect(before.integrity.nonManifoldEdges).toBe(0);
    expect(before.integrity.coplanarZFightingPairs).toBe(0);

    const grounded = groundStudioBg3dSkpPrimitivesToFloorY0([floatingBox]);
    expect(grounded.shiftedYMeters).toBeCloseTo(-3.25, 4);
    expect(grounded.groundedAtY0).toBe(true);

    const after = analyzeStudioBg3dSkpMesh(grounded.primitives, { orientationTriangleBudget: 1000 });
    expect(after.integrity.floorMinYMeters).toBeCloseTo(0, 5);
    expect(after.integrity.groundedAtY0).toBe(true);
    expect(after.sizeMeters).toEqual([2, 2, 2]);
    expect(after.integrity.nonManifoldEdges).toBe(0);
    expect(after.integrity.coplanarZFightingPairs).toBe(0);

    // Worker 코어 변환에서도 groundToFloorY0 옵션으로 경고 0건 + 바닥 접지 완료 검증
    const fake = createFakeOpenSkpModule({
      scene: {
        glbPrimitives: [floatingBox],
        gltfMaterials: [{}],
        textures: [],
      },
      model: {
        units: "Meter",
        definitions: new Map<number, unknown>(),
        root: { faces: [], instances: [] },
        layers: [],
        pages: [],
        materials: [],
      },
    });
    const output = await convertStudioBg3dSkpBytes(
      createSkpHeaderBytes({ version: "{21.0.339}", container: "vff", byteLength: 512 }),
      {
        loadModule: () => Promise.resolve(fake.module),
        execution: "worker",
        maxBytes: 10 * 1024 * 1024,
        groundToFloorY0: true,
      },
    );
    expect(output.report.warnings).toEqual([]);
    const writtenScene = fake.calls.toGlb[0]?.scene as { glbPrimitives: StudioBg3dSkpPrimitive[] };
    const writtenStats = analyzeStudioBg3dSkpMesh(writtenScene.glbPrimitives, { orientationTriangleBudget: 1000 });
    expect(writtenStats.integrity.groundedAtY0).toBe(true);
  });

  it("applies metric scale + Y=0 floor translation atomically via normalizeStudioBg3dSkpGlbMetricAndFloor", () => {
    const glb = createSyntheticGlb();
    const normalized = normalizeStudioBg3dSkpGlbMetricAndFloor(glb, {
      scaleFactor: 0.0254,
      floorMinYMeters: 10,
    });
    const json = readGlbJson(normalized) as {
      nodes: Array<{ name?: string; scale?: number[]; translation?: number[] }>;
    };
    const wrapper = json.nodes.find((node) => node.name === "SKP_unit_scale");
    expect(wrapper?.scale).toEqual([0.0254, 0.0254, 0.0254]);
    expect(wrapper?.translation?.[0]).toBe(0);
    expect(wrapper?.translation?.[1]).toBeCloseTo(-0.254, 5);
    expect(wrapper?.translation?.[2]).toBe(0);
  });

  it("detects non-manifold edges (>= 3 triangles on 1 edge) and coplanar Z-fighting triangles", () => {
    // 1개 모서리 (0,0,0)-(1,0,0)을 3개의 삼각형이 공유하는 비다양체 메시
    const nonManifold: StudioBg3dSkpPrimitive = {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0.5, 1, 0,
        0.5, 0, 1,
        0.5, -1, 0,
      ]),
      normals: new Float32Array(15),
      uvs: new Float32Array(10),
      indices: new Uint32Array([
        0, 1, 2,
        0, 1, 3,
        0, 1, 4,
      ]),
      materialIndex: 0,
      geomName: "non_manifold_fin",
    };
    const nonManifoldStats = analyzeStudioBg3dSkpMesh([nonManifold], { orientationTriangleBudget: 100 });
    expect(nonManifoldStats.integrity.nonManifoldEdges).toBe(1);

    // 같은 Y=0 평면에서 완전히 겹치는 두 삼각형(Z-fighting)
    const coplanarZFight: StudioBg3dSkpPrimitive = {
      positions: new Float32Array([
        0, 0, 0,
        2, 0, 0,
        0, 0, 2,
        0.2, 0, 0.2,
        1.8, 0, 0.2,
        0.2, 0, 1.8,
      ]),
      normals: new Float32Array(18),
      uvs: new Float32Array(12),
      indices: new Uint32Array([
        0, 1, 2,
        3, 4, 5,
      ]),
      materialIndex: 0,
      geomName: "z_fighting_decal",
    };
    const zFightStats = analyzeStudioBg3dSkpMesh([coplanarZFight], { orientationTriangleBudget: 100 });
    expect(zFightStats.integrity.coplanarZFightingPairs).toBe(1);
  });

  it("disposes all VRM geometry, materials, standard maps, and MToon/uniform textures even if one dispose throws", () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const albedoTex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const shadeTex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const uniformTex = new THREE.DataTexture(new Uint8Array(4), 1, 1);

    const material = new THREE.MeshStandardMaterial({ map: albedoTex }) as THREE.MeshStandardMaterial & {
      shadeMultiplyTexture?: THREE.Texture;
      uniforms?: Record<string, { value: unknown }>;
    };
    material.shadeMultiplyTexture = shadeTex;
    material.uniforms = { uRamp: { value: uniformTex } };

    const albedoDispose = vi.spyOn(albedoTex, "dispose").mockImplementation(() => {
      throw new Error("webgl-context-lost-during-texture-dispose");
    });
    const shadeDispose = vi.spyOn(shadeTex, "dispose");
    const uniformDispose = vi.spyOn(uniformTex, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose");

    group.add(new THREE.Mesh(geometry, material));

    expect(() => disposeStudioVrmSceneGpuResources(group)).toThrow(
      "webgl-context-lost-during-texture-dispose",
    );
    expect(albedoDispose).toHaveBeenCalledTimes(1);
    expect(shadeDispose).toHaveBeenCalledTimes(1);
    expect(uniformDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("resets LT layer encoder temporary canvases to 1x1 in try/finally even when PNG encoding fails", () => {
    const canvases: HTMLCanvasElement[] = [];
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const el = originalCreate(tagName);
      if (tagName.toLowerCase() === "canvas") {
        const canvas = el as HTMLCanvasElement;
        canvases.push(canvas);
        vi.spyOn(canvas, "getContext").mockImplementation(((contextId: string) =>
          contextId === "2d"
            ? {
                createImageData: (w: number, h: number) => ({
                  data: new Uint8ClampedArray(w * h * 4),
                  width: w,
                  height: h,
                }),
                putImageData: vi.fn(),
                clearRect: vi.fn(),
                drawImage: vi.fn(),
              }
            : null) as unknown as HTMLCanvasElement["getContext"]);
        vi.spyOn(canvas, "toDataURL").mockImplementation(() => {
          throw new Error("lt-encode-oom");
        });
      }
      return el;
    }) as typeof document.createElement);

    expect(() =>
      encodeStudioBg3dLtLayers([
        {
          role: "main-line",
          width: 32,
          height: 32,
          data: new Uint8ClampedArray(32 * 32 * 4),
        },
      ]),
    ).toThrow("lt-encode-oom");

    expect(canvases).toHaveLength(2);
    expect(canvases[0]?.width).toBe(1);
    expect(canvases[0]?.height).toBe(1);
    expect(canvases[1]?.width).toBe(1);
    expect(canvases[1]?.height).toBe(1);
  });
});

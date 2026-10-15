import { create as createSkpBuilder, buildScene, toGLB } from "openskp";
import { describe, expect, it } from "vitest";

import { StudioBg3dSkpConversionError } from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME,
  assertStudioBg3dSkpGlbContainer,
  scaleStudioBg3dGlbUniformly,
} from "./studio-bg3d-skp-glb-scale";
import { createSyntheticGlb, readGlbJson } from "./studio-bg3d-skp.test-fixture";

function failureOf(action: () => void): StudioBg3dSkpConversionError {
  try {
    action();
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

/** buildScene 은 정확한 ArrayBuffer 를 받는다. Uint8Array.buffer 는 SharedArrayBuffer 일 수도 있어 복사해 만든다. */
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function binChunkOf(glb: Uint8Array): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binOffset = 20 + jsonLength;
  const binLength = view.getUint32(binOffset, true);
  return glb.slice(binOffset + 8, binOffset + 8 + binLength);
}

describe("scaleStudioBg3dGlbUniformly", () => {
  it("returns the very same bytes for a factor of 1 (the inch baseline needs no change)", () => {
    const glb = createSyntheticGlb();
    expect(scaleStudioBg3dGlbUniformly(glb, 1)).toBe(glb);
  });

  it("wraps the scene roots in one scaled parent node without touching the binary chunk", () => {
    const glb = createSyntheticGlb({ bin: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) });
    const scaled = scaleStudioBg3dGlbUniformly(glb, 0.5);
    const json = readGlbJson(scaled);
    expect(json.nodes).toEqual([
      { mesh: 0 },
      { name: STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME, scale: [0.5, 0.5, 0.5], children: [0] },
    ]);
    expect(json.scenes).toEqual([{ nodes: [1] }]);
    expect([...binChunkOf(scaled)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const view = new DataView(scaled.buffer, scaled.byteOffset, scaled.byteLength);
    expect(view.getUint32(8, true)).toBe(scaled.byteLength);
    expect(view.getUint32(12, true) % 4).toBe(0);
    expect(() => assertStudioBg3dSkpGlbContainer(scaled)).not.toThrow();
  });

  it("keeps every root node as a child when the scene has several roots", () => {
    const glb = createSyntheticGlb({ nodes: [{ mesh: 0 }, { mesh: 1 }], scenes: [{ nodes: [0, 1] }] });
    const json = readGlbJson(scaleStudioBg3dGlbUniformly(glb, 39.37));
    expect(json.nodes).toHaveLength(3);
    expect(json.scenes).toEqual([{ nodes: [2] }]);
    expect((json.nodes as { children?: number[] }[])[2].children).toEqual([0, 1]);
  });

  it("wraps only the default scene when the document selects one", () => {
    const glb = createSyntheticGlb({
      nodes: [{ mesh: 0 }, { mesh: 1 }],
      scenes: [{ nodes: [0] }, { nodes: [1] }],
      scene: 1,
    });
    const json = readGlbJson(scaleStudioBg3dGlbUniformly(glb, 2));
    expect(json.scenes).toEqual([{ nodes: [0] }, { nodes: [2] }]);
  });

  it("preserves non-ASCII JSON content such as Korean node names", () => {
    const glb = createSyntheticGlb({ nodes: [{ mesh: 0, name: "교실 의자" }] });
    const json = readGlbJson(scaleStudioBg3dGlbUniformly(glb, 2));
    expect((json.nodes as { name?: string }[])[0].name).toBe("교실 의자");
  });

  it("accumulates when applied twice, which is why callers always scale the original conversion output", () => {
    const once = scaleStudioBg3dGlbUniformly(createSyntheticGlb(), 2);
    const twice = scaleStudioBg3dGlbUniformly(once, 3);
    const nodes = readGlbJson(twice).nodes as { scale?: number[] }[];
    expect(nodes.filter((node) => node.scale).map((node) => node.scale?.[0])).toEqual([2, 3]);
  });

  it("rejects factors that are not finite positive numbers as caller errors", () => {
    const glb = createSyntheticGlb();
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scaleStudioBg3dGlbUniformly(glb, factor)).toThrow(TypeError);
    }
  });

  it("rejects malformed containers with skp-parse-failed", () => {
    const valid = createSyntheticGlb();
    const wrongMagic = valid.slice();
    wrongMagic[0] = 0;
    const truncated = valid.slice(0, 15);
    const lengthMismatch = valid.slice();
    new DataView(lengthMismatch.buffer).setUint32(8, valid.byteLength + 4, true);
    const wrongVersion = valid.slice();
    new DataView(wrongVersion.buffer).setUint32(4, 1, true);
    const misaligned = valid.slice();
    new DataView(misaligned.buffer).setUint32(12, 3, true);
    for (const broken of [wrongMagic, truncated, lengthMismatch, wrongVersion, misaligned]) {
      const error = failureOf(() => scaleStudioBg3dGlbUniformly(broken, 2));
      expect(error.code).toBe("skp-parse-failed");
      expect(error.reason).toBe("invalid-output");
    }
  });

  it("rejects documents that have nothing to scale", () => {
    expect(failureOf(() => scaleStudioBg3dGlbUniformly(createSyntheticGlb({ scenes: [] }), 2)).code).toBe("skp-parse-failed");
    expect(failureOf(() => scaleStudioBg3dGlbUniformly(createSyntheticGlb({ scenes: [{ nodes: [] }] }), 2)).code)
      .toBe("skp-parse-failed");
    expect(failureOf(() => scaleStudioBg3dGlbUniformly(createSyntheticGlb({ nodes: [] }), 2)).code).toBe("skp-parse-failed");
  });
});

describe("assertStudioBg3dSkpGlbContainer", () => {
  it("accepts a GLB written by the real openskp exporter, before and after scaling", () => {
    const builder = createSkpBuilder();
    builder.addFace([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]]);
    const glb = toGLB(buildScene(exactBuffer(builder.toBytes())));
    expect(() => assertStudioBg3dSkpGlbContainer(glb)).not.toThrow();
    const scaled = scaleStudioBg3dGlbUniformly(glb, 39.37007874015748);
    expect(() => assertStudioBg3dSkpGlbContainer(scaled)).not.toThrow();
    const json = readGlbJson(scaled);
    expect(json.scenes).toEqual([{ nodes: [1] }]);
    expect(binChunkOf(scaled)).toEqual(binChunkOf(glb));
  });

  it("rejects non-GLB bytes, a wrong asset version and a missing JSON chunk", () => {
    expect(failureOf(() => assertStudioBg3dSkpGlbContainer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).code)
      .toBe("skp-parse-failed");
    expect(failureOf(() => assertStudioBg3dSkpGlbContainer(createSyntheticGlb({ assetVersion: "1.0" }))).reason)
      .toBe("invalid-output");
    const binFirst = new Uint8Array(12 + 8 + 4);
    const view = new DataView(binFirst.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, binFirst.byteLength, true);
    view.setUint32(12, 4, true);
    view.setUint32(16, 0x004e4942, true);
    expect(failureOf(() => assertStudioBg3dSkpGlbContainer(binFirst)).code).toBe("skp-parse-failed");
  });
});

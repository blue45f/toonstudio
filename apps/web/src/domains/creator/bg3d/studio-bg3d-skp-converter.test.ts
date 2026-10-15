import { create as createSkpBuilder, type SkpBuilder } from "openskp";
import { beforeEach, describe, expect, it } from "vitest";

import {
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
  convertStudioBg3dSkp,
} from "./studio-bg3d-skp-converter";
import { assertStudioBg3dSkpGlbContainer } from "./studio-bg3d-skp-glb-scale";
import { parseStudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import {
  loadStudioBg3dOpenSkpModule,
  resetStudioBg3dSkpModuleCacheForTests,
} from "./studio-bg3d-skp-worker-runtime";
import { createPngBytes, readGlbJson, replaceUtf16Text } from "./studio-bg3d-skp.test-fixture";

// 실제 openskp 와 그 작성기(SkpBuilder)로 만든 .skp 바이트만 쓴다. 바이너리 픽스처는 커밋하지 않는다.

type Point = [number, number, number];

function convert(bytes: Uint8Array) {
  return convertStudioBg3dSkp(bytes, { executionBackend: "direct" });
}

async function failureOf(promise: Promise<unknown>): Promise<StudioBg3dSkpConversionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

function square(size: number, z = 0, origin: Point = [0, 0, 0]): Point[] {
  const [x, y] = origin;
  return [[x, y, z], [x + size, y, z], [x + size, y + size, z], [x, y + size, z]];
}

function cubeFaces(size: number): Point[][] {
  const s = size;
  return [
    [[0, 0, 0], [0, s, 0], [s, s, 0], [s, 0, 0]],
    [[0, 0, s], [s, 0, s], [s, s, s], [0, s, s]],
    [[0, 0, 0], [s, 0, 0], [s, 0, s], [0, 0, s]],
    [[0, s, 0], [0, s, s], [s, s, s], [s, s, 0]],
    [[0, 0, 0], [0, 0, s], [0, s, s], [0, s, 0]],
    [[s, 0, 0], [s, s, 0], [s, s, s], [s, 0, s]],
  ];
}

function buildBytes(fill: (builder: SkpBuilder) => void): Uint8Array {
  const builder = createSkpBuilder();
  fill(builder);
  return builder.toBytes();
}

describe("convertStudioBg3dSkp with the real openskp (main-thread backend)", () => {
  beforeEach(() => {
    resetStudioBg3dSkpModuleCacheForTests();
  });

  it("converts a writer-made file into a valid GLB and a report that agrees with the geometry", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(100)); });
    const { glb, report } = await convert(bytes);

    expect(() => assertStudioBg3dSkpGlbContainer(glb)).not.toThrow();
    expect(parseStudioBg3dSkpImportReport(report)).toEqual(report);
    // SketchUp 의 100인치 = 2.54m, Z-up → Y-up 이라 정사각형이 X-Z 평면에 눕는다.
    expect(report.size?.openSkpMeters[0]).toBeCloseTo(2.54, 5);
    expect(report.size?.openSkpMeters[1]).toBeCloseTo(0, 6);
    expect(report.size?.openSkpMeters[2]).toBeCloseTo(2.54, 5);
    expect(report.size?.level).toBe("ok");
    expect(report.source).toMatchObject({ container: "legacy", sketchupMajor: 17, sketchupLabel: "SketchUp 2017", byteSize: bytes.byteLength });
    expect(report.counts.triangles).toBe(2);
    expect(report.counts.sourceFaces).toBe(1);
    expect(report.coordinates.metersPerSourceUnit).toBe(0.0254);
    expect(report.conversion.execution).toBe("main-thread");
  });

  it("reads component names, tags and instance counts from the placed scene", async () => {
    const bytes = buildBytes((builder) => {
      const furniture = builder.addLayer("Furniture", { color: [10, 200, 30] });
      const chair = builder.addComponentDefinition("Chair", (definition) => { definition.addFace(square(20)); });
      builder.addInstance(chair, { translation: [50, 0, 0], name: "Chair A", layer: furniture });
      builder.addInstance(chair, { translation: [100, 0, 0], name: "Chair B" });
      builder.addFace(square(10));
    });
    const { report } = await convert(bytes);
    expect(report.names.components.items).toEqual(["Chair"]);
    expect(report.counts.instances).toBe(2);
    expect(report.names.tags.items).toEqual(expect.arrayContaining(["Furniture", "Layer0"]));
    expect(report.names.scenes.available).toBe(false);
  });

  it("collapses a component placed dozens of times into a handful of draw calls", async () => {
    const bytes = buildBytes((builder) => {
      const tree = builder.addComponentDefinition("Tree", (definition) => { definition.addFace(square(10)); });
      for (let index = 0; index < 40; index += 1) builder.addInstance(tree, { translation: [index * 20, 0, 0] });
      builder.addFace(square(10));
    });
    const { glb, report } = await convert(bytes);
    expect(report.conversion.primitivesBeforeMerge).toBeGreaterThanOrEqual(40);
    expect(report.conversion.primitivesAfterMerge).toBeLessThanOrEqual(2);
    const meshes = readGlbJson(glb).meshes as { primitives: unknown[] }[];
    expect(meshes[0].primitives.length).toBe(report.conversion.primitivesAfterMerge);
    expect(report.counts.triangles).toBe(41 * 2);
  });

  it("leaves faces hidden in SketchUp out of the result", async () => {
    const bytes = buildBytes((builder) => {
      builder.addFace(square(10));
      builder.addFace(square(10, 0, [50, 0, 0]), { hidden: true });
    });
    const { report } = await convert(bytes);
    expect(report.counts.triangles).toBe(2);
    expect(report.size?.openSkpMeters[0]).toBeCloseTo(0.254, 5);
  });

  it("fails with skp-empty-scene, and explains why, when every face is hidden", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(10), { hidden: true }); });
    const error = await failureOf(convert(bytes));
    expect(error.code).toBe("skp-empty-scene");
    const report = parseStudioBg3dSkpImportReport(error.report);
    expect(report?.size).toBeNull();
    expect(report?.warnings.map((warning) => warning.code)).toContain("empty-scene");
  });

  it("warns that hidden instances and hidden tags are still part of the converted scene", async () => {
    const bytes = buildBytes((builder) => {
      const scratch = builder.addLayer("Scratch", { color: [1, 2, 3], hidden: true });
      const box = builder.addComponentDefinition("Box", (definition) => { definition.addFace(square(10)); });
      builder.addInstance(box, { translation: [0, 0, 0] });
      builder.addInstance(box, { translation: [100, 0, 0], hidden: true });
      builder.addFace(square(10, 5), { layer: scratch });
    });
    const { report } = await convert(bytes);
    expect(report.warnings).toContainEqual({ code: "hidden-instances-included", severity: "warning", count: 1, detail: null });
    expect(report.warnings).toContainEqual({ code: "hidden-tags-included", severity: "warning", count: 1, detail: "Scratch" });
  });

  it("flags a model that is a few millimetres wide and recommends metres", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(0.2)); });
    const { report } = await convert(bytes);
    expect(report.size?.level).toBe("too-small");
    expect(report.size?.recommendedUnit).toBe("m");
    expect(report.warnings.map((warning) => warning.code)).toContain("size-abnormal");
  });

  it("finds no flipped faces in a closed cube and exactly four borders when one face is reversed", async () => {
    const clean = await convert(buildBytes((builder) => { for (const face of cubeFaces(100)) builder.addFace(face); }));
    expect(clean.report.warnings.map((warning) => warning.code)).not.toContain("flipped-faces");

    const reversed = await convert(buildBytes((builder) => {
      cubeFaces(100).forEach((face, index) => { builder.addFace(index === 1 ? [...face].reverse() : face); });
    }));
    expect(reversed.report.warnings).toContainEqual({ code: "flipped-faces", severity: "warning", count: 4, detail: null });
  });

  it("embeds a textured material's image and counts it", async () => {
    const bytes = buildBytes((builder) => {
      const brick = builder.addTextureMaterial("Brick", createPngBytes(8, 8), "C:\\textures\\brick.png", 10, 10);
      builder.addFace(square(100), { material: brick });
    });
    const { glb, report } = await convert(bytes);
    expect(report.conversion.textures).toBe("embedded");
    expect(report.counts).toMatchObject({ textures: 1, texturesReferenced: 1 });
    const json = readGlbJson(glb);
    expect((json.images as unknown[]).length).toBe(1);
    expect((json.textures as unknown[]).length).toBe(1);
  });

  it("rejects the same bytes with a corrupted signature before running the parser", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(10)); });
    const broken = bytes.slice();
    broken[0] = 0x00;
    const error = await failureOf(convert(broken));
    expect(error).toBeInstanceOf(StudioBg3dSkpParseError);
    expect(error.reason).toBe("invalid-signature");
  });

  it("maps truncated and structurally broken files to skp-parse-failed", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(10)); });
    for (const broken of [bytes.slice(0, bytes.length >> 1), bytes.slice(0, 100), new Uint8Array([0xff, 0xfe, 0xff, 0x0e])]) {
      const error = await failureOf(convert(broken));
      expect(error.code).toBe("skp-parse-failed");
    }
  });

  it("refuses files saved by SketchUp before 2013 with skp-unsupported-version", async () => {
    const bytes = buildBytes((builder) => { builder.addFace(square(10)); });
    // 헤더의 UTF-16 버전 "{17.0.1}" 을 같은 길이의 "{12.0.5}" 로 바꾼다.
    const patched = replaceUtf16Text(bytes, "{17.0.1}", "{12.0.5}");
    const error = await failureOf(convert(patched));
    expect(error.code).toBe("skp-unsupported-version");
  });

  it("converts a couple of thousand faces comfortably inside the Worker time limit", async () => {
    const bytes = buildBytes((builder) => {
      for (let index = 0; index < 2_000; index += 1) {
        builder.addFace(square(9, 0, [(index % 50) * 10, Math.floor(index / 50) * 10, 0]));
      }
    });
    const started = performance.now();
    const { report } = await convertStudioBg3dSkp(bytes, { executionBackend: "direct", maxBytes: 8 * 1024 * 1024 });
    expect(report.counts.triangles).toBe(4_000);
    expect(performance.now() - started).toBeLessThan(15_000);
  });
});

describe("default openskp loader", () => {
  beforeEach(() => {
    resetStudioBg3dSkpModuleCacheForTests();
  });

  it("loads the real module once and reuses it", async () => {
    const first = await loadStudioBg3dOpenSkpModule();
    const second = await loadStudioBg3dOpenSkpModule();
    expect(first).toBe(second);
    expect(typeof first.buildScene).toBe("function");
    expect(typeof first.toGLB).toBe("function");
    expect(typeof first.parseSkp).toBe("function");
  });

  it("exposes the legacy error classes that the import pipeline and tests already know", () => {
    expect(new StudioBg3dSkpParseError().code).toBe("skp-parse-failed");
    expect(new StudioBg3dSkpConverterUnavailableError().code).toBe("skp-converter-unavailable");
    expect(new StudioBg3dSkpParseError()).toBeInstanceOf(StudioBg3dSkpConversionError);
  });
});

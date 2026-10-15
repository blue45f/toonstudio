import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
  STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES,
  STUDIO_BG3D_SKP_STAGES,
  STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_BYTES,
  STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT,
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import {
  classifyOpenSkpFailure,
  convertStudioBg3dSkpBytes,
  isOpenSkpModuleLike,
  type OpenSkpModuleLike,
  type StudioBg3dSkpConversionOptions,
} from "./studio-bg3d-skp-conversion-core";
import { parseStudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import {
  createBoxPrimitive,
  createFakeOpenSkpModule,
  createSkpHeaderBytes,
  createSkpVffBytes,
  createSyntheticGlb,
  readGlbJson,
  type FakeSkpModuleOptions,
} from "./studio-bg3d-skp.test-fixture";

const VFF_BYTES = createSkpHeaderBytes({ version: "{21.0.339}", container: "vff", byteLength: 1024 });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function sceneOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    glbPrimitives: [
      createBoxPrimitive({ size: 3, materialIndex: 0, geomName: "mesh_0" }),
      createBoxPrimitive({ size: 3, origin: [4, 0, 0], materialIndex: 0, geomName: "mesh_1" }),
      createBoxPrimitive({ size: 3, origin: [8, 0, 0], materialIndex: 1, geomName: "mesh_2" }),
    ],
    gltfMaterials: [{}, {}],
    textures: [],
    sceneHierarchy: {
      name: "ROOT",
      definitionName: "ROOT_MODEL",
      layer: "Untagged",
      children: [
        { name: "Chair A", definitionName: "Chair", layer: "Furniture", children: [] },
        { name: "Chair B", definitionName: "Chair", layer: "Untagged", children: [] },
        { name: "Lamp", definitionName: "Lamp", layer: "Light", children: [] },
      ],
    },
    ...overrides,
  };
}

function modelOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    units: "Millimeter",
    definitions: new Map<number, unknown>(),
    root: { faces: [{ materialId: null, backMaterialId: null }], instances: [] },
    layers: [{ name: "Untagged", hidden: false }, { name: "Furniture", hidden: false }],
    pages: [{ name: "Front" }],
    materials: [],
    ...overrides,
  };
}

function options(
  fake: FakeSkpModuleOptions,
  extra: Partial<StudioBg3dSkpConversionOptions> = {},
): { readonly conversion: StudioBg3dSkpConversionOptions; readonly fake: ReturnType<typeof createFakeOpenSkpModule> } {
  const created = createFakeOpenSkpModule(fake);
  return {
    fake: created,
    conversion: {
      loadModule: () => Promise.resolve(created.module),
      execution: "worker",
      maxBytes: 32 * 1024 * 1024,
      ...extra,
    },
  };
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

describe("convertStudioBg3dSkpBytes — success path", () => {
  it("converts, merges draw calls per material and produces a schema-valid report", async () => {
    const { conversion, fake } = options({ scene: sceneOf(), model: modelOf() });
    const output = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);

    expect([...output.glb.subarray(0, 4)]).toEqual([0x67, 0x6c, 0x54, 0x46]);
    expect(parseStudioBg3dSkpImportReport(output.report)).toEqual(output.report);
    expect(output.report.conversion).toMatchObject({
      converter: "openskp",
      execution: "worker",
      metadataPass: "done",
      textures: "none",
      primitivesBeforeMerge: 3,
      primitivesAfterMerge: 2,
      hiddenFacesExcluded: true,
    });
    expect(output.report.counts).toMatchObject({ vertices: 72, triangles: 36, materials: 2, textures: 0, instances: 3, sourceFaces: 1 });
    expect(output.report.source).toMatchObject({
      byteSize: 1024,
      container: "vff",
      sketchupVersion: "21.0.339",
      sketchupLabel: "SketchUp 2021",
      declaredUnits: "Millimeter",
    });
    expect(output.report.names.components.items).toEqual(["Chair", "Lamp"]);
    expect(output.report.names.tags.items).toEqual(["Untagged", "Furniture", "Light"]);
    expect(output.report.names.scenes).toEqual({ available: true, items: ["Front"], total: 1, truncated: false });
    expect(output.report.size?.openSkpMeters).toEqual([11, 3, 3]);
    expect(output.report.size?.level).toBe("ok");
    expect(output.report.warnings).toEqual([]);

    // 변환기에는 숨김 면 제외 옵션을 켜서 부르고, 병합된 형상(2개)만 GLB 로 쓴다.
    expect(fake.calls.build[0].options).toMatchObject({ respectEdgeVisibility: true });
    const written = fake.calls.toGlb[0].scene as { glbPrimitives: unknown[] };
    expect(written.glbPrimitives).toHaveLength(2);
    expect(fake.calls.toGlb[0].options).toBeUndefined();
  });

  it("reports each stage in order and passes openskp progress through as a fraction", async () => {
    const stages: StudioBg3dSkpStageProgress[] = [];
    const { conversion } = options(
      {
        scene: sceneOf(),
        model: modelOf(),
        progress: [
          { stage: "tlv_walk", current: 25, total: 100 },
          { stage: "tlv_walk", current: 100, total: 100 },
          { stage: "build_scene", current: 7, total: 7 },
        ],
      },
      { hooks: { onStage: (progress) => stages.push(progress), now: () => stages.length * 1_000 } },
    );
    await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    const distinct = stages.map((progress) => progress.stage).filter((stage, index, all) => all.indexOf(stage) === index);
    expect(distinct).toEqual([...STUDIO_BG3D_SKP_STAGES]);
    const building = stages.filter((progress) => progress.stage === "building-scene");
    expect(building.some((progress) => progress.fraction === 0.25)).toBe(true);
    expect(building.some((progress) => progress.fraction === 1)).toBe(true);
    expect(stages.every((progress) => progress.execution === "worker")).toBe(true);
  });

  it("throttles bursts of fine-grained progress but never drops the final value", async () => {
    const stages: StudioBg3dSkpStageProgress[] = [];
    const progress = Array.from({ length: 50 }, (_, index) => ({ stage: "tlv_walk", current: index + 1, total: 50 }));
    const { conversion } = options(
      { scene: sceneOf(), model: modelOf(), progress },
      { hooks: { onStage: (entry) => stages.push(entry), now: () => 5_000 } },
    );
    await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    const fractions = stages.filter((entry) => entry.stage === "building-scene").map((entry) => entry.fraction);
    expect(fractions.filter((fraction) => fraction === null).length).toBeGreaterThanOrEqual(1);
    expect(fractions.length).toBeLessThan(10);
    expect(fractions).toContain(1);
  });

  it("hands openskp an exact ArrayBuffer even when given a Uint8Array view with an offset", async () => {
    const padded = new Uint8Array(VFF_BYTES.byteLength + 64);
    padded.set(VFF_BYTES, 32);
    const { conversion, fake } = options({ scene: sceneOf(), model: modelOf() });
    await convertStudioBg3dSkpBytes(padded.subarray(32, 32 + VFF_BYTES.byteLength), conversion);
    const received = fake.calls.build[0].source;
    expect(received).toBeInstanceOf(ArrayBuffer);
    expect(received.byteLength).toBe(VFF_BYTES.byteLength);
    expect(new Uint8Array(received)[0]).toBe(0xff);
  });

  it("accepts an ArrayBuffer returned by toGLB", async () => {
    const glb = createSyntheticGlb();
    const { conversion } = options({ scene: sceneOf(), glb: glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer });
    const output = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(output.glb.byteLength).toBe(glb.byteLength);
  });
});

describe("convertStudioBg3dSkpBytes — failures are classified, never faked", () => {
  it("fails before loading the converter when the bytes are not a SketchUp file", async () => {
    const loadModule = vi.fn();
    const error = await failureOf(convertStudioBg3dSkpBytes(new Uint8Array([7, 8, 9, 10]), {
      loadModule,
      execution: "worker",
      maxBytes: 1_000,
    }));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.reason).toBe("invalid-signature");
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("fails with unsupported-version for files saved by SketchUp before 2013", async () => {
    const { conversion, fake } = options({ scene: sceneOf() });
    const error = await failureOf(convertStudioBg3dSkpBytes(createSkpHeaderBytes({ version: "{8.0.4810}" }), conversion));
    expect(error.code).toBe("skp-unsupported-version");
    expect(fake.calls.build).toHaveLength(0);
  });

  it("fails with too-large before touching the converter when over the cap", async () => {
    const { conversion, fake } = options({ scene: sceneOf() }, { maxBytes: 512 });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("source-limit");
    expect(fake.calls.build).toHaveLength(0);
  });

  it("fails with too-large before loading the converter when the compressed model data expands past the cap", async () => {
    const loadModule = vi.fn();
    // 파일 자체는 수백 바이트지만 중앙 디렉터리는 압축을 풀면 64MiB 라고 선언한다.
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 64 * 1024 * 1024 }]);
    const error = await failureOf(convertStudioBg3dSkpBytes(bytes, {
      loadModule,
      execution: "worker",
      maxBytes: 32 * 1024 * 1024,
    }));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("model-data-limit");
    expect(error.detail).toEqual({ modelDataBytes: 64 * 1024 * 1024, limitBytes: 32 * 1024 * 1024 });
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("lets a modern file through when its declared model data fits the cap", async () => {
    const { conversion } = options({ scene: sceneOf(), model: modelOf() });
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 4 * 1024 * 1024 }]);
    const { report } = await convertStudioBg3dSkpBytes(bytes, conversion);
    expect(report.source.container).toBe("vff");
  });

  it("applies the small main-thread cap and records the fallback honestly in the report", async () => {
    const big = createSkpHeaderBytes({ byteLength: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES + 1 });
    const { conversion } = options({ scene: sceneOf(), model: modelOf() }, { execution: "main-thread" });
    const error = await failureOf(convertStudioBg3dSkpBytes(big, conversion));
    expect(error.reason).toBe("main-thread-limit");

    const small = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(small.report.conversion.execution).toBe("main-thread");
    expect(small.report.warnings.map((warning) => warning.code)).toContain("main-thread-fallback");
  });

  it("maps a parser rejection to parse-failed and keeps the openskp stage in the diagnostics", async () => {
    const failure = Object.assign(new Error("record 3 is truncated"), { name: "SkpParseError", stage: "tlv_walk" });
    const { conversion } = options({ buildError: failure });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.message).toContain("tlv_walk");
    expect(error.message).toContain("record 3 is truncated");
    expect(error.detail).toEqual({ stage: "tlv_walk" });
    expect(error.cause).toBe(failure);
  });

  it("maps allocation failures to too-large with an out-of-memory reason", async () => {
    const { conversion } = options({ buildError: new RangeError("Array buffer allocation failed") });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("out-of-memory");
  });

  it("maps an exception from toGLB to parse-failed as well", async () => {
    const { conversion } = options({ scene: sceneOf(), toGlbError: new Error("encoder blew up") });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.message).toContain("encoder blew up");
  });

  it("rejects a scene without primitives as a broken conversion result", async () => {
    const { conversion } = options({ scene: { notAScene: true } });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.reason).toBe("invalid-geometry");
  });

  it("rejects primitives whose typed arrays are not what openskp promises", async () => {
    const { conversion } = options({ scene: { glbPrimitives: [{ positions: [0, 1, 2] }] } });
    expect((await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion))).reason).toBe("invalid-geometry");
  });

  it("reports an empty scene with skp-empty-scene and attaches a report that explains why", async () => {
    const { conversion, fake } = options({
      scene: sceneOf({ glbPrimitives: [], sceneHierarchy: { name: "ROOT", children: [] } }),
      model: modelOf(),
    });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-empty-scene");
    expect(error.reason).toBe("no-geometry");
    const report = parseStudioBg3dSkpImportReport(error.report);
    expect(report?.size).toBeNull();
    expect(report?.counts.triangles).toBe(0);
    expect(report?.warnings.map((warning) => warning.code)).toContain("empty-scene");
    expect(fake.calls.toGlb).toHaveLength(0);
  });

  it("treats primitives that contain only empty meshes as an empty scene too", async () => {
    const empty = { ...createBoxPrimitive(), positions: new Float32Array(0), normals: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint32Array(0) };
    const { conversion } = options({ scene: sceneOf({ glbPrimitives: [empty] }) });
    expect((await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion))).code).toBe("skp-empty-scene");
  });

  it("rejects a converter result that is not a GLB", async () => {
    for (const bad of [
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      new Uint8Array(0),
      createSyntheticGlb({ assetVersion: "1.0" }),
    ]) {
      const { conversion } = options({ scene: sceneOf(), glb: bad });
      const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
      expect(error.code).toBe("skp-parse-failed");
      expect(error.reason).toBe("invalid-output");
    }
  });

  it("rejects non-finite coordinates in the converter output", async () => {
    const broken = createBoxPrimitive();
    broken.positions[0] = Number.NaN;
    const { conversion } = options({ scene: sceneOf({ glbPrimitives: [broken] }) });
    expect((await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion))).reason).toBe("invalid-geometry");
  });
});

describe("convertStudioBg3dSkpBytes — converter loading", () => {
  it("reports converter-unavailable when the loader fails, wrapping the cause", async () => {
    const cause = new Error("Failed to fetch dynamically imported module");
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, {
      loadModule: () => Promise.reject(cause),
      execution: "worker",
      maxBytes: 1_000_000,
    }));
    expect(error).toBeInstanceOf(StudioBg3dSkpConverterUnavailableError);
    expect(error.code).toBe("skp-converter-unavailable");
    expect(error.cause).toBe(cause);
  });

  it("passes an already-classified loader error through untouched", async () => {
    const classified = new StudioBg3dSkpConverterUnavailableError("custom");
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, {
      loadModule: () => Promise.reject(classified),
      execution: "worker",
      maxBytes: 1_000_000,
    }));
    expect(error).toBe(classified);
  });

  it("verifies the module shape at runtime instead of trusting the import", async () => {
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, {
      // 설치본이 바뀌어 API 가 사라진 경우를 흉내 낸다.
      loadModule: () => Promise.resolve({ buildScene: () => ({}) } as unknown as OpenSkpModuleLike),
      execution: "worker",
      maxBytes: 1_000_000,
    }));
    expect(error.code).toBe("skp-converter-unavailable");
    expect(error.reason).toBe("converter-api-mismatch");
    expect(isOpenSkpModuleLike({ buildScene: () => 1, toGLB: () => 2 })).toBe(true);
    expect(isOpenSkpModuleLike({ buildScene: () => 1, toGLB: () => 2, parseSkp: "nope" })).toBe(false);
    expect(isOpenSkpModuleLike(null)).toBe(false);
  });
});

describe("convertStudioBg3dSkpBytes — cancellation and time limits", () => {
  it("stops at the next stage boundary once cancelled, without running the parser", async () => {
    let cancelled = false;
    const { conversion, fake } = options({ scene: sceneOf() }, {
      hooks: {
        isCancelled: () => cancelled,
        onStage: (progress) => {
          if (progress.stage === "loading-converter") cancelled = true;
        },
      },
    });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-cancelled");
    expect(error.name).toBe("AbortError");
    expect(fake.calls.build).toHaveLength(0);
  });

  it("fails with skp-timeout at a stage boundary once the cooperative deadline has passed", async () => {
    let clock = 0;
    const { conversion } = options({ scene: sceneOf(), model: modelOf() }, {
      timeoutMs: 5_000,
      hooks: { now: () => clock, onStage: (progress) => { if (progress.stage === "building-scene") clock += 6_000; } },
    });
    const error = await failureOf(convertStudioBg3dSkpBytes(VFF_BYTES, conversion));
    expect(error.code).toBe("skp-timeout");
    expect(error.reason).toBe("timeout");
    expect(error.detail).toEqual({ timeoutMs: 5_000 });
  });

  it("lets the main thread breathe between stages when asked to", async () => {
    const yielded = vi.fn(() => Promise.resolve());
    const { conversion } = options({ scene: sceneOf(), model: modelOf() }, {
      execution: "main-thread",
      hooks: { yieldToEventLoop: yielded },
    });
    await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(yielded.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});

describe("convertStudioBg3dSkpBytes — metadata pass", () => {
  it("still converts when the second parse fails and says that names are unavailable", async () => {
    const { conversion } = options({ scene: sceneOf(), parseError: new Error("model builder failed") });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.conversion.metadataPass).toBe("failed");
    expect(report.counts.sourceFaces).toBeNull();
    expect(report.names.scenes.available).toBe(false);
    // 배치된 개체가 쓰는 태그는 장면 계층에서 읽을 수 있다.
    expect(report.names.tags.items).toEqual(["Furniture", "Untagged", "Light"]);
    expect(report.warnings).toContainEqual({ code: "metadata-unavailable", severity: "info", count: null, detail: "parse-unavailable" });
  });

  it("treats a module without parseSkp the same way", async () => {
    const { conversion } = options({ scene: sceneOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.conversion.metadataPass).toBe("failed");
  });

  it("skips the second parse for very large files to protect time and memory", async () => {
    const big = createSkpHeaderBytes({ byteLength: STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES + 1 });
    const { conversion, fake } = options({ scene: sceneOf(), model: modelOf() }, { maxBytes: 64 * 1024 * 1024 });
    const { report } = await convertStudioBg3dSkpBytes(big, conversion);
    expect(fake.calls.parse).toBe(0);
    expect(report.conversion.metadataPass).toBe("skipped-large");
    expect(report.warnings).toContainEqual({ code: "metadata-unavailable", severity: "info", count: null, detail: "large-file" });
  });

  it("reports scenes only for modern files because classic files carry none", async () => {
    const legacy = createSkpHeaderBytes({ version: "{17.0.1}", container: "legacy", byteLength: 1024 });
    const { conversion } = options({ scene: sceneOf(), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(legacy, conversion);
    expect(report.source.container).toBe("legacy");
    expect(report.names.scenes.available).toBe(false);
  });

  it("warns about hidden instances and hidden tags that the baked scene still contains, in either container", async () => {
    const legacy = createSkpHeaderBytes({ version: "{17.0.1}", container: "legacy", byteLength: 1024 });
    const model = modelOf({
      definitions: new Map<number, unknown>([[5, { id: 5, name: "Box", faces: [], instances: [] }]]),
      root: {
        faces: [],
        instances: [{ name: "Box 1", refIdx: 5, hidden: true }, { name: "Box 2", refIdx: 5, hidden: false }],
      },
      layers: [{ name: "Untagged", hidden: false }, { name: "Scratch", hidden: true }],
    });
    const { conversion } = options({ scene: sceneOf(), model });
    const hiddenWarnings = [
      { code: "hidden-instances-included", severity: "warning", count: 1, detail: null },
      { code: "hidden-tags-included", severity: "warning", count: 1, detail: "Scratch" },
    ];
    // OpenSKP 소스는 레거시(레이어 레코드)와 2021 이후(8E3C) 모두에서 태그 숨김을 읽는다.
    for (const bytes of [legacy, VFF_BYTES]) {
      const { report } = await convertStudioBg3dSkpBytes(bytes, conversion);
      for (const warning of hiddenWarnings) expect(report.warnings).toContainEqual(warning);
    }
  });

  it("does not warn about tags when the parser reports none as hidden", async () => {
    const { conversion } = options({ scene: sceneOf(), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.warnings.map((warning) => warning.code)).not.toContain("hidden-tags-included");
  });
});

describe("convertStudioBg3dSkpBytes — textures", () => {
  it("embeds referenced textures when they are within budget", async () => {
    const textures = [{ data: PNG, mimeType: "image/png", filename: "a.png" }, { data: PNG, mimeType: "image/png", filename: "b.png" }];
    const { conversion, fake } = options({ scene: sceneOf({ textures }), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(fake.calls.toGlb[0].options).toEqual({ textures: true });
    expect(report.conversion.textures).toBe("embedded");
    expect(report.counts).toMatchObject({ textures: 2, texturesReferenced: 2 });
  });

  it("falls back to flat colour and says so when there are too many textures", async () => {
    const textures = Array.from({ length: STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT + 1 }, (_, index) => ({ data: PNG, mimeType: "image/png", filename: `${index}.png` }));
    const { conversion, fake } = options({ scene: sceneOf({ textures }), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(fake.calls.toGlb[0].options).toBeUndefined();
    expect(report.conversion.textures).toBe("omitted");
    expect(report.counts).toMatchObject({ textures: 0, texturesReferenced: STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT + 1 });
    expect(report.warnings).toContainEqual({ code: "textures-omitted", severity: "warning", count: STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT + 1, detail: "count" });
  });

  it("falls back to flat colour when the combined image bytes exceed the budget", async () => {
    const textures = [{ data: new Uint8Array(STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_BYTES + 1), mimeType: "image/png", filename: "huge.png" }];
    const { conversion } = options({ scene: sceneOf({ textures }), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.conversion.textures).toBe("omitted");
    expect(report.warnings).toContainEqual({ code: "textures-omitted", severity: "warning", count: 1, detail: "size" });
  });

  it("names materials whose texture file is missing or in an unsupported format", async () => {
    const model = modelOf({
      root: { faces: [{ materialId: 1, backMaterialId: null }, { materialId: 2, backMaterialId: null }], instances: [] },
      materials: [
        { id: 1, name: "Lost Wood", texture: { data: null } },
        { id: 2, name: "Scan", texture: { data: new Uint8Array([0x42, 0x4d, 0, 0]) } },
      ],
      materialsById: new Map<number, unknown>([
        [1, { id: 1, name: "Lost Wood", texture: { data: null } }],
        [2, { id: 2, name: "Scan", texture: { data: new Uint8Array([0x42, 0x4d, 0, 0]) } }],
      ]),
    });
    const { conversion } = options({ scene: sceneOf(), model });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.warnings).toContainEqual({ code: "texture-missing", severity: "warning", count: 1, detail: "Lost Wood" });
    expect(report.warnings).toContainEqual({ code: "texture-unsupported-format", severity: "warning", count: 1, detail: "Scan" });
  });
});

describe("convertStudioBg3dSkpBytes — geometry warnings", () => {
  it("warns about faces whose front side points the other way, with the border count", async () => {
    const scene = sceneOf({ glbPrimitives: [createBoxPrimitive({ size: 2, reversedFaces: [3] })] });
    const { conversion } = options({ scene, model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.warnings).toContainEqual({ code: "flipped-faces", severity: "warning", count: 4, detail: null });
  });

  it("warns about too many polygons and says the orientation check was skipped for them", async () => {
    const triangles = 250_000;
    const bulk = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(6),
      indices: new Uint32Array(triangles * 3).map((_, index) => index % 3),
      materialIndex: 0,
      geomName: "bulk",
    };
    const { conversion } = options({ scene: sceneOf({ glbPrimitives: [bulk] }), model: modelOf() });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.counts.triangles).toBe(triangles);
    expect(report.warnings).toContainEqual({ code: "high-polygon-count", severity: "warning", count: triangles, detail: null });
    expect(report.warnings).toContainEqual({ code: "orientation-check-skipped", severity: "info", count: triangles, detail: null });
  });

  it("flags an abnormal size and recommends a unit from the file's own declaration when plausible", async () => {
    const scene = sceneOf({ glbPrimitives: [createBoxPrimitive({ size: 3_000 })] });
    const { conversion } = options({ scene, model: modelOf({ units: "Millimeter" }) });
    const { report } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(report.size?.level).toBe("too-large");
    expect(report.size?.recommendedUnit).toBe("mm");
    expect(report.warnings.map((warning) => warning.code)).toContain("size-abnormal");
  });

  it("produces a GLB whose JSON the synthetic exporter wrote (end of pipeline sanity)", async () => {
    const { conversion } = options({ scene: sceneOf(), model: modelOf() });
    const { glb } = await convertStudioBg3dSkpBytes(VFF_BYTES, conversion);
    expect(readGlbJson(glb).asset).toMatchObject({ version: "2.0" });
  });
});

describe("classifyOpenSkpFailure", () => {
  it("returns an already-classified error unchanged", () => {
    const error = new StudioBg3dSkpConversionError("skp-timeout", "x");
    expect(classifyOpenSkpFailure(error)).toBe(error);
  });

  it("treats non-Error throwables as parse failures with a neutral message", () => {
    const classified = classifyOpenSkpFailure("boom");
    expect(classified.code).toBe("skp-parse-failed");
    expect(classified.message).toContain(".skp 파일 구조를 해석하지 못했습니다");
  });
});

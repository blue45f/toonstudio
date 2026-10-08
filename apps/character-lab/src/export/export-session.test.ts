import { beforeAll, describe, expect, it } from "vitest";

import { KIT_MORPH_NAMES, createDefaultRecipe, createKitDefaultRecipe, failVisible, recipeDigest } from "../contracts";
import { fnv1a32 } from "../shared/hash";
import { buildMinimalGlb, parseGlb } from "../testing/minimal-glb";
import { createMockEngine, syntheticRaster } from "../testing/mock-engine";
import { installPsdCanvasStub } from "../testing/psd-canvas-stub";
import { rasterEquals } from "../testing/raster-fixtures";
import { defaultRecipeFixture } from "../testing/recipe-fixtures";

import { MAX_PNG_EXPORT_DIMENSION, MAX_PSD_EXPORT_DIMENSION, buildCaptureRequest, exportFileName, exportGlb, exportLayeredPsd, exportRecipe, exportTransparentPng, isGlb, validateExportDimensions } from "./export-session";
import { decodePng } from "./png-encoder";
import { parseRecipeFile } from "./recipe-file";

import type { CaptureRequest } from "../contracts";

beforeAll(() => {
  installPsdCanvasStub();
});

describe("exportTransparentPng", () => {
  it("요청 해상도로 lit 패스를 캡처해 PNG로 인코딩한다(뷰포트 크기 무관)", async () => {
    const engine = createMockEngine();
    engine.resize(300, 200);
    let tick = 100;
    const result = await exportTransparentPng(engine, { width: 32, height: 24, settleSteps: 10 }, { now: () => (tick += 5) });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const decoded = await decodePng(result.bytes);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(24);
    expect(rasterEquals(decoded, syntheticRaster(32, 24, fnv1a32("lit")))).toBe(true);
    expect(decoded.rgba[3]).toBe(0); // 테두리 투명 보존
    expect(result.receipt).toMatchObject({ kind: "png", mime: "image/png", width: 32, height: 24, settleSteps: 10, fileName: "character-mock-32x24.png" });
    expect(result.receipt.durationMs).toBeGreaterThan(0);
    const settle = engine.calls.find((c) => c.method === "settle");
    expect(settle?.args).toEqual([10]);
    const passes = engine.calls.find((c) => c.method === "renderPasses");
    const request = passes?.args[0] as CaptureRequest;
    expect(request).toMatchObject({ width: 32, height: 24, passes: ["lit"], transparentBackground: true, settleSteps: 10 });
    expect(request.camera?.mode).toBe("full-body");
  });

  it("크기 검증·엔진 실패·settle 실패를 LabFailure로 돌려준다", async () => {
    const engine = createMockEngine();
    const tooBig = await exportTransparentPng(engine, { width: MAX_PNG_EXPORT_DIMENSION + 1, height: 16 });
    expect(!tooBig.ok && tooBig.failure.code).toBe("export-size");
    expect(engine.calls).toHaveLength(0);
    const fractional = validateExportDimensions(10.5, 16, 4096);
    expect(fractional?.code).toBe("export-size");

    const failing = createMockEngine({ failPasses: failVisible("mock-pass-fail", "모의 패스 실패", undefined, 1) });
    const failed = await exportTransparentPng(failing, { width: 16, height: 16 });
    expect(!failed.ok && failed.failure.code).toBe("mock-pass-fail");

    const broken = createMockEngine();
    broken.settle = async () => {
      throw new Error("settle boom");
    };
    const settleFailed = await exportTransparentPng(broken, { width: 16, height: 16, settleSteps: 3 });
    expect(!settleFailed.ok && settleFailed.failure.code).toBe("export-settle");
    expect(!settleFailed.ok && settleFailed.failure.detail).toMatch(/settle boom/u);

    const wrongSize = createMockEngine();
    const original = wrongSize.renderPasses.bind(wrongSize);
    wrongSize.renderPasses = async (req) => original({ ...req, width: 8, height: 8 });
    const mismatch = await exportTransparentPng(wrongSize, { width: 16, height: 16 });
    expect(!mismatch.ok && mismatch.failure.code).toBe("export-capture-size");
  });
});

describe("exportLayeredPsd", () => {
  it("5개 패스를 캡처해 PSD 바이트와 레이어 영수증을 돌려준다", async () => {
    const engine = createMockEngine({ partIdPalette: { 1: { role: "skin", labelKo: "피부" } } });
    const result = await exportLayeredPsd(engine, [], { width: 24, height: 24, includeIdMasks: true, includeReferencePasses: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(String.fromCharCode(...result.bytes.subarray(0, 4))).toBe("8BPS");
    expect(result.receipt.kind).toBe("psd");
    expect(result.receipt.fileName).toBe("character-mock-24x24.psd");
    expect(result.receipt.psd?.names).toContain("밑색");
    expect(result.receipt.psd?.names).toContain("참조/법선");
    const request = engine.calls.find((c) => c.method === "renderPasses")?.args[0] as CaptureRequest;
    expect(request.passes).toEqual(["flat", "lit", "normal", "depth", "part-id"]);
    const tooBig = await exportLayeredPsd(engine, [], { width: MAX_PSD_EXPORT_DIMENSION + 1, height: 16, includeIdMasks: false, includeReferencePasses: false });
    expect(!tooBig.ok && tooBig.failure.code).toBe("export-size");
  });
});

describe("exportGlb / exportRecipe", () => {
  it("GLB 매직을 검사하고 파일명을 만든다", async () => {
    const engine = createMockEngine();
    const recipe = defaultRecipeFixture();
    const result = await exportGlb(engine, recipe);
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(isGlb(result.bytes)).toBe(true);
    expect(result.receipt.mime).toBe("model/gltf-binary");
    expect(result.receipt.fileName).toMatch(/^character-[0-9a-f]{8}\.glb$/u);
    engine.exportGlb = async () => new Uint8Array([1, 2, 3]);
    const invalid = await exportGlb(engine, recipe);
    expect(!invalid.ok && invalid.failure.code).toBe("export-glb-invalid");
    engine.exportGlb = async () => {
      throw new Error("no scene");
    };
    const thrown = await exportGlb(engine, recipe);
    expect(!thrown.ok && thrown.failure.code).toBe("export-glb");
    expect(exportFileName("png", "abcdef0123", 10, 20)).toBe("character-abcdef01-10x20.png");
  });

  it("레시피 JSON은 페인트 레이어를 포함하고 다시 파싱된다", async () => {
    const recipe = defaultRecipeFixture();
    const layer = { part: "skin" as const, width: 4, height: 4, rgba: new Uint8ClampedArray(64).fill(255), revision: 1 };
    const result = await exportRecipe(recipe, [layer], { now: () => Date.UTC(2026, 9, 1) });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(result.receipt.fileName).toMatch(/^character-[0-9a-f]{8}-20261001\.character\.json$/u);
    const parsed = parseRecipeFile(new TextDecoder().decode(result.bytes));
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    expect(parsed.recipe.paint.layers).toHaveLength(1);
    expect(buildCaptureRequest({ width: 8, height: 8, settleSteps: 99999 }, ["lit"]).settleSteps).toBe(600);
  });
});

describe("키트 소스 GLB·레시피 내보내기 (계약 문서 8.2절)", () => {
  it("키트 레시피의 GLB 파일명은 v2 레시피 다이제스트이고 절차·성별에 따라 달라진다", async () => {
    const engine = createMockEngine();
    const female = createKitDefaultRecipe("female");
    const male = createKitDefaultRecipe("male");
    const results = await Promise.all([exportGlb(engine, female), exportGlb(engine, male), exportGlb(engine, createDefaultRecipe())]);
    const names = results.map((r) => (r.ok ? r.receipt.fileName : r.failure.reasonKo));
    expect(names[0]).toBe(`character-${recipeDigest(female).slice(0, 8)}.glb`);
    expect(names[1]).toBe(`character-${recipeDigest(male).slice(0, 8)}.glb`);
    expect(new Set(names).size).toBe(3);
    expect(recipeDigest(createKitDefaultRecipe("female"))).toBe(recipeDigest(female));
    expect(engine.calls.filter((c) => c.method === "exportGlb")).toHaveLength(3);
  });

  it("키트 morph 어휘 64개를 담은 GLB를 가공 없이 그대로 돌려준다(엔진이 내용을 책임진다)", async () => {
    const kitGlb = buildMinimalGlb({ meshName: "TS_Body", morphTargetNames: KIT_MORPH_NAMES });
    const engine = createMockEngine();
    engine.exportGlb = async () => kitGlb;
    const result = await exportGlb(engine, createKitDefaultRecipe());
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(result.bytes).toBe(kitGlb);
    expect(result.receipt).toMatchObject({ kind: "glb", mime: "model/gltf-binary", bytes: kitGlb.length });
    const parsed = parseGlb(result.bytes);
    expect(parsed.version).toBe(2);
    expect(KIT_MORPH_NAMES).toHaveLength(64);
    expect(JSON.stringify(parsed.json)).toContain("param:headSize:+");
  });

  it("GLB 매직 검사는 큰 버퍼의 일부(byteOffset)로 받은 바이트도 올바르게 읽고 버전 1·짧은 바이트·키트 로드 실패 사유를 거른다", async () => {
    const glb = buildMinimalGlb();
    const padded = new Uint8Array(glb.length + 8);
    padded.set(glb, 8);
    const view = padded.subarray(8);
    expect(view.byteOffset).toBe(8);
    expect(isGlb(view)).toBe(true);
    const v1 = new Uint8Array(glb);
    new DataView(v1.buffer).setUint32(4, 1, true);
    expect(isGlb(v1)).toBe(false);
    expect(isGlb(glb.subarray(0, 11))).toBe(false);

    const engine = createMockEngine();
    engine.exportGlb = async () => view;
    const ok = await exportGlb(engine, createKitDefaultRecipe());
    expect(ok.ok).toBe(true);
    engine.exportGlb = async () => v1;
    const invalid = await exportGlb(engine, createKitDefaultRecipe());
    expect(!invalid.ok && invalid.failure.code).toBe("export-glb-invalid");
  });

  it("엔진이 던진 LabFailure(키트 로드 실패 등)는 코드를 바꾸지 않고 그대로 올린다(무음 대체 금지)", async () => {
    const engine = createMockEngine();
    engine.exportGlb = async () => {
      throw failVisible("kit-source-unsupported", "이 엔진은 아직 모듈식 키트 소스를 불러오지 못합니다.", undefined, 1);
    };
    const result = await exportGlb(engine, createKitDefaultRecipe());
    expect(!result.ok && result.failure.code).toBe("kit-source-unsupported");
    expect(!result.ok && result.failure.reasonKo).toMatch(/키트/u);
  });

  it("키트 레시피 JSON은 v2·kit 소스를 보존하며 다시 파싱되고, 헤어 같은 변형 의존 페인트 레이어도 함께 실린다", async () => {
    const recipe = createKitDefaultRecipe("male");
    const hair = { part: "hair" as const, width: 4, height: 4, rgba: new Uint8ClampedArray(64).fill(200), revision: 1 };
    const result = await exportRecipe(recipe, [hair], { now: () => Date.UTC(2026, 9, 8) });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(result.receipt.fileName).toMatch(/^character-[0-9a-f]{8}-20261008\.character\.json$/u);
    const parsed = parseRecipeFile(new TextDecoder().decode(result.bytes));
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    expect(parsed.recipe.version).toBe(2);
    expect(parsed.recipe.source).toEqual(recipe.source);
    expect(parsed.recipe.source.kind).toBe("kit");
    expect(parsed.recipe.paint.layers.map((l) => l.part)).toEqual(["hair"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildKraFixtureDetailed,
  buildKraMaskTileFile,
  buildKraTileFile,
  kraTilePayload,
  noiseTile,
  patternTile,
  solidTile,
} from "../../../../tests/corpus/formats/kra-fixtures";
import { buildFormatZipFixture } from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import { describeKraPixelFormat, kraReduceLut } from "../kra-colorspace";
import { applyKraTransparencyMasks, importKra } from "../kra-document";
import { parseKraMaindoc } from "../kra-maindoc";
import { assembleKraLayer, assembleKraMask, decodeKraTile, KraTileError, parseKraTileFile } from "../kra-tiles";
import { KRA_LIMITS, KraError } from "../kra-types";

/** 결정적 난수(mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 바이트를 바꾸거나 지우거나 끼워 넣는다. */
function corrupt(source: Uint8Array, next: () => number): Uint8Array {
  let bytes = Uint8Array.from(source);
  const edits = 1 + Math.floor(next() * 4);
  for (let edit = 0; edit < edits; edit += 1) {
    const at = Math.floor(next() * Math.max(1, bytes.length));
    const kind = Math.floor(next() * 4);
    if (kind === 0) {
      bytes[at] = Math.floor(next() * 256);
    } else if (kind === 1) {
      bytes[at] = bytes[at]! ^ (1 << Math.floor(next() * 8));
    } else if (kind === 2) {
      const cut = Math.min(Math.max(0, bytes.length - at), 1 + Math.floor(next() * 8));
      const out = new Uint8Array(bytes.length - cut);
      out.set(bytes.subarray(0, at));
      out.set(bytes.subarray(at + cut), at);
      bytes = out;
    } else {
      const inserted = Uint8Array.from({ length: 1 + Math.floor(next() * 8) }, () => Math.floor(next() * 256));
      const out = new Uint8Array(bytes.length + inserted.length);
      out.set(bytes.subarray(0, at));
      out.set(inserted, at);
      out.set(bytes.subarray(at), at + inserted.length);
      bytes = out;
    }
  }
  return bytes;
}

const rgba8 = describeKraPixelFormat("RGBA")!;

/** 타일 파일 전체를 읽는 경로. KraTileError 외의 예외는 모두 결함이다. */
function runTilePipeline(bytes: Uint8Array): void {
  try {
    const file = parseKraTileFile(bytes, { ...KRA_LIMITS, maxLayerPixels: 300_000 });
    assembleKraLayer({
      file,
      format: file.pixelBytes === rgba8.pixelBytes ? rgba8 : describeKraPixelFormat("RGBA16")!,
      lut: kraReduceLut("srgb"),
      defaultPixelNative: null,
      offsetX: 0,
      offsetY: 0,
      canvasWidth: 64,
      canvasHeight: 64,
      limits: { ...KRA_LIMITS, maxLayerPixels: 300_000 },
    });
    for (const tile of file.tiles) decodeKraTile(file, tile);
  } catch (error) {
    if (!(error instanceof KraTileError)) throw error;
  }
}

/** 마스크 값 파일 전체를 읽는 경로. KraTileError 외의 예외는 모두 결함이다. */
function runMaskPipeline(bytes: Uint8Array): void {
  try {
    const limits = { ...KRA_LIMITS, maxLayerPixels: 300_000 };
    const file = parseKraTileFile(bytes, limits);
    assembleKraMask({ file, defaultValue: 7, offsetX: 5, offsetY: -3, limits });
    for (const tile of file.tiles) decodeKraTile(file, tile);
  } catch (error) {
    if (!(error instanceof KraTileError)) throw error;
  }
}

describe("손상 입력에서도 정해진 오류만 던진다", () => {
  const tileFile = buildKraTileFile({
    pixelBytes: 4,
    tiles: [
      { x: 0, y: 0, payload: kraTilePayload(patternTile(4, 1), 4) },
      { x: 64, y: 0, payload: kraTilePayload(noiseTile(4, 2), 4, "raw") },
      { x: -64, y: 64, payload: kraTilePayload(solidTile([5, 6, 7, 255]), 4) },
    ],
  });

  it("타일 파일을 어느 길이에서 잘라도 KraTileError만 난다", () => {
    for (let length = 0; length <= tileFile.length; length += 1) runTilePipeline(tileFile.subarray(0, length));
  });

  it("타일 파일의 무작위 변조 4000건에서 KraTileError 외의 예외가 없다", () => {
    const next = random(20_261_029);
    for (let round = 0; round < 4000; round += 1) runTilePipeline(corrupt(tileFile, next));
  });

  describe("마스크 값 경로", () => {
    const maskFile = buildKraMaskTileFile([
      { x: 0, y: 0, values: (x, y) => (x * 3 + y * 5) & 0xff },
      { x: 64, y: 0, values: noiseTile(1, 2) },
      { x: -64, y: 64, values: () => 200 },
    ]);

    it("마스크 값 파일을 어느 길이에서 잘라도 KraTileError만 난다", () => {
      for (let length = 0; length <= maskFile.length; length += 1) runMaskPipeline(maskFile.subarray(0, length));
    });

    it("마스크 값 파일의 무작위 변조 4000건에서 KraTileError 외의 예외가 없다", () => {
      const next = random(20_261_030);
      for (let round = 0; round < 4000; round += 1) runMaskPipeline(corrupt(maskFile, next));
    });

    it("마스크 항목(값 파일, 기본값, maindoc, 레이어 데이터)을 변조하고 ZIP을 다시 만든 600건에서 정해진 오류만 나고 적용 결과가 일관된다", async () => {
      const detailed = buildKraFixtureDetailed({
        layers: [
          {
            name: "a",
            tileFile,
            masks: [
              { nodetype: "transparencymask", name: "top", valuesFile: maskFile, attrs: { x: "10", y: "-4" } },
              { nodetype: "transparencymask", name: "low", valuesFile: buildKraMaskTileFile([{ x: 0, y: 0, values: () => 128 }]), defaultValue: Uint8Array.of(255) },
              { nodetype: "selectionmask", name: "sel", valuesFile: maskFile },
              { nodetype: "transparencymask", name: "empty" },
            ],
          },
          { nodetype: "grouplayer", name: "g", masks: [{ nodetype: "transparencymask", name: "gm", valuesFile: maskFile }], children: [{ name: "b", tileFile }] },
        ],
      });
      const next = random(5_150);
      let maskDiagnostics = 0;
      let applied = 0;
      let unreadable = 0;
      let rejected = 0;
      for (let round = 0; round < 600; round += 1) {
        const target = Math.floor(next() * detailed.entries.length);
        const entries = detailed.entries.map((entry, index) =>
          index === target ? { ...entry, data: corrupt(entry.data ?? new Uint8Array(), next), method: 0 as const } : { ...entry, method: 0 as const },
        );
        try {
          const result = await importKra(buildFormatZipFixture(entries));
          if (result.unsupported.some((issue) => issue.code.startsWith("kra-mask-") && issue.code !== "kra-mask-unsupported")) maskDiagnostics += 1;
          for (const layer of result.layers) {
            const outcome = applyKraTransparencyMasks(layer);
            if (outcome.status === "applied") {
              applied += 1;
              expect(outcome.pixels.length).toBe(layer.pixels!.length);
            } else if (outcome.status === "mask-unreadable") {
              unreadable += 1;
              expect(layer.masks[outcome.maskIndex]!.defaultValue).toBeNull();
            }
          }
        } catch (error) {
          if (!(error instanceof KraError)) throw error;
          rejected += 1;
        }
      }
      // 마스크 코드에 실제로 닿았다는 증거
      expect(maskDiagnostics).toBeGreaterThan(10);
      expect(applied).toBeGreaterThan(100);
      expect(unreadable).toBeGreaterThan(5);
      expect(rejected).toBeLessThan(300);
    });
  });

  it("maindoc.xml의 무작위 변조 1500건에서 KraError 외의 예외가 없다", () => {
    const base = buildKraFixtureDetailed({
      layers: [
        { name: "A &amp; b", masks: [{ nodetype: "transparencymask", name: "m" }] },
        { nodetype: "grouplayer", name: "g", children: [{ name: "inner" }, { nodetype: "clonelayer", name: "c" }] },
      ],
    }).maindoc;
    const bytes = new TextEncoder().encode(base);
    const decoder = new TextDecoder("utf-8");
    const next = random(77);
    for (let round = 0; round < 1500; round += 1) {
      const text = decoder.decode(corrupt(bytes, next));
      try {
        parseKraMaindoc(text, KRA_LIMITS);
      } catch (error) {
        if (!(error instanceof KraError)) throw error;
      }
    }
  });

  it("ZIP 바이트의 무작위 변조 300건은 가져오기에 성공하거나 KraError로 끝난다 (대부분 ZIP 계층에서 거부된다)", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "a", tileFile }, { nodetype: "grouplayer", name: "g", children: [{ name: "b", tileFile }] }] });
    const next = random(4242);
    for (let round = 0; round < 300; round += 1) {
      try {
        await importKra(corrupt(detailed.bytes, next));
      } catch (error) {
        if (!(error instanceof KraError)) throw error;
      }
    }
  });

  it("항목 내용(maindoc, 레이어 데이터, 기본 픽셀, 부속 이미지, mimetype)을 변조하고 ZIP을 다시 만든 600건이 안쪽 파서까지 닿는다", async () => {
    // ZIP의 CRC를 다시 계산하므로 변조가 컨테이너 검사에 걸리지 않고 maindoc·타일·색 공간 코드까지 도달한다.
    const detailed = buildKraFixtureDetailed({
      layers: [
        { name: "a", tileFile, masks: [{ nodetype: "transparencymask", name: "m" }] },
        { nodetype: "grouplayer", name: "g", children: [{ name: "b", tileFile }, { nodetype: "clonelayer", name: "c" }] },
      ],
      mergedImage: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
      icc: Uint8Array.from([1, 2, 3, 4]),
    });
    const next = random(31_337);
    let layerDiagnostics = 0;
    let assetDiagnostics = 0;
    let rejected = 0;
    let succeeded = 0;
    for (let round = 0; round < 600; round += 1) {
      const target = Math.floor(next() * detailed.entries.length);
      const entries = detailed.entries.map((entry, index) =>
        index === target ? { ...entry, data: corrupt(entry.data ?? new Uint8Array(), next), method: 0 as const } : { ...entry, method: 0 as const },
      );
      try {
        const result = await importKra(buildFormatZipFixture(entries));
        succeeded += 1;
        if (result.unsupported.some((issue) => issue.code.startsWith("kra-layer"))) layerDiagnostics += 1;
        if (result.warnings.some((issue) => issue.code.startsWith("kra-png") || issue.code.startsWith("kra-mimetype"))) assetDiagnostics += 1;
      } catch (error) {
        if (!(error instanceof KraError)) throw error;
        rejected += 1;
      }
    }
    // 안쪽 파서에 실제로 닿았다는 증거: 레이어 데이터 진단, 부속 항목 진단, 문서 거부가 모두 일어난다
    expect(layerDiagnostics).toBeGreaterThan(15);
    expect(assetDiagnostics).toBeGreaterThan(4);
    expect(rejected).toBeGreaterThan(15);
    expect(succeeded).toBeGreaterThan(75);
  });

  it("압축을 풀지 않는(stored) 항목의 변조는 CRC·구조 검사에 걸리거나 진단으로 남는다", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "a", tileFile }] });
    const stored = buildFormatZipFixture(detailed.entries.map((entry) => ({ ...entry, method: 0 as const })));
    const next = random(99);
    for (let round = 0; round < 300; round += 1) {
      try {
        await importKra(corrupt(stored, next));
      } catch (error) {
        if (!(error instanceof KraError)) throw error;
      }
    }
  });
});

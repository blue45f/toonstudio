import { initializeCanvas, readPsd } from "ag-psd";
import { describe, expect, it } from "vitest";

import { buildCharacterSemanticPsd } from "./character-shaper-psd-assembly";
import { createCharacterExportPreflight } from "../character-platform/export/character-export-preflight";

import type { CharacterSemanticPass, CharacterSemanticPassId } from "./character-shaper-contract";
import type { Layer } from "ag-psd";

initializeCanvas(() => { throw new Error("이 검증은 DOM 캔버스를 사용하지 않습니다."); },
  (width, height): ImageData => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }));

type Pixel = readonly [number, number, number, number];

/** 프로덕션 수학을 호출하지 않는 normal/Multiply/Screen·그룹 마스크·클리핑 합성기. */
function composite(layers: readonly Layer[], pixel: number): Pixel {
  let out: Pixel = [0, 0, 0, 0];
  for (const layer of [...layers].reverse()) {
    if (layer.hidden) continue;
    const data = layer.imageData?.data;
    const source: Pixel = layer.children ? composite(layer.children, pixel)
      : [data?.[pixel * 4] ?? 0, data?.[pixel * 4 + 1] ?? 0, data?.[pixel * 4 + 2] ?? 0, (data?.[pixel * 4 + 3] ?? 0) / 255];
    const mask = layer.mask?.imageData?.data;
    const alpha = source[3] * (layer.opacity ?? 1) * (mask ? (mask[pixel * 4] ?? 0) / 255 : 1);
    const blend = (channel: number) => layer.blendMode === "multiply" ? out[channel] * source[channel] / 255
      : layer.blendMode === "screen" ? 255 - (255 - out[channel]) * (255 - source[channel]) / 255 : source[channel];
    if (layer.clipping) {
      const clipped = (c: number) => out[c] * (1 - alpha) + blend(c) * alpha;
      if (out[3] > 0) out = [clipped(0), clipped(1), clipped(2), out[3]];
      continue;
    }
    const nextAlpha = alpha + out[3] * (1 - alpha);
    const colour = (channel: number) => nextAlpha === 0 ? 0 : ((1 - alpha) * out[3] * out[channel]
      + (1 - out[3]) * alpha * source[channel] + out[3] * alpha * blend(channel)) / nextAlpha;
    out = [colour(0), colour(1), colour(2), nextAlpha];
  }
  return out;
}

function pass(id: CharacterSemanticPassId, pixels: readonly Pixel[]): CharacterSemanticPass {
  return { id, width: 3, height: 1, rgba: new Uint8ClampedArray(pixels.flatMap((pixel) => [...pixel])) };
}

function fixture() {
  const flat: Pixel[] = [[60, 80, 130, 255], [40, 70, 100, 96], [180, 120, 90, 180]];
  const shadow: Pixel[] = [[120, 160, 220, 255], [60, 180, 100, 96], [200, 160, 180, 255]];
  const highlight: Pixel[] = [[20, 40, 10, 128], [30, 10, 40, 96], [20, 10, 30, 64]];
  const appearance: Pixel[] = flat.map((pixel, index) => {
    const dark = (channel: number) => pixel[channel] * (1 - shadow[index][3] / 255 + shadow[index][channel] / 255 * shadow[index][3] / 255);
    const channel = (c: number) => Math.round(dark(c) + (255 - dark(c)) * highlight[index][c] / 255 * highlight[index][3] / 255);
    return [channel(0), channel(1), channel(2), pixel[3]];
  });
  const passes = [pass("beauty", appearance), pass("flat", flat), pass("shadow", shadow), pass("highlight", highlight),
    pass("line", [[0, 0, 0, 120], [0, 0, 0, 80], [0, 0, 0, 200]]),
    pass("mask-hair", [[255, 255, 255, 255], [255, 255, 255, 96], [255, 255, 255, 0]]),
    pass("mask-skin", [[255, 255, 255, 0], [255, 255, 255, 0], [255, 255, 255, 180]])];
  return { passes, appearance };
}

async function roundtrip(passes: readonly CharacterSemanticPass[], createHairLayer: boolean) {
  const result = buildCharacterSemanticPsd(passes, [], { title: "헤어 색 분리", createHairLayer, extractLuminanceOutline: true });
  const psd = readPsd(await result.blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  return { ...result, psd };
}

describe("PSD 실제 헤어 색 분리", () => {
  it("비흰색·반투명 헤어를 PSD로 재읽어 독립 재합성해도 원래 색과 alpha를 유지한다", async () => {
    const { passes, appearance } = fixture();
    const originals = passes.map((entry) => new Uint8ClampedArray(entry.rgba));
    const off = await roundtrip(passes, false); const on = await roundtrip(passes, true);
    expect(passes.map((entry) => entry.rgba)).toEqual(originals);
    const character = on.psd.children?.find((layer) => layer.name === "캐릭터");
    const hair = character?.children?.find((layer) => layer.name === "헤어 (SHAPER 3-Layer)");
    expect(hair?.children?.map((layer) => layer.name)).toEqual(["Hair Line", "Hair Shadow", "Hair Base"]);
    expect(hair?.children?.[0]?.hidden).toBe(true);
    expect(hair?.children?.[0]?.clipping).toBe(true); expect(hair?.children?.[1]?.clipping).toBe(true);
    expect(hair?.children?.[2]?.imageData?.data.slice(0, 3)).not.toEqual(new Uint8ClampedArray([255, 255, 255]));
    expect(on.receipt.skipped).toContainEqual(expect.objectContaining({ pass: "line", reason: expect.stringContaining("기본 숨김") }));
    for (let pixel = 0; pixel < 3; pixel += 1) {
      const before = composite(off.psd.children ?? [], pixel); const after = composite(on.psd.children ?? [], pixel);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(after[c] - appearance[pixel][c])).toBeLessThanOrEqual(1);
        expect(Math.abs(after[c] - before[c])).toBeLessThanOrEqual(1);
      }
      expect(after[3] * 255).toBeCloseTo(appearance[pixel][3]);
    }
    if (!hair) throw new Error("헤어 그룹 없음");
    hair.hidden = true;
    expect(composite(on.psd.children ?? [], 0)[3]).toBe(0); expect(composite(on.psd.children ?? [], 1)[3]).toBe(0);
    const body = composite(on.psd.children ?? [], 2);
    expect(body[3] * 255).toBeCloseTo(180);
    for (let c = 0; c < 3; c += 1) expect(Math.abs(body[c] - appearance[2][c])).toBeLessThanOrEqual(1);
  });

  it("실제 PSD clipping은 Hair Shadow·Line을 Hair Base 밖의 본체로 번지지 않게 한다", async () => {
    const { passes } = fixture(); const { psd } = await roundtrip(passes, true);
    const hair = psd.children?.find((layer) => layer.name === "캐릭터")?.children?.find((layer) => layer.name === "헤어 (SHAPER 3-Layer)");
    if (!hair?.children) throw new Error("헤어 그룹 없음");
    const before = composite(psd.children ?? [], 2);
    for (const layer of hair.children.filter((layer) => layer.clipping)) {
      layer.hidden = false;
      layer.imageData?.data.set([255, 0, 0, 255], 8);
    }
    expect(composite(psd.children ?? [], 2)).toEqual(before);
  });

  it("유효한 밑색·음영·선화가 없으면 마스크를 색으로 대체하지 않고 없는 패스와 사유를 기록한다", async () => {
    const { passes } = fixture();
    const missingFlat = await roundtrip(passes.filter((entry) => entry.id !== "flat"), true);
    expect(missingFlat.receipt.layerNames).not.toContain("헤어 (SHAPER 3-Layer)");
    expect(missingFlat.receipt.skipped).toContainEqual(expect.objectContaining({ pass: "mask-hair", reason: expect.stringContaining("실제 밑색") }));
    const baseOnly = await roundtrip(passes.filter((entry) => entry.id !== "shadow" && entry.id !== "line"), true);
    expect(baseOnly.receipt.layerNames).toContain("Hair Base"); expect(baseOnly.receipt.layerNames).not.toContain("Hair Shadow");
    expect(baseOnly.receipt.layerNames).not.toContain("Hair Line");
    expect(baseOnly.receipt.skipped).toContainEqual(expect.objectContaining({ pass: "shadow", reason: expect.stringContaining("패스가 없어") }));
    const preflight = createCharacterExportPreflight({ format: "psd", width: 1024, height: 1024, transparent: true, profile: {}, createHairLayer: true });
    expect(preflight.shaperHairThreeLayers).toEqual([]);
    expect(preflight.warnings).toContainEqual(expect.objectContaining({ code: "hair-split-conditional", message: expect.stringContaining("생략") }));
    const canonical = createCharacterExportPreflight({ format: "psd", width: 1024, height: 1024, transparent: true, profile: { status: "ready" }, canonical: true, createHairLayer: true });
    expect(canonical.shaperHairThreeLayers?.map((layer) => layer.psdLayerName)).toEqual(["Hair Base", "Hair Shadow", "Hair Line"]);
    expect(canonical.warnings).toContainEqual(expect.objectContaining({ code: "hair-split-conditional", message: expect.stringContaining("기본 숨김") }));
  });
});

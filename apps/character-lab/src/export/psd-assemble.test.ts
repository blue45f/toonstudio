import { readPsd } from "ag-psd";
import { beforeAll, describe, expect, it } from "vitest";

import { allocatePartIdsByRole, rolePartId } from "../contracts";
import { installPsdCanvasStub } from "../testing/psd-canvas-stub";
import { captureResultFixture, fillRaster, idPassRaster, pixelAt, rasterEquals } from "../testing/raster-fixtures";

import { PSD_MIME, assemblePsd, toAgPsd } from "./psd-assemble";
import { planCharacterPsd } from "./psd-plan";

import type { CapturedRaster } from "../contracts";
import type { PsdLayerPlan, PsdPlan } from "./psd-plan";
import type { Layer } from "ag-psd";

beforeAll(() => {
  installPsdCanvasStub();
});

function makePlan(): PsdPlan {
  const capture = captureResultFixture({ width: 16, height: 16 });
  const result = planCharacterPsd(capture, [], { includeIdMasks: true, includeReferencePasses: true });
  if (!result.ok) throw new Error(result.failure.reasonKo);
  return result.plan;
}

function names(layers: readonly Layer[] | undefined, prefix = ""): string[] {
  return (layers ?? []).flatMap((layer) => (layer.children ? [`${prefix}${layer.name ?? ""}`, ...names(layer.children, `${prefix}${layer.name ?? ""}/`)] : [`${prefix}${layer.name ?? ""}`]));
}

function rasterOf(layer: Layer | undefined): CapturedRaster {
  const image = layer?.imageData;
  if (!image) throw new Error(`레이어 ${layer?.name ?? "?"}에 imageData가 없습니다.`);
  return { width: image.width, height: image.height, rgba: new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength) };
}

function find(layers: readonly Layer[] | undefined, name: string): Layer | undefined {
  for (const layer of layers ?? []) {
    if (layer.name === name) return layer;
    const nested = find(layer.children, name);
    if (nested) return nested;
  }
  return undefined;
}

function findPlan(layers: readonly PsdLayerPlan[], name: string): PsdLayerPlan | undefined {
  for (const layer of layers) {
    if (layer.name === name) return layer;
    if (layer.kind === "group") {
      const nested = findPlan(layer.children, name);
      if (nested) return nested;
    }
  }
  return undefined;
}

describe("assemblePsd", () => {
  it("ag-psd round-trip: 레이어 이름·순서·blend·숨김·크기·픽셀과 합성 이미지가 보존된다", () => {
    const plan = makePlan();
    const bytes = assemblePsd(plan);
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0)).toBe("8BPS");
    expect(PSD_MIME).toBe("image/vnd.adobe.photoshop");

    // readPsd는 ArrayBuffer만 받으므로(SharedArrayBuffer 불가) 복사본의 buffer를 넘긴다.
    const psd = readPsd(new Uint8Array(bytes).buffer, { useImageData: true, skipThumbnail: true });
    expect(psd.width).toBe(16);
    expect(psd.height).toBe(16);
    expect(names(psd.children)).toEqual(plan.receipt.names);

    const shade = find(psd.children, "음영");
    const highlight = find(psd.children, "하이라이트");
    const flat = find(psd.children, "밑색");
    expect(shade?.blendMode).toBe("multiply");
    expect(highlight?.blendMode).toBe("screen");
    expect(flat?.blendMode).toBe("normal");
    expect(find(psd.children, "참조")?.hidden).toBe(true);
    expect(find(psd.children, "부위 ID 마스크")?.hidden).toBe(true);
    expect(flat?.hidden ?? false).toBe(false);

    for (const name of ["밑색", "음영", "하이라이트", "주선", "피부", "깊이"]) {
      const planned = findPlan(plan.layers, name);
      const written = find(psd.children, name);
      if (!planned || planned.kind !== "raster") throw new Error(`계획에 ${name} 없음`);
      const read = rasterOf(written);
      expect(read.width).toBe(16);
      expect(read.height).toBe(16);
      expect(rasterEquals(read, planned.raster)).toBe(true);
    }
    const composite = psd.imageData;
    if (!composite) throw new Error("합성 imageData 없음");
    expect(rasterEquals({ width: composite.width, height: composite.height, rgba: new Uint8ClampedArray(composite.data.buffer, composite.data.byteOffset, composite.data.byteLength) }, plan.composite)).toBe(true);
  });

  it("toAgPsd는 그룹을 pass through·children으로, 래스터를 imageData로 매핑한다", () => {
    const plan = makePlan();
    const psd = toAgPsd(plan);
    expect(psd.channels).toBe(4);
    expect(psd.bitsPerChannel).toBe(8);
    const reference = psd.children?.[0];
    expect(reference?.blendMode).toBe("pass through");
    expect(reference?.children?.[0]?.imageData?.width).toBe(16);
    expect(reference?.children?.[0]?.name).toBe("깊이");
  });

  it("실제 PSD 왕복에서 본체의 clipping 체인과 반투명 알파가 보존된다", () => {
    const flat = fillRaster(2, 1, (x) => [100, 140, 180, x === 0 ? 64 : 128]);
    const lit = fillRaster(2, 1, (x) => [60, 180, 120, x === 0 ? 64 : 96]);
    const result = planCharacterPsd(captureResultFixture({ width: 2, height: 1, passes: { flat, lit } }), [], { includeIdMasks: false, includeReferencePasses: false, lineArt: { alphaEdges: false, idEdges: false, lumaEdges: false, depthThreshold: 0, normalAngleDeg: 0 } });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const psd = readPsd(assemblePsd(result.plan), { useImageData: true });
    expect(find(psd.children, "밑색")?.clipping ?? false).toBe(false);
    for (const name of ["음영", "하이라이트", "주선"]) expect(find(psd.children, name)?.clipping, name).toBe(true);
    for (let x = 0; x < 2; x += 1) {
      let alpha = 0;
      for (const layer of psd.children ?? []) {
        if (layer.hidden || layer.children || layer.clipping) continue;
        const sourceAlpha = pixelAt(rasterOf(layer), x, 0)[3] / 255 * (layer.opacity ?? 1);
        alpha = sourceAlpha + alpha * (1 - sourceAlpha);
      }
      expect(alpha * 255).toBe(pixelAt(lit, x, 0)[3]);
    }
  });

  it("실제 PSD 왕복에서도 헤어 알파 분리·음영/주선 clipping·반투명 밑색이 보존된다", () => {
    const roles = ["skin", "hair", "hair-accessory", "skin"] as const;
    const flat = fillRaster(4, 2, (x) => [80, 140, 190, x === 1 ? 64 : x === 2 ? 128 : 255]);
    const lit = fillRaster(4, 2, (x) => [150, 90, 220, x === 1 ? 64 : x === 2 ? 128 : 255]);
    const capture = captureResultFixture({ width: 4, height: 2, partIdPalette: allocatePartIdsByRole(roles.map((role) => ({ role }))), passes: { flat, lit, "part-id": idPassRaster(4, 2, (x) => rolePartId(roles[x] ?? "skin")) } });
    const result = planCharacterPsd(capture, [], { includeIdMasks: false, includeReferencePasses: false, splitHairLayers: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const psd = readPsd(new Uint8Array(assemblePsd(result.plan)).buffer, { useImageData: true, skipThumbnail: true });
    const hair = find(psd.children, "헤어 분리");
    expect(hair?.children?.map((layer) => layer.name)).toEqual(["헤어 밑색", "헤어 음영", "헤어 주선"]);
    expect(find(psd.children, "헤어 밑색")?.clipping ?? false).toBe(false);
    expect(find(psd.children, "헤어 음영")?.clipping).toBe(true);
    expect(find(psd.children, "헤어 주선")?.clipping).toBe(true);
    expect(pixelAt(rasterOf(find(psd.children, "헤어 밑색")), 1, 0)[3]).toBe(64);
    expect(pixelAt(rasterOf(find(psd.children, "헤어 밑색")), 2, 0)[3]).toBe(128);
    for (const name of ["밑색", "음영", "하이라이트", "주선"]) {
      const raster = rasterOf(find(psd.children, name));
      expect(pixelAt(raster, 1, 0), name).toEqual([0, 0, 0, 0]);
      expect(pixelAt(raster, 2, 0), name).toEqual([0, 0, 0, 0]);
    }
    expect(pixelAt(rasterOf(find(psd.children, "밑색")), 0, 0)).toEqual(pixelAt(flat, 0, 0));
    const composite = rasterOf({ imageData: psd.imageData });
    for (let x = 0; x < 4; x += 1) {
      const expected = pixelAt(lit, x, 0);
      const actual = pixelAt(composite, x, 0);
      expect(actual[3]).toBe(expected[3]);
      // PSD 합성 미리보기의 8bit matte 왕복은 반투명 RGB에 255/alpha 양자화 오차가 있다.
      const tolerance = Math.ceil(255 / expected[3]);
      for (let channel = 0; channel < 3; channel += 1) expect(Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(tolerance);
    }
  });
});

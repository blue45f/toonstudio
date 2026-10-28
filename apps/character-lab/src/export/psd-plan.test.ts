import { describe, expect, it } from "vitest";

import { PART_ROLES, PART_ROLE_LABELS_KO, allocatePartIdsByRole, rolePartId } from "../contracts";
import { captureResultFixture, fillRaster, idPassRaster, pixelAt, solidRaster } from "../testing/raster-fixtures";

import { PSD_MAX_DIMENSION, buildIdMaskLayers, depthToRaster, downsampleRaster, idMaskColor, planCharacterPsd } from "./psd-plan";

import type { PaintLayer } from "../contracts";
import type { PsdLayerPlan, PsdRasterLayerPlan } from "./psd-plan";

function paintLayer(part: PaintLayer["part"], size: number, paint: boolean): PaintLayer {
  const rgba = new Uint8ClampedArray(size * size * 4);
  if (paint) {
    for (let y = 0; y < size / 2; y += 1) {
      for (let x = 0; x < size / 2; x += 1) {
        const i = (y * size + x) * 4;
        rgba[i] = 255;
        rgba[i + 3] = 255;
      }
    }
  }
  return { part, width: size, height: size, rgba, revision: 1 };
}

function flatten(layers: readonly PsdLayerPlan[], prefix = ""): string[] {
  return layers.flatMap((layer) => (layer.kind === "group" ? [`${prefix}${layer.name}`, ...flatten(layer.children, `${prefix}${layer.name}/`)] : [`${prefix}${layer.name}`]));
}

function rasterLayer(layers: readonly PsdLayerPlan[], name: string): PsdRasterLayerPlan {
  for (const layer of layers) {
    if (layer.kind === "raster" && layer.name === name) return layer;
    if (layer.kind === "group") {
      const found = layer.children.find((child) => child.kind === "raster" && child.name === name);
      if (found?.kind === "raster") return found;
    }
  }
  throw new Error(`래스터 레이어 없음: ${name}`);
}

/** PSD의 normal/multiply/screen을 straight-alpha source-over 식으로 독립 재합성한다. */
function compositePixel(layers: readonly PsdLayerPlan[], x: number, y: number, hiddenGroups: readonly string[] = []): readonly number[] {
  let rgba: readonly number[] = [0, 0, 0, 0];
  const visit = (items: readonly PsdLayerPlan[]): void => {
    for (const layer of items) {
      if (layer.hidden || hiddenGroups.includes(layer.name)) continue;
      if (layer.kind === "group") {
        visit(layer.children);
        continue;
      }
      const source = pixelAt(layer.raster, x, y);
      const sourceAlpha = source[3] / 255 * layer.opacity;
      const backdropAlpha = (rgba[3] ?? 0) / 255;
      if (layer.clipping) {
        const rgb = [0, 1, 2].map((channel) => {
          const base = (rgba[channel] ?? 0) / 255;
          const blend = (source[channel] ?? 0) / 255;
          const value = layer.blendMode === "multiply" ? base * blend : layer.blendMode === "screen" ? 1 - (1 - base) * (1 - blend) : blend;
          return backdropAlpha === 0 ? 0 : (base * (1 - sourceAlpha) + value * sourceAlpha) * 255;
        });
        rgba = [...rgb, backdropAlpha * 255];
        continue;
      }
      const alpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
      const rgb = [0, 1, 2].map((channel) => {
        const base = (rgba[channel] ?? 0) / 255;
        const blend = (source[channel] ?? 0) / 255;
        const value = layer.blendMode === "multiply" ? base * blend : layer.blendMode === "screen" ? 1 - (1 - base) * (1 - blend) : blend;
        return alpha === 0 ? 0 : ((1 - sourceAlpha) * backdropAlpha * base + sourceAlpha * ((1 - backdropAlpha) * blend + backdropAlpha * value)) / alpha * 255;
      });
      rgba = [...rgb, alpha * 255];
    }
  };
  visit(layers);
  return rgba;
}

const NO_LINE_EDGES = { alphaEdges: false, idEdges: false, lumaEdges: false, depthThreshold: 0, normalAngleDeg: 0 } as const;

describe("planCharacterPsd", () => {
  it("레이어 순서·blend·숨김 스냅샷과 재합성 MAE", () => {
    // 기본 fixture의 깊이 램프(16px에 0→1)는 실제 캡처보다 수십 배 가파르므로 평탄한 깊이로 바꾼다.
    const capture = captureResultFixture({ width: 16, height: 16, depth: { width: 16, height: 16, depth: new Float32Array(256).fill(0.5), near: 0.1, far: 10 } });
    const result = planCharacterPsd(capture, [paintLayer("skin", 64, true), paintLayer("hair", 64, false)], { includeIdMasks: true, includeReferencePasses: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const { plan } = result;
    expect(plan.width).toBe(16);
    expect(flatten(plan.layers)).toEqual([
      "참조",
      "참조/깊이",
      "부위 ID 마스크",
      "부위 ID 마스크/피부",
      "밑색",
      "음영",
      "하이라이트",
      "주선",
      "페인트",
      "페인트/피부 (UV 공간 1/4)",
    ]);
    expect(plan.receipt.names).toEqual(flatten(plan.layers));
    expect(plan.receipt.layerCount).toBe(7);
    expect(plan.receipt.groupCount).toBe(3);
    const byName = new Map<string, PsdLayerPlan>();
    const walk = (items: readonly PsdLayerPlan[]): void => {
      for (const item of items) {
        byName.set(item.name, item);
        if (item.kind === "group") walk(item.children);
      }
    };
    walk(plan.layers);
    const shade = byName.get("음영");
    const highlight = byName.get("하이라이트");
    const flat = byName.get("밑색");
    const line = byName.get("주선");
    expect(shade?.kind === "raster" && shade.blendMode).toBe("multiply");
    expect(highlight?.kind === "raster" && highlight.blendMode).toBe("screen");
    expect(flat?.kind === "raster" && flat.blendMode).toBe("normal");
    expect(flat?.hidden).toBe(false);
    expect(byName.get("참조")?.hidden).toBe(true);
    expect(byName.get("부위 ID 마스크")?.hidden).toBe(true);
    expect(byName.get("페인트")?.hidden).toBe(true);
    expect(line?.kind === "raster" && line.raster.rgba[(8 * 16 + 8) * 4 + 3]).toBe(0);
    expect(plan.receipt.lineArtPixels).toBeGreaterThan(8);
    expect(plan.receipt.recomposeMae).toBeLessThanOrEqual(2);
    expect(plan.composite).toBe(capture.passes.lit);
    expect(plan.receipt.skippedKo).toEqual(["참조/법선: normal 패스가 없습니다.", "페인트/헤어: 칠한 픽셀이 없습니다."]);
    const paint = byName.get("페인트/피부 (UV 공간 1/4)") ?? byName.get("피부 (UV 공간 1/4)");
    expect(paint?.kind === "raster" && paint.raster.width).toBe(16);
    expect(paint?.kind === "raster" && pixelAt(paint.raster, 2, 2)).toEqual([255, 0, 0, 255]);
    const mask = byName.get("피부");
    expect(mask?.kind === "raster" && pixelAt(mask.raster, 8, 8)[3]).toBe(255);
    expect(mask?.kind === "raster" && pixelAt(mask.raster, 0, 0)[3]).toBe(0);
  });

  it("옵션을 끄면 참조·ID 마스크 그룹이 없고 part-id 패스가 없으면 사유를 남긴다", () => {
    const capture = captureResultFixture({ width: 8, height: 8 });
    const minimal = planCharacterPsd(capture, [], { includeIdMasks: false, includeReferencePasses: false });
    if (!minimal.ok) throw new Error(minimal.failure.reasonKo);
    expect(flatten(minimal.plan.layers)).toEqual(["밑색", "음영", "하이라이트", "주선"]);

    const noId = captureResultFixture({ width: 8, height: 8, passes: { flat: solidRaster(8, 8, [10, 20, 30, 255]), lit: solidRaster(8, 8, [5, 10, 15, 255]) } });
    const planned = planCharacterPsd(noId, [], { includeIdMasks: true, includeReferencePasses: false });
    if (!planned.ok) throw new Error(planned.failure.reasonKo);
    expect(planned.plan.receipt.skippedKo).toEqual(["부위 ID 마스크: part-id 패스가 없습니다."]);
  });

  it("실패 경로: 상한 초과·패스 누락·패스 크기 불일치", () => {
    const big = captureResultFixture({ width: 4, height: 4 });
    const tooLarge = planCharacterPsd({ ...big, width: PSD_MAX_DIMENSION + 1 }, [], { includeIdMasks: false, includeReferencePasses: false }, 1);
    expect(!tooLarge.ok && tooLarge.failure.code).toBe("psd-too-large");
    const missing = planCharacterPsd(captureResultFixture({ passes: { lit: solidRaster(16, 16, [0, 0, 0, 255]) } }), [], { includeIdMasks: false, includeReferencePasses: false });
    expect(!missing.ok && missing.failure.code).toBe("psd-missing-pass");
    const mismatch = planCharacterPsd(captureResultFixture({ passes: { flat: solidRaster(16, 16, [0, 0, 0, 255]), lit: solidRaster(8, 8, [0, 0, 0, 255]) } }), [], {
      includeIdMasks: false,
      includeReferencePasses: false,
    });
    expect(!mismatch.ok && mismatch.failure.code).toBe("psd-pass-size");
  });

  it("보조 함수: 마스크 색 결정성, 깊이 래스터, 박스 다운샘플", () => {
    expect(idMaskColor("skin")).toEqual(idMaskColor("skin"));
    expect(idMaskColor("skin")).not.toEqual(idMaskColor("hair"));
    const masks = buildIdMaskLayers(new Uint16Array([0, 1, 2, 2]), 2, 2, { 1: { role: "skin", labelKo: "피부" }, 2: { role: "hair", labelKo: "헤어" }, 9: { role: "top", labelKo: "상의" } });
    expect(masks.map((m) => m.name)).toEqual(["피부", "헤어"]);
    expect(pixelAt(masks[1]?.raster ?? solidRaster(2, 2, [0, 0, 0, 0]), 1, 1)[3]).toBe(255);
    const lit = fillRaster(2, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
    const depth = depthToRaster({ width: 2, height: 1, depth: new Float32Array([0.5, 0.25]), near: 0, far: 1 }, lit);
    expect(pixelAt(depth, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(depth, 1, 0)).toEqual([191, 191, 191, 255]);
    const source = fillRaster(4, 4, (x) => (x < 2 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
    const small = downsampleRaster(source, 2);
    expect(small.width).toBe(2);
    expect(pixelAt(small, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelAt(small, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(downsampleRaster(source, 1)).toBe(source);
  });
});

/** 키트 v1 이전(15개)부터 있던 역할의 ID 마스크 색 골든. 역할 순서가 밀리면 PSD 마스크 색이 바뀌므로 고정한다. */
const LEGACY_MASK_COLORS = {
  skin: [242, 85, 85],
  head: [85, 242, 131],
  eyeball: [177, 85, 242],
  iris: [242, 223, 85],
  pupil: [85, 216, 242],
  "eye-highlight": [242, 85, 170],
  brow: [124, 242, 85],
  lash: [91, 85, 242],
  teeth: [242, 137, 85],
  tongue: [85, 242, 183],
  hair: [229, 85, 242],
  top: [209, 242, 85],
  bottom: [85, 163, 242],
  shoes: [242, 85, 117],
  accessory: [85, 242, 98],
} as const;

describe("키트 역할 (underwear 추가, 계약 문서 8.3절)", () => {
  it("속옷은 기존 15개 역할 뒤(16번째)에 붙어 그 역할들의 마스크 색이 그대로이고 새 색을 받는다", () => {
    // 레시피 v3(2026-10-23)는 속옷 뒤 끝에 층·헤어 부속 역할 4개를 더 붙였다. 앞 16개 역할의 순서·색은 그대로다.
    expect(PART_ROLES).toHaveLength(20);
    expect(PART_ROLES.indexOf("underwear")).toBe(15);
    expect(PART_ROLES.slice(16)).toEqual(["inner", "outer", "legwear", "hair-accessory"]);
    expect(PART_ROLE_LABELS_KO.underwear).toBe("속옷");
    for (const [role, color] of Object.entries(LEGACY_MASK_COLORS)) {
      expect(idMaskColor(role as keyof typeof LEGACY_MASK_COLORS), role).toEqual(color);
    }
    expect(idMaskColor("underwear")).toEqual([144, 85, 242]);
    const colors = PART_ROLES.map((role) => idMaskColor(role).join(","));
    expect(new Set(colors).size).toBe(PART_ROLES.length);
  });

  it("역할 고정 팔레트(allocatePartIdsByRole)로 역할 전부(20개)가 PART_ROLES 순서의 마스크 레이어가 된다", () => {
    const palette = allocatePartIdsByRole(PART_ROLES.map((role) => ({ role })));
    // 한 줄에 역할 전부를 가로로 배치한다(partId = rolePartId).
    const width = PART_ROLES.length;
    const ids = new Uint16Array(width).map((_, x) => rolePartId(PART_ROLES[x] ?? "skin"));
    const masks = buildIdMaskLayers(ids, width, 1, palette);
    expect(masks.map((m) => m.name)).toEqual(PART_ROLES.map((role) => PART_ROLE_LABELS_KO[role]));
    const underwearX = PART_ROLES.indexOf("underwear");
    const underwear = masks[underwearX];
    expect(underwear?.name).toBe("속옷");
    expect(underwear && pixelAt(underwear.raster, underwearX, 0)).toEqual([144, 85, 242, 255]);
    expect(underwear && pixelAt(underwear.raster, 0, 0)[3]).toBe(0);
    expect(masks[masks.length - 1]?.name).toBe(PART_ROLE_LABELS_KO["hair-accessory"]);
  });

  it("키트 파츠 구성(속옷 포함, 눈 좌우는 한 역할)의 part-id 캡처가 PSD 마스크 그룹에 속옷 레이어를 만든다", () => {
    const keptRoles = PART_ROLES.filter((role) => role !== "pupil"); // 필수 구성: pupil은 선택 파츠(홍채 텍스처에 구워짐)
    const palette = allocatePartIdsByRole(keptRoles.map((role) => ({ role })));
    const size = 24; // 첫 줄에 역할 19개(동공 제외, 키트 v2 층·헤어 부속 포함)가 다 들어가는 폭
    const idPass = idPassRaster(size, size, (x, y) => (y === 0 ? rolePartId(keptRoles[x] ?? "skin") : 0));
    const capture = captureResultFixture({
      width: size,
      height: size,
      partIdPalette: palette,
      passes: { flat: solidRaster(size, size, [200, 160, 140, 255]), lit: solidRaster(size, size, [150, 120, 100, 255]), "part-id": idPass },
    });
    const result = planCharacterPsd(capture, [], { includeIdMasks: true, includeReferencePasses: false });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const names = result.plan.receipt.names;
    expect(names).toContain("부위 ID 마스크/속옷");
    expect(names).not.toContain("부위 ID 마스크/동공");
    const maskNames = names.filter((n) => n.startsWith("부위 ID 마스크/"));
    expect(maskNames).toEqual(keptRoles.map((role) => `부위 ID 마스크/${PART_ROLE_LABELS_KO[role]}`));
    expect(result.plan.receipt.skippedKo).toEqual([]);
  });

  it("속옷이 팔레트에만 있고 픽셀이 없으면 레이어를 만들지 않는다(빈 마스크 금지)", () => {
    const masks = buildIdMaskLayers(new Uint16Array([1, 1, 0, 0]), 2, 2, allocatePartIdsByRole([{ role: "skin" }, { role: "underwear" }]));
    expect(masks.map((m) => m.name)).toEqual(["피부"]);
  });

  it("splitHairLayers=true(SHAPER createHairLayer): 헤어 부위 픽셀을 헤어 밑색·헤어 음영·헤어 주선 그룹으로 분리한다", () => {
    const palette = allocatePartIdsByRole([{ role: "skin" }, { role: "hair" }]);
    const idPass = idPassRaster(8, 8, (x) => (x < 4 ? rolePartId("skin") : rolePartId("hair")));
    const capture = captureResultFixture({
      width: 8,
      height: 8,
      partIdPalette: palette,
      passes: {
        flat: solidRaster(8, 8, [200, 150, 120, 255]),
        lit: solidRaster(8, 8, [140, 100, 80, 255]),
        "part-id": idPass,
      },
    });
    const res = planCharacterPsd(capture, [], {
      includeIdMasks: false,
      includeReferencePasses: false,
      splitHairLayers: true,
    });
    if (!res.ok) throw new Error(res.failure.reasonKo);
    expect(res.plan.receipt.names).toContain("헤어 분리");
    expect(res.plan.receipt.names).toContain("헤어 분리/헤어 밑색");
    expect(res.plan.receipt.names).toContain("헤어 분리/헤어 음영");
    expect(res.plan.receipt.names).toContain("헤어 분리/헤어 주선");
    for (const name of ["밑색", "음영", "하이라이트", "주선"]) {
      expect(pixelAt(rasterLayer(res.plan.layers, name).raster, 6, 4), name).toEqual([0, 0, 0, 0]);
    }
    const hiddenHair = compositePixel(res.plan.layers, 6, 4, ["헤어 분리"]);
    expect(hiddenHair).toEqual([0, 0, 0, 0]);
    expect(pixelAt(rasterLayer(res.plan.layers, "헤어 밑색").raster, 1, 4)).toEqual([0, 0, 0, 0]);
  });

  it("헤어·헤어 부속을 분리해도 밝은 채널과 음영을 재합성하고 본체 픽셀·입력 캡처를 보존한다", () => {
    const roles = ["skin", "hair", "hair-accessory", "top", "hair", "skin"] as const;
    const flatColors = [[170, 100, 20], [40, 140, 220], [220, 140, 40], [70, 80, 90], [0, 255, 100], [210, 170, 150]] as const;
    const litColors = [[190, 80, 40], [100, 80, 240], [100, 190, 90], [140, 40, 110], [40, 180, 130], [150, 140, 120]] as const;
    const alphaAt = (x: number, y: number): number => y === 1 && (roles[x] === "hair" || roles[x] === "hair-accessory") ? x === 1 ? 64 : 128 : 255;
    const flat = fillRaster(6, 2, (x, y) => [...(flatColors[x] ?? flatColors[0]), alphaAt(x, y)]);
    const lit = fillRaster(6, 2, (x, y) => [...(litColors[x] ?? litColors[0]), alphaAt(x, y)]);
    const capture = captureResultFixture({ width: 6, height: 2, partIdPalette: allocatePartIdsByRole(roles.map((role) => ({ role }))), passes: { flat, lit, "part-id": idPassRaster(6, 2, (x) => rolePartId(roles[x] ?? "skin")) } });
    const originalBytes = [new Uint8ClampedArray(flat.rgba), new Uint8ClampedArray(lit.rgba)];
    const common = { includeIdMasks: false, includeReferencePasses: false, lineArt: NO_LINE_EDGES };
    const split = planCharacterPsd(capture, [], { ...common, splitHairLayers: true });
    const whole = planCharacterPsd(capture, [], common);
    if (!split.ok || !whole.ok) throw new Error("PSD 계획 실패");
    const hairGroup = split.plan.layers.find((layer) => layer.name === "헤어 분리");
    expect(hairGroup?.kind === "group" && hairGroup.children.map((layer) => layer.name)).toEqual(["헤어 밑색", "헤어 음영", "헤어 주선"]);
    expect(rasterLayer(split.plan.layers, "헤어 음영").clipping).toBe(true);
    expect(rasterLayer(split.plan.layers, "헤어 주선").clipping).toBe(true);
    for (let x = 0; x < roles.length; x += 1) {
      const rebuilt = compositePixel(split.plan.layers, x, 0);
      const expected = pixelAt(lit, x, 0);
      for (let channel = 0; channel < 4; channel += 1) expect(Math.abs((rebuilt[channel] ?? 0) - (expected[channel] ?? 0)), `x=${x} channel=${channel}`).toBeLessThanOrEqual(2);
      if (roles[x] === "hair" || roles[x] === "hair-accessory") {
        expect(compositePixel(split.plan.layers, x, 0, ["헤어 분리"])).toEqual([0, 0, 0, 0]);
        const edge = compositePixel(split.plan.layers, x, 1);
        const edgeExpected = pixelAt(lit, x, 1);
        expect(edge[3]).toBe(edgeExpected[3]);
        for (let channel = 0; channel < 3; channel += 1) expect(Math.abs((edge[channel] ?? 0) - (edgeExpected[channel] ?? 0))).toBeLessThanOrEqual(2);
        expect(compositePixel(split.plan.layers, x, 1, ["헤어 분리"])).toEqual([0, 0, 0, 0]);
      } else {
        for (const name of ["밑색", "음영", "하이라이트", "주선"]) {
          expect(pixelAt(rasterLayer(split.plan.layers, name).raster, x, 0), name).toEqual(pixelAt(rasterLayer(whole.plan.layers, name).raster, x, 0));
        }
        expect(compositePixel(split.plan.layers, x, 0, ["헤어 분리"])).toEqual(compositePixel(whole.plan.layers, x, 0));
      }
    }
    expect(split.plan.receipt.recomposeMae).toBeLessThanOrEqual(2);
    expect(split.plan.composite).toBe(lit);
    expect(flat.rgba).toEqual(originalBytes[0]);
    expect(lit.rgba).toEqual(originalBytes[1]);
  });

  it("본체의 반투명·flat 밖 hull coverage를 실제 레이어로 재합성하고 입력 렌더를 보존한다", () => {
    const flatAlpha = [64, 128, 200, 0];
    const litAlpha = [64, 96, 224, 128];
    const flat = fillRaster(4, 2, (x, y) => y === 0 ? [100, 180, 40, flatAlpha[x] ?? 0] : [0, 0, 0, 0]);
    const lit = fillRaster(4, 2, (x, y) => y === 0 ? x === 3 ? [0, 0, 0, 128] : [50, 200, 100, litAlpha[x] ?? 0] : [0, 0, 0, 0]);
    const originals = [new Uint8ClampedArray(flat.rgba), new Uint8ClampedArray(lit.rgba)];
    const result = planCharacterPsd(captureResultFixture({ width: 4, height: 2, passes: { flat, lit } }), [paintLayer("skin", 4, true)], { includeIdMasks: false, includeReferencePasses: false, lineArt: NO_LINE_EDGES });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    for (let x = 0; x < 4; x += 1) {
      const actual = compositePixel(result.plan.layers, x, 0);
      const expected = pixelAt(lit, x, 0);
      expect(actual[3]).toBe(expected[3]);
      for (let c = 0; c < 3; c += 1) expect(Math.abs((actual[c] ?? 0) - (expected[c] ?? 0))).toBeLessThanOrEqual(2);
    }
    for (const name of ["음영", "하이라이트", "주선"]) expect(rasterLayer(result.plan.layers, name).clipping, name).toBe(true);
    expect(result.plan.layers.findIndex((layer) => layer.name === "주선")).toBe(result.plan.layers.findIndex((layer) => layer.name === "밑색") + 3);
    expect(result.plan.layers.findIndex((layer) => layer.name === "페인트")).toBeGreaterThan(result.plan.layers.findIndex((layer) => layer.name === "주선"));
    expect(flat.rgba).toEqual(originals[0]);
    expect(lit.rgba).toEqual(originals[1]);
    expect(result.plan.composite).toBe(lit);
  });

  it("가시 주선도 본체 밑색 알파에 클리핑돼 반투명 가장자리를 불투명하게 만들지 않는다", () => {
    const flat = fillRaster(3, 3, (x, y) => x === 1 && y === 1 ? [100, 100, 100, 64] : [0, 0, 0, 0]);
    const lit = fillRaster(3, 3, (x, y) => x === 1 && y === 1 ? [50, 50, 50, 64] : [0, 0, 0, 0]);
    const result = planCharacterPsd(captureResultFixture({ width: 3, height: 3, passes: { flat, lit } }), [], { includeIdMasks: false, includeReferencePasses: false });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(pixelAt(rasterLayer(result.plan.layers, "주선").raster, 1, 1)[3]).toBe(255);
    expect(rasterLayer(result.plan.layers, "주선").hidden).toBe(true);
    const visibleLine = result.plan.layers.map(layer => layer.name === "주선" ? { ...layer, hidden: false } : layer);
    expect(compositePixel(visibleLine, 1, 1)[3]).toBe(64);
    const originalRender = compositePixel(result.plan.layers, 1, 1);
    expect(originalRender[3]).toBe(64);
    for (let c = 0; c < 3; c += 1) expect(Math.abs((originalRender[c] ?? 0) - 50)).toBeLessThanOrEqual(2);
  });

  it("기하학적 소유권으로 part-id 밖 hull까지 헤어에 넣고 숨김 시 잔여선을 제거한다", () => {
    const hair = rolePartId("hair");
    const fringe = (x: number, y: number) => (y === 1 && x >= 1 && x <= 3) || (x === 2 && y >= 0 && y <= 2);
    const flat = fillRaster(5, 3, (x, y) => x === 2 && y === 1 ? [120, 80, 40, 255] : [0, 0, 0, 0]);
    const lit = fillRaster(5, 3, (x, y) => x === 2 && y === 1 ? [100, 60, 20, 255] : fringe(x, y) ? [12, 10, 14, 64] : [0, 0, 0, 0]);
    const capture = captureResultFixture({ width: 5, height: 3, partIdPalette: allocatePartIdsByRole([{ role: "hair" }]), passes: { flat, lit, "part-id": idPassRaster(5, 3, (x, y) => x === 2 && y === 1 ? hair : 0) } });
    const withoutOwnership = planCharacterPsd(capture, [], { includeIdMasks: false, includeReferencePasses: false, splitHairLayers: true });
    expect(withoutOwnership).toMatchObject({ ok: false, failure: { code: "psd-hair-ownership-missing" } });
    const mask = fillRaster(5, 3, (x, y) => fringe(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 0]);
    const result = planCharacterPsd({ ...capture, hairOwnership: { status: "available", raster: mask, samples: 4, classification: "majority-visible-samples", limitationsKo: [] } }, [], { includeIdMasks: false, includeReferencePasses: false, splitHairLayers: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 5; x += 1) {
      const actual = compositePixel(result.plan.layers, x, y), expected = pixelAt(lit, x, y);
      expect(actual[3]).toBe(expected[3]);
      for (let c = 0; c < 3; c += 1) expect(Math.abs((actual[c] ?? 0) - (expected[c] ?? 0))).toBeLessThanOrEqual(2);
      expect(compositePixel(result.plan.layers, x, y, ["헤어 분리"])[3]).toBe(0);
    }
    expect(result.plan.receipt.recomposeMae).toBeLessThanOrEqual(2);
  });

  it("MSAA 공유 경계는 명시한 기하 과반 소유로 나누고 전체 RGBA는 보존한다", () => {
    const flat = solidRaster(2, 1, [120, 80, 40, 255]), lit = solidRaster(2, 1, [80, 100, 60, 128]);
    const mask = fillRaster(2, 1, (x) => [x === 0 ? 127 : 128, 0, 0, 255]);
    const capture = captureResultFixture({ width: 2, height: 1, passes: { flat, lit }, partIdPalette: { 1: { role: "hair", labelKo: "헤어" } } });
    const result = planCharacterPsd({ ...capture, hairOwnership: { status: "available", raster: mask, samples: 4, classification: "majority-visible-samples", limitationsKo: [] } }, [], { includeIdMasks: false, includeReferencePasses: false, splitHairLayers: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(compositePixel(result.plan.layers, 0, 0, ["헤어 분리"])[3]).toBe(128);
    expect(compositePixel(result.plan.layers, 1, 0, ["헤어 분리"])[3]).toBe(0);
    for (let x = 0; x < 2; x += 1) {
      const actual = compositePixel(result.plan.layers, x, 0), expected = pixelAt(lit, x, 0);
      expect(actual[3]).toBe(expected[3]);
      for (let c = 0; c < 3; c += 1) expect(Math.abs((actual[c] ?? 0) - (expected[c] ?? 0))).toBeLessThanOrEqual(2);
    }
  });

  it("헤어 ID가 없으면 분리 사유를 남기고 본체 레이어를 비우지 않는다", () => {
    const flat = solidRaster(2, 2, [180, 140, 90, 255]);
    const lit = solidRaster(2, 2, [90, 120, 150, 255]);
    for (const withIdPass of [false, true]) {
      const capture = captureResultFixture({ width: 2, height: 2, partIdPalette: { 1: { role: "skin", labelKo: "피부" } }, passes: { flat, lit, ...(withIdPass ? { "part-id": idPassRaster(2, 2, () => 1) } : {}) } });
      const result = planCharacterPsd(capture, [], { includeIdMasks: false, includeReferencePasses: false, splitHairLayers: true, lineArt: NO_LINE_EDGES });
      if (!result.ok) throw new Error(result.failure.reasonKo);
      expect(result.plan.layers.some((layer) => layer.name === "헤어 분리")).toBe(false);
      expect(result.plan.receipt.skippedKo).toContain(withIdPass ? "헤어 분리: 헤어 부위 픽셀이 없습니다." : "헤어 분리: part-id 패스가 없습니다.");
      expect(rasterLayer(result.plan.layers, "밑색").raster.rgba).toEqual(flat.rgba);
      expect(compositePixel(result.plan.layers, 0, 0)[3]).toBe(255);
    }
  });
});

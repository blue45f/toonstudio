import { describe, expect, it } from "vitest";

import {
  computeLineartSignedDistanceField,
  computeMeijsterEdt2d,
  estimateSilhouettePseudoNormals,
  floodFillWithSdfGapClosing,
  generateDirectionalCelShadowAndRim,
  resolveLightDirectionVector,
  samplePseudoNormalAt,
  WEBTOON_CEL_LIGHT_PRESETS,
} from "./index";

/** 우측 벽면 중앙에 `gapHeightPx` 크기의 열린 틈새를 가진 사각형 선화 마스크를 생성한다. */
function createBrokenBoxMask(
  width: number,
  height: number,
  box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  gapHeightPx: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let x = box.left; x <= box.right; x += 1) {
    mask[box.top * width + x] = 255;
    mask[box.bottom * width + x] = 255;
  }
  const midY = Math.floor((box.top + box.bottom) / 2);
  const gapStart = midY - Math.floor(gapHeightPx / 2);
  const gapEnd = gapStart + gapHeightPx - 1;
  for (let y = box.top; y <= box.bottom; y += 1) {
    mask[y * width + box.left] = 255;
    if (gapHeightPx <= 0 || y < gapStart || y > gapEnd) mask[y * width + box.right] = 255;
  }
  return mask;
}

/** 중심 `(cx, cy)` 반지름 `radius`인 원형 실루엣 알파 마스크(`0..255`)를 생성한다. */
function createCircleSilhouetteAlpha(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const coverage = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(x - cx, y - cy)));
      alpha[y * width + x] = Math.round(coverage * 255);
    }
  }
  return alpha;
}

function sumHalfMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  predicate: (x: number, y: number) => boolean,
): number {
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (predicate(x, y)) sum += mask[y * width + x] ?? 0;
    }
  }
  return sum;
}

describe("wasm64-wave44-gap-closing-cel-lighting", () => {
  it("1. Meijster 2-Pass EDT는 직각삼각형(3-4-5) 유클리드 거리를 정확히 산출한다", () => {
    const mask = new Uint8Array(12 * 12);
    mask[2 * 12 + 3] = 1;
    const dist = computeMeijsterEdt2d(mask, 12, 12);
    expect(dist[2 * 12 + 3]).toBeCloseTo(0, 5);
    expect(dist[(2 + 4) * 12 + (3 + 3)]).toBeCloseTo(5, 5);
  });

  it("2. 선화 부호 거리장(SDF)은 빈 공간에서 양수, 두꺼운 먹선 내부에서 음수 부호를 갖는다", () => {
    const mask = new Uint8Array(15 * 15);
    for (let y = 5; y <= 9; y += 1) {
      for (let x = 5; x <= 9; x += 1) mask[y * 15 + x] = 1;
    }
    const sdf = computeLineartSignedDistanceField(mask, 15, 15);
    expect(sdf[7 * 15 + 7] ?? 0).toBeLessThan(-1);
    expect(sdf[1 * 15 + 1] ?? 0).toBeGreaterThan(5);
  });

  it("3. 1px 미세 선화 틈새가 열려 있어도 gapTolerancePx >= 1이면 외부 배경으로 누출되지 않는다", () => {
    const broken = createBrokenBoxMask(48, 48, { left: 10, top: 10, right: 36, bottom: 36 }, 1);
    const leaked = floodFillWithSdfGapClosing({
      width: 48, height: 48, lineart: broken, seedX: 22, seedY: 22, gapTolerancePx: 0, trapPixels: 0,
    });
    const sealed = floodFillWithSdfGapClosing({
      width: 48, height: 48, lineart: broken, seedX: 22, seedY: 22, gapTolerancePx: 1, trapPixels: 0,
    });
    expect(leaked.leakedToCanvasBorder).toBe(true);
    expect(sealed.leakedToCanvasBorder).toBe(false);
    expect(sealed.filledRegionMask[22 * 48 + 42]).toBe(0);
    expect(sealed.filledPixelCount).toBe(25 * 25 + 1);
  });

  it("4. 8px 중간 틈새를 가상 직선 장벽으로 닫으면서도 내부 직각 모서리는 끝까지 채운다", () => {
    const broken = createBrokenBoxMask(64, 64, { left: 12, top: 12, right: 48, bottom: 48 }, 8);
    const result = floodFillWithSdfGapClosing({
      width: 64, height: 64, lineart: broken, seedX: 28, seedY: 28, gapTolerancePx: 8, trapPixels: 0,
    });
    expect(result.leakedToCanvasBorder).toBe(false);
    expect(result.filledRegionMask[13 * 64 + 13]).toBe(1);
    expect(result.filledRegionMask[47 * 64 + 13]).toBe(1);
    expect(result.filledRegionMask[13 * 64 + 47]).toBe(1);
    expect(result.filledRegionMask[47 * 64 + 47]).toBe(1);
    expect(result.filledRegionMask[30 * 64 + 51]).toBe(0);
  });

  it("5. 크게 끊어진 16px 선화 틈새도 gapTolerancePx: 16에서 외부 누출 없이 정확히 봉합한다", () => {
    const broken = createBrokenBoxMask(80, 80, { left: 14, top: 14, right: 62, bottom: 62 }, 16);
    const result = floodFillWithSdfGapClosing({
      width: 80, height: 80, lineart: broken, seedX: 36, seedY: 36, gapTolerancePx: 16, trapPixels: 0,
    });
    expect(result.leakedToCanvasBorder).toBe(false);
    expect(result.filledRegionMask[38 * 80 + 66]).toBe(0);
    expect(result.filledRegionMask[15 * 80 + 15]).toBe(1);
    expect(result.filledPixelCount).toBeGreaterThan(45 * 45);
  });

  it("6. gapTolerancePx를 초과하는 완전히 열린 통로는 억지로 막지 않고 배경까지 자연스럽게 통과한다", () => {
    const wideOpen = createBrokenBoxMask(72, 72, { left: 12, top: 12, right: 56, bottom: 56 }, 22);
    const result = floodFillWithSdfGapClosing({
      width: 72, height: 72, lineart: wideOpen, seedX: 30, seedY: 30, gapTolerancePx: 6,
    });
    expect(result.leakedToCanvasBorder).toBe(true);
    expect(result.filledRegionMask[2 * 72 + 2]).toBe(1);
  });

  it("7. Halo-Free Trapping(1px 확장)은 반투명 안티앨리어싱 선화 아래 흰 들뜸을 제거하고 빈 틈새 밖으로는 번지지 않는다", () => {
    const size = 56;
    const cx = 28;
    const radius = 16;
    const rgbaLineart = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x > cx && Math.abs(y - cx) <= 2) continue;
        const ringDist = Math.abs(Math.hypot(x - cx, y - cx) - radius);
        if (ringDist < 1.8) {
          rgbaLineart[(y * size + x) * 4 + 3] = Math.round((1 - ringDist / 1.8) * 255);
        }
      }
    }

    const untrapped = floodFillWithSdfGapClosing({
      width: size, height: size, lineart: rgbaLineart, seedX: cx, seedY: cx, gapTolerancePx: 6, trapPixels: 0,
    });
    const trapped = floodFillWithSdfGapClosing({
      width: size, height: size, lineart: rgbaLineart, seedX: cx, seedY: cx, gapTolerancePx: 6, trapPixels: 1,
    });

    // 내측 반투명 먹선(115 <= alpha < 235) 중 밑색이 받쳐지지 않아 흰 종이가 비치는 들뜸 픽셀 수 측정
    const countWhiteFringePixels = (flatMask: Uint8Array): number => {
      let count = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const d = Math.hypot(x - cx, y - cx);
          const idx = y * size + x;
          const lineA = rgbaLineart[idx * 4 + 3] ?? 0;
          if (d < radius && lineA >= 115 && lineA < 235 && (flatMask[idx] ?? 0) === 0) count += 1;
        }
      }
      return count;
    };

    expect(countWhiteFringePixels(untrapped.filledRegionMask)).toBeGreaterThan(12);
    expect(countWhiteFringePixels(trapped.filledRegionMask)).toBe(0);
    expect(trapped.trappedEdgePixelCount).toBeGreaterThan(20);
    expect(trapped.leakedToCanvasBorder).toBe(false);
    expect(trapped.filledRegionMask[cx * size + (cx + radius + 3)]).toBe(0);
  });

  it("8. 투명 배경 알파 선화와 흰 배경 휘도 선화 RGBA를 자동 구분해 동일한 밑색 영역을 채운다", () => {
    const mask = createBrokenBoxMask(40, 40, { left: 8, top: 8, right: 30, bottom: 30 }, 4);
    const transparentLayer = new Uint8ClampedArray(40 * 40 * 4);
    const opaquePaperLayer = new Uint8ClampedArray(40 * 40 * 4);
    for (let i = 0; i < 40 * 40; i += 1) {
      const isInk = (mask[i] ?? 0) > 0;
      transparentLayer[i * 4 + 3] = isInk ? 255 : 0;
      const tone = isInk ? 10 : 255;
      opaquePaperLayer[i * 4] = tone;
      opaquePaperLayer[i * 4 + 1] = tone;
      opaquePaperLayer[i * 4 + 2] = tone;
      opaquePaperLayer[i * 4 + 3] = 255;
    }

    const resAlpha = floodFillWithSdfGapClosing({ width: 40, height: 40, lineart: transparentLayer, seedX: 18, seedY: 18, gapTolerancePx: 5 });
    const resLuma = floodFillWithSdfGapClosing({ width: 40, height: 40, lineart: opaquePaperLayer, seedX: 18, seedY: 18, gapTolerancePx: 5 });
    expect(resAlpha.leakedToCanvasBorder).toBe(false);
    expect(resAlpha.filledPixelCount).toBe(resLuma.filledPixelCount);
  });

  it("9. 큰 gapTolerancePx 설정에서도 작은 닫힌 단추 내부 클릭을 정상적으로 채운다", () => {
    const buttonMask = createBrokenBoxMask(48, 48, { left: 18, top: 18, right: 26, bottom: 26 }, 0);
    const fill = floodFillWithSdfGapClosing({
      width: 48, height: 48, lineart: buttonMask, seedX: 20, seedY: 20, gapTolerancePx: 12, trapPixels: 0,
    });
    expect(fill.leakedToCanvasBorder).toBe(false);
    expect(fill.filledPixelCount).toBe(49);
  });

  it("10. 먹선 위 직접 클릭 또는 캔버스 범위 밖 시드 입력 시 안전하게 빈 마스크를 반환한다", () => {
    const mask = createBrokenBoxMask(32, 32, { left: 6, top: 6, right: 24, bottom: 24 }, 0);
    const onInk = floodFillWithSdfGapClosing({ width: 32, height: 32, lineart: mask, seedX: 6, seedY: 12 });
    const outOfBounds = floodFillWithSdfGapClosing({ width: 32, height: 32, lineart: mask, seedX: -3, seedY: 99 });
    expect(onInk.filledPixelCount).toBe(0);
    expect(outOfBounds.filledPixelCount).toBe(0);
  });

  it("11. 2.5D 의사 법선 생성기는 모든 내부·외부 픽셀에서 단위벡터 정규화(||N|| = 1, nz > 0)를 보장한다", () => {
    const silhouette = createCircleSilhouetteAlpha(48, 48, 24, 24, 16);
    const normalResult = estimateSilhouettePseudoNormals({ width: 48, height: 48, silhouetteAlpha: silhouette });
    for (let i = 0; i < 48 * 48; i += 1) {
      const nx = normalResult.normalsFloat32[i * 3] ?? 0;
      const ny = normalResult.normalsFloat32[i * 3 + 1] ?? 0;
      const nz = normalResult.normalsFloat32[i * 3 + 2] ?? 0;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(nz).toBeGreaterThan(0);
    }
  });

  it("12. 원형 실루엣 법선은 중심에서 정면(+Z)을 향하고 상·하·좌·우 외곽에서 각 바깥쪽으로 기울어진다", () => {
    const silhouette = createCircleSilhouetteAlpha(64, 64, 32, 32, 22);
    const normalMap = estimateSilhouettePseudoNormals({ width: 64, height: 64, silhouetteAlpha: silhouette, bevelWidthPx: 20 });
    expect(samplePseudoNormalAt(normalMap, 32, 32).nz).toBeGreaterThan(0.98);
    expect(samplePseudoNormalAt(normalMap, 50, 32).nx).toBeGreaterThan(0.45);
    expect(samplePseudoNormalAt(normalMap, 14, 32).nx).toBeLessThan(-0.45);
    expect(samplePseudoNormalAt(normalMap, 32, 14).ny).toBeGreaterThan(0.45);
    expect(samplePseudoNormalAt(normalMap, 32, 50).ny).toBeLessThan(-0.45);
  });

  it("13. 베벨 프로파일 3종(hemisphere·cosine·smoothstep)과 탄젠트 노멀맵 RGBA 인코딩이 정합한다", () => {
    const silhouette = createCircleSilhouetteAlpha(40, 40, 20, 20, 14);
    const hemi = estimateSilhouettePseudoNormals({ width: 40, height: 40, silhouetteAlpha: silhouette, profileCurve: "hemisphere" });
    const cos = estimateSilhouettePseudoNormals({ width: 40, height: 40, silhouetteAlpha: silhouette, profileCurve: "cosine" });
    const smooth = estimateSilhouettePseudoNormals({ width: 40, height: 40, silhouetteAlpha: silhouette, profileCurve: "smoothstep" });

    expect(hemi.heightField[20 * 40 + 9] ?? 0).toBeGreaterThan(cos.heightField[20 * 40 + 9] ?? 0);
    expect(smooth.heightField[20 * 40 + 20] ?? 0).toBeGreaterThan(5);
    expect([hemi.normalMapRgba[0], hemi.normalMapRgba[1], hemi.normalMapRgba[2], hemi.normalMapRgba[3]]).toEqual([128, 128, 255, 0]);
  });

  it("14. 웹툰 광원 프리셋 5종은 자연스러운 한글 이름과 단위 정규화된 3D 광원 벡터를 제공한다", () => {
    const presetIds = Object.keys(WEBTOON_CEL_LIGHT_PRESETS) as Array<keyof typeof WEBTOON_CEL_LIGHT_PRESETS>;
    expect(presetIds).toHaveLength(5);
    for (const id of presetIds) {
      const preset = WEBTOON_CEL_LIGHT_PRESETS[id];
      expect(preset.labelKo.length).toBeGreaterThan(2);
      const dir = resolveLightDirectionVector(preset.azimuthDeg, preset.elevationDeg);
      expect(Math.hypot(dir.lx, dir.ly, dir.lz)).toBeCloseTo(1, 6);
    }
  });

  it("15. 우측 광원(0°)과 좌측 광원(180°)에서 셀 그림자 및 림라이트 마스크가 정확히 좌우 대칭을 이룬다", () => {
    const size = 65;
    const cx = 32;
    const silhouette = createCircleSilhouetteAlpha(size, size, cx, cx, 22);
    const normalMap = estimateSilhouettePseudoNormals({ width: size, height: size, silhouetteAlpha: silhouette, bevelWidthPx: 20 });

    const lightRight = generateDirectionalCelShadowAndRim({ normalMap, azimuthDeg: 0, elevationDeg: 28, celBandMode: "hard" });
    const lightLeft = generateDirectionalCelShadowAndRim({ normalMap, azimuthDeg: 180, elevationDeg: 28, celBandMode: "hard" });

    const rightShadowLeftHalf = sumHalfMask(lightRight.shadowAlphaMask, size, size, (x) => x < cx);
    const rightShadowRightHalf = sumHalfMask(lightRight.shadowAlphaMask, size, size, (x) => x > cx);
    const leftShadowRightHalf = sumHalfMask(lightLeft.shadowAlphaMask, size, size, (x) => x > cx);
    expect(rightShadowLeftHalf).toBeGreaterThan(rightShadowRightHalf * 4);
    expect(rightShadowLeftHalf).toBe(leftShadowRightHalf);

    const rightRimRightHalf = sumHalfMask(lightRight.rimAlphaMask, size, size, (x) => x > cx);
    const leftRimLeftHalf = sumHalfMask(lightLeft.rimAlphaMask, size, size, (x) => x < cx);
    expect(rightRimRightHalf).toBeGreaterThan(500);
    expect(rightRimRightHalf).toBe(leftRimLeftHalf);
  });

  it("16. 정오 야외광은 하단 그림자·상단 림라이트를 만들고 공포 하단광은 상단 그림자·하단 림라이트로 반전된다", () => {
    const size = 65;
    const cy = 32;
    const silhouette = createCircleSilhouetteAlpha(size, size, cy, cy, 22);
    const normalMap = estimateSilhouettePseudoNormals({ width: size, height: size, silhouetteAlpha: silhouette, bevelWidthPx: 20 });

    const noon = generateDirectionalCelShadowAndRim({ normalMap, presetId: "noon-outdoor" });
    const horror = generateDirectionalCelShadowAndRim({ normalMap, presetId: "horror-underlight" });

    expect(sumHalfMask(noon.shadowAlphaMask, size, size, (_, y) => y > cy)).toBeGreaterThan(
      sumHalfMask(noon.shadowAlphaMask, size, size, (_, y) => y < cy) * 3,
    );
    expect(sumHalfMask(horror.shadowAlphaMask, size, size, (_, y) => y < cy)).toBeGreaterThan(
      sumHalfMask(horror.shadowAlphaMask, size, size, (_, y) => y > cy) * 3,
    );
    expect(sumHalfMask(horror.rimAlphaMask, size, size, (_, y) => y > cy)).toBeGreaterThan(
      sumHalfMask(horror.rimAlphaMask, size, size, (_, y) => y < cy) * 3,
    );
  });

  it("17. 역광 드라마틱 프리셋은 실루엣 코어를 깊은 그림자로 덮고 광원 쪽 외곽에 강한 림라이트를 만든다", () => {
    const size = 65;
    const center = 32;
    const silhouette = createCircleSilhouetteAlpha(size, size, center, center, 22);
    const normalMap = estimateSilhouettePseudoNormals({ width: size, height: size, silhouetteAlpha: silhouette, bevelWidthPx: 20 });
    const backlight = generateDirectionalCelShadowAndRim({ normalMap, presetId: "dramatic-backlight" });

    expect(backlight.presetLabelKo).toBe("역광 드라마틱");
    expect(backlight.shadowAlphaMask[center * size + center] ?? 0).toBeGreaterThan(180);
    let maxTopRim = 0;
    for (let y = 10; y <= 16; y += 1) {
      const rVal = backlight.rimAlphaMask[y * size + center] ?? 0;
      if (rVal > maxTopRim) maxTopRim = rVal;
    }
    expect(maxTopRim).toBeGreaterThan(180);
  });

  it("18. 셀 밴드 모드(hard · soft · two-tone)에 따라 그림자 계조 전이 폭이 명확히 구분된다", () => {
    const silhouette = createCircleSilhouetteAlpha(64, 64, 32, 32, 24);
    const normalMap = estimateSilhouettePseudoNormals({ width: 64, height: 64, silhouetteAlpha: silhouette, bevelWidthPx: 22 });

    const hard = generateDirectionalCelShadowAndRim({
      normalMap, azimuthDeg: 135, elevationDeg: 30, celBandMode: "hard", shadowSoftness: 0, maxShadowAlpha: 200, rimIntensity: 0,
    });
    const soft = generateDirectionalCelShadowAndRim({
      normalMap, azimuthDeg: 135, elevationDeg: 30, celBandMode: "soft", shadowSoftness: 0.22, maxShadowAlpha: 200, rimIntensity: 0,
    });
    const twoTone = generateDirectionalCelShadowAndRim({
      normalMap, azimuthDeg: 135, elevationDeg: 30, celBandMode: "two-tone", shadowSoftness: 0.02, maxShadowAlpha: 200, rimIntensity: 0,
    });

    const countMidTones = (mask: Uint8ClampedArray): number => {
      let mid = 0;
      for (let i = 0; i < mask.length; i += 1) {
        const v = mask[i] ?? 0;
        if (v > 20 && v < 180) mid += 1;
      }
      return mid;
    };
    expect(countMidTones(soft.shadowAlphaMask)).toBeGreaterThan(countMidTones(hard.shadowAlphaMask) + 80);
    expect(countMidTones(twoTone.shadowAlphaMask)).toBeGreaterThan(countMidTones(hard.shadowAlphaMask) + 40);
  });

  it("19. 셀 그림자 마스크와 림라이트 마스크 모두 실루엣 바깥 투명 픽셀에서는 알파 0을 보장한다", () => {
    const silhouette = createCircleSilhouetteAlpha(48, 48, 24, 24, 14);
    const normalMap = estimateSilhouettePseudoNormals({ width: 48, height: 48, silhouetteAlpha: silhouette });
    const cel = generateDirectionalCelShadowAndRim({ normalMap, presetId: "sunset-side" });
    for (let i = 0; i < 48 * 48; i += 1) {
      if ((silhouette[i] ?? 0) === 0) {
        expect(cel.shadowAlphaMask[i]).toBe(0);
        expect(cel.rimAlphaMask[i]).toBe(0);
      }
    }
  });

  it("20. 열린 12px 틈새 선화에서 스마트 밑색 채우기 → 의사 법선 → 창가 사선광 셀 명암·림라이트 합성까지 일괄 동작한다", () => {
    const brokenCharacter = createBrokenBoxMask(64, 64, { left: 14, top: 12, right: 50, bottom: 52 }, 12);
    const flat = floodFillWithSdfGapClosing({
      width: 64, height: 64, lineart: brokenCharacter, seedX: 32, seedY: 32, gapTolerancePx: 12, fillColor: { r: 235, g: 192, b: 168, a: 255 },
    });
    expect(flat.leakedToCanvasBorder).toBe(false);

    const normalMap = estimateSilhouettePseudoNormals({ width: 64, height: 64, silhouetteAlpha: flat.filledAlphaMask, bevelWidthPx: 14 });
    const shaded = generateDirectionalCelShadowAndRim({ normalMap, presetId: "window-diagonal", baseFlatRgba: flat.flatLayerRgba });

    expect(shaded.litPixelCount).toBeGreaterThan(200);
    expect(shaded.shadowedPixelCount).toBeGreaterThan(150);
    expect(shaded.rimPixelCount).toBeGreaterThan(20);
    expect(shaded.compositedRgba).toBeInstanceOf(Uint8ClampedArray);
    expect(shaded.compositedRgba?.[(18 * 64 + 20) * 4] ?? 0).toBeGreaterThan(
      shaded.compositedRgba?.[(46 * 64 + 44) * 4] ?? 255,
    );
  });
});

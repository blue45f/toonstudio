import { describe, expect, it } from "vitest";

import {
  packTexelLockedBoxUvs,
  projectScreenStrokeToAtlas,
  updateBoxDimensionsAndRepack,
  type BoxPartSpec,
} from "./studio-mesh-texel-box-uv-paint";

/** 정사영(Orthographic) View-Projection 행렬: 45도 회전해 두 인접 면(+Z, +X)이 동시에 보이도록 구성. */
function makeIsometricOrthoVp(yawRad: number, scale: number): Float32Array {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  // column-major: x' = scale*(c*x - s*z), y' = scale*y, z' = -0.2*(s*x + c*z), w' = 1
  return new Float32Array([
    scale * c, 0, -0.2 * s, 0,
    0, scale, 0, 0,
    -scale * s, 0, -0.2 * c, 0,
    0, 0, 0, 1,
  ]);
}

describe("studio-mesh-texel-box-uv-paint", () => {
  it("텍셀 밀도 고정(32 px/m)으로 박스 6면을 겹침 없이 2px 거터를 지켜 자동 패킹한다", () => {
    const parts: BoxPartSpec[] = [
      { id: "book-cover", name: "책 표지", center: [0, 0.15, 0], sizeMeters: [0.5, 0.3125, 0.25] },
      { id: "sign-board", name: "간판", center: [1, 0.5, 0], sizeMeters: [1.0, 0.5, 0.125] },
    ];

    const packed = packTexelLockedBoxUvs(parts, {
      texelDensityPxPerMeter: 32,
      gutterPx: 2,
      allowRotate: true,
    });

    expect(packed.islands.length).toBe(12);
    expect(packed.atlasWidth).toBeGreaterThanOrEqual(64);
    expect((packed.atlasWidth & (packed.atlasWidth - 1)) === 0).toBe(true);
    expect(packed.utilizationRatio).toBeGreaterThan(0.1);

    // 모든 아일랜드 쌍이 최소 2px 거터를 유지하며 절대 겹치지 않는지 전수 검사
    for (let i = 0; i < packed.islands.length; i += 1) {
      const a = packed.islands[i]!;
      expect(a.achievedTexelDensity).toBeCloseTo(32, 1);
      expect(a.pixelX).toBeGreaterThanOrEqual(2);
      expect(a.pixelY).toBeGreaterThanOrEqual(2);
      expect(a.pixelX + a.pixelWidth).toBeLessThanOrEqual(packed.atlasWidth - 2);
      expect(a.pixelY + a.pixelHeight).toBeLessThanOrEqual(packed.atlasHeight - 2);

      for (let j = i + 1; j < packed.islands.length; j += 1) {
        const b = packed.islands[j]!;
        const separated =
          a.pixelX + a.pixelWidth + 2 <= b.pixelX ||
          b.pixelX + b.pixelWidth + 2 <= a.pixelX ||
          a.pixelY + a.pixelHeight + 2 <= b.pixelY ||
          b.pixelY + b.pixelHeight + 2 <= a.pixelY;
        expect(separated).toBe(true);
      }
    }
  });

  it("박스 치수를 2배로 키우면 텍셀 밀도를 유지한 채 UV 픽셀 크기가 비례 동기화된다", () => {
    const parts: BoxPartSpec[] = [
      { id: "prop", name: "소품 상자", center: [0, 0.5, 0], sizeMeters: [1, 1, 1] },
    ];
    const before = packTexelLockedBoxUvs(parts, { texelDensityPxPerMeter: 32, gutterPx: 2 });
    const after = updateBoxDimensionsAndRepack(parts, "prop", [2, 1, 1], {
      texelDensityPxPerMeter: 32,
      gutterPx: 2,
    });

    const frontBefore = before.islands.find((isl) => isl.face === "+z")!;
    const frontAfter = after.islands.find((isl) => isl.face === "+z")!;
    expect(Math.max(frontAfter.pixelWidth, frontAfter.pixelHeight)).toBe(
      Math.max(frontBefore.pixelWidth, frontBefore.pixelHeight) * 2,
    );
    expect(frontAfter.achievedTexelDensity).toBeCloseTo(32, 2);
  });

  it("스크린스페이스 브러시가 UV 심을 넘어 인접 2개 면(+Z, +X)을 끊김 없이 동시 채색하고 거터를 확장한다", () => {
    const parts: BoxPartSpec[] = [
      { id: "cube", name: "큐브", center: [0, 0, 0], sizeMeters: [1, 1, 1] },
    ];
    const packed = packTexelLockedBoxUvs(parts, { texelDensityPxPerMeter: 32, gutterPx: 2 });
    const atlas = new Uint8ClampedArray(packed.atlasWidth * packed.atlasHeight * 4);

    // 45도 회전 뷰로 +Z면과 +X면 경계 모서리가 화면 중앙(x=128)에 놓이게 함
    const camera = {
      viewProjectionMatrix: makeIsometricOrthoVp(-Math.PI / 4, 0.9),
      viewportWidth: 256,
      viewportHeight: 256,
    };

    const stats = projectScreenStrokeToAtlas(atlas, packed, camera, {
      points: [
        [75, 128],
        [180, 128],
      ],
      radiusPx: 18,
      colorRgba: [220, 64, 48, 255],
      opacity: 1,
      hardness: 0.7,
    });

    // UV 심을 건너 +Z와 +X 두 아일랜드에 모두 채색되어야 함
    expect(stats.crossedIslands).toBeGreaterThanOrEqual(2);
    expect(stats.paintedTexels).toBeGreaterThan(200);
    expect(stats.dilatedGutterTexels).toBeGreaterThan(0);

    // 실제 아틀라스 버퍼에 적색 채널이 채워졌는지 확인
    let redHits = 0;
    for (let i = 0; i < atlas.length; i += 4) {
      if (atlas[i]! > 150 && atlas[i + 3]! > 200) redHits += 1;
    }
    expect(redHits).toBeGreaterThan(200);
  });
});

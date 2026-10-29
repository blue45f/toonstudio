import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildKraFixture, buildKraTileFile } from "../../../../tests/corpus/formats/kra-fixtures";
import { KRA_REAL_TILE_VECTORS } from "../../../../tests/corpus/formats/kra-real-tile-vectors";
import { KRA_SUPPORTED_COLOR_SPACES } from "../kra-colorspace";
import { importKra } from "../kra-document";
import { decodeKraTile, parseKraTileFile } from "../kra-tiles";
import { KRA_LIMITS } from "../kra-types";

function base64ToBytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

function hexToBytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "hex"));
}

/**
 * 실제 Krita 5.2.2가 저장한 타일 페이로드로 LZF 해제와 픽셀 환원을 대조한다. 정답은 원본 PNG(d10)나 Krita가 읽어 준
 * 픽셀(d04)이고, 풀린 바이트의 SHA-256은 독립 Python LZF 해석기로 계산했다. 실수 형식(d14)의 `rgba`는 Krita가 읽어 준 네이티브
 * 바이트에 환원식을 독립 구현으로 적용한 값이고, Krita가 합성 이미지로 그린 `renderRgba`와 1단계 이내로 같다.
 */
describe("실제 Krita 타일 페이로드(알려진 정답)", () => {
  it("벡터가 지원하는 여덟 색 공간과 두 플래그(LZF, 비압축)를 모두 덮는다", () => {
    expect(new Set(KRA_REAL_TILE_VECTORS.map((vector) => vector.colorSpace))).toEqual(new Set(KRA_SUPPORTED_COLOR_SPACES));
    expect(KRA_REAL_TILE_VECTORS.filter((vector) => vector.flag === 1)).toHaveLength(12);
    // 비압축 타일은 픽셀 크기 1바이트 단위(회색)·4바이트(RGBA8)·16비트 회색을 덮는다
    expect(KRA_REAL_TILE_VECTORS.filter((vector) => vector.flag === 0).map((vector) => [vector.colorSpace, vector.pixelBytes])).toEqual([
      ["GRAYA", 2],
      ["RGBA", 4],
      ["GRAYAU16", 4],
    ]);
  });

  describe.each(KRA_REAL_TILE_VECTORS.map((vector) => [vector.id, vector] as const))("%s", (_id, vector) => {
    const payload = base64ToBytes(vector.payloadBase64);

    it("페이로드 첫 바이트가 벡터의 플래그와 같다", () => {
      expect(payload[0]).toBe(vector.flag);
    });

    it("풀면 독립 해석기와 같은 바이트 평면 배치가 나온다 (비압축 타일은 픽셀을 이어 붙인 원본을 평면으로 바꾼 것)", () => {
      const file = parseKraTileFile(buildKraTileFile({ pixelBytes: vector.pixelBytes, tiles: [{ x: vector.tile[0], y: vector.tile[1], payload }] }), KRA_LIMITS);
      const planar = decodeKraTile(file, file.tiles[0]!);
      expect(planar).toHaveLength(64 * 64 * vector.pixelBytes);
      expect(createHash("sha256").update(planar).digest("hex")).toBe(vector.planarSha256);
      if (vector.flag === 0) {
        // 비압축 본문은 평면 배치가 아니다: 그대로 쓰면 해시가 다르다
        expect(createHash("sha256").update(payload.subarray(1)).digest("hex")).not.toBe(vector.planarSha256);
      }
    });

    it("importKra가 정답 픽셀을 RGBA8로 되돌린다", async () => {
      const bytes = buildKraFixture({
        width: vector.canvas[0],
        height: vector.canvas[1],
        colorSpace: vector.colorSpace,
        profile: vector.profile,
        layers: [
          {
            name: "real",
            tileFile: buildKraTileFile({ pixelBytes: vector.pixelBytes, tiles: [{ x: vector.tile[0], y: vector.tile[1], payload }] }),
            defaultPixel: hexToBytes(vector.defaultPixelHex),
          },
        ],
      });
      const result = await importKra(bytes);
      expect(result.unsupported).toEqual([]);
      const layer = result.layers[0]!;
      const extent = layer.extent!;
      for (const probe of vector.probes) {
        const offset = ((probe.y - extent.y) * extent.width + (probe.x - extent.x)) * 4;
        const got = Array.from(layer.pixels!.subarray(offset, offset + 4));
        expect(got, `(${probe.x}, ${probe.y})`).toEqual(probe.rgba);
        if (probe.renderRgba !== undefined && !(got[3] === 0 && probe.renderRgba[3] === 0)) {
          // Krita 자신이 그린 값과 1단계 이내
          probe.renderRgba.forEach((value, channel) => expect(Math.abs(got[channel]! - value), `(${probe.x}, ${probe.y}) 채널 ${channel}`).toBeLessThanOrEqual(1));
        }
      }
    });

    it("실수 형식 벡터는 Krita의 합성 이미지 값을 담고 있다", () => {
      const isFloat = vector.colorSpace.includes("F16") || vector.colorSpace.includes("F32");
      expect(vector.probes.every((probe) => probe.renderRgba !== undefined)).toBe(isFloat);
    });
  });
});

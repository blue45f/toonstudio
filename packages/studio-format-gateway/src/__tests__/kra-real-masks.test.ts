import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildKraTileFile } from "../../../../tests/corpus/formats/kra-fixtures";
import { KRA_REAL_MASK_VECTORS } from "../../../../tests/corpus/formats/kra-real-mask-vectors";
import { assembleKraMask, decodeKraTile, parseKraTileFile } from "../kra-tiles";
import { KRA_LIMITS } from "../kra-types";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function tileFileOf(vector: (typeof KRA_REAL_MASK_VECTORS)[number]) {
  const payload = Uint8Array.from(Buffer.from(vector.payloadBase64, "base64"));
  return { payload, file: parseKraTileFile(buildKraTileFile({ pixelBytes: 1, tiles: [{ x: vector.tile[0], y: vector.tile[1], payload }] }), KRA_LIMITS) };
}

// 벡터는 실제 Krita 5.2.2가 저장한 마스크 타일이다. 합성 압축기 없이 Krita 압축기의 출력으로 해제와 조립을 검증한다.
describe("실제 Krita 마스크 타일 알려진 정답 벡터", () => {
  it("벡터가 LZF와 비압축, 오프셋 0과 0이 아닌 경우, 기본값 0과 255를 모두 덮는다", () => {
    expect(KRA_REAL_MASK_VECTORS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(KRA_REAL_MASK_VECTORS.map((vector) => vector.flag))).toEqual(new Set([0, 1]));
    expect(new Set(KRA_REAL_MASK_VECTORS.map((vector) => vector.defaultValue))).toEqual(new Set([0, 255]));
    expect(KRA_REAL_MASK_VECTORS.some((vector) => vector.offset[0] !== 0 || vector.offset[1] !== 0)).toBe(true);
    expect(new Set(KRA_REAL_MASK_VECTORS.map((vector) => vector.id)).size).toBe(KRA_REAL_MASK_VECTORS.length);
  });

  it.each(KRA_REAL_MASK_VECTORS)("$id: 풀면 독립 해석기가 푼 4096바이트와 SHA-256이 같다", (vector) => {
    const { payload, file } = tileFileOf(vector);
    expect(payload[0]).toBe(vector.flag);
    const raw = decodeKraTile(file, file.tiles[0]!);
    expect(raw).toHaveLength(64 * 64);
    expect(sha256(raw)).toBe(vector.rawSha256);
  });

  it.each(KRA_REAL_MASK_VECTORS)("$id: 조립한 값이 Krita가 읽어 준 값과 같다 (이미지 좌표 = 타일 + 마스크 오프셋 + 타일 안 좌표)", (vector) => {
    const { file } = tileFileOf(vector);
    const result = assembleKraMask({
      file,
      defaultValue: vector.defaultValue,
      offsetX: vector.offset[0],
      offsetY: vector.offset[1],
      limits: KRA_LIMITS,
    });
    const originX = vector.tile[0] + vector.offset[0];
    const originY = vector.tile[1] + vector.offset[1];
    expect(result.extent).toEqual({ x: originX, y: originY, width: 64, height: 64 });
    for (const probe of vector.probes) {
      expect(result.values![probe.y * 64 + probe.x], `(${probe.x}, ${probe.y})`).toBe(probe.value);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  ByteWriter,
  TYPE,
  buildAsepriteFixture,
  celChunk,
  chunk,
  layerChunk,
  userDataChunk,
  frameOf,
  richAsepriteSpec,
  spriteOf,
  type FixtureSpec,
} from "../../../../tests/corpus/formats/aseprite-fixtures";
import {
  AsepriteSpriteError,
  importAsepriteSprite,
  type AsepriteSpriteErrorCode,
  type AsepriteSpriteImportOptions,
  type AsepriteSpriteImportResult,
} from "../aseprite-sprite";

type Input = Uint8Array | ArrayBuffer | Blob;

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function importSpec(spec: FixtureSpec, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteImportResult> {
  return importAsepriteSprite(buildAsepriteFixture(spec), options);
}

async function failureOf(input: Input, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteErrorCode> {
  try {
    await importAsepriteSprite(input, options);
  } catch (error) {
    if (error instanceof AsepriteSpriteError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

describe("Aseprite 청크 단위 복구", () => {
  it("알 수 없는 청크 타입과 폐기된 청크는 건너뛰고 위치를 남긴다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          chunk(0x7777, Uint8Array.of(1, 2, 3)),
          chunk(TYPE.mask, new Uint8Array(4)),
          chunk(TYPE.path, new Uint8Array(0)),
          layerChunk({ name: "after" }),
        ]),
      ]),
    );

    expect(result.layers.map((layer) => layer.name)).toEqual(["L", "after"]);
    expect(result.unknownChunks.map((entry) => [entry.frameIndex, entry.typeValue, entry.length])).toEqual([
      [0, 0x7777, 9],
      [0, 0x2016, 10],
      [0, 0x2017, 6],
    ]);
    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-type-unknown"]);
    expect(codes(result.warnings)).toEqual(["aseprite-chunk-deprecated", "aseprite-chunk-deprecated"]);
    // 위치는 입력 안에서 청크 헤더의 시작을 가리킨다.
    const bytes = buildAsepriteFixture(
      spriteOf([frameOf([layerChunk({ name: "L" }), chunk(0x7777, Uint8Array.of(1, 2, 3))])]),
    );
    const located = await importAsepriteSprite(bytes);
    const unknown = located.unknownChunks[0]!;
    expect(bytes[unknown.offset + 4]).toBe(0x77);
    expect(bytes[unknown.offset + 5]).toBe(0x77);
  });

  it("청크 크기가 6보다 작거나 프레임 밖으로 나가면 그 프레임의 나머지를 읽지 않고 truncated로 표시한다", async () => {
    const small = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "a" }), chunk(TYPE.layer, new Uint8Array(0), 3), layerChunk({ name: "lost" })])]),
    );
    const large = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "a" }), chunk(TYPE.layer, new Uint8Array(4), 5000), layerChunk({ name: "lost" })])]),
    );

    for (const result of [small, large]) {
      expect(result.layers.map((layer) => layer.name)).toEqual(["a"]);
      expect(result.truncated).toBe(true);
      expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    }
  });

  it("청크 헤더가 프레임 끝에 걸치면 chunk-invalid와 truncated다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "a" })], { newCount: 2, oldCount: 2, trailing: Uint8Array.of(1, 2, 3) })]));

    expect(result.truncated).toBe(true);
    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.layers).toHaveLength(1);
  });

  it("청크 하나의 해석 실패는 그 청크만 버리고 다음 청크를 계속 읽는다", async () => {
    const tooShortLayer = chunk(TYPE.layer, Uint8Array.of(1, 0, 0, 0));
    const result = await importSpec(spriteOf([frameOf([tooShortLayer, layerChunk({ name: "ok" })])]));

    expect(result.layers.map((layer) => layer.name)).toEqual(["ok"]);
    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.unsupported[0]!.path).toBe("frame[0].chunk[0]@144");
    expect(result.truncated).toBe(false);
  });

  it("해석한 청크 뒤에 남은 바이트는 경고하고 셀 청크는 남은 바이트를 데이터로 쓴다", async () => {
    const padded = new ByteWriter()
      .u16(3)
      .u16(0)
      .u16(0)
      .u16(0)
      .u16(0)
      .u16(0)
      .u8(255)
      .zeros(3)
      .string("pad")
      .bytes([1, 2, 3])
      .toBytes();
    const result = await importSpec(spriteOf([frameOf([chunk(TYPE.layer, padded)])]));

    expect(codes(result.warnings)).toEqual(["aseprite-chunk-trailing-bytes"]);
    expect(result.layers[0]!.name).toBe("pad");
  });

  it("외부 파일 항목 수가 남은 바이트에 비해 지나치게 크면 메모리를 잡지 않고 그 청크만 거부한다", async () => {
    const hostile = new ByteWriter().u32(0xffff_ffff).zeros(8).toBytes();
    const result = await importSpec(spriteOf([frameOf([chunk(TYPE.externalFiles, hostile), layerChunk({ name: "L" })])]));

    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.externalFiles).toEqual([]);
    expect(result.layers).toHaveLength(1);
  });
});

describe("Aseprite 손상 입력 견고성", () => {
  function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 모든 청크 종류를 한 번씩 담은 파일: 대표 스프라이트에 타일맵 레이어·셀과 알 수 없는 청크를 더한다. */
  function everythingSpec(): FixtureSpec {
    const rich = richAsepriteSpec();
    const [first, ...rest] = rich.frames;
    const firstCel = first!.chunks.findIndex((entry) => entry.type === TYPE.cel);
    const withTileLayer = [
      ...first!.chunks.slice(0, firstCel),
      layerChunk({ name: "tiles", type: 2, tilesetIndex: 0 }),
      ...first!.chunks.slice(firstCel),
    ];
    return spriteOf(
      [
        { ...first!, chunks: withTileLayer },
        ...rest,
        frameOf([
          chunk(0x7777, Uint8Array.of(1, 2, 3)),
          celChunk({ layer: 3, body: { kind: "tilemap", widthTiles: 2, heightTiles: 1, tiles: Uint8Array.of(1, 0, 0, 0, 2, 0, 0, 0) } }),
          userDataChunk({ text: "tile cel" }),
        ]),
      ],
      { headerFlags: 3, speed: 120 },
    );
  }

  it("모든 청크 종류를 담은 정상 파일은 진단이 알려진 한 가지뿐이다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(everythingSpec()));

    expect(codes(result.warnings)).toEqual([]);
    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-type-unknown"]);
    expect(result.truncated).toBe(false);
  });

  it("어느 길이로 잘라도 형식 오류 외의 예외 없이 결과를 돌려주고 truncated로 표시한다", async () => {
    const bytes = buildAsepriteFixture(everythingSpec());

    for (let length = 0; length < bytes.byteLength; length += 1) {
      const cut = bytes.slice(0, length);
      if (length < 128) {
        expect(await failureOf(cut)).toBe("signature-invalid");
        continue;
      }
      const result = await importAsepriteSprite(cut);
      expect(result.truncated, `길이 ${length}`).toBe(true);
      expect(codes(result.warnings), `길이 ${length}`).toContain("aseprite-file-size-mismatch");
      expect(result.frames.length).toBeLessThanOrEqual(result.header.frameCount);
    }
  });

  it("바이트를 무작위로 바꿔도 형식 오류 외의 예외가 없고 결과는 직렬화할 수 있다", async () => {
    const original = buildAsepriteFixture(everythingSpec());
    const random = mulberry32(0xa5e0);
    let imported = 0;
    let rejected = 0;

    for (let iteration = 0; iteration < 1_500; iteration += 1) {
      const mutated = original.slice();
      const flips = 1 + Math.floor(random() * 4);
      for (let flip = 0; flip < flips; flip += 1) {
        mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
      }
      try {
        const result = await importAsepriteSprite(mutated, { decodePixels: iteration % 3 !== 0 });
        imported += 1;
        expect(result.frames.length).toBeLessThanOrEqual(result.header.frameCount);
        expect(result.cels.every((cel) => Number.isInteger(cel.layerIndex))).toBe(true);
        JSON.stringify(result, (_key, value: unknown) => (value instanceof Uint8Array ? value.byteLength : value));
      } catch (error) {
        expect(error, `반복 ${iteration}`).toBeInstanceOf(AsepriteSpriteError);
        rejected += 1;
      }
    }

    // 변조가 대부분 헤더 밖에 떨어지므로 대다수는 읽히고, 헤더를 건드린 일부만 거부된다.
    expect(imported).toBeGreaterThan(1_000);
    expect(rejected).toBeLessThan(500);
  });
});

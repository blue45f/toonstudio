import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  buildOffscreenFixture,
  colorBlockBytes,
  concatBytes,
  encodeBlockRecord,
  encodeBlockStream,
  encodeOffscreenAttribute,
  FIXTURE_FORMATS,
  grayBlockBytes,
  maskBlockBytes,
  u32be,
  utf16be,
  zlibCompress,
} from "../../../../tests/corpus/formats/chunked-sqlite-block-fixtures";
import { DeflateBitWriter, writeStoredBlock, zlibWrapRaw } from "../../../../tests/corpus/formats/deflate-writer";
import {
  CLIP_BLOCK_EDGE,
  CLIP_BLOCK_LIMITS,
  CLIP_COMPRESSED_SLACK_BYTES,
  CLIP_DEFLATE_BLOCK_COST_BYTES,
  CLIP_EMPTY_BLOCK_RECORD_BYTES,
  CLIP_MAX_DEFLATE_BLOCKS,
  CLIP_RECORD_COST_BYTES,
  ClipBlockError,
  decodeClipOffscreen,
  parseClipBlockRecords,
  parseClipOffscreenAttribute,
  resolveClipBlockLayout,
  stepClipOffscreenDecode,
  type ClipBlockErrorCode,
} from "../chunked-sqlite-blocks";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function codeOf(action: () => unknown): ClipBlockErrorCode | "other" | "none" {
  try {
    action();
    return "none";
  } catch (error) {
    return error instanceof ClipBlockError ? error.code : "other";
  }
}

/** 입력을 `chunk`바이트씩 저장 블록으로 나눠 담은 zlib 스트림. DEFLATE 블록 수를 정확히 정하려고 쓴다. */
function storedZlib(bytes: Uint8Array, chunk: number): Uint8Array {
  const writer = new DeflateBitWriter();
  const count = Math.ceil(bytes.byteLength / chunk);
  for (let index = 0; index < count; index += 1) writeStoredBlock(writer, bytes.subarray(index * chunk, (index + 1) * chunk), index === count - 1);
  return zlibWrapRaw(writer.toBytes(), bytes);
}

/** 레코드 하나짜리 rgba 오프스크린(10x10)을 `compressed`로 만들어 풀어 본 결과. */
function decodeSingleRgbaBlock(compressed: Uint8Array, hooks: { reserve?: (bytes: number) => void; chargeWork?: (bytes: number) => void } = {}): ReturnType<typeof decodeClipOffscreen> {
  const stream = encodeBlockStream([{ compressed, decompressedBytes: 327_680 }]);
  const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: stream.blockSizes }));
  return decodeClipOffscreen({ attribute, payload: stream.payload, ...hooks });
}

/** 손으로 쓴 바이트 열: 숫자는 u32 BE로, 문자열은 UTF-16BE로 이어 붙인다. 인코더와 독립이라는 점이 이 함수의 존재 이유다. */
function raw(...parts: Array<number | string>): Uint8Array {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === "number") bytes.push((part >>> 24) & 0xff, (part >>> 16) & 0xff, (part >>> 8) & 0xff, part & 0xff);
    else for (const char of part) bytes.push(char.charCodeAt(0) >> 8, char.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(bytes);
}

describe("parseClipOffscreenAttribute: 손으로 적은 알려진 정답 벡터", () => {
  // 300x200 색 오프스크린: 가로 2블록, 세로 1블록. 블록 크기는 데이터 없는 레코드 104바이트 둘.
  const handmade = concatBytes(
    raw(16, 102, 42, 42),
    // Parameter 절: 이름 9글자 + 값 20개(폭, 높이, 가로·세로 블록 수, 네 묶음)
    raw(9, "Parameter", 300, 200, 2, 1, 33, 1, 4, 5, 65536, 4, 1024, 1, 256, 65536, 256, 1024, 8, 8, 0, 0),
    // InitColor 절: 20, has_color, packed_rgba, 추가 값 개수, 채널 수
    raw(9, "InitColor", 20, 1, 0xff0000ff, 0, 4),
    // BlockSize 절: 12, 블록 수, 채널 수, 블록마다 레코드 크기
    raw(9, "BlockSize", 12, 2, 4, 104, 104),
  );

  it("필드를 그대로 읽는다", () => {
    expect(handmade.byteLength).toBe(16 + 102 + 42 + 42);
    const attribute = parseClipOffscreenAttribute(handmade);
    expect(attribute).toEqual({
      width: 300,
      height: 200,
      columns: 2,
      rows: 1,
      channelOrder: 33,
      channelCount: 4,
      pixelBytesCode: 5,
      initColor: { hasColor: true, packedRgba: 0xff0000ff, extraCount: 0, channelCount: 4 },
      blockSizes: [104, 104],
    });
  });

  it("인코더가 만든 BLOB와 손으로 적은 BLOB가 바이트까지 같다", () => {
    const encoded = encodeOffscreenAttribute({ width: 300, height: 200, kind: "rgba", hasColor: true, packedRgba: 0xff0000ff, blockSizes: [104, 104] });
    // 손으로 적은 쪽은 InitColor 채널 수를 4로 적었고 인코더도 형식의 채널 수 4를 쓴다.
    expect(encoded).toEqual(handmade);
  });

  it("추가 초기 값이 있으면 InitColor 절 길이가 4바이트씩 늘고 개수가 맞아야 한다", () => {
    const withExtras = concatBytes(
      raw(16, 102, 50, 42),
      raw(9, "Parameter", 300, 200, 2, 1, 33, 1, 4, 5, 65536, 4, 1024, 1, 256, 65536, 256, 1024, 8, 8, 0, 0),
      raw(9, "InitColor", 20, 0, 0, 2, 4, 7, 9),
      raw(9, "BlockSize", 12, 2, 4, 104, 104),
    );
    expect(parseClipOffscreenAttribute(withExtras).initColor).toEqual({ hasColor: false, packedRgba: 0, extraCount: 2, channelCount: 4 });
    const wrongCount = Uint8Array.from(withExtras);
    wrongCount[16 + 102 + 4 + 18 + 4 * 3 + 3] = 3; // 추가 값 개수 2 -> 3
    expect(codeOf(() => parseClipOffscreenAttribute(wrongCount))).toBe("attribute");
  });
});

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  return "오류 없음";
}

describe("parseClipOffscreenAttribute: 절 값 개수와 길이의 경계", () => {
  /** 세 절을 값 열 그대로 이어 붙인 속성 BLOB. 머리의 절 길이는 값 개수에서 계산한다. */
  function attributeWith(parameter: number[], initColor: number[], blockSize: number[]): Uint8Array {
    const sections = [raw(9, "Parameter", ...parameter), raw(9, "InitColor", ...initColor), raw(9, "BlockSize", ...blockSize)];
    return concatBytes(raw(16, sections[0]!.byteLength, sections[1]!.byteLength, sections[2]!.byteLength), ...sections);
  }
  const PARAMETER_MIN = [300, 200, 2, 1, 33, 1, 4, 5];
  const INIT_MIN = [20, 1, 0xff0000ff, 0, 4];
  const BLOCK_MIN = [12, 2, 4, 104, 104];

  it("절마다 필요한 최소 값 개수(Parameter 8, InitColor 5, BlockSize 3)로 만든 속성은 읽는다", () => {
    expect(parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN, INIT_MIN, BLOCK_MIN))).toMatchObject({ width: 300, height: 200, channelOrder: 33, channelCount: 4, pixelBytesCode: 5, blockSizes: [104, 104] });
    expect(parseClipOffscreenAttribute(attributeWith([0, 0, 0, 0, 33, 1, 4, 5], INIT_MIN, [12, 0, 4]))).toMatchObject({ width: 0, height: 0, blockSizes: [] });
  });

  it("절마다 값이 하나라도 모자라면 개수를 담아 알린다", () => {
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN.slice(0, 7), INIT_MIN, BLOCK_MIN)))).toBe("Parameter 값이 7개뿐이다");
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN, INIT_MIN.slice(0, 4), BLOCK_MIN)))).toBe("InitColor 값이 4개뿐이다");
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN, INIT_MIN, BLOCK_MIN.slice(0, 2))))).toBe("BlockSize 값이 2개뿐이다");
  });

  it("값이 하나도 없는 절(길이가 절 머리와 같음)은 값 개수 0으로 알리고 머리보다 짧거나 4의 배수가 아니면 길이가 올바르지 않다고 알린다", () => {
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith([], INIT_MIN, BLOCK_MIN)))).toBe("Parameter 값이 0개뿐이다");
    expect(messageOf(() => parseClipOffscreenAttribute(concatBytes(raw(16, 0, 0, 0))))).toBe("Parameter 절 길이 0가 올바르지 않다");
    const oddLength = concatBytes(raw(16, 22 + 4 + 2, 42, 40), new Uint8Array(22 + 4 + 2 + 42 + 40));
    expect(messageOf(() => parseClipOffscreenAttribute(oddLength))).toBe("Parameter 절 길이 28가 올바르지 않다");
  });

  it("절 이름이 다르면 읽은 이름을 그대로 알린다(UTF-16BE의 위쪽 바이트가 0이 아닌 글자 포함)", () => {
    const named = (name: string): Uint8Array => {
      const sections = [raw(9, name, ...PARAMETER_MIN), raw(9, "InitColor", ...INIT_MIN), raw(9, "BlockSize", ...BLOCK_MIN)];
      return concatBytes(raw(16, sections[0]!.byteLength, sections[1]!.byteLength, sections[2]!.byteLength), ...sections);
    };

    expect(messageOf(() => parseClipOffscreenAttribute(named("Parametre")))).toBe('절 이름이 Parameter이어야 하는데 "Parametre"이다');
    expect(messageOf(() => parseClipOffscreenAttribute(named("한글이름이아홉자다")))).toBe('절 이름이 Parameter이어야 하는데 "한글이름이아홉자다"이다');
  });

  it("절 길이가 절 머리(22바이트)보다 짧으면 4의 배수 여부와 상관없이 올바르지 않다", () => {
    // 18은 22보다 짧고 (18 − 22)이 4의 배수라 나머지 검사만으로는 걸리지 않는다. 20은 나머지 검사에도 걸린다.
    for (const length of [18, 20, 21]) {
      const bytes = concatBytes(raw(16, length, 42, 40), new Uint8Array(length + 42 + 40));
      expect(messageOf(() => parseClipOffscreenAttribute(bytes)), `길이 ${length}`).toBe(`Parameter 절 길이 ${length}가 올바르지 않다`);
    }
    // 22 이상이면서 (길이 − 22)가 4의 배수가 아니면 올바르지 않다.
    for (const length of [23, 24, 25, 28]) {
      const bytes = concatBytes(raw(16, length, 42, 40), new Uint8Array(length + 42 + 40));
      expect(messageOf(() => parseClipOffscreenAttribute(bytes)), `길이 ${length}`).toBe(`Parameter 절 길이 ${length}가 올바르지 않다`);
    }
  });

  it("절 길이 하나가 BLOB 길이를 넘으면 그 사실을 알리고(같으면 합이 맞지 않는다고 알린다), 합이 맞지 않으면 합을 알린다", () => {
    const blob = (parameter: number, initColor: number, blockSize: number, size: number) => concatBytes(raw(16, parameter, initColor, blockSize), new Uint8Array(size - 16));
    // 한 절만 BLOB보다 길다 → 세 자리 각각
    expect(messageOf(() => parseClipOffscreenAttribute(blob(61, 0, 0, 60)))).toBe("절 길이가 BLOB보다 길다");
    expect(messageOf(() => parseClipOffscreenAttribute(blob(0, 61, 0, 60)))).toBe("절 길이가 BLOB보다 길다");
    expect(messageOf(() => parseClipOffscreenAttribute(blob(0, 0, 61, 60)))).toBe("절 길이가 BLOB보다 길다");
    // BLOB 길이와 정확히 같으면 '길다'가 아니라 합이 맞지 않는 것이다
    expect(messageOf(() => parseClipOffscreenAttribute(blob(60, 0, 0, 60)))).toBe("절 길이의 합(76)이 BLOB 길이 60와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(blob(0, 60, 0, 60)))).toBe("절 길이의 합(76)이 BLOB 길이 60와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(blob(0, 0, 60, 60)))).toBe("절 길이의 합(76)이 BLOB 길이 60와 다르다");
    // 세 길이의 합이 모두 반영된 숫자가 메시지에 든다
    expect(messageOf(() => parseClipOffscreenAttribute(blob(10, 20, 30, 100)))).toBe("절 길이의 합(76)이 BLOB 길이 100와 다르다");
  });

  it("폭·높이 한도: 한 변이 한도와 같으면 통과하고 하나 넘으면 다른 변이 0이어도 limit이다", () => {
    const sized = (width: number, height: number, columns: number, rows: number, blocks: number) =>
      attributeWith([width, height, columns, rows, 33, 1, 4, 5], INIT_MIN, [12, blocks, 4, ...new Array<number>(blocks).fill(104)]);
    const limits = { maxBlocks: 100, maxPixels: 256 };

    expect(parseClipOffscreenAttribute(sized(1, 256, 1, 1, 1), limits)).toMatchObject({ width: 1, height: 256 });
    expect(parseClipOffscreenAttribute(sized(256, 1, 1, 1, 1), limits)).toMatchObject({ width: 256, height: 1 });
    expect(codeOf(() => parseClipOffscreenAttribute(sized(257, 0, 2, 0, 0), limits))).toBe("limit");
    expect(codeOf(() => parseClipOffscreenAttribute(sized(0, 257, 0, 2, 0), limits))).toBe("limit");
    expect(codeOf(() => parseClipOffscreenAttribute(sized(16, 17, 1, 1, 1), limits))).toBe("limit");
    expect(parseClipOffscreenAttribute(sized(16, 16, 1, 1, 1), limits)).toMatchObject({ width: 16, height: 16 });
  });

  it("블록 격자는 가로·세로 하나만 틀려도 격자 불일치로 알린다", () => {
    const grid = (columns: number, rows: number) =>
      attributeWith([513, 300, columns, rows, 33, 1, 4, 5], INIT_MIN, [12, columns * rows, 4, ...new Array<number>(columns * rows).fill(104)]);

    expect(parseClipOffscreenAttribute(grid(3, 2))).toMatchObject({ columns: 3, rows: 2 });
    expect(messageOf(() => parseClipOffscreenAttribute(grid(2, 2)))).toBe("블록 격자 2x2가 크기 513x300에서 계산한 3x2와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(grid(3, 3)))).toBe("블록 격자 3x3가 크기 513x300에서 계산한 3x2와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(grid(2, 3)))).toBe("블록 격자 2x3가 크기 513x300에서 계산한 3x2와 다르다");
  });

  it("머리 16바이트만 있는 속성도 절 길이 검사에서 걸린다(머리 길이 경계)", () => {
    expect(messageOf(() => parseClipOffscreenAttribute(new Uint8Array(15)))).toBe("Attribute BLOB이 머리(16바이트)보다 짧다");
    expect(messageOf(() => parseClipOffscreenAttribute(raw(16, 0, 0, 0)))).toBe("Parameter 절 길이 0가 올바르지 않다");
  });

  it("InitColor의 추가 값 개수와 BlockSize의 블록 수는 실제 값 열과 정확히 맞아야 한다", () => {
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN, [20, 1, 0xff0000ff, 1, 4], BLOCK_MIN)))).toBe("InitColor의 추가 값 개수 1가 실제 0개와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(attributeWith(PARAMETER_MIN, INIT_MIN, [12, 3, 4, 104, 104])))).toBe("BlockSize의 블록 수 3가 실제 2개와 다르다");
  });
});

describe("decodeClipOffscreen: 한 채널만 있는 초기 색", () => {
  it.each([
    ["R", 0x07000000, [7, 0, 0, 0]],
    ["G", 0x00070000, [0, 7, 0, 0]],
    ["B", 0x00000700, [0, 0, 7, 0]],
    ["A", 0x00000007, [0, 0, 0, 7]],
    // 값이 정확히 1인 채널(0과 1의 경계)도 0이 아닌 색이다.
    ["R=1", 0x01000000, [1, 0, 0, 0]],
    ["G=1", 0x00010000, [0, 1, 0, 0]],
    ["B=1", 0x00000100, [0, 0, 1, 0]],
    ["A=1", 0x00000001, [0, 0, 0, 1]],
  ])("%s 채널만 0이 아닌 초기 색도 빈 블록을 정확히 채운다", (_name, packedRgba, expected) => {
    const built = buildOffscreenFixture({ width: 5, height: 3, kind: "rgba", hasColor: true, packedRgba, emptyBlocks: new Set([0]), pixelAt: () => [1, 2, 3, 4] });
    const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(built.attribute), payload: built.payload });

    expect(result.initial).toEqual(expected);
    for (let at = 0; at < result.pixels!.byteLength; at += 4) expect(Array.from(result.pixels!.subarray(at, at + 4))).toEqual(expected);
  });

  it("마스크의 초기 값은 packed RGBA의 마지막 바이트이고 0이 아니면 채운다(1, 128)", () => {
    for (const [packed, value] of [[0x00000001, 1], [0x00000080, 128], [0xffffff00, 0]] as const) {
      const built = buildOffscreenFixture({ width: 3, height: 3, kind: "mask8", hasColor: true, packedRgba: packed, emptyBlocks: new Set([0]), pixelAt: () => [9] });
      const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(built.attribute), payload: built.payload });

      expect(result.initial).toEqual([value]);
      expect(Array.from(result.values!)).toEqual(new Array(9).fill(value));
    }
  });
});

describe("parseClipBlockRecords: 레코드 끝 경계", () => {
  const compressed = zlibCompress(new Uint8Array(327_680));
  const full = encodeBlockRecord(0, { compressed, decompressedBytes: 327_680 });
  const attributeFor = (declared: number) => parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: [declared] }));

  /** 레코드의 끝에서 `cut`바이트를 잘라 내고 길이 필드를 맞춘다. */
  function trimmed(cut: number): { payload: Uint8Array; declared: number } {
    const declared = full.byteLength - cut;
    const payload = Uint8Array.from(full.subarray(0, declared));
    new DataView(payload.buffer).setUint32(0, declared, false);
    return { payload, declared };
  }

  it("온전한 레코드는 읽는다(끝 표식 4 + 34바이트)", () => {
    const records = parseClipBlockRecords(full, attributeFor(full.byteLength));
    expect(records[0]!.compressed).toMatchObject({ length: compressed.byteLength });
  });

  it("압축 데이터가 레코드 끝과 정확히 맞으면 끝 표식이 없다고 알린다(데이터 경계)", () => {
    const { payload, declared } = trimmed(4 + 34);
    expect(messageOf(() => parseClipBlockRecords(payload, attributeFor(declared)))).toBe("블록 0의 끝 표식이 레코드 밖이다");
  });

  it("압축 데이터가 레코드 끝을 한 바이트라도 넘으면 레코드 밖이라고 알린다", () => {
    const { payload, declared } = trimmed(4 + 34 + 1);
    expect(messageOf(() => parseClipBlockRecords(payload, attributeFor(declared)))).toBe("블록 0의 압축 데이터가 레코드 밖이다");
  });

  it("끝 표식 길이 필드(4바이트)만 남으면 표식 이름이 없어 길이와 내용이 맞지 않는다고 알린다(끝 표식 경계)", () => {
    const { payload, declared } = trimmed(34);
    expect(messageOf(() => parseClipBlockRecords(payload, attributeFor(declared)))).toBe("블록 0의 레코드 길이와 내용이 맞지 않는다");
  });

  it("끝 표식 길이 필드가 3바이트만 남으면 끝 표식이 레코드 밖이라고 알린다", () => {
    const { payload, declared } = trimmed(34 + 1);
    expect(messageOf(() => parseClipBlockRecords(payload, attributeFor(declared)))).toBe("블록 0의 끝 표식이 레코드 밖이다");
  });
});

describe("parseClipOffscreenAttribute: 블록 수와 격자", () => {
  it("BlockSize의 블록 수가 크기에서 계산한 격자(열 x 행)와 다르면 모자라든 넘치든 attribute 오류다", () => {
    const attributeFor = (count: number) => encodeOffscreenAttribute({ width: 300, height: 200, kind: "rgba", blockSizes: new Array<number>(count).fill(104) });

    expect(parseClipOffscreenAttribute(attributeFor(2)).blockSizes).toHaveLength(2);
    expect(messageOf(() => parseClipOffscreenAttribute(attributeFor(1)))).toBe("블록 수 1가 격자 2x1와 다르다");
    expect(messageOf(() => parseClipOffscreenAttribute(attributeFor(3)))).toBe("블록 수 3가 격자 2x1와 다르다");
  });
});

describe("parseClipBlockRecords: 선언 길이", () => {
  it("선언 길이가 최소 104바이트보다 짧으면 그 사실을 알린다(103은 거부, 104는 받는다)", () => {
    const attributeFor = (declared: number) => parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: [declared] }));
    const empty = encodeBlockRecord(0, { compressed: null, decompressedBytes: 327_680 });

    expect(parseClipBlockRecords(empty, attributeFor(104))[0]).toMatchObject({ index: 0, compressed: null });
    expect(messageOf(() => parseClipBlockRecords(empty, attributeFor(103)))).toBe("블록 0의 선언 길이 103가 최소 104바이트보다 짧다");
    expect(messageOf(() => parseClipBlockRecords(empty, attributeFor(0)))).toBe("블록 0의 선언 길이 0가 최소 104바이트보다 짧다");
  });
});

describe("parseClipOffscreenAttribute: 구조 검사", () => {
  const base = encodeOffscreenAttribute({ width: 513, height: 300, kind: "rgba", blockSizes: new Array<number>(6).fill(104) });

  it("블록 격자는 크기에서 올림해 계산한 값과 같아야 한다", () => {
    expect(parseClipOffscreenAttribute(base).columns).toBe(3);
    expect(parseClipOffscreenAttribute(base).rows).toBe(2);
    const wrongGrid = Uint8Array.from(base);
    // Parameter 값: 16 + 4 + 18 = 38번째 바이트부터 폭, 높이, 가로 블록 수 ...
    new DataView(wrongGrid.buffer).setUint32(38 + 8, 2, false);
    expect(codeOf(() => parseClipOffscreenAttribute(wrongGrid))).toBe("attribute");
  });

  it("폭과 높이가 0이면 블록이 없다", () => {
    const empty = encodeOffscreenAttribute({ width: 0, height: 0, kind: "rgba", blockSizes: [] });
    expect(parseClipOffscreenAttribute(empty)).toMatchObject({ columns: 0, rows: 0, blockSizes: [] });
  });

  it.each([
    ["머리 크기 필드", (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(0, 17, false)],
    ["절 길이의 합", (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(4, 106, false)],
    ["Parameter 이름", (bytes: Uint8Array) => (bytes[16 + 4 + 1] = 0x42)],
    ["이름 글자 수", (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(16, 8, false)],
  ])("%s가 어긋나면 attribute 오류다", (_name, mutate) => {
    const mutated = Uint8Array.from(base);
    mutate(mutated);
    expect(codeOf(() => parseClipOffscreenAttribute(mutated))).toBe("attribute");
  });

  it("BlockSize 절의 블록 수가 실제 개수와 다르면 attribute 오류다", () => {
    const mutated = Uint8Array.from(base);
    const blockSectionStart = 16 + 102 + 42;
    new DataView(mutated.buffer).setUint32(blockSectionStart + 4 + 18 + 4, 7, false);
    expect(codeOf(() => parseClipOffscreenAttribute(mutated))).toBe("attribute");
  });

  it("한도: 픽셀 수와 블록 수를 넘으면 limit이다(경계 포함)", () => {
    const wide = encodeOffscreenAttribute({ width: 1024, height: 1, kind: "rgba", blockSizes: [104, 104, 104, 104] });
    expect(parseClipOffscreenAttribute(wide, { maxBlocks: 4, maxPixels: 1024 }).columns).toBe(4);
    expect(codeOf(() => parseClipOffscreenAttribute(wide, { maxBlocks: 3, maxPixels: 1024 }))).toBe("limit");
    expect(codeOf(() => parseClipOffscreenAttribute(wide, { maxBlocks: 4, maxPixels: 1023 }))).toBe("limit");
  });

  it("폭·높이가 u32 최댓값이어도 곱셈이 넘치지 않고 limit으로 끝난다", () => {
    const huge = Uint8Array.from(base);
    new DataView(huge.buffer).setUint32(38, 0xffffffff, false);
    new DataView(huge.buffer).setUint32(42, 0xffffffff, false);
    expect(codeOf(() => parseClipOffscreenAttribute(huge))).toBe("limit");
  });

  it("어느 길이에서 잘라도 ClipBlockError만 난다", () => {
    for (let length = 0; length < base.byteLength; length += 1) {
      const code = codeOf(() => parseClipOffscreenAttribute(base.subarray(0, length)));
      expect(code, `length ${length}`).toBe("attribute");
    }
  });

  it("바이트 하나를 바꾼 3000건은 ClipBlockError 외의 예외를 내지 않는다", () => {
    const next = mulberry32(5);
    for (let trial = 0; trial < 3000; trial += 1) {
      const mutated = Uint8Array.from(base);
      mutated[Math.floor(next() * mutated.byteLength)] ^= 1 + Math.floor(next() * 255);
      expect(codeOf(() => parseClipOffscreenAttribute(mutated)), `trial ${trial}`).not.toBe("other");
    }
  });
});

describe("resolveClipBlockLayout", () => {
  it.each([
    ["색", { channelOrder: 0x21, channelCount: 4, pixelBytesCode: 5 }, { kind: "rgba", decompressedBytes: 327_680 }],
    ["회색 8비트", { channelOrder: 0x11, channelCount: 1, pixelBytesCode: 2 }, { kind: "gray8", decompressedBytes: 131_072 }],
    ["회색 1비트", { channelOrder: 0x11, channelCount: 1, pixelBytesCode: 1 }, { kind: "gray1", decompressedBytes: 16_384 }],
    ["마스크", { channelOrder: 0x01, channelCount: 0, pixelBytesCode: 1 }, { kind: "mask8", decompressedBytes: 65_536 }],
  ])("%s", (_name, attribute, expected) => {
    expect(resolveClipBlockLayout(attribute)).toEqual(expected);
  });

  it.each([
    [{ channelOrder: 0x21, channelCount: 3, pixelBytesCode: 5 }],
    [{ channelOrder: 0x21, channelCount: 4, pixelBytesCode: 6 }],
    [{ channelOrder: 0x31, channelCount: 4, pixelBytesCode: 5 }],
    [{ channelOrder: 0x01, channelCount: 1, pixelBytesCode: 1 }],
  ])("관찰되지 않은 조합은 null이다: %j", (attribute) => {
    expect(resolveClipBlockLayout(attribute)).toBeNull();
  });
});

describe("parseClipBlockRecords: 손으로 적은 레코드", () => {
  // 데이터 없는 블록 레코드(명세: 104바이트)
  const emptyRecord = raw(104, 19, "BlockDataBeginChunk", 0, 327_680, 256, 256, 0, 17, "BlockDataEndChunk");

  it("데이터 없는 레코드는 정확히 104바이트다", () => {
    expect(emptyRecord.byteLength).toBe(104);
  });

  it("압축 데이터가 있으면 레코드는 압축 길이 + 112바이트이고 압축 길이 필드만 리틀엔디언이다", () => {
    const stream = Uint8Array.of(0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01); // 빈 출력 zlib 스트림(내용은 이 시험에서 풀지 않는다)
    const length = stream.byteLength;
    const withData = concatBytes(
      raw(length + 112, 19, "BlockDataBeginChunk", 0, 327_680, 256, 256, 1, length + 4),
      Uint8Array.of(length, 0, 0, 0), // 압축 길이 u32 LE
      stream,
      raw(17, "BlockDataEndChunk"),
    );
    expect(withData.byteLength).toBe(length + 112);
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 100, height: 100, kind: "rgba", blockSizes: [withData.byteLength] }));
    const records = parseClipBlockRecords(withData, attribute);
    expect(records).toEqual([{ index: 0, decompressedBytes: 327_680, compressed: { offset: 4 + 4 + 38 + 20 + 8, length } }]);
    expect(withData.subarray(records[0]!.compressed!.offset, records[0]!.compressed!.offset + length)).toEqual(stream);
  });

  it("레코드 열을 가로 우선으로 읽고 뒤따르는 BlockStatus·BlockCheckSum 절은 읽지 않는다", () => {
    const secondRecord = raw(104, 19, "BlockDataBeginChunk", 1, 327_680, 256, 256, 0, 17, "BlockDataEndChunk");
    const trailing = concatBytes(raw(11, "BlockStatus", 12, 2, 4, 1, 1), raw(13, "BlockCheckSum", 12, 2, 4, 0, 0));
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 300, height: 100, kind: "rgba", blockSizes: [104, 104] }));
    const records = parseClipBlockRecords(concatBytes(emptyRecord, secondRecord, trailing), attribute);
    expect(records.map((record) => [record.index, record.compressed])).toEqual([
      [0, null],
      [1, null],
    ]);
  });

  const oneBlock = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 100, height: 100, kind: "rgba", blockSizes: [104] }));

  it.each([
    ["레코드 길이 필드", 0, 105],
    ["시작 표식 길이", 4, 20],
    ["블록 번호", 4 + 4 + 38, 1],
    ["블록 폭", 4 + 4 + 38 + 8, 128],
    ["블록 높이", 4 + 4 + 38 + 12, 128],
    ["끝 표식 길이", 104 - 34 - 4, 16],
  ])("%s가 어긋나면 stream 오류다", (_name, at, value) => {
    const mutated = Uint8Array.from(emptyRecord);
    new DataView(mutated.buffer).setUint32(at, value, false);
    expect(codeOf(() => parseClipBlockRecords(mutated, oneBlock))).toBe("stream");
  });

  it("시작·끝 표식 글자가 다르면 stream 오류다", () => {
    const startMark = Uint8Array.from(emptyRecord);
    startMark[4 + 4 + 1] = 0x58;
    expect(codeOf(() => parseClipBlockRecords(startMark, oneBlock))).toBe("stream");
    const endMark = Uint8Array.from(emptyRecord);
    endMark[104 - 1] = 0x58;
    expect(codeOf(() => parseClipBlockRecords(endMark, oneBlock))).toBe("stream");
  });

  it("데이터 영역이 선언 길이보다 짧으면 stream 오류다", () => {
    expect(codeOf(() => parseClipBlockRecords(emptyRecord.subarray(0, 103), oneBlock))).toBe("stream");
  });

  it("선언 길이가 최소 104바이트보다 짧으면 stream 오류다", () => {
    const tiny = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 100, height: 100, kind: "rgba", blockSizes: [103] }));
    expect(codeOf(() => parseClipBlockRecords(emptyRecord, tiny))).toBe("stream");
  });

  it("데이터 있음 표시가 있는데 구간 길이가 압축 길이+4가 아니면 stream 오류다", () => {
    const stream = zlibCompress(new Uint8Array(10));
    const good = encodeBlockRecord(0, { compressed: stream, decompressedBytes: 327_680 });
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 100, height: 100, kind: "rgba", blockSizes: [good.byteLength] }));
    expect(parseClipBlockRecords(good, attribute)).toHaveLength(1);
    const wrongSection = Uint8Array.from(good);
    new DataView(wrongSection.buffer).setUint32(4 + 4 + 38 + 20, stream.byteLength + 5, false);
    expect(codeOf(() => parseClipBlockRecords(wrongSection, attribute))).toBe("stream");
    const overrun = Uint8Array.from(good);
    new DataView(overrun.buffer).setUint32(4 + 4 + 38 + 24, stream.byteLength + 100, true);
    new DataView(overrun.buffer).setUint32(4 + 4 + 38 + 20, stream.byteLength + 104, false);
    expect(codeOf(() => parseClipBlockRecords(overrun, attribute))).toBe("stream");
  });

  it("레코드 바이트를 하나씩 바꾼 3000건은 ClipBlockError 외의 예외를 내지 않는다", () => {
    const blocks = [
      { compressed: zlibCompress(new Uint8Array(1_000)), decompressedBytes: 327_680 },
      { compressed: null, decompressedBytes: 327_680 },
    ];
    const stream = encodeBlockStream(blocks);
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 300, height: 100, kind: "rgba", blockSizes: stream.blockSizes }));
    const next = mulberry32(8);
    for (let trial = 0; trial < 3000; trial += 1) {
      const mutated = Uint8Array.from(stream.payload);
      mutated[Math.floor(next() * mutated.byteLength)] ^= 1 + Math.floor(next() * 255);
      expect(codeOf(() => parseClipBlockRecords(mutated, attribute)), `trial ${trial}`).not.toBe("other");
    }
    for (let length = 0; length < stream.payload.byteLength; length += 7) {
      expect(codeOf(() => parseClipBlockRecords(stream.payload.subarray(0, length), attribute)), `length ${length}`).not.toBe("other");
    }
  });
});

describe("decodeClipOffscreen: 색", () => {
  const colorAt = (x: number, y: number): readonly number[] => [x % 251, (y * 3) % 253, (x + y) % 255, (x * 7 + y) % 256];

  it.each([
    [1, 1],
    [255, 255],
    [256, 256],
    [257, 257],
    [513, 300],
  ])("%dx%d: 모든 픽셀이 입력과 같다(가장자리 블록 잘림 포함)", (width, height) => {
    const built = buildOffscreenFixture({ width, height, kind: "rgba", pixelAt: colorAt, padding: [9, 9, 9, 9] });
    const attribute = parseClipOffscreenAttribute(built.attribute);
    const result = decodeClipOffscreen({ attribute, payload: built.payload });
    expect(result.kind).toBe("rgba");
    expect(result.pixels).not.toBeNull();
    expect(result.values).toBeNull();
    expect(result.pixels!.byteLength).toBe(width * height * 4);
    let wrong = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const expected = colorAt(x, y);
        const at = (y * width + x) * 4;
        if (result.pixels![at] !== expected[0] || result.pixels![at + 1] !== expected[1] || result.pixels![at + 2] !== expected[2] || result.pixels![at + 3] !== expected[3]) wrong += 1;
      }
    }
    expect(wrong).toBe(0);
    expect(result.decodedBlocks).toBe(Math.ceil(width / 256) * Math.ceil(height / 256));
  });

  it("바이트 순서: 알파 평면이 먼저이고 색 평면은 B, G, R, 쓰지 않는 바이트 순서다", () => {
    // 해제 후 블록을 손으로 쓴다: 첫 픽셀만 의미가 있다.
    const block = new Uint8Array(327_680);
    block[0] = 200; // 알파(0,0)
    block[65_536] = 30; // B(0,0)
    block[65_537] = 20; // G(0,0)
    block[65_538] = 10; // R(0,0)
    block[65_539] = 99; // 쓰지 않는 바이트: 결과에 나오면 안 된다
    block[1] = 255; // 알파(1,0)
    block[65_536 + 4 + 2] = 77; // R(1,0)
    const stream = encodeBlockStream([{ compressed: zlibCompress(block), decompressedBytes: 327_680 }]);
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 2, height: 1, kind: "rgba", blockSizes: stream.blockSizes }));
    const result = decodeClipOffscreen({ attribute, payload: stream.payload });
    expect([...result.pixels!]).toEqual([10, 20, 30, 200, 77, 0, 0, 255]);
  });

  it("데이터 없는 블록은 InitColor를 따른다(색이 있으면 packed RGBA, 없으면 투명)", () => {
    const empty = new Set([0, 1]);
    const colored = buildOffscreenFixture({ width: 300, height: 10, kind: "rgba", hasColor: true, packedRgba: 0x11223344, emptyBlocks: empty, pixelAt: () => [1, 2, 3, 4] });
    const coloredResult = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(colored.attribute), payload: colored.payload });
    expect([...coloredResult.pixels!.subarray(0, 4)]).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect([...coloredResult.pixels!.subarray((10 * 300 - 1) * 4, 10 * 300 * 4)]).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect(coloredResult.initial).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect(coloredResult.decodedBlocks).toBe(0);

    const uncolored = buildOffscreenFixture({ width: 300, height: 10, kind: "rgba", hasColor: false, packedRgba: 0x11223344, emptyBlocks: new Set([1]), pixelAt: () => [5, 6, 7, 8] });
    const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(uncolored.attribute), payload: uncolored.payload });
    expect([...result.pixels!.subarray(0, 4)]).toEqual([5, 6, 7, 8]);
    expect([...result.pixels!.subarray(299 * 4, 300 * 4)]).toEqual([0, 0, 0, 0]);
    expect(result.initial).toEqual([0, 0, 0, 0]);
  });

  it("외부 데이터가 없으면(payload null) 전체가 InitColor다", () => {
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 3, height: 2, kind: "rgba", hasColor: true, packedRgba: 0xffffffff, blockSizes: [104] }));
    const result = decodeClipOffscreen({ attribute, payload: null });
    expect(new Set(result.pixels)).toEqual(new Set([255]));
    expect(result.decodedBlocks).toBe(0);
  });
});

describe("decodeClipOffscreen: 회색과 마스크", () => {
  it("회색 8비트는 R=G=B=회색이고 알파 평면을 쓴다", () => {
    const grayAt = (x: number, y: number): readonly number[] => [(x * 5 + y) % 256, (x + 2 * y) % 256];
    const built = buildOffscreenFixture({ width: 300, height: 5, kind: "gray8", pixelAt: grayAt });
    const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(built.attribute), payload: built.payload });
    expect(result.kind).toBe("gray");
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 300; x += 1) {
        const [gray, alpha] = grayAt(x, y);
        const at = (y * 300 + x) * 4;
        expect([result.pixels![at], result.pixels![at + 1], result.pixels![at + 2], result.pixels![at + 3]]).toEqual([gray, gray, gray, alpha]);
      }
    }
  });

  it("마스크는 한 평면의 값이고 데이터 없는 블록은 InitColor의 알파(없으면 0)다", () => {
    const valueAt = (x: number, y: number): readonly number[] => [(x * 3 + y * 11) % 256];
    const built = buildOffscreenFixture({ width: 300, height: 4, kind: "mask8", hasColor: true, packedRgba: 0xffffffff, emptyBlocks: new Set([1]), pixelAt: valueAt });
    const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(built.attribute), payload: built.payload });
    expect(result.kind).toBe("mask");
    expect(result.pixels).toBeNull();
    expect(result.values!.byteLength).toBe(300 * 4);
    expect(result.values![0]).toBe(valueAt(0, 0)[0]);
    expect(result.values![255]).toBe(valueAt(255, 0)[0]);
    expect(result.values![256]).toBe(255);
    expect(result.values![299]).toBe(255);
    expect(result.initial).toEqual([255]);

    const hidden = buildOffscreenFixture({ width: 10, height: 1, kind: "mask8", hasColor: false, packedRgba: 0xffffffff, emptyBlocks: new Set([0]), pixelAt: () => [9] });
    const hiddenResult = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(hidden.attribute), payload: hidden.payload });
    expect(new Set(hiddenResult.values)).toEqual(new Set([0]));
  });
});

describe("decodeClipOffscreen: 오류와 자원 회계", () => {
  const built = buildOffscreenFixture({ width: 600, height: 300, kind: "rgba", pixelAt: (x, y) => [x % 256, y % 256, 0, 255] });
  const attribute = parseClipOffscreenAttribute(built.attribute);

  it("1비트 단색과 알 수 없는 형식은 format 오류다", () => {
    const gray1 = { ...attribute, channelOrder: 0x11, channelCount: 1, pixelBytesCode: 1 };
    expect(codeOf(() => decodeClipOffscreen({ attribute: gray1, payload: built.payload }))).toBe("format");
    const unknown = { ...attribute, channelOrder: 0x41 };
    expect(codeOf(() => decodeClipOffscreen({ attribute: unknown, payload: built.payload }))).toBe("format");
  });

  it("알 수 없는 형식의 문구는 채널 순서를 16진으로, 채널 수와 바이트 코드를 10진으로 알린다", () => {
    const unknown = { ...attribute, channelOrder: 0x2b, channelCount: 3, pixelBytesCode: 9 };

    expect(messageOf(() => decodeClipOffscreen({ attribute: unknown, payload: built.payload }))).toBe("지원하지 않는 블록 형식이다 (채널 순서 0x2b, 채널 3, 바이트 코드 9)");
  });

  it("크기가 0x0인 오프스크린은 초기 색이 있어도 빈 버퍼로 읽는다(0바이트 버퍼에 쓰다 던지지 않는다)", () => {
    for (const kind of ["rgba", "gray8", "mask8"] as const) {
      const empty = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 0, height: 0, kind, hasColor: true, packedRgba: 0x11223344, blockSizes: [] }));
      const result = decodeClipOffscreen({ attribute: empty, payload: null });

      expect((result.pixels ?? result.values)!.byteLength, kind).toBe(0);
      expect(result.decodedBlocks).toBe(0);
    }
  });

  it("데이터 있음 표시가 0이 아닌 값이면(하위 바이트가 모두 0이어도) 압축 구간을 읽으려 한다", () => {
    const empty = encodeBlockRecord(0, { compressed: null, decompressedBytes: 327_680 });
    const flagged = Uint8Array.from(empty);
    // 표시(u32)는 레코드 머리 4 + 4 + 38 + 16 = 62바이트 뒤에 있다.
    new DataView(flagged.buffer).setUint32(62, 0x01000000, false);
    const flaggedAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: [flagged.byteLength] }));

    expect(codeOf(() => decodeClipOffscreen({ attribute: flaggedAttribute, payload: flagged }))).toBe("stream");
  });

  it("레코드의 해제 후 크기가 형식과 다르면 stream 오류다", () => {
    const wrong = buildOffscreenFixture({ width: 100, height: 100, kind: "rgba", pixelAt: () => [0, 0, 0, 0] });
    const blocks = wrong.blocks.map((block) => ({ ...block, decompressedBytes: block.decompressedBytes - 1 }));
    const stream = encodeBlockStream(blocks);
    const wrongAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 100, height: 100, kind: "rgba", blockSizes: stream.blockSizes }));
    let reserved = 0;
    expect(codeOf(() => decodeClipOffscreen({ attribute: wrongAttribute, payload: stream.payload, reserve: (bytes) => (reserved += bytes) }))).toBe("stream");
    expect(reserved).toBe(0);
  });

  it("해제 후 크기가 같은 블록들 중 하나만 달라도(마지막 블록) reserve 전에 거부한다", () => {
    const two = buildOffscreenFixture({ width: 300, height: 10, kind: "rgba", pixelAt: () => [1, 2, 3, 4] });
    const blocks = two.blocks.map((block, index) => (index === 1 ? { ...block, decompressedBytes: block.decompressedBytes + 1 } : block));
    const stream = encodeBlockStream(blocks);
    const attribute2 = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 300, height: 10, kind: "rgba", blockSizes: stream.blockSizes }));
    let reserved = 0;
    expect(codeOf(() => decodeClipOffscreen({ attribute: attribute2, payload: stream.payload, reserve: (bytes) => (reserved += bytes) }))).toBe("stream");
    expect(reserved).toBe(0);
  });

  it("데이터 없는 블록의 해제 후 크기 필드는 검증하지 않는다(해제할 것이 없다)", () => {
    const blocks = [{ compressed: null, decompressedBytes: 7 }];
    const stream = encodeBlockStream(blocks);
    const emptyAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: stream.blockSizes }));
    expect(decodeClipOffscreen({ attribute: emptyAttribute, payload: stream.payload }).decodedBlocks).toBe(0);
  });

  it("레코드 표식이 손상되면 reserve를 부르지 않고 stream 오류다", () => {
    const corrupted = Uint8Array.from(built.payload);
    corrupted[9] ^= 0xff;
    let reserved = 0;
    expect(codeOf(() => decodeClipOffscreen({ attribute, payload: corrupted, reserve: (bytes) => (reserved += bytes) }))).toBe("stream");
    expect(reserved).toBe(0);
  });

  it("압축 길이 상한: 해제 후 크기 + 1/8 + 1024바이트까지는 읽고 1바이트라도 넘으면 reserve 전에 stream 오류다", () => {
    const limit = 327_680 + 40_960 + CLIP_COMPRESSED_SLACK_BYTES;
    expect(CLIP_COMPRESSED_SLACK_BYTES).toBe(1024);
    expect(limit).toBe(369_664);
    const reservedAt = (length: number): { code: string; reserved: number } => {
      let reserved = 0;
      const code = codeOf(() => decodeSingleRgbaBlock(new Uint8Array(length), { reserve: (bytes) => (reserved += bytes) }));
      return { code, reserved };
    };
    // 상한 이내의 길이는 레코드로서 받아들여지고(그 뒤 zlib 머리가 틀려 decode 오류), 예약까지 간다.
    expect(reservedAt(limit)).toEqual({ code: "decode", reserved: 10 * 10 * 4 });
    expect(reservedAt(limit + 1)).toEqual({ code: "stream", reserved: 0 });
  });

  it("압축 길이 상한은 마스크 블록(65,536바이트)에도 해제 후 크기에 맞춰 적용된다", () => {
    const limit = 65_536 + 8_192 + CLIP_COMPRESSED_SLACK_BYTES;
    const decodeMask = (length: number): string => {
      const stream = encodeBlockStream([{ compressed: new Uint8Array(length), decompressedBytes: 65_536 }]);
      const maskAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "mask8", blockSizes: stream.blockSizes }));
      return codeOf(() => decodeClipOffscreen({ attribute: maskAttribute, payload: stream.payload }));
    };
    expect(limit).toBe(74_752);
    expect(decodeMask(limit)).toBe("decode");
    expect(decodeMask(limit + 1)).toBe("stream");
  });

  it("압축이 거의 안 되는 정상 블록(zlib이 낼 수 있는 최악의 길이)은 상한에 걸리지 않는다", () => {
    const next = mulberry32(99);
    const noise = new Uint8Array(327_680);
    for (let index = 0; index < noise.length; index += 1) noise[index] = Math.floor(next() * 256);
    const compressed = zlibCompress(noise);
    // zlib compressBound(327,680) = 327,680 + 80 + 20 + 0 + 13 = 327,793 이 상한(369,664)보다 한참 작다.
    expect(compressed.byteLength).toBeGreaterThan(327_680);
    expect(compressed.byteLength).toBeLessThanOrEqual(327_793);
    const result = decodeSingleRgbaBlock(compressed);
    expect(result.decodedBlocks).toBe(1);
    // 색 평면은 알파 평면(65,536바이트) 뒤에서 시작하고 한 픽셀이 B, G, R, (쓰지 않음)이다.
    expect(Array.from(result.pixels!.subarray(0, 4))).toEqual([noise[65_536 + 2], noise[65_536 + 1], noise[65_536], noise[0]]);
  });

  it("zlib 스트림이 손상되면 decode 오류이고 메시지에 블록 번호가 든다", () => {
    const good = buildOffscreenFixture({ width: 600, height: 100, kind: "rgba", pixelAt: () => [1, 2, 3, 4] });
    const records = parseClipBlockRecords(good.payload, parseClipOffscreenAttribute(good.attribute));
    const corrupted = Uint8Array.from(good.payload);
    corrupted[records[1]!.compressed!.offset + 5] ^= 0xff;
    let thrown: unknown;
    try {
      decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(good.attribute), payload: corrupted });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ClipBlockError);
    expect((thrown as ClipBlockError).code).toBe("decode");
    expect((thrown as ClipBlockError).message).toContain("블록 1");
  });

  it("압축이 풀려도 크기가 기대와 다르면 decode 오류다", () => {
    const short = zlibCompress(new Uint8Array(1000));
    const stream = encodeBlockStream([{ compressed: short, decompressedBytes: 327_680 }]);
    const shortAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: stream.blockSizes }));
    expect(codeOf(() => decodeClipOffscreen({ attribute: shortAttribute, payload: stream.payload }))).toBe("decode");
    const big = zlibCompress(new Uint8Array(327_681));
    const bigStream = encodeBlockStream([{ compressed: big, decompressedBytes: 327_680 }]);
    const bigAttribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 10, height: 10, kind: "rgba", blockSizes: bigStream.blockSizes }));
    expect(codeOf(() => decodeClipOffscreen({ attribute: bigAttribute, payload: bigStream.payload }))).toBe("decode");
  });

  it("출력 버퍼는 만들기 전에 정확한 바이트 수로 알린다(색은 w*h*4, 마스크는 w*h)", () => {
    const reserved: number[] = [];
    decodeClipOffscreen({ attribute, payload: built.payload, reserve: (bytes) => reserved.push(bytes) });
    expect(reserved).toEqual([600 * 300 * 4]);
    const mask = buildOffscreenFixture({ width: 600, height: 300, kind: "mask8", pixelAt: () => [1] });
    const maskReserved: number[] = [];
    decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(mask.attribute), payload: mask.payload, reserve: (bytes) => maskReserved.push(bytes) });
    expect(maskReserved).toEqual([600 * 300]);
  });

  it("예산 초과로 reserve가 던지면 그 예외가 그대로 나가고 블록은 하나도 풀지 않는다", () => {
    let calls = 0;
    expect(() =>
      decodeClipOffscreen({
        attribute,
        payload: built.payload,
        reserve: () => {
          calls += 1;
          throw new ClipBlockError("예산 초과", "limit");
        },
      }),
    ).toThrow("예산 초과");
    expect(calls).toBe(1);
  });

  it("chargeWork: 레코드 수 x 1,024, 출력 버퍼 크기, 데이터 있는 블록마다 해제 후 크기와 DEFLATE 블록 수 x 8,192를 이 순서로 알린다", () => {
    const raw327680 = colorBlockBytes(() => [9, 8, 7, 6]);
    const charges: number[] = [];
    decodeSingleRgbaBlock(storedZlib(raw327680, 65_535), { chargeWork: (bytes) => charges.push(bytes) });
    // 레코드 1개, 10x10 RGBA(400바이트), 해제 후 327,680바이트를 65,535바이트씩 담으면 저장 블록 6개다.
    expect(charges).toEqual([CLIP_RECORD_COST_BYTES, 10 * 10 * 4, 327_680, 6 * CLIP_DEFLATE_BLOCK_COST_BYTES]);
    expect(CLIP_DEFLATE_BLOCK_COST_BYTES).toBe(8192);
    expect(CLIP_RECORD_COST_BYTES).toBe(1024);
  });

  it("chargeWork: 데이터 없는 블록은 레코드와 출력에만 세고 데이터 있는 블록마다 두 번씩 더 센다", () => {
    const mixed = buildOffscreenFixture({ width: 256 * 3, height: 1, kind: "mask8", emptyBlocks: new Set([1]), pixelAt: () => [5] });
    const charges: number[] = [];
    decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(mixed.attribute), payload: mixed.payload, chargeWork: (bytes) => charges.push(bytes) });
    expect(charges).toHaveLength(2 + 2 * 2);
    expect(charges[0]).toBe(3 * CLIP_RECORD_COST_BYTES);
    expect(charges[1]).toBe(256 * 3);
    expect(charges[2]).toBe(65_536);
    expect(charges[3]! % CLIP_DEFLATE_BLOCK_COST_BYTES).toBe(0);
    expect(charges[3]!).toBeGreaterThanOrEqual(CLIP_DEFLATE_BLOCK_COST_BYTES);
    expect(charges[4]).toBe(65_536);
    expect(charges[5]! % CLIP_DEFLATE_BLOCK_COST_BYTES).toBe(0);
  });

  it("chargeWork: 외부 데이터가 없으면(payload null) 레코드를 훑지 않으므로 출력 버퍼 크기만 센다", () => {
    const charges: number[] = [];
    const result = decodeClipOffscreen({ attribute, payload: null, chargeWork: (bytes) => charges.push(bytes) });

    expect(charges).toEqual([600 * 300 * 4]);
    expect(result.decodedBlocks).toBe(0);
  });

  it("chargeWork: 레코드 구조가 깨진 입력은 레코드 비용만 세고 출력 버퍼는 예약도 청구도 하지 않는다", () => {
    const broken = Uint8Array.from(built.payload);
    broken[0] ^= 0xff; // 첫 레코드의 길이 필드를 깬다.
    const charges: number[] = [];
    const reserved: number[] = [];
    const action = () => decodeClipOffscreen({ attribute, payload: broken, chargeWork: (bytes) => charges.push(bytes), reserve: (bytes) => reserved.push(bytes) });

    expect(codeOf(action)).toBe("stream");
    expect(charges).toEqual([attribute.blockSizes.length * CLIP_RECORD_COST_BYTES]);
    expect(reserved).toEqual([]);
  });

  it("chargeWork는 출력 버퍼를 예약한 다음에 청구하고, 청구가 던지면 버퍼를 만들지 않는다", () => {
    const events: string[] = [];
    expect(() =>
      decodeClipOffscreen({
        attribute,
        payload: built.payload,
        reserve: (bytes) => events.push(`reserve ${bytes}`),
        chargeWork: (bytes) => {
          events.push(`work ${bytes}`);
          if (bytes === 600 * 300 * 4) throw new ClipBlockError("작업량 초과", "limit");
        },
      }),
    ).toThrow("작업량 초과");
    expect(events).toEqual([`work ${attribute.blockSizes.length * CLIP_RECORD_COST_BYTES}`, `reserve ${600 * 300 * 4}`, `work ${600 * 300 * 4}`]);
  });

  it("chargeWork가 풀기 전에 던지면 그 블록은 풀지 않고 예외가 그대로 나간다", () => {
    let calls = 0;
    expect(() =>
      decodeClipOffscreen({
        attribute,
        payload: built.payload,
        chargeWork: () => {
          calls += 1;
          if (calls === 3) throw new ClipBlockError("작업량 초과", "limit");
        },
      }),
    ).toThrow("작업량 초과");
    // 레코드, 출력, 그리고 첫 블록의 해제 후 크기에서 던졌다.
    expect(calls).toBe(3);
  });

  it("chargeWork가 푼 뒤에 던져도 decode 오류로 감싸지 않고 그대로 나간다", () => {
    let calls = 0;
    const action = () =>
      decodeClipOffscreen({
        attribute,
        payload: built.payload,
        chargeWork: () => {
          calls += 1;
          if (calls === 4) throw new ClipBlockError("작업량 초과", "limit");
        },
      });
    expect(codeOf(action)).toBe("limit");
    expect(calls).toBe(4);
  });

  it("초기 색 채움: 한 픽셀(4바이트)부터 수백 픽셀까지 모든 크기에서 픽셀마다 같은 색이다", () => {
    for (const [width, height] of [[1, 1], [2, 1], [3, 1], [1, 5], [7, 3], [33, 9], [256, 2], [257, 3]] as const) {
      const blockCount = Math.ceil(width / 256) * Math.ceil(height / 256);
      const attributeBytes = encodeOffscreenAttribute({ width, height, kind: "rgba", hasColor: true, packedRgba: 0x11223344, blockSizes: new Array<number>(blockCount).fill(104) });
      const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(attributeBytes), payload: null });
      expect(result.pixels!.byteLength, `${width}x${height}`).toBe(width * height * 4);
      for (let at = 0; at < result.pixels!.byteLength; at += 4) {
        expect(Array.from(result.pixels!.subarray(at, at + 4)), `${width}x${height} @${at}`).toEqual([0x11, 0x22, 0x33, 0x44]);
      }
    }
  });

  it("블록 하나의 DEFLATE 블록 수 상한 256: 정확히 256개는 풀리고 257개는 limit 사유의 decode 오류다", () => {
    expect(CLIP_MAX_DEFLATE_BLOCKS).toBe(256);
    const bytes = colorBlockBytes((x, y) => [x & 255, y & 255, 3, 255]);
    const ok = decodeSingleRgbaBlock(storedZlib(bytes, 1280));
    expect(ok.decodedBlocks).toBe(1);
    let thrown: unknown;
    try {
      decodeSingleRgbaBlock(storedZlib(bytes, 1279));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ClipBlockError);
    expect((thrown as ClipBlockError).code).toBe("decode");
    expect((thrown as ClipBlockError).message).toContain("블록 0");
    expect((thrown as ClipBlockError).message).toContain("limit");
    expect((thrown as ClipBlockError).message).toContain("상한 256개");
  });

  it("기본 한도가 설계 문서의 표와 같다", () => {
    expect(CLIP_BLOCK_LIMITS).toEqual({ maxBlocks: 16_384, maxPixels: 134_217_728 });
    expect(CLIP_BLOCK_EDGE).toBe(256);
    expect(FIXTURE_FORMATS.rgba.decompressedBytes).toBe(327_680);
  });
});

describe("decodeClipOffscreen: 출력 버퍼를 만들 수 없을 때", () => {
  /** 지정한 길이로 `new Uint8Array(n)`을 부르면 `error`를 던지게 한 전역 `Uint8Array`를 걸고 `action`을 실행한다. */
  function withFailingAllocation<T>(length: number, error: Error, action: () => T): T {
    const RealUint8Array = Uint8Array;
    vi.stubGlobal(
      "Uint8Array",
      new Proxy(RealUint8Array, {
        construct(target, args, newTarget) {
          if (args[0] === length) throw error;
          return Reflect.construct(target, args, newTarget === undefined ? target : newTarget);
        },
      }),
    );
    try {
      return action();
    } finally {
      vi.unstubAllGlobals();
    }
  }
  const emptyOffscreen = (width: number, height: number) => parseClipOffscreenAttribute(encodeOffscreenAttribute({ width, height, kind: "rgba", blockSizes: [104, 104, 104, 104].slice(0, Math.ceil(width / 256) * Math.ceil(height / 256)) }));

  it("메모리가 모자라 버퍼를 만들지 못하면(RangeError) 크기를 담은 limit 오류로 바꾼다", () => {
    const attribute = emptyOffscreen(100, 50);
    const failure = withFailingAllocation(100 * 50 * 4, new RangeError("Array buffer allocation failed"), () => {
      try {
        decodeClipOffscreen({ attribute, payload: null });
      } catch (error) {
        return error;
      }
      return null;
    });

    expect(failure).toBeInstanceOf(ClipBlockError);
    expect((failure as ClipBlockError).code).toBe("limit");
    expect((failure as ClipBlockError).message).toBe("출력 100x50픽셀의 버퍼를 만들 수 없다 (메모리 부족)");
  });

  it("RangeError가 아닌 오류는 바꾸지 않고 그대로 낸다", () => {
    const attribute = emptyOffscreen(100, 50);
    const original = new TypeError("예상하지 못한 오류");
    const thrown = withFailingAllocation(100 * 50 * 4, original, () => {
      try {
        decodeClipOffscreen({ attribute, payload: null });
      } catch (error) {
        return error;
      }
      return null;
    });

    expect(thrown).toBe(original);
  });
});

describe("decodeClipOffscreen: 무작위 대조", () => {
  it("크기·종류·빈 블록을 무작위로 고른 60건이 입력 픽셀과 정확히 같다", () => {
    const next = mulberry32(2026);
    for (let trial = 0; trial < 60; trial += 1) {
      const width = 1 + Math.floor(next() * 700);
      const height = 1 + Math.floor(next() * 400);
      const kind = (["rgba", "gray8", "mask8"] as const)[Math.floor(next() * 3)]!;
      const columns = Math.ceil(width / 256);
      const rows = Math.ceil(height / 256);
      const emptyBlocks = new Set<number>();
      for (let index = 0; index < columns * rows; index += 1) if (next() < 0.3) emptyBlocks.add(index);
      const seed = Math.floor(next() * 1e9);
      const sample = mulberry32(seed);
      const table = new Uint8Array(1021);
      for (let index = 0; index < table.length; index += 1) table[index] = Math.floor(sample() * 256);
      const pixelAt = (x: number, y: number): readonly number[] => {
        const base = (x * 31 + y * 17) % 1021;
        return [table[base]!, table[(base + 1) % 1021]!, table[(base + 2) % 1021]!, table[(base + 3) % 1021]!];
      };
      const packedRgba = Math.floor(next() * 0x1_0000_0000) >>> 0;
      const hasColor = next() < 0.5;
      const built = buildOffscreenFixture({ width, height, kind, hasColor, packedRgba, emptyBlocks, pixelAt });
      const result = decodeClipOffscreen({ attribute: parseClipOffscreenAttribute(built.attribute), payload: built.payload });
      const initialRgba = hasColor ? [(packedRgba >>> 24) & 0xff, (packedRgba >>> 16) & 0xff, (packedRgba >>> 8) & 0xff, packedRgba & 0xff] : [0, 0, 0, 0];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const blockIndex = Math.floor(y / 256) * columns + Math.floor(x / 256);
          const isEmpty = emptyBlocks.has(blockIndex);
          const source = pixelAt(x, y);
          if (kind === "mask8") {
            const expected = isEmpty ? (hasColor ? packedRgba & 0xff : 0) : source[0]!;
            if (result.values![y * width + x] !== expected) expect.fail(`trial ${trial} ${kind} (${x},${y})`);
          } else {
            const expected = isEmpty ? initialRgba : kind === "rgba" ? source : [source[0]!, source[0]!, source[0]!, source[1]!];
            const at = (y * width + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) {
              if (result.pixels![at + channel] !== expected[channel]) expect.fail(`trial ${trial} ${kind} (${x},${y}) ch${channel}`);
            }
          }
        }
      }
    }
  });
});

describe("블록 헬퍼", () => {
  it("해제 후 블록 바이트의 크기는 형식 표와 같다", () => {
    expect(colorBlockBytes(() => [0, 0, 0, 0]).byteLength).toBe(FIXTURE_FORMATS.rgba.decompressedBytes);
    expect(grayBlockBytes(() => [0, 0]).byteLength).toBe(FIXTURE_FORMATS.gray8.decompressedBytes);
    expect(maskBlockBytes(() => 0).byteLength).toBe(FIXTURE_FORMATS.mask8.decompressedBytes);
    expect(u32be(1, 2).byteLength).toBe(8);
    expect(utf16be("ab")).toEqual(Uint8Array.of(0, 0x61, 0, 0x62));
    expect(deflateSync(new Uint8Array(1)).byteLength).toBeGreaterThan(0);
  });
});

describe("stepClipOffscreenDecode: 중간에 양보할 수 있는 해독", () => {
  it("블록 64개마다 한 번 yield하고 return 값이 decodeClipOffscreen과 같다", () => {
    const wide = buildOffscreenFixture({ width: 256 * 130, height: 1, kind: "mask8", pixelAt: (x) => [x & 255] });
    const attribute = parseClipOffscreenAttribute(wide.attribute);
    const steps = stepClipOffscreenDecode({ attribute, payload: wide.payload });
    let yields = 0;
    let step = steps.next();
    while (step.done !== true) {
      yields += 1;
      step = steps.next();
    }

    expect(yields).toBe(2);
    const direct = decodeClipOffscreen({ attribute, payload: wide.payload });
    expect(step.value.decodedBlocks).toBe(130);
    expect(Buffer.compare(Buffer.from(step.value.values!), Buffer.from(direct.values!))).toBe(0);
  });

  it("블록이 64개 미만이면 한 번도 yield하지 않는다", () => {
    const narrow = buildOffscreenFixture({ width: 256 * 63, height: 1, kind: "mask8", pixelAt: () => [3] });
    const steps = stepClipOffscreenDecode({ attribute: parseClipOffscreenAttribute(narrow.attribute), payload: narrow.payload });

    expect(steps.next().done).toBe(true);
  });

  it("yield 횟수는 데이터 있는 블록 수를 64로 나눈 몫이다(63→0, 64→1, 65→1, 127→1, 128→2, 129→2)", () => {
    const yieldsFor = (blockCount: number): number => {
      const wide = buildOffscreenFixture({ width: 256 * blockCount, height: 1, kind: "mask8", pixelAt: () => [3] });
      const steps = stepClipOffscreenDecode({ attribute: parseClipOffscreenAttribute(wide.attribute), payload: wide.payload });
      let yields = 0;
      for (let step = steps.next(); step.done !== true; step = steps.next()) yields += 1;
      return yields;
    };
    expect([63, 64, 65, 127, 128, 129].map(yieldsFor)).toEqual([0, 1, 1, 1, 2, 2]);
  });

  it("데이터 없는 블록은 yield 횟수에 세지 않는다", () => {
    const empty = new Set<number>();
    for (let index = 0; index < 200; index += 1) if (index % 2 === 0) empty.add(index);
    const sparse = buildOffscreenFixture({ width: 256 * 200, height: 1, kind: "mask8", emptyBlocks: empty, pixelAt: () => [3] });
    const steps = stepClipOffscreenDecode({ attribute: parseClipOffscreenAttribute(sparse.attribute), payload: sparse.payload });
    let yields = 0;
    let step = steps.next();
    while (step.done !== true) {
      yields += 1;
      step = steps.next();
    }
    // 데이터 있는 블록은 100개이므로 한 번이다.
    expect(yields).toBe(1);
    expect(step.value.decodedBlocks).toBe(100);
  });

  it("yield 사이에 호출자가 멈출 수 있다: 첫 yield 뒤 return하면 나머지 블록은 풀리지 않는다", () => {
    const wide = buildOffscreenFixture({ width: 256 * 130, height: 1, kind: "mask8", pixelAt: () => [3] });
    const attribute = parseClipOffscreenAttribute(wide.attribute);
    let reserved = 0;
    const steps = stepClipOffscreenDecode({ attribute, payload: wide.payload, reserve: (bytes) => (reserved += bytes) });

    expect(steps.next().done).toBe(false);
    expect(steps.return(undefined as never).done).toBe(true);
    expect(reserved).toBe(256 * 130);
  });

  it("오류는 generator를 만들 때가 아니라 첫 next()에서 던져진다", () => {
    const mono = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 4, height: 4, kind: "mask8", blockSizes: [CLIP_EMPTY_BLOCK_RECORD_BYTES] }));
    const steps = stepClipOffscreenDecode({ attribute: { ...mono, channelOrder: 0x11, channelCount: 1, pixelBytesCode: 1 }, payload: null });

    expect(() => steps.next()).toThrow(ClipBlockError);
  });
});

describe("블록 배치 교차 확인: 명세 S2가 '접힌 알파'로 적은 사상은 행 우선 평면과 같다", () => {
  // S2(wamsoft/clipparse)는 알파를 4x4 슈퍼픽셀 64x64 격자로 접어 폭 64의 타일 넷으로 나눈다고 적고, 쓰기 쪽 색인을
  // alpha[y][x] -> [y//4][64*(y%4) + x//4][x%4] (모양 64 x 256 x 4바이트)로 적었다. 이 색인을 바이트 위치로 풀어 쓰면
  // ((y>>2)*256 + 64*(y&3) + (x>>2))*4 + (x&3) = (y>>2)*1024 + (y&3)*256 + x = y*256 + x 이므로 행 우선 평면과 같은 바이트다.
  const foldedOffset = (x: number, y: number): number => ((y >> 2) * 256 + 64 * (y & 3) + (x >> 2)) * 4 + (x & 3);

  it("S2의 색인식은 모든 (x, y)에서 y*256+x와 같은 바이트 위치를 가리킨다", () => {
    let mismatches = 0;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        if (foldedOffset(x, y) !== y * 256 + x) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("S2의 색인식으로 알파를 배치한 블록을 풀면 각 픽셀의 알파가 그 좌표에 나온다", () => {
    const block = new Uint8Array(327_680);
    const alphaOf = (x: number, y: number): number => (x * 3 + y * 5 + (x >> 4) * 11) & 255;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) block[foldedOffset(x, y)] = alphaOf(x, y);
    }
    const stream = encodeBlockStream([{ compressed: zlibCompress(block), decompressedBytes: 327_680 }]);
    const attribute = parseClipOffscreenAttribute(encodeOffscreenAttribute({ width: 256, height: 256, kind: "rgba", blockSizes: stream.blockSizes }));
    const result = decodeClipOffscreen({ attribute, payload: stream.payload });

    let wrong = 0;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        if (result.pixels![(y * 256 + x) * 4 + 3] !== alphaOf(x, y)) wrong += 1;
      }
    }
    expect(wrong).toBe(0);
  });

  it("데이터 없는 레코드의 바이트 수 상수는 인코더가 만든 레코드와 같다", () => {
    expect(CLIP_EMPTY_BLOCK_RECORD_BYTES).toBe(104);
    expect(encodeBlockRecord(0, { compressed: null, decompressedBytes: 327_680 }).byteLength).toBe(CLIP_EMPTY_BLOCK_RECORD_BYTES);
  });
});

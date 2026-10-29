import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildGbr,
  buildGih,
  buildPat,
  buildVbr,
  grayPixels,
  rgbaPixels,
} from "../../../../tests/corpus/formats/gimp-brush-fixtures";
import {
  GIMP_BRUSH_LIMITS,
  GimpBrushError,
  importGimpBrush,
  importGimpPattern,
  inspectGimpBrushFormat,
  type GimpBrushErrorCode,
  type GimpBrushImportOptions,
} from "../gimp-brush";

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function failureOf(run: () => Promise<unknown>): Promise<GimpBrushErrorCode> {
  try {
    await run();
  } catch (error) {
    if (error instanceof GimpBrushError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

const brushFailure = (bytes: Uint8Array, options?: GimpBrushImportOptions) => failureOf(() => importGimpBrush(bytes, options));
const patternFailure = (bytes: Uint8Array, options?: GimpBrushImportOptions) => failureOf(() => importGimpPattern(bytes, options));

describe("GIMP 브러시(.gbr)", () => {
  it("v2 회색 브러시의 헤더 필드와 픽셀을 읽는다", async () => {
    const pixels = grayPixels(3, 2);
    const bytes = buildGbr({ width: 3, height: 2, pixels, spacing: 17, name: "둥근 붓" });
    const result = await importGimpBrush(bytes);

    expect(result).toMatchObject({
      format: "gimp-brush",
      specProfile: "gimp-brush-public-spec",
      version: 2,
      name: "둥근 붓",
      width: 3,
      height: 2,
      bytesValue: 1,
      colorMode: "grayscale",
      spacing: 17,
      byteOffset: 0,
      byteLength: bytes.byteLength,
      headerBytes: 28 + new TextEncoder().encode("둥근 붓").byteLength + 1,
    });
    expect(result.pixels).toEqual(pixels);
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.source).toEqual({ byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  });

  it("RGBA 브러시는 4바이트 픽셀을 그대로 돌려준다", async () => {
    const pixels = rgbaPixels(2, 3);
    const result = await importGimpBrush(buildGbr({ width: 2, height: 3, pixels, bytes: 4 }));

    expect(result).toMatchObject({ bytesValue: 4, colorMode: "rgba", width: 2, height: 3 });
    expect(result.pixels).toEqual(pixels);
  });

  it("v1 브러시는 매직과 간격이 없다", async () => {
    const pixels = grayPixels(2, 2);
    const result = await importGimpBrush(buildGbr({ version: 1, width: 2, height: 2, pixels, name: "old" }));

    expect(result).toMatchObject({ version: 1, name: "old", spacing: null, headerBytes: 20 + 4 });
    expect(result.pixels).toEqual(pixels);
    expect(result.warnings).toEqual([]);
  });

  it("손으로 배치한 31바이트 리터럴(1x1 회색, 간격 50)을 읽는다", async () => {
    // 빌더를 거치지 않는 독립 리터럴이다: 헤더 크기 30, 버전 2, 1x1, bytes 1, 매직 GIMP, 간격 50, 이름 "A\0", 픽셀 255.
    const bytes = Uint8Array.from([
      0, 0, 0, 30, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x47, 0x49, 0x4d, 0x50, 0, 0, 0, 50, 0x41, 0, 255,
    ]);
    const result = await importGimpBrush(bytes);

    expect(bytes.byteLength).toBe(31);
    expect(result).toMatchObject({ version: 2, name: "A", width: 1, height: 1, spacing: 50, colorMode: "grayscale", headerBytes: 30 });
    expect(Array.from(result.pixels!)).toEqual([255]);
  });

  it("이름의 널 종결자가 없어도 헤더 크기가 가리키는 만큼을 이름으로 읽는다", async () => {
    const result = await importGimpBrush(buildGbr({ width: 1, height: 1, pixels: [9], name: "no-nul", terminator: false }));

    expect(result.name).toBe("no-nul");
    expect(result.warnings).toEqual([]);
  });

  it("널 종결자 뒤의 0이 아닌 바이트는 무시하고 경고한다", async () => {
    const result = await importGimpBrush(buildGbr({ width: 1, height: 1, pixels: [9], rawName: [0x41, 0x42, 0, 0x43, 0x44] }));

    expect(result.name).toBe("AB");
    expect(codes(result.warnings)).toEqual(["gimp-brush-name-trailing-bytes"]);
  });

  it("널 종결자 뒤가 전부 0이면 경고하지 않는다", async () => {
    const result = await importGimpBrush(buildGbr({ width: 1, height: 1, pixels: [9], rawName: [0x41, 0x42, 0, 0] }));

    expect(result.name).toBe("AB");
    expect(result.warnings).toEqual([]);
  });

  it("UTF-8이 아닌 이름은 대체 문자로 읽고 경고한다", async () => {
    const result = await importGimpBrush(buildGbr({ width: 1, height: 1, pixels: [9], rawName: [0x41, 0xff, 0x42] }));

    expect(result.name).toBe("A�B");
    expect(codes(result.warnings)).toEqual(["gimp-brush-name-utf8-invalid"]);
  });

  it("v3는 본문 배치가 문서에 없어 픽셀을 해석하지 않고 알려진 식별자 18만 float16으로 표시한다", async () => {
    const float16 = await importGimpBrush(buildGbr({ version: 3, width: 2, height: 2, bytes: 18, pixels: new Array(32).fill(1) }));
    const other = await importGimpBrush(buildGbr({ version: 3, width: 2, height: 2, bytes: 7, pixels: new Array(8).fill(1) }));

    expect(float16).toMatchObject({ version: 3, colorMode: "float16", bytesValue: 18, pixels: null, spacing: 25 });
    expect(codes(float16.unsupported)).toEqual(["gimp-brush-v3-data-not-decoded"]);
    expect(other).toMatchObject({ colorMode: "unknown", pixels: null });
  });

  it("뒤에 남은 바이트는 경고한다", async () => {
    const bytes = buildGbr({ width: 1, height: 1, pixels: [9], trailing: [1, 2, 3] });
    const result = await importGimpBrush(bytes);

    expect(codes(result.warnings)).toEqual(["gimp-brush-trailing-bytes"]);
    expect(result.byteLength).toBe(bytes.byteLength - 3);
  });

  it.each([
    ["버전 0", { version: 0 }, "version-unsupported"],
    ["버전 4", { version: 4 }, "version-unsupported"],
    ["매직이 GIMP가 아닌", { magic: "GIMQ" }, "magic-invalid"],
    ["bytes가 3인", { bytes: 3 }, "color-depth-unsupported"],
    ["bytes가 0인", { bytes: 0 }, "color-depth-unsupported"],
    ["헤더 크기가 고정 영역보다 작은", { headerSizeOverride: 27 }, "header-invalid"],
    ["헤더 크기가 파일보다 큰", { headerSizeOverride: 100 }, "truncated"],
  ] as const)("%s 브러시는 %s 코드로 거부한다", async (_label, extra, expected) => {
    expect(await brushFailure(buildGbr({ width: 2, height: 2, pixels: grayPixels(2, 2), ...extra }))).toBe(expected);
  });

  it("너비·높이가 0이면 header-invalid, 한도를 넘으면 limit-exceeded다", async () => {
    expect(await brushFailure(buildGbr({ width: 0, height: 2, pixels: [] }))).toBe("header-invalid");
    expect(await brushFailure(buildGbr({ width: 2, height: 0, pixels: [] }))).toBe("header-invalid");
    expect(await brushFailure(buildGbr({ width: 10_001, height: 1, pixels: [] }))).toBe("limit-exceeded");
    expect(await brushFailure(buildGbr({ width: 1, height: 10_001, pixels: [] }))).toBe("limit-exceeded");
    expect(await brushFailure(buildGbr({ width: 4, height: 4, pixels: grayPixels(4, 4) }), { limits: { maxDimension: 3 } })).toBe("limit-exceeded");
  });

  it("픽셀이 모자라거나 헤더보다 짧은 파일은 truncated다", async () => {
    const full = buildGbr({ width: 4, height: 4, pixels: grayPixels(4, 4) });

    expect(await brushFailure(full.subarray(0, full.byteLength - 1))).toBe("truncated");
    expect(await brushFailure(full.subarray(0, 19))).toBe("truncated");
    expect(await brushFailure(new Uint8Array(0))).toBe("truncated");
  });

  it("이름 영역이 한도를 넘으면 limit-exceeded다", async () => {
    const bytes = buildGbr({ width: 1, height: 1, pixels: [1], name: "x".repeat(40) });

    expect(await brushFailure(bytes, { limits: { maxNameBytes: 39 } })).toBe("limit-exceeded");
    expect((await importGimpBrush(bytes, { limits: { maxNameBytes: 41 } })).name).toBe("x".repeat(40));
  });

  it("호출자는 한도를 낮추기만 할 수 있다", async () => {
    const bytes = buildGbr({ width: 1, height: 1, pixels: [1] });

    expect(await brushFailure(bytes, { limits: { maxFileBytes: bytes.byteLength - 1 } })).toBe("source-too-large");
    expect(await brushFailure(bytes, { limits: { maxDimension: GIMP_BRUSH_LIMITS.maxDimension + 1 } })).toBe("source-too-large");
    expect(await brushFailure(bytes, { limits: { maxDimension: -1 } })).toBe("source-too-large");
    expect(await brushFailure(bytes, { limits: { maxDimension: 1.5 } })).toBe("source-too-large");
    expect(Object.isFrozen(GIMP_BRUSH_LIMITS)).toBe(true);
  });

  it("한도와 정확히 같은 값은 허용하고 1만 넘어도 거부한다", async () => {
    const wide = buildGbr({ width: 10_000, height: 1, pixels: new Uint8Array(10_000) });
    const bytes = buildGbr({ width: 1, height: 1, pixels: [1] });

    expect((await importGimpBrush(wide)).width).toBe(10_000);
    expect(await brushFailure(buildGbr({ width: 10_001, height: 1, pixels: new Uint8Array(10_001) }))).toBe("limit-exceeded");
    expect((await importGimpBrush(bytes, { limits: { maxFileBytes: bytes.byteLength } })).width).toBe(1);
    expect((await importGimpBrush(bytes, { limits: { maxDimension: GIMP_BRUSH_LIMITS.maxDimension } })).width).toBe(1);
  });

  it("이름이 비어 헤더가 고정 영역과 같은 크기여도 읽는다", async () => {
    const result = await importGimpBrush(buildGbr({ width: 1, height: 1, pixels: [1], name: "", terminator: false }));

    expect(result.name).toBe("");
    expect(result.headerBytes).toBe(28);
  });

  it("중단 신호가 켜져 있으면 aborted로 거부한다", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await brushFailure(buildGbr({ width: 1, height: 1, pixels: [1] }), { signal: controller.signal })).toBe("aborted");
  });

  it("Uint8Array·ArrayBuffer·Blob 입력이 같은 결과를 내고 호출자 버퍼와 메모리를 공유하지 않는다", async () => {
    const bytes = buildGbr({ width: 2, height: 2, pixels: grayPixels(2, 2) });
    const fromBytes = await importGimpBrush(bytes);
    const fromBuffer = await importGimpBrush(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const fromBlob = await importGimpBrush(new Blob([new Uint8Array(bytes)]));
    const before = fromBytes.pixels!.slice();
    bytes.fill(0xff);

    expect(fromBuffer.source).toEqual(fromBytes.source);
    expect(fromBlob.source).toEqual(fromBytes.source);
    expect(fromBytes.pixels).toEqual(before);
  });
});

describe("GIMP 패턴(.pat)", () => {
  it.each([
    [1, "grayscale"],
    [2, "grayscale-alpha"],
    [3, "rgb"],
    [4, "rgba"],
  ] as const)("bytes %i는 %s로 읽고 픽셀을 그대로 돌려준다", async (bytesValue, colorMode) => {
    const pixels = Uint8Array.from({ length: 3 * 2 * bytesValue }, (_, index) => (index * 13 + 5) & 0xff);
    const result = await importGimpPattern(buildPat({ width: 3, height: 2, bytes: bytesValue, pixels, name: "무늬" }));

    expect(result).toMatchObject({
      format: "gimp-pattern",
      specProfile: "gimp-brush-public-spec",
      version: 1,
      name: "무늬",
      width: 3,
      height: 2,
      bytesPerPixel: bytesValue,
      colorMode,
    });
    expect(result.pixels).toEqual(pixels);
    expect(result.warnings).toEqual([]);
  });

  it("손으로 배치한 32바이트 리터럴(2x1 RGB)을 읽는다", async () => {
    // 헤더 크기 26, 버전 1, 2x1, bytes 3, 매직 GPAT, 이름 "P\0", 픽셀 6바이트.
    const bytes = Uint8Array.from([
      0, 0, 0, 26, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 3, 0x47, 0x50, 0x41, 0x54, 0x50, 0, 1, 2, 3, 4, 5, 6,
    ]);
    const result = await importGimpPattern(bytes);

    expect(bytes.byteLength).toBe(32);
    expect(result).toMatchObject({ name: "P", width: 2, height: 1, colorMode: "rgb", headerBytes: 26 });
    expect(Array.from(result.pixels)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([1, 2, 3, 4] as const)(
    "오래된 문서에 적힌 GIMP 매직(bytes %i)은 실제 파일에 없어 패턴으로 받지 않고 판별도 패턴으로 보지 않는다",
    async (bytesValue) => {
      const bytes = buildPat({ width: 1, height: 1, bytes: bytesValue, pixels: new Array(bytesValue).fill(7), magic: "GIMP" });

      expect(await patternFailure(bytes)).toBe("magic-invalid");
      // 가져오기가 거부하는 것을 판별이 패턴이라고 하면 판별 결과로 함수를 고르는 호출자가 어긋난다.
      expect(inspectGimpBrushFormat(bytes)).not.toBe("pat");
    },
  );

  it.each([
    ["매직이 GPAT가 아닌", { magic: "ABCD" }, "magic-invalid"],
    ["버전 2인", { version: 2 }, "version-unsupported"],
    ["bytes가 5인", { bytes: 5, pixels: new Array(5).fill(0) }, "color-depth-unsupported"],
    ["bytes가 0인", { bytes: 0, pixels: [] }, "color-depth-unsupported"],
    ["너비가 0인", { width: 0, pixels: [] }, "header-invalid"],
    ["너비가 한도를 넘는", { width: 10_001, pixels: [] }, "limit-exceeded"],
    ["헤더 크기가 24보다 작은", { headerSizeOverride: 23 }, "header-invalid"],
  ] as const)("%s 패턴은 %s 코드로 거부한다", async (_label, extra, expected) => {
    expect(await patternFailure(buildPat({ width: 1, height: 1, bytes: 1, pixels: [1], ...extra }))).toBe(expected);
  });

  it("픽셀이 모자라거나 헤더보다 짧으면 truncated고 남은 바이트는 경고한다", async () => {
    const full = buildPat({ width: 2, height: 2, bytes: 3, pixels: new Array(12).fill(5) });
    const trailing = await importGimpPattern(buildPat({ width: 1, height: 1, bytes: 1, pixels: [1], trailing: [9, 9] }));

    expect(await patternFailure(full.subarray(0, full.byteLength - 1))).toBe("truncated");
    expect(await patternFailure(full.subarray(0, 23))).toBe("truncated");
    expect(codes(trailing.warnings)).toEqual(["gimp-pattern-trailing-bytes"]);
  });
});

describe("GIMP 브러시 계열 형식 판별", () => {
  const brush = buildGbr({ width: 2, height: 2, pixels: grayPixels(2, 2) });
  const brushV1 = buildGbr({ version: 1, width: 2, height: 2, pixels: grayPixels(2, 2) });
  const pattern = buildPat({ width: 2, height: 2, bytes: 3, pixels: new Array(12).fill(1) });
  const pipe = buildGih({ name: "pipe", parameters: "ncells:2 dim:1 rank0:2 sel0:random", brushes: [brush, brush] });
  const vbr = buildVbr(["GIMP-VBR", "1.0", "n", "10.0", "5.0", "1.0", "1.0", "0.0"]);

  it("확장자 없이 앞부분으로 가른다", () => {
    expect(inspectGimpBrushFormat(brush)).toBe("gbr");
    expect(inspectGimpBrushFormat(brushV1)).toBe("gbr");
    expect(inspectGimpBrushFormat(pattern)).toBe("pat");
    expect(inspectGimpBrushFormat(pipe)).toBe("gih");
    expect(inspectGimpBrushFormat(vbr)).toBe("vbr");
  });

  it.each([1, 2, 3, 4] as const)("가져오기가 받는 패턴(bytes %i)은 판별도 pat이다", async (bytesValue) => {
    const bytes = buildPat({ width: 2, height: 1, bytes: bytesValue, pixels: new Array(2 * bytesValue).fill(3) });

    expect((await importGimpPattern(bytes)).bytesPerPixel).toBe(bytesValue);
    expect(inspectGimpBrushFormat(bytes)).toBe("pat");
  });

  it("알 수 없는 입력은 unknown이다", () => {
    expect(inspectGimpBrushFormat(new Uint8Array(0))).toBe("unknown");
    expect(inspectGimpBrushFormat(new Uint8Array(200))).toBe("unknown");
    expect(inspectGimpBrushFormat(new TextEncoder().encode("hello\nworld\n"))).toBe("unknown");
    expect(inspectGimpBrushFormat(new TextEncoder().encode("GIMP-VBRX\n"))).toBe("unknown");
    // 브러시 헤더가 없는 파이프 모양 텍스트
    expect(inspectGimpBrushFormat(new TextEncoder().encode("name\n3 ncells:3\nnot a brush"))).toBe("unknown");
  });

  it("너비나 높이가 0인 헤더, 둘째 줄이 숫자로 시작하지 않는 텍스트는 판별하지 않는다", () => {
    expect(inspectGimpBrushFormat(buildGbr({ width: 0, height: 1, pixels: [] }))).toBe("unknown");
    expect(inspectGimpBrushFormat(buildGbr({ width: 1, height: 0, pixels: [] }))).toBe("unknown");
    for (const secondLine of ["abc ncells:1", " ncells:1", ""]) {
      const textual = Uint8Array.from([...new TextEncoder().encode(`name\n${secondLine}\n`), ...brush]);

      expect(inspectGimpBrushFormat(textual), JSON.stringify(secondLine)).toBe("unknown");
    }
  });

  it("이름이 빈 파이프도 파이프로 판별한다", () => {
    const empty = buildGih({ name: "", parameters: "ncells:1", brushes: [brush] });

    expect(inspectGimpBrushFormat(empty)).toBe("gih");
  });

  it("v1 브러시는 픽셀이 모자라면 브러시로 보지 않는다", () => {
    expect(inspectGimpBrushFormat(brushV1.subarray(0, brushV1.byteLength - 1))).toBe("unknown");
  });
});

describe("GIMP 브러시·패턴 손상 입력 견고성", () => {
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

  const samples: ReadonlyArray<readonly [string, Uint8Array, (bytes: Uint8Array) => Promise<unknown>]> = [
    ["gbr v2", buildGbr({ width: 5, height: 4, pixels: grayPixels(5, 4), name: "r" }), (bytes) => importGimpBrush(bytes)],
    ["gbr rgba", buildGbr({ width: 3, height: 3, pixels: rgbaPixels(3, 3), bytes: 4 }), (bytes) => importGimpBrush(bytes)],
    ["gbr v1", buildGbr({ version: 1, width: 3, height: 3, pixels: grayPixels(3, 3) }), (bytes) => importGimpBrush(bytes)],
    ["pat", buildPat({ width: 4, height: 3, bytes: 3, pixels: new Array(36).fill(7) }), (bytes) => importGimpPattern(bytes)],
  ];

  it.each(samples)("%s: 어느 길이로 잘라도 형식 오류 외의 예외가 없다", async (_label, bytes, run) => {
    for (let length = 0; length < bytes.byteLength; length += 1) {
      try {
        await run(bytes.slice(0, length));
        throw new Error(`길이 ${length}가 거부되지 않았다`);
      } catch (error) {
        expect(error, `길이 ${length}`).toBeInstanceOf(GimpBrushError);
      }
    }
    await expect(run(bytes)).resolves.toBeDefined();
  });

  it.each(samples)("%s: 바이트를 무작위로 바꿔도 형식 오류 외의 예외가 없다", async (_label, original, run) => {
    const random = mulberry32(0x6762);
    for (let iteration = 0; iteration < 600; iteration += 1) {
      const mutated = original.slice();
      for (let flip = 0; flip < 1 + Math.floor(random() * 3); flip += 1) {
        mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
      }
      try {
        await run(mutated);
      } catch (error) {
        expect(error, `반복 ${iteration}`).toBeInstanceOf(GimpBrushError);
      }
    }
  });
});

import { describe, expect, it } from "vitest";

import { buildGbr, buildGih, grayPixels, rgbaPixels } from "../../../../tests/corpus/formats/gimp-brush-fixtures";
import { GimpBrushError, type GimpBrushErrorCode, type GimpBrushImportOptions } from "../gimp-brush";
import { importGimpBrushPipe } from "../gimp-brush-pipe";

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function failureOf(bytes: Uint8Array, options?: GimpBrushImportOptions): Promise<GimpBrushErrorCode> {
  try {
    await importGimpBrushPipe(bytes, options);
  } catch (error) {
    if (error instanceof GimpBrushError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

const gray = (width: number, height: number, name: string, seed = 1) => buildGbr({ width, height, pixels: grayPixels(width, height, seed), name });
const rgba = (width: number, height: number, name: string) => buildGbr({ width, height, pixels: rgbaPixels(width, height), bytes: 4, name });

describe("GIMP 이미지 파이프(.gih)", () => {
  it("크기가 서로 다른 브러시를 앞 브러시의 길이로 이어 읽는다", async () => {
    const brushes = [gray(2, 2, "a"), rgba(1, 3, "b"), gray(4, 1, "c", 3)];
    const bytes = buildGih({
      name: "Fire",
      parameters: "ncells:3 cellwidth:4 cellheight:3 step:100 dim:1 cols:1 rows:1 placement:constant rank0:3 sel0:incremental",
      brushes,
    });
    const result = await importGimpBrushPipe(bytes);

    expect(result).toMatchObject({ format: "gimp-brush-pipe", specProfile: "gimp-brush-public-spec", name: "Fire", declaredBrushCount: 3, truncated: false });
    expect(result.brushes.map((brush) => [brush.name, brush.width, brush.height, brush.colorMode])).toEqual([
      ["a", 2, 2, "grayscale"],
      ["b", 1, 3, "rgba"],
      ["c", 4, 1, "grayscale"],
    ]);
    // 브러시들은 빈틈 없이 이어지고 마지막이 파일 끝이다.
    let expectedOffset = bytes.byteLength - brushes.reduce((total, brush) => total + brush.byteLength, 0);
    for (const [index, brush] of result.brushes.entries()) {
      expect(brush.byteOffset).toBe(expectedOffset);
      expect(brush.byteLength).toBe(brushes[index]!.byteLength);
      expectedOffset += brush.byteLength;
    }
    expect(expectedOffset).toBe(bytes.byteLength);
    expect(result.brushes[1]!.pixels).toEqual(rgbaPixels(1, 3));
    expect(result.parameters).toMatchObject({
      cellCount: 3,
      cellWidth: 4,
      cellHeight: 3,
      step: 100,
      dim: 1,
      cols: 1,
      rows: 1,
      placement: "constant",
      ranks: [3],
      selections: ["incremental"],
    });
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.source.byteLength).toBe(bytes.byteLength);
  });

  it("다차원 파이프의 차원별 길이와 선택 방식을 순서대로 읽는다", async () => {
    const brushes = Array.from({ length: 6 }, (_, index) => gray(2, 2, `b${index}`, index));
    const result = await importGimpBrushPipe(
      buildGih({ name: "Charcoal", parameters: "ncells:6 step:100 dim:2 rank0:2 sel0:angular rank1:3 sel1:random", brushes }),
    );

    expect(result.parameters).toMatchObject({ dim: 2, ranks: [2, 3], selections: ["angular", "random"] });
    expect(result.brushes).toHaveLength(6);
    expect(result.warnings).toEqual([]);
  });

  it("공개 문서의 예처럼 단일 selection 키만 있어도 첫 선택 방식으로 읽는다", async () => {
    const result = await importGimpBrushPipe(
      buildGih({ name: "Doc", parameters: "ncells:2 step:20 dim:1 cols:2 rows:1 rank0:2 selection:incremental", brushes: [gray(1, 1, "a"), gray(1, 1, "b")] }),
    );

    expect(result.parameters).toMatchObject({ cols: 2, rows: 1, selections: ["incremental"] });
  });

  it("문서에 없는 키는 entries에 남기고 형식이 틀린 토큰과 반복 키는 경고한다", async () => {
    const result = await importGimpBrushPipe(
      buildGih({ name: "x", parameters: "ncells:1 step:5 custom:yes loose step:6 dim:1 rank0:1 sel0:random", brushes: [gray(1, 1, "a")] }),
    );

    expect(result.parameters.entries).toMatchObject({ ncells: "1", step: "6", custom: "yes", sel0: "random" });
    expect(result.parameters.step).toBe(6);
    expect(codes(result.warnings).sort()).toEqual(["gimp-pipe-parameter-duplicate", "gimp-pipe-parameter-malformed"]);
    expect(result.parameters.raw).toBe("ncells:1 step:5 custom:yes loose step:6 dim:1 rank0:1 sel0:random");
  });

  it("정수가 아닌 숫자 매개변수는 null로 두고 경고한다", async () => {
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:1 step:abc cellwidth:-3", brushes: [gray(1, 1, "a")] }));

    expect(result.parameters).toMatchObject({ step: null, cellWidth: null, cellCount: 1 });
    expect(codes(result.warnings)).toEqual(["gimp-pipe-parameter-not-integer", "gimp-pipe-parameter-not-integer"]);
  });

  it("__proto__ 같은 키로 객체 프로토타입을 오염시키지 못한다", async () => {
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:1 __proto__:polluted constructor:c toString:s", brushes: [gray(1, 1, "a")] }));

    expect(Object.getPrototypeOf(result.parameters.entries)).toBeNull();
    expect(result.parameters.entries["__proto__"]).toBe("polluted");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.keys(result.parameters.entries)).toEqual(expect.arrayContaining(["__proto__", "constructor", "toString"]));
  });

  it("선언한 개수보다 브러시가 적으면 읽은 만큼 돌려주고 truncated로 표시한다", async () => {
    const result = await importGimpBrushPipe(
      buildGih({ name: "x", parameters: "ncells:3 dim:1 rank0:3 sel0:random", count: 3, brushes: [gray(2, 2, "a"), gray(2, 2, "b")] }),
    );

    expect(result.truncated).toBe(true);
    expect(result.brushes).toHaveLength(2);
    expect(codes(result.warnings)).toEqual(["gimp-pipe-brush-count-mismatch"]);
    // 바이트가 끝난 것은 깨진 브러시가 아니다.
    expect(result.unsupported).toEqual([]);
  });

  it("중간 브러시가 깨지면 그 앞까지 돌려주고 이유를 unsupported로 남긴다", async () => {
    const broken = buildGbr({ version: 9, width: 1, height: 1, pixels: [1] });
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:3", brushes: [gray(1, 1, "a"), broken, gray(1, 1, "c")] }));

    expect(result.brushes.map((brush) => brush.name)).toEqual(["a"]);
    expect(result.truncated).toBe(true);
    expect(codes(result.unsupported)).toEqual(["gimp-pipe-brush-invalid"]);
    expect(result.unsupported[0]!.path).toMatch(/^brush\[1\]@/u);
  });

  it("v3 브러시는 본문 크기를 몰라 그 뒤를 읽지 않는다", async () => {
    const v3 = buildGbr({ version: 3, width: 1, height: 1, bytes: 18, pixels: [1, 2, 3, 4, 5, 6, 7, 8] });
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:2", brushes: [v3, gray(1, 1, "late")] }));

    expect(result.brushes).toHaveLength(1);
    expect(result.brushes[0]).toMatchObject({ version: 3, pixels: null });
    expect(codes(result.unsupported)).toEqual(expect.arrayContaining(["gimp-brush-v3-data-not-decoded", "gimp-pipe-brush-body-unknown"]));
    expect(result.truncated).toBe(true);
  });

  it("ncells와 차원별 길이의 곱이 선언한 개수와 다르면 경고한다", async () => {
    const result = await importGimpBrushPipe(
      buildGih({ name: "x", parameters: "ncells:5 dim:2 rank0:2 sel0:random rank1:2 sel1:random", brushes: [gray(1, 1, "a"), gray(1, 1, "b")] }),
    );

    expect(codes(result.warnings).sort()).toEqual(["gimp-pipe-ncells-mismatch", "gimp-pipe-rank-product-mismatch"]);
  });

  it("키가 비어 있는 토큰은 형식이 틀린 것으로 보고 거대한 차원 수도 곧바로 끝난다", async () => {
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:1 :novalue dim:4000000000 rank0:1 sel0:random", brushes: [gray(1, 1, "a")] }));

    expect(codes(result.warnings)).toEqual(["gimp-pipe-parameter-malformed"]);
    expect(result.parameters.dim).toBe(4_000_000_000);
    expect(result.parameters.ranks).toEqual([1]);
    expect(result.parameters.selections).toEqual(["random"]);
  });

  it("한도와 같은 개수의 파이프는 읽고 v3 브러시 하나뿐인 파이프는 잘린 것이 아니다", async () => {
    const two = buildGih({ name: "x", parameters: "ncells:2", brushes: [gray(1, 1, "a"), gray(1, 1, "b")] });
    const v3 = buildGbr({ version: 3, width: 1, height: 1, bytes: 18, pixels: [1, 2, 3, 4, 5, 6, 7, 8] });
    const onlyV3 = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:1", brushes: [v3] }));

    expect((await importGimpBrushPipe(two, { limits: { maxPipeBrushes: 2 } })).brushes).toHaveLength(2);
    expect(onlyV3.truncated).toBe(false);
    expect(codes(onlyV3.unsupported)).toEqual(["gimp-brush-v3-data-not-decoded", "gimp-pipe-brush-body-unknown"]);
  });

  it("마지막 브러시 뒤의 바이트를 경고한다", async () => {
    const result = await importGimpBrushPipe(buildGih({ name: "x", parameters: "ncells:1", brushes: [gray(1, 1, "a")], trailing: [1, 2, 3] }));

    expect(codes(result.warnings)).toEqual(["gimp-pipe-trailing-bytes"]);
    expect(result.truncated).toBe(false);
  });

  it("CRLF 줄바꿈 헤더도 읽고 경고한다", async () => {
    const result = await importGimpBrushPipe(buildGih({ name: "crlf", parameters: "ncells:1 sel0:random dim:1 rank0:1", brushes: [gray(1, 1, "a")], lineEnding: "\r\n" }));

    expect(result.name).toBe("crlf");
    expect(result.parameters.selections).toEqual(["random"]);
    expect(codes(result.warnings)).toEqual(["gimp-pipe-carriage-return"]);
  });

  it("UTF-8이 아닌 헤더 바이트는 대체 문자로 읽고 경고한다", async () => {
    const body = buildGih({ name: "AB", parameters: "ncells:1", brushes: [gray(1, 1, "a")] });
    const mutated = body.slice();
    mutated[1] = 0xff; // 이름의 두 번째 글자

    const result = await importGimpBrushPipe(mutated);

    expect(result.name).toBe("A�");
    expect(codes(result.warnings)).toEqual(["gimp-pipe-header-utf8-invalid"]);
  });

  it("텍스트 헤더가 올바르지 않으면 거부한다", async () => {
    const brush = gray(1, 1, "a");

    expect(await failureOf(new TextEncoder().encode("이름만 있고 줄바꿈이 없다"))).toBe("header-invalid");
    expect(await failureOf(new TextEncoder().encode("이름\n둘째 줄은 숫자로 시작하지 않는다\n"))).toBe("header-invalid");
    expect(await failureOf(buildGih({ name: "x", parameters: "ncells:0", count: 0, brushes: [brush] }))).toBe("header-invalid");
    expect(await failureOf(buildGih({ name: "x", parameters: "ncells:2", count: 2, brushes: [brush] }), { limits: { maxPipeBrushes: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(buildGih({ name: "x".repeat(40), parameters: "ncells:1", brushes: [brush] }), { limits: { maxLineBytes: 16 } })).toBe("limit-exceeded");
  });

  it("둘째 줄이 숫자로 시작하지 않으면 그 이유를 밝혀 거부한다", async () => {
    await expect(importGimpBrushPipe(new TextEncoder().encode("x\n ncells:1\n"))).rejects.toThrow(/브러시 수로 시작하지 않는다/u);
    await expect(importGimpBrushPipe(new TextEncoder().encode("x\n\n"))).rejects.toThrow(/브러시 수로 시작하지 않는다/u);
  });

  it("브러시 수가 안전 정수를 넘으면 거부하고 호출자는 한도를 낮추기만 할 수 있다", async () => {
    const huge = new TextEncoder().encode(`x\n${"9".repeat(30)} ncells:1\n`);

    expect(await failureOf(huge)).toBe("header-invalid");
    expect(await failureOf(buildGih({ name: "x", parameters: "ncells:1", brushes: [gray(1, 1, "a")] }), { limits: { maxPipeBrushes: 5000 } })).toBe("source-too-large");
  });

  it("중단 신호가 켜져 있으면 aborted로 거부한다", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await failureOf(buildGih({ name: "x", parameters: "ncells:1", brushes: [gray(1, 1, "a")] }), { signal: controller.signal })).toBe("aborted");
  });

  it("어느 길이로 잘라도 형식 오류 외의 예외가 없고 잘린 파일은 truncated 또는 거부다", async () => {
    const bytes = buildGih({ name: "robust", parameters: "ncells:3 dim:1 rank0:3 sel0:random", brushes: [gray(3, 2, "a"), rgba(2, 2, "b"), gray(1, 4, "c")] });

    for (let length = 0; length < bytes.byteLength; length += 1) {
      try {
        const result = await importGimpBrushPipe(bytes.slice(0, length));
        expect(result.truncated, `길이 ${length}`).toBe(true);
        expect(result.brushes.length, `길이 ${length}`).toBeLessThan(3);
      } catch (error) {
        expect(error, `길이 ${length}`).toBeInstanceOf(GimpBrushError);
      }
    }
    expect((await importGimpBrushPipe(bytes)).brushes).toHaveLength(3);
  });

  it("바이트를 무작위로 바꿔도 형식 오류 외의 예외가 없다", async () => {
    const original = buildGih({ name: "robust", parameters: "ncells:3 dim:1 rank0:3 sel0:random", brushes: [gray(3, 2, "a"), rgba(2, 2, "b"), gray(1, 4, "c")] });
    let state = 0x6769;
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let iteration = 0; iteration < 800; iteration += 1) {
      const mutated = original.slice();
      for (let flip = 0; flip < 1 + Math.floor(next() * 3); flip += 1) {
        mutated[Math.floor(next() * mutated.length)] = Math.floor(next() * 256);
      }
      try {
        await importGimpBrushPipe(mutated);
      } catch (error) {
        expect(error, `반복 ${iteration}`).toBeInstanceOf(GimpBrushError);
      }
    }
  });
});

import { describe, expect, it } from "vitest";

import { buildVbr } from "../../../../tests/corpus/formats/gimp-brush-fixtures";
import { GimpBrushError, type GimpBrushErrorCode } from "../gimp-brush";
import { importGimpGeneratedBrush } from "../gimp-generated-brush";

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function failureOf(bytes: Uint8Array, limits?: { readonly maxLineBytes: number }): Promise<GimpBrushErrorCode> {
  try {
    await importGimpGeneratedBrush(bytes, limits === undefined ? {} : { limits });
  } catch (error) {
    if (error instanceof GimpBrushError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

const V10 = ["GIMP-VBR", "1.0", "2. Hardness 075", "10.000000", "25.000000", "0.750000", "1.000000", "0.000000"];
const V15 = ["GIMP-VBR", "1.5", "2. Star", "diamond", "50.000000", "25.000000", "5", "1.000000", "2.500000", "17.500000"];

describe("GIMP 생성 브러시(.vbr)", () => {
  it("버전 1.0(8줄)은 모양과 가시 수 없이 읽는다", async () => {
    const result = await importGimpGeneratedBrush(buildVbr(V10));

    expect(result).toMatchObject({
      format: "gimp-generated-brush",
      specProfile: "gimp-brush-public-spec",
      version: "1.0",
      name: "2. Hardness 075",
      shape: null,
      spacing: 10,
      radius: 25,
      spikes: null,
      hardness: 0.75,
      aspectRatio: 1,
      angle: 0,
    });
    expect(result.warnings).toEqual([]);
    expect(result.source.byteLength).toBe(buildVbr(V10).byteLength);
  });

  it("버전 1.5(10줄)는 모양과 가시 수가 끼어 뒤 필드 위치가 밀린다", async () => {
    const result = await importGimpGeneratedBrush(buildVbr(V15));

    expect(result).toMatchObject({
      version: "1.5",
      name: "2. Star",
      shape: "diamond",
      spacing: 50,
      radius: 25,
      spikes: 5,
      hardness: 1,
      aspectRatio: 2.5,
      angle: 17.5,
    });
    expect(result.warnings).toEqual([]);
  });

  it("문서가 정한 모양 세 가지(circle, square, diamond)는 경고 없이 받는다", async () => {
    for (const shape of ["circle", "square", "diamond"]) {
      const lines = [...V15];
      lines[3] = shape;
      const result = await importGimpGeneratedBrush(buildVbr(lines));
      expect(result.shape).toBe(shape);
      expect(result.warnings).toEqual([]);
    }
  });

  it("모르는 모양은 값을 남기고 경고한다", async () => {
    const lines = [...V15];
    lines[3] = "hexagon";
    const result = await importGimpGeneratedBrush(buildVbr(lines));

    expect(result.shape).toBe("hexagon");
    expect(codes(result.warnings)).toEqual(["gimp-vbr-shape-unknown"]);
  });

  it("마지막 줄바꿈이 없어도, CRLF여도 읽는다", async () => {
    const noFinalNewline = new TextEncoder().encode(V10.join("\n"));
    const crlf = await importGimpGeneratedBrush(buildVbr(V10, "\r\n"));

    expect((await importGimpGeneratedBrush(noFinalNewline)).radius).toBe(25);
    expect(crlf.radius).toBe(25);
    expect(crlf.name).toBe("2. Hardness 075");
    expect(codes(crlf.warnings)).toEqual(["gimp-vbr-carriage-return"]);
  });

  it("지수 표기와 부호가 있는 소수를 받고 쉼표 소수점·NaN·무한대는 거부한다", async () => {
    const lines = [...V10];
    lines[3] = "1e2";
    lines[4] = "+3.5";
    lines[7] = "-12.5";
    const result = await importGimpGeneratedBrush(buildVbr(lines));

    expect([result.spacing, result.radius, result.angle]).toEqual([100, 3.5, -12.5]);
    for (const bad of ["1,5", "NaN", "Infinity", "", "abc", "1.2.3", "0x10"]) {
      const broken = [...V10];
      broken[4] = bad;
      expect(await failureOf(buildVbr(broken)), bad).toBe("header-invalid");
    }
  });

  it("가시 수가 정수가 아니거나 음수이면 거부한다", async () => {
    for (const bad of ["5.5", "-1", "abc"]) {
      const lines = [...V15];
      lines[6] = bad;
      expect(await failureOf(buildVbr(lines)), bad).toBe("header-invalid");
    }
    const intLike = [...V15];
    intLike[6] = "3.0";
    expect((await importGimpGeneratedBrush(buildVbr(intLike))).spikes).toBe(3);
    const zero = [...V15];
    zero[6] = "0";
    expect((await importGimpGeneratedBrush(buildVbr(zero))).spikes).toBe(0);
  });

  it("매직이 다르거나 버전을 모르면 거부한다", async () => {
    expect(await failureOf(buildVbr(["GIMP-VBX", ...V10.slice(1)]))).toBe("magic-invalid");
    expect(await failureOf(buildVbr(["", ...V10.slice(1)]))).toBe("magic-invalid");
    expect(await failureOf(buildVbr([V10[0]!, "2.0", ...V10.slice(2)]))).toBe("version-unsupported");
    expect(await failureOf(buildVbr([V10[0]!]))).toBe("version-unsupported");
    expect(await failureOf(new Uint8Array(0))).toBe("magic-invalid");
  });

  it("줄이 모자라면 truncated로 거부하고 남는 줄은 경고한다", async () => {
    expect(await failureOf(buildVbr(V10.slice(0, 7)))).toBe("truncated");
    expect(await failureOf(buildVbr(V15.slice(0, 9)))).toBe("truncated");
    const extra = await importGimpGeneratedBrush(buildVbr([...V10, "더", "줄"]));

    expect(codes(extra.warnings)).toEqual(["gimp-vbr-trailing-lines"]);
    expect(extra.radius).toBe(25);
  });

  it("이름이 255바이트를 넘으면 경고하고 UTF-8이 아니면 대체 문자로 읽는다", async () => {
    const long = [...V10];
    long[2] = "가".repeat(86); // 258바이트
    const longResult = await importGimpGeneratedBrush(buildVbr(long));
    const exact = [...V10];
    exact[2] = "a".repeat(255);

    expect(codes(longResult.warnings)).toEqual(["gimp-vbr-name-too-long"]);
    expect(codes((await importGimpGeneratedBrush(buildVbr(exact))).warnings)).toEqual([]);

    const text = new TextEncoder().encode(buildVbrText(V10));
    const at = text.indexOf(0x32); // 이름 첫 글자 '2'
    const mutated = text.slice();
    mutated[at] = 0xff;
    const result = await importGimpGeneratedBrush(mutated);
    expect(result.name.startsWith("�")).toBe(true);
    expect(codes(result.warnings)).toEqual(["gimp-vbr-utf8-invalid"]);
  });

  it("텍스트가 줄 한도의 16배를 넘으면 줄을 쪼개기 전에 거부한다", async () => {
    const huge = new Uint8Array(200_000).fill(0x0a);

    expect(await failureOf(huge)).toBe("limit-exceeded");
    // 76바이트 본문에 4바이트 줄 하나를 더해 정확히 16 × 5 = 80바이트로 맞춘다.
    const body = buildVbr([...V10, "zzz"]);

    expect(body.byteLength).toBe(80);
    expect(await failureOf(body, { maxLineBytes: 4 })).toBe("limit-exceeded");
    expect((await importGimpGeneratedBrush(body, { limits: { maxLineBytes: 5 } })).radius).toBe(25);
  });

  it("바이트를 무작위로 바꿔도 형식 오류 외의 예외가 없다", async () => {
    const original = buildVbr(V15);
    let state = 0x7662;
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
        await importGimpGeneratedBrush(mutated);
      } catch (error) {
        expect(error, `반복 ${iteration}`).toBeInstanceOf(GimpBrushError);
      }
    }
  });
});

function buildVbrText(lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

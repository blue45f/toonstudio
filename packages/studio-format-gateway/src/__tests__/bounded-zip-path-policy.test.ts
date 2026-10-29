import { describe, expect, it } from "vitest";

import { buildFormatZipFixture } from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import { FormatZipReaderError, readFormatZipArchive, type FormatZipPathPolicy } from "../bounded-zip";
import { equalBytes } from "../bounded-zip-path";

const data = new TextEncoder().encode("x");

async function openWith(paths: readonly string[], pathPolicy?: FormatZipPathPolicy) {
  const bytes = buildFormatZipFixture(paths.map((path) => ({ path, data })));
  return readFormatZipArchive(bytes, pathPolicy === undefined ? {} : { pathPolicy });
}

async function codeOf(paths: readonly string[], pathPolicy?: FormatZipPathPolicy): Promise<string> {
  try {
    await openWith(paths, pathPolicy);
  } catch (error) {
    if (error instanceof FormatZipReaderError) return error.code;
    throw error;
  }
  return "열림";
}

/** 모든 운영체제에 풀기에는 안전하지 않지만 메모리에서 이름으로 찾는 데는 문제가 없는 경로. */
const PORTABLE_ONLY_REJECTED: readonly (readonly [string, string])[] = [
  ["콜론", "1화: 시작/layers/layer2"],
  ["물음표", "뭐?/layers/layer2"],
  ["별표", "a*b/layers/layer2"],
  ["세로줄", "a|b/layers/layer2"],
  ["부등호 <", "a<b/layers/layer2"],
  ["부등호 >", "a>b/layers/layer2"],
  ["큰따옴표", 'q"q/layers/layer2'],
  ["역슬래시", "a\\b/layers/layer2"],
  ["드라이브 문자 모양", "C:foo/layers/layer2"],
  ["끝이 점", "name./layers/layer2"],
  ["끝이 공백", "name /layers/layer2"],
  ["앞이 공백", " name/layers/layer2"],
  ["Windows 예약 이름", "con/layers/layer2"],
  ["Windows 예약 이름 + 확장자", "aux.txt"],
  ["분해형 한글(NFD)", "웹툰/layers/layer2".normalize("NFD")],
  ["전각 라틴", "Ａ/layers/layer2"],
  ["상표 기호", "™/layers/layer2"],
  ["방향 제어 문자", "a‮b/layers/layer2"],
];

describe("ZIP 경로 정책", () => {
  it("기본값은 portable이고 평범한 경로를 연다", async () => {
    const archive = await openWith(["doc/layers/layer2", "doc/annotations/icc"]);
    expect(archive.entries.map((entry) => entry.path)).toEqual(["doc/layers/layer2", "doc/annotations/icc"]);
  });

  describe.each(PORTABLE_ONLY_REJECTED)("portable은 거부하고 memory는 받아들인다: %s", (_label, path) => {
    it("portable(기본)은 PATH_INVALID", async () => {
      expect(await codeOf([path])).toBe("PATH_INVALID");
      expect(await codeOf([path], "portable")).toBe("PATH_INVALID");
    });

    it("memory는 열고 정확한 경로로 찾아 읽는다", async () => {
      const archive = await openWith([path], "memory");
      expect(archive.getEntry(path)?.path).toBe(path);
      expect(await archive.readEntry(path)).toEqual(data);
    });
  });

  describe.each([
    ["상위 구간", "../evil/layers/layer2"],
    ["중간 상위 구간", "doc/../evil"],
    ["현재 구간", "./doc/layers/layer2"],
    ["절대 경로", "/abs/layers/layer2"],
    ["이중 슬래시로 시작", "//abs/layers/layer2"],
    ["빈 구간", "a//b"],
    ["탭", "tab\tname/layers/layer2"],
    ["줄바꿈", "line\nbreak/layers/layer2"],
    ["NUL", "nul\u0000/layers/layer2"],
    ["DEL", "del\u007f/layers/layer2"],
  ])("어느 정책에서도 거부한다: %s", (_label, path) => {
    it("portable과 memory 모두 PATH_INVALID", async () => {
      expect(await codeOf([path], "portable")).toBe("PATH_INVALID");
      expect(await codeOf([path], "memory")).toBe("PATH_INVALID");
    });
  });

  it("portable은 대소문자·정규화만 다른 경로를 중복으로 본다", async () => {
    expect(await codeOf(["Doc/layers/layer2", "doc/layers/layer2"], "portable")).toBe("PATH_DUPLICATE");
  });

  it("memory는 대소문자가 다른 경로를 서로 다른 항목으로 둔다 (정확히 같은 경로만 중복)", async () => {
    const archive = await openWith(["Doc/layers/layer2", "doc/layers/layer2"], "memory");
    expect(archive.entries.map((entry) => entry.path)).toEqual(["Doc/layers/layer2", "doc/layers/layer2"]);
    expect(archive.getEntry("Doc/layers/layer2")).toBeDefined();
    expect(archive.getEntry("DOC/layers/layer2")).toBeUndefined();
    expect(await codeOf(["doc/x", "doc/x"], "memory")).toBe("PATH_DUPLICATE");
  });

  it("memory도 파일과 디렉터리가 충돌하는 경로를 거부한다", async () => {
    expect(await codeOf(["doc", "doc/layers/layer2"], "memory")).toBe("PATH_DUPLICATE");
  });

  it("memory도 경로 길이 한도를 지킨다", async () => {
    const long = `${"가".repeat(400)}/layers/layer2`; // UTF-8로 1,200바이트 넘음
    expect(await codeOf([long], "memory")).toBe("PATH_INVALID");
  });

  describe.each(["portable", "memory"] as const)("경로 세부 검사 (%s)", (policy) => {
    it("제어 문자는 0x1f까지 거부하고 0x20(안쪽 공백)과 U+0080은 받아들인다", async () => {
      expect(await codeOf(["a\u001fb/layers/layer2"], policy)).toBe("PATH_INVALID");
      expect(await codeOf(["a b/layers/layer2"], policy)).toBe("열림");
      expect(await codeOf(["a\u0080b/layers/layer2"], policy)).toBe("열림");
    });

    it("UTF-8 BOM으로 시작하는 경로는 재인코딩이 달라서 거부한다", async () => {
      expect(await codeOf(["\uFEFFdoc/layers/layer2"], policy)).toBe("PATH_INVALID");
    });

    it("경로 길이 한도는 한도와 같은 경로까지 받아들이고 하나 넘으면 거부한다", async () => {
      const limits = { maxPathBytes: 12 };
      const open = (path: string) => readFormatZipArchive(buildFormatZipFixture([{ path, data }]), { limits, pathPolicy: policy });
      await expect(open("abcdefghijkl")).resolves.toBeDefined();
      await expect(open("abcdefghijklm")).rejects.toMatchObject({ code: "PATH_INVALID" });
    });

    it("거부한 경로는 오류의 path에 담기고, 경로를 읽기 전에 거부하면 path가 없다", async () => {
      const rejected = await readFormatZipArchive(buildFormatZipFixture([{ path: "a/../b", data }]), { pathPolicy: policy }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(rejected).toBeInstanceOf(FormatZipReaderError);
      expect(rejected).toMatchObject({ code: "PATH_INVALID", path: "a/../b" });
      const tooLong = await readFormatZipArchive(buildFormatZipFixture([{ path: "x".repeat(2000), data }]), { pathPolicy: policy }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(tooLong).toMatchObject({ code: "PATH_INVALID" });
      expect((tooLong as FormatZipReaderError).path).toBeUndefined();
    });
  });

  it("equalBytes는 길이와 내용이 모두 같아야 같다", () => {
    const bytes = (...values: number[]) => Uint8Array.from(values);
    expect(equalBytes(bytes(), bytes())).toBe(true);
    expect(equalBytes(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true);
    expect(equalBytes(bytes(1, 2), bytes(1, 2, 3))).toBe(false);
    expect(equalBytes(bytes(1, 2, 3), bytes(1, 2))).toBe(false);
    expect(equalBytes(bytes(1, 2, 3), bytes(1, 2, 4))).toBe(false);
    expect(equalBytes(bytes(9, 2, 3), bytes(1, 2, 3))).toBe(false);
  });

  it("알 수 없는 정책 값은 LIMIT_INVALID로 거부한다", async () => {
    const bytes = buildFormatZipFixture([{ path: "a", data }]);
    await expect(readFormatZipArchive(bytes, { pathPolicy: "loose" as never })).rejects.toMatchObject({ code: "LIMIT_INVALID" });
  });
});

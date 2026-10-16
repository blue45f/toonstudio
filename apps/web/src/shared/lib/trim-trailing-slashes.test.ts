import { describe, expect, it } from "vitest";

import { trimTrailingSlashes } from "./trim-trailing-slashes";

describe("trimTrailingSlashes", () => {
  it.each([
    ["", ""],
    ["/", ""],
    ["////", ""],
    ["/about", "/about"],
    ["/about/", "/about"],
    ["/about////", "/about"],
    ["/a//b/", "/a//b"],
    ["//a", "//a"],
    ["https://example.test/", "https://example.test"],
    ["https://example.test/ai/v1///", "https://example.test/ai/v1"],
    ["/한글/경로//", "/한글/경로"],
    ["a/\n", "a/\n"],
    ["a/\n/", "a/\n"],
  ])("%j → %j", (input, expected) => {
    expect(trimTrailingSlashes(input)).toBe(expected);
  });

  it("바꿀 것이 없으면 같은 문자열을 그대로 돌려준다", () => {
    const value = "/studio/p/project-1";
    expect(trimTrailingSlashes(value)).toBe(value);
  });

  it("수정 전 정규식(/\\/+$/u)과 무작위 문자열 5,000건에서 결과가 같다", () => {
    let state = 20_261_015;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const alphabet = ["/", "/", "/", "a", "b", "\n", " ", "가", ".", "?"];
    for (let caseIndex = 0; caseIndex < 5_000; caseIndex += 1) {
      const length = Math.floor(next() * 14);
      let input = "";
      for (let index = 0; index < length; index += 1) input += alphabet[Math.floor(next() * alphabet.length)] ?? "";
      expect(trimTrailingSlashes(input), JSON.stringify(input)).toBe(input.replace(/\/+$/u, ""));
    }
  });

  it("슬래시가 길게 이어져도 선형 시간에 끝난다", () => {
    // 6만 칸이면 수정 전 정규식은 호출마다 1초 안팎이 든다. 더 길게 잡으면 퇴행했을 때 시험이 실패하지 않고 멈춰 버린다
    // (입력 길이의 제곱 시간이라 200만 칸은 수 시간이다).
    const run = "/".repeat(60_000);
    const startedAt = performance.now();
    expect(trimTrailingSlashes(`/about${run}x`)).toBe(`/about${run}x`);
    expect(trimTrailingSlashes(`/about${run}`)).toBe("/about");
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(300);
  });
});

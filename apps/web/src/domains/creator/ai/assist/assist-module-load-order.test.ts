import { describe, expect, it, vi } from "vitest";

/**
 * 보조 기능 모듈은 어느 것을 먼저 불러와도 순환 import 때문에 값이 비지 않아야 한다.
 * 대화상자는 지연 로딩이라 어떤 모듈이 먼저 평가될지 화면마다 다르다. 순환 안에서 아직 초기화되지 않은 값을 모듈 맨 위에서
 * 읽으면 브라우저에서는 "Cannot access ... before initialization"으로 편집기 화면 전체가 오류 화면으로 바뀌고, 테스트
 * 환경에서는 그 값이 조용히 undefined가 된다. 그래서 모듈마다 그것을 먼저 불러온 뒤 같은 폴더 모든 모듈의 내보낸 값이
 * undefined가 아닌지 본다(예: assist-localize를 먼저 열면 assist-alt-text의 ALT_TEXT_LANGUAGES가 비던 문제).
 */
const MODULES = import.meta.glob<Record<string, unknown>>(["./*.ts", "!./*.test.ts"]);
const PATHS = Object.keys(MODULES).sort();

describe("AI 보조 모듈 불러오기 순서", () => {
  it("검사할 모듈을 찾는다", () => {
    expect(PATHS.length).toBeGreaterThan(10);
  });

  for (const first of PATHS) {
    it(`${first}를 먼저 불러와도 같은 폴더 모듈의 내보낸 값이 비지 않는다`, async () => {
      vi.resetModules();
      await MODULES[first]!();
      const empty: string[] = [];
      for (const path of PATHS) {
        const exported = await MODULES[path]!();
        for (const [name, value] of Object.entries(exported)) {
          if (value === undefined) empty.push(`${path}#${name}`);
        }
      }
      expect(empty).toEqual([]);
    });
  }
});

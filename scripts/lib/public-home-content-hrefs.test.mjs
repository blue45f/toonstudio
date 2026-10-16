import assert from "node:assert/strict";

import { readHomeContentHrefs } from "./public-home-content-hrefs.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SAMPLE = `
export const HOME_QUICK_STARTS = [
  { href: "/create", ko: "작품 시작하기", en: "Start a work" },
  { href: "/story-lab?idea=1", ko: "스토리", en: "Story" },
] as const;

export const HOME_EXAMPLES = [
  { image: "canvas-noir", ko: "회색의 도시" },
] as const;
`;

describe("public-home-content-hrefs: 홈 콘텐츠 href 읽기", () => {
  it("as const 배열의 href 를 선언 순서대로 읽는다", () => {
    assert.deepEqual(readHomeContentHrefs("HOME_QUICK_STARTS", SAMPLE), ["/create", "/story-lab?idea=1"]);
  });

  it("href 가 없는 배열이나 없는 이름은 조용히 빈 목록이 아니라 실패한다", () => {
    assert.throws(() => readHomeContentHrefs("HOME_EXAMPLES", SAMPLE), /href 를 읽지 못했습니다/u);
    assert.throws(() => readHomeContentHrefs("HOME_MISSING", SAMPLE), /href 를 읽지 못했습니다/u);
  });

  it("실제 reference-home-content.ts 에서 바로가기와 Luna 제안을 읽는다", () => {
    for (const name of ["HOME_QUICK_STARTS", "HOME_LUNA_SUGGESTIONS"]) {
      const hrefs = readHomeContentHrefs(name);
      assert.ok(hrefs.length >= 3, `${name} 항목이 너무 적습니다`);
      for (const href of hrefs) assert.match(href, /^\//u, `${name}: 내부 경로가 아닙니다 ${href}`);
    }
  });
});

import { describe, expect, it } from "vitest";

import { stripTrailingNuls as fromCommon } from "../format-common";
import { stripTrailingNuls as fromLeaf } from "../nul-text";

// nul-text.ts 는 Studio 정적 그래프에 닿는 abr·abr-preview 를 위해 format-common 의 같은 함수를 복사해 둔 것이다.
// 두 사본이 어긋나면 ABR 이름만 다르게 읽히므로 같은 입력에서 같은 결과를 내는지 고정한다.
describe("stripTrailingNuls 사본 일치", () => {
  const cases = [
    "",
    "\0",
    "\0\0\0",
    "brush",
    "brush\0",
    "brush\0\0\0\0",
    "\0brush",
    "br\0ush\0",
    "한글 이름\0\0",
    "\0".repeat(5000) + "x",
    "x" + "\0".repeat(5000),
  ];

  it.each(cases.map((text) => [JSON.stringify(text.slice(0, 24)), text] as const))("%s", (_label, text) => {
    expect(fromLeaf(text)).toBe(fromCommon(text));
  });

  it("끝의 NUL 만 떼고 가운데 NUL 은 둔다", () => {
    expect(fromLeaf("a\0b\0\0")).toBe("a\0b");
    expect(fromLeaf("\0\0")).toBe("");
  });
});

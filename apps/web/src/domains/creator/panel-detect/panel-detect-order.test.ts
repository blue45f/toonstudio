import { describe, expect, it } from "vitest";

import { sortPanelsByReadingOrder } from "./panel-detect-order";

import type { PanelRect } from "./panel-detect-types";

interface Named extends PanelRect {
  readonly name: string;
}

const rect = (name: string, x: number, y: number, width: number, height: number): Named => ({ name, x, y, width, height });
const names = (list: readonly Named[]): string[] => list.map((entry) => entry.name);

describe("읽기 순서 정렬", () => {
  // 2×2 격자
  const topLeft = rect("TL", 0, 0, 480, 480);
  const topRight = rect("TR", 520, 0, 480, 480);
  const bottomLeft = rect("BL", 0, 520, 480, 480);
  const bottomRight = rect("BR", 520, 520, 480, 480);
  const shuffled = [bottomRight, topLeft, bottomLeft, topRight];

  it("만화: 위 줄 오른쪽 → 왼쪽, 아래 줄 오른쪽 → 왼쪽", () => {
    expect(names(sortPanelsByReadingOrder(shuffled, "manga"))).toEqual(["TR", "TL", "BR", "BL"]);
  });

  it("코믹: 위 줄 왼쪽 → 오른쪽, 아래 줄 왼쪽 → 오른쪽", () => {
    expect(names(sortPanelsByReadingOrder(shuffled, "comic"))).toEqual(["TL", "TR", "BL", "BR"]);
  });

  it("웹툰: 위에서 아래로, 같은 줄은 왼쪽 → 오른쪽", () => {
    expect(names(sortPanelsByReadingOrder(shuffled, "webtoon"))).toEqual(["TL", "TR", "BL", "BR"]);
  });

  it("긴 컷 하나 + 쌓인 두 컷(L 자)은 묶음 단위로 읽는다", () => {
    const tall = rect("tall", 0, 0, 480, 1000);
    const upper = rect("upper", 520, 0, 480, 480);
    const lower = rect("lower", 520, 520, 480, 480);
    expect(names(sortPanelsByReadingOrder([lower, tall, upper], "manga"))).toEqual(["upper", "lower", "tall"]);
    expect(names(sortPanelsByReadingOrder([lower, tall, upper], "comic"))).toEqual(["tall", "upper", "lower"]);
  });

  it("세로 한 줄은 어떤 방식이든 위에서 아래로", () => {
    const column = [rect("c", 0, 1200, 700, 400), rect("a", 0, 0, 700, 500), rect("b", 0, 600, 700, 500)];
    for (const mode of ["manga", "comic", "webtoon"] as const) {
      expect(names(sortPanelsByReadingOrder(column, mode))).toEqual(["a", "b", "c"]);
    }
  });

  it("서로 겹쳐 가로·세로로 못 가르는 배치는 위쪽 가장자리 → 가로 방향 순으로 정렬한다", () => {
    const a = rect("a", 0, 0, 600, 600);
    const b = rect("b", 300, 100, 600, 600);
    const c = rect("c", 100, 300, 600, 600);
    expect(names(sortPanelsByReadingOrder([c, b, a], "comic"))).toEqual(["a", "b", "c"]);
    expect(names(sortPanelsByReadingOrder([c, b, a], "manga"))).toEqual(["a", "b", "c"]);
  });

  it("반올림으로 한두 픽셀 겹친 위아래 컷은 같은 줄로 보지 않는다", () => {
    const upper = rect("upper", 0, 0, 800, 500);
    const lower = rect("lower", 0, 499, 800, 500);
    expect(names(sortPanelsByReadingOrder([lower, upper], "manga"))).toEqual(["upper", "lower"]);
  });

  it("입력을 바꾸지 않고, 비어 있거나 하나뿐이어도 동작하며, 같은 입력은 같은 순서를 낸다", () => {
    const input = [...shuffled];
    const sorted = sortPanelsByReadingOrder(input, "manga");
    expect(input).toEqual(shuffled);
    expect(sorted).not.toBe(input);
    expect(sortPanelsByReadingOrder([], "manga")).toEqual([]);
    expect(names(sortPanelsByReadingOrder([topLeft], "webtoon"))).toEqual(["TL"]);
    expect(names(sortPanelsByReadingOrder(input, "manga"))).toEqual(names(sorted));
  });
});

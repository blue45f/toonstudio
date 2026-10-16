import { describe, expect, it } from "vitest";

import type { InkComponent } from "./panel-detect-components";
import {
  createSeparatorClassifier,
  edgeBandCoverage,
  edgeBandThickness,
  hasSeparatePanelCandidates,
  isFrameLikeComponent,
  isRectangularRegion,
  longestBlankRun,
  openingLength,
} from "./panel-detect-frames";
import type { PanelRegion } from "./panel-detect-profile";
import type { InkMask } from "./panel-detect-raster";

/** 글자 그림으로 마스크를 만든다. '#' 은 내용, 그 밖은 여백. */
function maskOf(rows: readonly string[]): InkMask {
  const width = rows[0].length;
  const data = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => {
    expect(row.length).toBe(width);
    for (let x = 0; x < width; x += 1) data[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return { width, height: rows.length, step: 1, data };
}

const whole = (mask: InkMask): PanelRegion => ({ x0: 0, y0: 0, x1: mask.width, y1: mask.height });

/** 위아래 선으로 막힌 테두리 속 빈 칸(양끝이 모두 막힘). */
const FRAMED = [
  "########################",
  "#                      #",
  "#                      #",
  "#           ##         #",
  "#           ##         #",
  "#                      #",
  "#                      #",
  "########################",
];

/** 두 컷 사이에 세로 여백(12~15열)이 있다. 위·아래 선은 여백을 가로지르지 않는다. */
const TWO_PANELS = [
  "###########     ###########",
  "#         #     #         #",
  "#    #    #     #    #    #",
  "#         #     #         #",
  "###########     ###########",
];

describe("테두리 인식 — 가장자리 띠", () => {
  it("띠 두께는 긴 변의 3%(최소 3줄)이고 짧은 변의 1/3 을 넘지 않는다", () => {
    expect(edgeBandThickness({ x0: 0, y0: 0, x1: 100, y1: 60 })).toBe(3);
    expect(edgeBandThickness({ x0: 0, y0: 0, x1: 1000, y1: 900 })).toBe(30);
    expect(edgeBandThickness({ x0: 0, y0: 0, x1: 9, y1: 9 })).toBe(3);
    expect(edgeBandThickness({ x0: 0, y0: 0, x1: 5, y1: 5 })).toBe(1);
    expect(edgeBandThickness({ x0: 2, y0: 2, x1: 400, y1: 8 })).toBe(2);
  });

  it("가장자리를 따라 띠 안에 내용이 있는 위치를 표시한다", () => {
    const mask = maskOf(TWO_PANELS);
    const region = whole(mask);
    const top = edgeBandCoverage(mask, region, "top");
    expect(top).toHaveLength(27);
    expect(Array.from(top.slice(0, 11)).every((value) => value === 1)).toBe(true);
    expect(Array.from(top.slice(11, 16)).every((value) => value === 0)).toBe(true);
    const left = edgeBandCoverage(mask, region, "left");
    expect(left).toHaveLength(5);
    expect(Array.from(left).every((value) => value === 1)).toBe(true);
    // 오른쪽·아래쪽 띠도 같은 규칙이다.
    expect(Array.from(edgeBandCoverage(mask, region, "bottom").slice(11, 16)).every((value) => value === 0)).toBe(true);
    expect(Array.from(edgeBandCoverage(mask, region, "right"))).toHaveLength(5);
  });

  it("영역 오프셋을 반영해 부분 영역의 띠만 훑는다", () => {
    const mask = maskOf(TWO_PANELS);
    const right = edgeBandCoverage(mask, { x0: 16, y0: 0, x1: 27, y1: 5 }, "top");
    expect(right).toHaveLength(11);
    expect(Array.from(right).every((value) => value === 1)).toBe(true);
  });

  it("가장 긴 빈 구간을 구간 안에서만 센다", () => {
    const coverage = Uint8Array.from([1, 0, 0, 1, 0, 0, 0, 1]);
    expect(longestBlankRun(coverage, 0, coverage.length)).toBe(3);
    expect(longestBlankRun(coverage, 0, 3)).toBe(2);
    expect(longestBlankRun(coverage, 7, 20)).toBe(0);
    expect(longestBlankRun(coverage, -5, 2)).toBe(1);
    expect(openingLength(3)).toBe(2);
    expect(openingLength(8)).toBe(4);
  });
});

describe("테두리 인식 — 여백 묶음 분류", () => {
  it("테두리 속 빈 칸은 양끝이 모두 막혀 enclosed 다", () => {
    const mask = maskOf(FRAMED);
    const classify = createSeparatorClassifier(mask, whole(mask), "cols", 4);
    expect(classify({ start: 2, end: 11 })).toBe("enclosed");
    expect(classify({ start: 14, end: 22 })).toBe("enclosed");
  });

  it("컷 사이 여백은 양끝이 열려 open 이다", () => {
    const mask = maskOf(TWO_PANELS);
    const classify = createSeparatorClassifier(mask, whole(mask), "cols", 4);
    expect(classify({ start: 11, end: 16 })).toBe("open");
  });

  it("다른 컷의 선이 한쪽 끝을 가로지르면 crossed 다", () => {
    // 위쪽은 여백이 열려 있지만 맨 아래 한 줄이 여백 위를 가로질러 이어진다(넓은 컷의 아래 테두리).
    const mask = maskOf([
      "###########     ###########",
      "#         #     #         #",
      "#         #     #         #",
      "#         #     #         #",
      "###########################",
    ]);
    const classify = createSeparatorClassifier(mask, whole(mask), "cols", 4);
    expect(classify({ start: 11, end: 16 })).toBe("crossed");
  });

  it("행 묶음은 왼쪽·오른쪽 띠로 판정한다", () => {
    const rowsOpen = [
      "##########",
      "#        #",
      "##########",
      "          ",
      "          ",
      "          ",
      "##########",
      "#        #",
      "##########",
    ];
    const mask = maskOf(rowsOpen);
    const classify = createSeparatorClassifier(mask, whole(mask), "rows", 4);
    expect(classify({ start: 3, end: 6 })).toBe("open");
    // 같은 자리를 양쪽 세로선이 막으면 테두리 속 빈 칸이다.
    const rowsEnclosed = rowsOpen.map((row, y) => (y >= 3 && y < 6 ? `#${row.slice(1, 9)}#` : row));
    const enclosedMask = maskOf(rowsEnclosed);
    expect(createSeparatorClassifier(enclosedMask, whole(enclosedMask), "rows", 4)({ start: 3, end: 6 })).toBe("enclosed");
  });

  it("띠 안에 잡티가 한두 개 있어도 빈 구간이 충분하면 열린 것으로 본다", () => {
    const speckled = TWO_PANELS.map((row, y) => (y === 0 ? `${row.slice(0, 13)}#${row.slice(14)}` : row));
    const mask = maskOf(speckled);
    expect(createSeparatorClassifier(mask, whole(mask), "cols", 4)({ start: 11, end: 16 })).toBe("open");
  });
});

describe("테두리 인식 — 직사각형 판정", () => {
  it("테두리로 막힌 영역과 꽉 찬 그림은 직사각형이다", () => {
    const framed = maskOf(FRAMED);
    expect(isRectangularRegion(framed, whole(framed), 4)).toBe(true);
    const solid = maskOf(Array.from({ length: 6 }, () => "#".repeat(12)));
    expect(isRectangularRegion(solid, whole(solid), 4)).toBe(true);
  });

  it("컷 사이 여백이 낀 영역이나 변 일부만 닿는 덩어리는 직사각형이 아니다", () => {
    const two = maskOf(TWO_PANELS);
    expect(isRectangularRegion(two, whole(two), 4)).toBe(false);
    const blob = maskOf([
      "                ",
      "      ####      ",
      "     ######     ",
      "     ######     ",
      "      ####      ",
      "                ",
    ]);
    expect(isRectangularRegion(blob, whole(blob), 4)).toBe(false);
  });
});

function component(x0: number, y0: number, x1: number, y1: number, area: number): InkComponent {
  return { x0, y0, x1, y1, area };
}

describe("테두리 인식 — 덩어리 분류", () => {
  it("얇은 고리는 테두리, 꽉 찬 덩어리와 두꺼운 띠는 테두리가 아니다", () => {
    // 360×700 상자에 4px 테두리: 면적 ≈ 8,400. 둘레×두께 한도의 75% 는 약 17,000.
    expect(isFrameLikeComponent(component(0, 0, 360, 700, 8_400))).toBe(true);
    expect(isFrameLikeComponent(component(0, 0, 100, 308, 24_000))).toBe(false);
    // 변 폭 80px 의 두꺼운 고리.
    expect(isFrameLikeComponent(component(0, 0, 1120, 1120, 332_800))).toBe(false);
  });

  it("서로 이어지지 않은 컷 후보가 둘 이상이면 합쳐졌을 수 있다고 본다", () => {
    const area = 1_000_000;
    const left = component(0, 0, 480, 800, 300_000);
    const right = component(500, 0, 1000, 800, 300_000);
    expect(hasSeparatePanelCandidates([left, right], area)).toBe(true);
    // 얇은 테두리 고리 둘도 컷 후보다.
    expect(hasSeparatePanelCandidates([component(0, 0, 480, 800, 9_000), component(500, 0, 1000, 800, 9_000)], area)).toBe(true);
  });

  it("다른 후보의 경계 상자 안에 든 덩어리와 작은 조각은 세지 않는다", () => {
    const area = 1_000_000;
    const ring = component(0, 0, 1000, 1000, 12_000);
    const figure = component(300, 200, 600, 800, 120_000);
    expect(hasSeparatePanelCandidates([ring, figure], area)).toBe(false);
    expect(hasSeparatePanelCandidates([figure, component(900, 900, 920, 920, 100)], area)).toBe(false);
    expect(hasSeparatePanelCandidates([], area)).toBe(false);
  });
});

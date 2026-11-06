import { pathBounds } from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import { parseSvgToScene } from "../svg";

function importRect(width: number, height: number, aspectRatio?: string) {
  const attribute = aspectRatio === undefined ? "" : `preserveAspectRatio="${aspectRatio}"`;
  return parseSvgToScene(`<svg width="${width}" height="${height}" viewBox="10 20 100 100" ${attribute}>
    <rect x="10" y="20" width="100" height="100"/>
  </svg>`);
}

function rectBounds(result: ReturnType<typeof parseSvgToScene>) {
  const node = result.scene.nodes[0];
  if (node?.kind !== "fill-path") throw new Error("사각형 채우기 경로가 필요합니다.");
  return pathBounds(node.path);
}

describe("SVG 루트 viewBox 종횡비 보존", () => {
  it("기본값은 정사각형을 늘리지 않고 가로 뷰포트 가운데에 맞춘다", () => {
    const result = importRect(200, 100);
    expect(rectBounds(result)).toEqual({ minX: 50, minY: 0, maxX: 150, maxY: 100 });
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("기본값은 세로 뷰포트에서도 가운데에 맞춘다", () => {
    expect(rectBounds(importRect(100, 200))).toEqual({ minX: 0, minY: 50, maxX: 100, maxY: 150 });
  });

  it.each(["none", "none meet", "none slice"])("%s 만 비균등 확대를 허용한다", (value) => {
    const result = importRect(200, 100, value);
    expect(rectBounds(result)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it.each([
    ["xMinYMin", 0, 0], ["xMidYMin", 50, 0], ["xMaxYMin", 100, 0],
    ["xMinYMid", 0, 50], ["xMidYMid", 50, 50], ["xMaxYMid", 100, 50],
    ["xMinYMax", 0, 100], ["xMidYMax", 50, 100], ["xMaxYMax", 100, 100],
  ] as const)("%s meet 정렬과 양의 viewBox 원점을 보존한다", (align, x, y) => {
    expect(rectBounds(importRect(200, 100, `${align} meet`))).toEqual({
      minX: x, minY: 0, maxX: x + 100, maxY: 100,
    });
    expect(rectBounds(importRect(100, 200, align))).toEqual({
      minX: 0, minY: y, maxX: 100, maxY: y + 100,
    });
  });

  it.each([
    ["xMinYMin", 0, 0], ["xMidYMin", -50, 0], ["xMaxYMin", -100, 0],
    ["xMinYMid", 0, -50], ["xMidYMid", -50, -50], ["xMaxYMid", -100, -50],
    ["xMinYMax", 0, -100], ["xMidYMax", -50, -100], ["xMaxYMax", -100, -100],
  ] as const)("%s slice는 비율을 보존하며 뷰포트를 채운다", (align, x, y) => {
    expect(rectBounds(importRect(200, 100, `${align} slice`))).toEqual({
      minX: 0, minY: y, maxX: 200, maxY: y + 200,
    });
    expect(rectBounds(importRect(100, 200, `${align} slice`))).toEqual({
      minX: x, minY: 0, maxX: x + 200, maxY: 200,
    });
  });

  it.each(["xUnknownYMid", "xMidYMid stretch", "none extra", "xMidYMid meet extra", ""])(
    "잘못된 %s 값은 경고하고 기본 정렬로 복구한다", (value) => {
      const result = importRect(200, 100, value);
      expect(rectBounds(result)).toEqual({ minX: 50, minY: 0, maxX: 150, maxY: 100 });
      expect(result.warnings).toHaveLength(1);
      expect(result.unsupported).toEqual(["attr:preserveAspectRatio"]);
    },
  );

  it("SVG 1.1 defer 접두사와 XML 공백을 허용한다", () => {
    const result = importRect(200, 100, "  defer\t xMaxYMid\n meet  ");
    expect(rectBounds(result)).toEqual({ minX: 100, minY: 0, maxX: 200, maxY: 100 });
    expect(result.warnings).toEqual([]);
  });

  it("viewBox가 없으면 preserveAspectRatio를 적용하지 않는다", () => {
    const result = parseSvgToScene('<svg width="200" height="100" preserveAspectRatio="xMaxYMax slice"><rect width="20" height="10"/></svg>');
    expect(rectBounds(result)).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10 });
    expect(result.warnings).toEqual([]);
  });

  it("중첩 변환과 획 두께에 같은 균등 축척을 적용한다", () => {
    const result = parseSvgToScene('<svg width="200" height="100" viewBox="0 0 100 100"><g transform="translate(10 20)"><path d="M0 0 L10 0" fill="none" stroke="black" stroke-width="4"/></g></svg>');
    const group = result.scene.nodes[0];
    const node = group?.kind === "group" ? group.children[0] : group;
    if (node?.kind !== "stroke-path") throw new Error("획 경로가 필요합니다.");
    expect(node.path.verbs).toEqual([{ v: "M", x: 60, y: 20 }, { v: "L", x: 70, y: 20 }]);
    expect(node.strokeWidth).toBe(4);
  });
});

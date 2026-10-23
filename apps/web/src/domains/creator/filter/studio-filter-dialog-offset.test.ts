// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  clampStudioFilterDialogOffset,
  readAppliedStudioFilterDialogOffset,
} from "./studio-filter-dialog-offset";

describe("필터 창 위치 보정 순수 함수", () => {
  it("화면에 적용된 translate 를 읽고, 속성이 없는 가운데는 0 으로 읽는다", () => {
    const node = document.createElement("section");
    expect(readAppliedStudioFilterDialogOffset(node)).toEqual({ x: 0, y: 0 });

    node.style.translate = "4px -27.6559px";
    expect(readAppliedStudioFilterDialogOffset(node)).toEqual({ x: 4, y: -27.6559 });
  });

  it("기본 자리는 사각형에서 적용된 offset 을 빼서 구하고 위·아래 여백 안으로 넣는다", () => {
    // 568x320 화면, 높이 275 패널의 기본 자리는 top 22.5 — offset 은 -10.5..10.5 안이어야 한다.
    const rect = { top: 22.5 + 204, left: 12, width: 544, height: 275 };
    const clamped = clampStudioFilterDialogOffset(
      { x: 0, y: 204 },
      { x: 0, y: 204 },
      rect,
      { width: 568, height: 320 },
    );
    expect(clamped.x).toBeCloseTo(0);
    expect(clamped.y).toBeCloseTo(10.5);
  });

  it("패널이 화면보다 크면 위쪽 여백에 붙인다", () => {
    const clamped = clampStudioFilterDialogOffset(
      { x: 0, y: -90 },
      { x: 0, y: 0 },
      { top: 0, left: 12, width: 544, height: 400 },
      { width: 568, height: 320 },
    );
    expect(clamped.y).toBe(12);
  });
});

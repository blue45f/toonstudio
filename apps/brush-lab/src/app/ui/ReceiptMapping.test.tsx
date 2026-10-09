// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fakeEnv } from "../../bench/testing/synthetic-images";
import { presetById } from "../../engine/presets/catalog";
import { lineStroke } from "../../engine/testing/synthetic-strokes";
import { createBristlePbdLane } from "../../lanes/physics/bristle-pbd-lane";

import { ReceiptMapping, receiptStringList } from "./ReceiptMapping";

afterEach(cleanup);

describe("ReceiptMapping: 레인 영수증의 옮기지 못한 항목 표시(R-B-2)", () => {
  it("receiptStringList는 문자열 배열만 꺼내고 모양이 다르면 빈 배열이다", () => {
    expect(receiptStringList({ unmappedKo: ["a", 1, "b"] }, "unmappedKo")).toEqual(["a", "b"]);
    expect(receiptStringList({ unmappedKo: "a" }, "unmappedKo")).toEqual([]);
    expect(receiptStringList(null, "mappedKo")).toEqual([]);
    expect(receiptStringList(undefined, "notesKo")).toEqual([]);
  });

  it("영수증에 unmappedKo·mappedKo가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<ReceiptMapping receipt={{ dabCount: 3 }} />);
    expect(container.innerHTML).toBe("");
    cleanup();
    const none = render(<ReceiptMapping receipt={undefined} />);
    expect(none.container.innerHTML).toBe("");
  });

  it("옮기지 못한 항목과 옮긴 항목을 한글 요약과 함께 보인다", () => {
    render(<ReceiptMapping receipt={{ unmappedKo: ["산포", "테이퍼"], mappedKo: ["팁 지름"] }} />);
    expect(screen.getByTestId("lab-draw-hud-unmapped").textContent).toContain("옮기지 못한 항목 2건");
    expect(screen.getByTestId("lab-draw-hud-unmapped").textContent).toContain("산포");
    expect(screen.getByTestId("lab-draw-hud-mapped").textContent).toContain("팁 지름");
  });

  it("실제 붓털 레인 영수증(에어브러시 근사)의 unmappedKo가 모델 이름과 함께 화면에 나온다", async () => {
    const lane = createBristlePbdLane({ bristles: 8 });
    await lane.init(fakeEnv(), { width: 128, height: 128, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(presetById("airbrush"), 1);
    lane.addSamples(lineStroke(24, 40, 100, 46, 0.7, { durationMs: 200 }));
    const receipt = await lane.endStroke();
    lane.dispose();
    render(<ReceiptMapping receipt={receipt} />);
    expect(screen.getByTestId("lab-draw-hud-unmapped").textContent).toContain("airbrush");
    expect(screen.getByTestId("lab-draw-hud-unmapped").textContent).toContain("종이 그레인");
  });
});

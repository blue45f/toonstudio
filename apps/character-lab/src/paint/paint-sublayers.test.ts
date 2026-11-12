import { describe, expect, it } from "vitest";

import { readPixel } from "./paint-layer";
import { createPaintSession } from "./paint-session";
import { PAINT_SUBLAYER_INDICES, createPartSublayerStack, recompositePartSublayers } from "./paint-sublayers";

describe("paint-sublayers (SHAPER Layer 0 ~ Layer 5)", () => {
  it("6개의 서브레이어 슬롯(0..5)을 생성하고 순서대로 선형 색공간 source-over 합성한다", () => {
    expect(PAINT_SUBLAYER_INDICES).toEqual([0, 1, 2, 3, 4, 5]);
    const session = createPaintSession({
      layerSize: 64,
      activePart: "head",
      brush: { radiusPx: 6, hardness: 1, opacity: 1, color: "#112233" },
    });

    // Layer 0에 어두운 선화 칠하기
    session.setActiveSublayer(0);
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    const l0Token = session.endStroke();
    expect(l0Token?.tiles.length).toBe(1);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    // Layer 1에 밝은 볼터치(#ff3366) 덧칠하기
    session.setActiveSublayer(1);
    session.setBrush({ color: "#ff3366", opacity: 1, hardness: 1 });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    const l1Token = session.endStroke();
    expect(l1Token).not.toBeNull();
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);

    // Layer 1만 숨기면 Layer 0의 선화가 손상 없이 그대로 복원된다
    session.setSublayerVisible("head", 1, false);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    // 다시 켜고 불투명도를 50%로 낮추면 두 레이어가 자연스럽게 혼합된다
    session.setSublayerVisible("head", 1, true);
    session.setSublayerOpacity("head", 1, 0.5);
    const blended = readPixel(session.layer("head"), 32, 32);
    expect(blended[0]).toBeGreaterThan(100);
    expect(blended[0]).toBeLessThan(255);
    expect(blended[3]).toBe(255);

    // Layer 1 스트로크만 Undo하면 Layer 0 선화만 남고, Redo하면 다시 합성된다
    session.setSublayerOpacity("head", 1, 1);
    const redoToken = l1Token ? session.applyToken(l1Token) : null;
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
    if (redoToken) session.applyToken(redoToken);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);
  });

  it("clearSublayer는 선택한 서브레이어만 비우고 다른 서브레이어 데이터는 유지하며 Undo로 복원된다", () => {
    const session = createPaintSession({
      layerSize: 64,
      activePart: "skin",
      brush: { radiusPx: 5, hardness: 1, opacity: 1, color: "#224488" },
    });
    session.setActiveSublayer(0);
    session.beginStroke({ u: 0.25, v: 0.25, pressure: 1 });
    session.endStroke();

    session.setActiveSublayer(2);
    session.setBrush({ color: "#ee4422" });
    session.beginStroke({ u: 0.75, v: 0.75, pressure: 1 });
    session.endStroke();

    expect(readPixel(session.layer("skin"), 16, 16)[3]).toBe(255);
    expect(readPixel(session.layer("skin"), 48, 48)[3]).toBe(255);

    const clearToken = session.clearSublayer("skin", 2);
    expect(clearToken).not.toBeNull();
    expect(readPixel(session.layer("skin"), 16, 16)[3]).toBe(255);
    expect(readPixel(session.layer("skin"), 48, 48)[3]).toBe(0);

    if (clearToken) session.applyToken(clearToken);
    expect(readPixel(session.layer("skin"), 48, 48)[3]).toBe(255);
  });

  it("recompositePartSublayers는 크기나 부위가 다른 타깃에 대해 명시적 예외를 던진다", () => {
    const stack = createPartSublayerStack("head", 32, 32);
    const mismatchSession = createPaintSession({ layerSize: 16 });
    expect(() => recompositePartSublayers(stack, mismatchSession.layer("head"))).toThrow(/일치하지 않습니다/u);
  });
});

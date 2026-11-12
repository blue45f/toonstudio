import { describe, expect, it } from "vitest";

import { DEFAULT_BRUSH } from "../contracts";

import { applyUndoToken, createPaintLayer, eraseDab, isPaintLayerEmpty, mirrorDabHorizontal, readPixel, stampDab } from "./paint-layer";
import { createPaintSession } from "./paint-session";
import { createStrokeSession } from "./stroke-session";
import { WEBTOON_DECAL_SPECS, evaluateWebtoonDecalAlpha, isWebtoonDecalId, stampWebtoonDecal } from "./webtoon-decals";

describe("paint: 지우개·좌우 대칭·웹툰 디테일 스탬프", () => {
  it("mirrorDabHorizontal은 U 좌표를 1 - u로 대칭 반전하고 V·필압을 보존한다", () => {
    expect(mirrorDabHorizontal({ u: 0.25, v: 0.4, pressure: 0.8 })).toEqual({ u: 0.75, v: 0.4, pressure: 0.8 });
    expect(mirrorDabHorizontal({ u: 0.5, v: 0.2, pressure: 1 })).toEqual({ u: 0.5, v: 0.2, pressure: 1 });
  });

  it("eraseDab은 칠해진 픽셀 알파를 감쇠시키고 undo 토큰으로 정확히 복원하며 빈 레이어에서는 빈 토큰을 반환한다", () => {
    const layer = createPaintLayer("skin", 64, 64);
    const emptyErase = eraseDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...DEFAULT_BRUSH, radiusPx: 6, opacity: 1, hardness: 1 });
    expect(emptyErase.tiles).toEqual([]);
    expect(layer.revision).toBe(0);

    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...DEFAULT_BRUSH, color: "#ff3366", radiusPx: 6, opacity: 1, hardness: 1 });
    expect(readPixel(layer, 32, 32)[3]).toBe(255);

    const eraseToken = eraseDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...DEFAULT_BRUSH, radiusPx: 8, opacity: 1, hardness: 1 });
    expect(eraseToken.tiles.length).toBeGreaterThan(0);
    expect(readPixel(layer, 32, 32)).toEqual([0, 0, 0, 0]);

    applyUndoToken(layer, eraseToken);
    expect(readPixel(layer, 32, 32)[3]).toBe(255);
  });

  it("createStrokeSession은 symmetry=true에서 좌우 양쪽에 칠하고 toolMode='eraser'에서 양쪽을 함께 지운다", () => {
    const layer = createPaintLayer("head", 64, 64);
    const brush = { ...DEFAULT_BRUSH, color: "#ee6b7a", radiusPx: 4, opacity: 1, hardness: 1 };
    const stroke = createStrokeSession(layer, brush, { symmetry: true, toolMode: "brush", wrap: false });
    stroke.begin({ u: 0.25, v: 0.5, pressure: 1 });
    const paintToken = stroke.end();

    expect(paintToken.tiles.length).toBeGreaterThanOrEqual(1);
    expect(readPixel(layer, 16, 32)[3]).toBe(255);
    expect(readPixel(layer, 48, 32)[3]).toBe(255);

    const eraser = createStrokeSession(layer, { ...brush, radiusPx: 6 }, { symmetry: true, toolMode: "eraser", wrap: false });
    eraser.begin({ u: 0.25, v: 0.5, pressure: 1 });
    const eraseToken = eraser.end();

    expect(isPaintLayerEmpty(layer)).toBe(true);
    applyUndoToken(layer, eraseToken);
    expect(readPixel(layer, 16, 32)[3]).toBe(255);
    expect(readPixel(layer, 48, 32)[3]).toBe(255);
  });

  it("WEBTOON_DECAL_SPECS 4종 모두 유효한 알파 마스크와 대칭 스탬프·undo를 생성한다", () => {
    expect(WEBTOON_DECAL_SPECS).toHaveLength(4);
    for (const spec of WEBTOON_DECAL_SPECS) {
      expect(isWebtoonDecalId(spec.id)).toBe(true);
      expect(evaluateWebtoonDecalAlpha(spec.id, 0, 0)).toBeGreaterThan(0);
      expect(evaluateWebtoonDecalAlpha(spec.id, 2, 2)).toBe(0);
    }
    expect(isWebtoonDecalId("unknown")).toBe(false);

    const session = createPaintSession({ layerSize: 128, activePart: "head", symmetry: true });
    const token = session.stampDecal("blush-slash", { uv: [0.3, 0.4], scalePx: 16 });
    expect(token).not.toBeNull();
    const layer = session.layer("head");
    expect(readPixel(layer, Math.floor(0.3 * 128), Math.floor(0.4 * 128))[3]).toBeGreaterThan(0);
    expect(readPixel(layer, Math.floor(0.7 * 128), Math.floor(0.4 * 128))[3]).toBeGreaterThan(0);

    if (token) session.applyToken(token);
    expect(isPaintLayerEmpty(layer)).toBe(true);
  });
});

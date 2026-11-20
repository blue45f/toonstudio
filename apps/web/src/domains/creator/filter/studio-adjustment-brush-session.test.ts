import { describe, expect, it } from "vitest";

import {
  STUDIO_ADJUSTMENT_BRUSH_PRESETS,
  beginAdjustmentBrushStroke,
  commitAdjustmentBrushStroke,
  evaluateAdjustmentBrushPreview,
  invertAdjustmentBrushMask,
  moveAdjustmentBrushStroke,
  updateAdjustmentBrushOpacity,
  updateAdjustmentBrushParameters,
} from "./studio-adjustment-brush-session";

function makeUniformGrayImage(
  width: number,
  height: number,
  gray = 110,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("studio-adjustment-brush-session", () => {
  it("긋는 즉시 1급 조정 레이어와 반전(0 숨김) 마스크를 자동 생성하고 칠한 자리만 비파괴 밝기 적용한다", () => {
    const width = 48;
    const height = 48;
    const source = makeUniformGrayImage(width, height, 100);

    let session = beginAdjustmentBrushStroke({
      presetId: "exposure-brighten",
      canvasWidth: width,
      canvasHeight: height,
      startPoint: { x: 24, y: 24, pressure01: 1 },
      tip: { radiusPx: 8, hardness01: 0.6, flow01: 1, mode: "add" },
      clipToBelow: true,
    });

    expect(session.autoCreatedMaskInverted).toBe(true);
    expect(session.adjustmentElement.type).toBe("adjustment");
    expect(session.adjustmentElement.adjustment).toBe("exposure");
    expect(session.adjustmentElement.clipToBelow).toBe(true);
    expect(session.mask.data[0]).toBe(0); // 칠하지 않은 좌상단은 숨김(0)
    expect(session.mask.data[24 * width + 24]).toBe(255); // 브러시 중심은 255

    // 오른쪽으로 드래그 보간 후 커밋
    session = moveAdjustmentBrushStroke(session, { x: 34, y: 24, pressure01: 1 });
    session = commitAdjustmentBrushStroke(session);
    expect(session.phase).toBe("committed");
    expect(session.dabCount).toBeGreaterThan(2);
    expect(session.mask.data[24 * width + 29]).toBeGreaterThan(200);

    const preview = evaluateAdjustmentBrushPreview(source, session);
    expect(preview.applied).toBe(true);
    // 원본 버퍼 불변
    expect(source.data[(24 * width + 24) * 4]).toBe(100);
    // 칠한 중앙 픽셀은 노출+로 밝아짐
    expect(preview.imageData.data[(24 * width + 24) * 4]!).toBeGreaterThan(135);
    // 칠하지 않은 좌상단(0,0)은 원본(100)과 완전히 동일
    expect(preview.imageData.data[0]).toBe(100);
  });

  it("지우기 모드(subtract), 사후 파라미터/불투명도 수정, 마스크 반전이 비파괴로 동작한다", () => {
    const width = 32;
    const height = 32;
    const source = makeUniformGrayImage(width, height, 120);

    let session = beginAdjustmentBrushStroke({
      presetId: "contrast-punch",
      canvasWidth: width,
      canvasHeight: height,
      startPoint: { x: 16, y: 16 },
      tip: { radiusPx: 6, hardness01: 1, flow01: 1, mode: "add" },
    });
    session = commitAdjustmentBrushStroke(session);
    expect(session.mask.data[16 * width + 16]).toBe(255);

    // 같은 세션에서 지우기(subtract) 획을 그어 중앙 마스크를 다시 숨긴다
    const erased = beginAdjustmentBrushStroke({
      presetId: "contrast-punch",
      canvasWidth: width,
      canvasHeight: height,
      startPoint: { x: 16, y: 16 },
      tip: { radiusPx: 4, hardness01: 1, flow01: 1, mode: "subtract" },
      existingSession: session,
    });
    expect(erased.adjustmentElement.id).toBe(session.adjustmentElement.id);
    expect(erased.strokeCount).toBe(2);
    expect(erased.mask.data[16 * width + 16]).toBe(0);

    // 사후 파라미터 재조정 & 불투명도 50% 적용
    const tweaked = updateAdjustmentBrushOpacity(
      updateAdjustmentBrushParameters(session, { brightness: 45, contrast: 40 }),
      0.5,
    );
    expect(tweaked.adjustmentElement.opacity).toBe(0.5);
    expect(tweaked.adjustmentElement.parameters.brightness).toBe(45);

    const previewTweaked = evaluateAdjustmentBrushPreview(source, tweaked);
    expect(previewTweaked.applied).toBe(true);
    expect(previewTweaked.imageData.data[(16 * width + 16) * 4]!).toBeGreaterThan(120);

    // 마스크 반전 시 칠하지 않았던 (0,0)이 255, 중앙(16,16)이 0이 된다
    const inverted = invertAdjustmentBrushMask(session);
    expect(inverted.mask.data[0]).toBe(255);
    expect(inverted.mask.data[16 * width + 16]).toBe(0);
  });

  it("모든 기본 조정 브러시 프리셋 8종이 유효한 조정 실행기로 동작한다", () => {
    const source = {
      width: 16,
      height: 16,
      data: new Uint8ClampedArray(16 * 16 * 4),
    };
    for (let i = 0; i < source.data.length; i += 4) {
      source.data[i] = 140;
      source.data[i + 1] = 110;
      source.data[i + 2] = 90;
      source.data[i + 3] = 255;
    }

    for (const preset of STUDIO_ADJUSTMENT_BRUSH_PRESETS) {
      const session = beginAdjustmentBrushStroke({
        presetId: preset.id,
        canvasWidth: 16,
        canvasHeight: 16,
        startPoint: { x: 8, y: 8 },
        tip: { radiusPx: 5, hardness01: 1, flow01: 1, mode: "add" },
      });
      const res = evaluateAdjustmentBrushPreview(source, session);
      expect(res.applied).toBe(true);
    }
  });
});

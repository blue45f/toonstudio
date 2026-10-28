import { describe, expect, it } from "vitest";

import { studioUvClientPoint, studioUvHitTest, studioUvTransformRequest, studioUvViewBox } from "./studio-hybrid-dcc-uv-editor-session";
import { deriveStudioHybridDccUvEditorModel, workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";

describe("UV 화면의 좌표·입력·선택 규칙", () => {
  it("V가 위로 향하며 비정사각형 화면의 letterbox를 선택에서 제외한다", () => {
    const view = { x: 0, y: -1, size: 1 };
    const rect = { left: 10, top: 20, width: 400, height: 200 };
    expect(studioUvClientPoint(view, rect, 130, 180)).toEqual({ u: 0.1, v: 0.19999999999999996 });
    expect(studioUvClientPoint(view, rect, 20, 120)).toBeNull();
    expect(studioUvClientPoint(view, { ...rect, width: 0 }, 10, 20)).toBeNull();
    const fitted = studioUvViewBox([{ halfEdgeId: 0, u: -3, v: 5 }]);
    expect(fitted.x).toBeLessThanOrEqual(-3);
    expect(fitted.y).toBeLessThanOrEqual(-5);
    expect(fitted.x + fitted.size).toBeGreaterThanOrEqual(1);
  });

  it("도 입력을 라디안으로 바꾸며 0·음수 배율과 타일 밖 이동을 허용한다", () => {
    expect(studioUvTransformRequest("rotate", { u: "0", v: "0", angle: "90" })).toEqual({ kind: "rotate", angleRad: Math.PI / 2 });
    expect(studioUvTransformRequest("scale", { u: "0", v: "-2", angle: "0" })).toEqual({ kind: "scale", value: { x: 0, y: -2 } });
    expect(studioUvTransformRequest("translate", { u: "-4", v: "2.5", angle: "0" })).toEqual({ kind: "translate", value: { x: -4, y: 2.5 } });
    expect(studioUvTransformRequest("translate", { u: "", v: "0", angle: "0" })).toBeNull();
    expect(studioUvTransformRequest("rotate", { u: "0", v: "0", angle: "1e999" })).toBeNull();
  });

  it("정본 면 코너와 실제 폴리곤을 선택하며 타일 빈 공간은 선택하지 않는다", () => {
    const model = deriveStudioHybridDccUvEditorModel(workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-hit"), "cube")));
    if (!model) throw new Error("UV 모델이 없습니다.");
    const first = model.islands[0]; const corner = model.corners[0];
    if (!first || !corner) throw new Error("UV 선택 대상이 없습니다.");
    expect(studioUvHitTest(model, "corner", corner.u, corner.v, 0.001)).toBe(corner.halfEdgeId);
    expect(studioUvHitTest(model, "island", (first.bounds.minU + first.bounds.maxU) / 2, (first.bounds.minV + first.bounds.maxV) / 2, 0.001)).toBe(first.id);
    expect(studioUvHitTest(model, "island", 12, -12, 0.01)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { createStudioHybridDccDefaultToonMaterial, normalizeStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { studioToonEditorFields, studioToonEditorRequest, studioToonEditorWidthMode } from "./studio-hybrid-dcc-toon-editor-session";

describe("툰 재질 화면 단위와 저장 값", () => {
  it.each([0, .003, Math.PI / 7, Math.PI, 1e-25, 1e30])("화면 비율 % 표시만으로 원본 폭 %s를 변경하지 않는다", (width) => {
    const original = normalizeStudioHybridDccToonMaterial({ ...createStudioHybridDccDefaultToonMaterial(), outline: { enabled: true, mode: "screenCoordinates", width, colorSrgb: "#010203" } });
    const fields = studioToonEditorFields(original);
    expect(studioToonEditorRequest(fields)).toEqual(original);
    expect(studioToonEditorRequest({ ...fields, shade: "#ffaa99" }).outline.width).toBe(width);
    const switched = studioToonEditorWidthMode(studioToonEditorWidthMode(fields, "worldCoordinates"), "screenCoordinates");
    expect(studioToonEditorRequest(switched)).toEqual(original);
  });
  it("사용자가 입력한 1.5%는 SDK factor .03으로 저장하며 입력을 원래 수치로 되돌릴 수 있다", () => {
    const material = normalizeStudioHybridDccToonMaterial({ ...createStudioHybridDccDefaultToonMaterial(), outline: { enabled: true, mode: "screenCoordinates", width: .003, colorSrgb: "#000000" } });
    const fields = studioToonEditorFields(material);
    expect(studioToonEditorRequest({ ...fields, width: "1.5" }).outline.width).toBe(.03);
    expect(studioToonEditorRequest({ ...fields, width: fields.width })).toEqual(material);
    expect(() => studioToonEditorRequest({ ...fields, width: "" })).toThrow();
    expect(() => studioToonEditorRequest({ ...fields, width: "NaN" })).toThrow();
    expect(() => studioToonEditorRequest({ ...fields, width: "-1" })).toThrow();
  });
});

import { describe, expect, it } from "vitest";

import { studioVrmExportErrorMessage } from "./studio-vrm-export-error";
import { buildStudioVrmExportLookAt, type StudioVrmExportLookAt } from "./studio-vrm-export-look-at";

const RANGE = { inputMaxValue: 90, outputScale: 1 } as const;

function lookAt(overrides: Partial<StudioVrmExportLookAt> = {}): StudioVrmExportLookAt {
  return {
    type: "expression",
    offsetFromHeadBone: [0, 0.07, 0.05],
    rangeMapHorizontalInner: RANGE,
    rangeMapHorizontalOuter: RANGE,
    rangeMapVerticalDown: RANGE,
    rangeMapVerticalUp: RANGE,
    ...overrides,
  };
}

const LOOK_PRESETS = { lookUp: {}, lookDown: {}, lookLeft: {}, lookRight: {} };
const INVALID = studioVrmExportErrorMessage("look-at-invalid");

describe("buildStudioVrmExportLookAt", () => {
  it("omits the key when no look-at is given", () => {
    expect(buildStudioVrmExportLookAt(undefined, { humanoidBones: {} })).toBeUndefined();
  });

  it("writes an expression look-at with every range map", () => {
    expect(buildStudioVrmExportLookAt(lookAt(), { humanoidBones: {}, expressions: { preset: LOOK_PRESETS } })).toEqual({
      type: "expression",
      offsetFromHeadBone: [0, 0.07, 0.05],
      rangeMapHorizontalInner: RANGE,
      rangeMapHorizontalOuter: RANGE,
      rangeMapVerticalDown: RANGE,
      rangeMapVerticalUp: RANGE,
    });
  });

  it("refuses an expression look-at without the four gaze expressions", () => {
    const { lookLeft: _lookLeft, ...threePresets } = LOOK_PRESETS;
    expect(() => buildStudioVrmExportLookAt(lookAt(), { humanoidBones: {}, expressions: { preset: threePresets } }))
      .toThrow(INVALID);
  });

  it("requires both eye bones for a bone look-at and allows degree outputs", () => {
    const bone = lookAt({ type: "bone", rangeMapHorizontalOuter: { inputMaxValue: 90, outputScale: 12 } });
    expect(() => buildStudioVrmExportLookAt(bone, { humanoidBones: { leftEye: 3 } })).toThrow(INVALID);
    expect(buildStudioVrmExportLookAt(bone, { humanoidBones: { leftEye: 3, rightEye: 4 } }))
      .toMatchObject({ type: "bone", rangeMapHorizontalOuter: { inputMaxValue: 90, outputScale: 12 } });
  });

  it("rejects values the loader would silently change or that cannot be a gaze", () => {
    const context = { humanoidBones: {}, expressions: { preset: LOOK_PRESETS } };
    for (const bad of [
      lookAt({ rangeMapVerticalUp: { inputMaxValue: 0.001, outputScale: 1 } }),
      lookAt({ rangeMapVerticalUp: { inputMaxValue: 90, outputScale: 1.5 } }),
      lookAt({ rangeMapVerticalUp: { inputMaxValue: Number.NaN, outputScale: 1 } }),
      lookAt({ offsetFromHeadBone: [0, 2, 0] }),
      lookAt({ type: "eyes" as StudioVrmExportLookAt["type"] }),
    ]) {
      expect(() => buildStudioVrmExportLookAt(bad, context)).toThrow(INVALID);
    }
  });
});

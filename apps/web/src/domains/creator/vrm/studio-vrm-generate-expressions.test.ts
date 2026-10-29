import { describe, expect, it } from "vitest";

import {
  addStudioVrmCustomExpression,
  countStudioVrmEditedExpressions,
  isStudioVrmCustomExpressionName,
  removeStudioVrmCustomExpression,
  resetStudioVrmPresetExpression,
  resolveStudioVrmFaceMorphs,
  sanitizeStudioVrmExpressionAuthoring,
  setStudioVrmCustomExpressionEyeSide,
  setStudioVrmCustomExpressionParam,
  setStudioVrmPresetExpressionParam,
  STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES,
  STUDIO_VRM_DEFAULT_FACE_MORPHS,
  STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS,
  strongerStudioVrmBlinkOverride,
  studioVrmCustomExpressionLabel,
  studioVrmExpressionOverridePolicy,
  type StudioVrmExpressionAuthoring,
  type StudioVrmFaceMorph,
} from "./studio-vrm-generate-expressions";
import { STUDIO_VRM_EXPORT_EXPRESSION_PRESETS } from "./studio-vrm-export-vrm-extension";
import { STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES } from "./studio-vrm-humanoid-mesh";

function morphNamed(morphs: readonly StudioVrmFaceMorph[], name: string): StudioVrmFaceMorph {
  const found = morphs.find((morph) => morph.name === name);
  if (!found) throw new Error(`missing morph ${name}`);
  return found;
}

describe("default expression table", () => {
  it("keeps the generator's morph target names and VRM preset vocabulary", () => {
    expect(STUDIO_VRM_DEFAULT_FACE_MORPHS.map((morph) => morph.name)).toEqual([
      ...STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES,
    ]);
    for (const morph of STUDIO_VRM_DEFAULT_FACE_MORPHS) {
      expect(STUDIO_VRM_EXPORT_EXPRESSION_PRESETS).toContain(morph.name);
    }
  });

  it("returns the default table itself when nothing was edited", () => {
    expect(resolveStudioVrmFaceMorphs(undefined)).toBe(STUDIO_VRM_DEFAULT_FACE_MORPHS);
    expect(resolveStudioVrmFaceMorphs({})).toBe(STUDIO_VRM_DEFAULT_FACE_MORPHS);
    // 조정하지 않은 커스텀 표정은 내보낼 모프가 없으므로 기본 테이블과 같다.
    expect(
      resolveStudioVrmFaceMorphs({ custom: [{ name: "mine", template: "mine", delta: {} }] }),
    ).toBe(STUDIO_VRM_DEFAULT_FACE_MORPHS);
  });

  it("never offers a template key that collides with a VRM preset", () => {
    for (const template of STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES) {
      expect(STUDIO_VRM_EXPORT_EXPRESSION_PRESETS).not.toContain(template.id);
      expect(isStudioVrmCustomExpressionName(template.id)).toBe(true);
    }
    expect(isStudioVrmCustomExpressionName("happy")).toBe(false);
    expect(isStudioVrmCustomExpressionName("neutral")).toBe(false);
  });
});

describe("sanitizeStudioVrmExpressionAuthoring", () => {
  it("clamps, rounds and drops zero or unknown values", () => {
    const sanitized = sanitizeStudioVrmExpressionAuthoring({
      presets: {
        happy: { mouthCurve: 0.42345, eyeClose: 9, browRaise: 0, bogus: 1 },
        blink: { eyeClose: 1 },
        angry: { browAngle: Number.NaN },
      },
    });
    expect(sanitized).toEqual({ presets: { happy: { mouthCurve: 0.423, eyeClose: 1 } } });
  });

  it("lets mouth-shape presets move only the mouth", () => {
    const sanitized = sanitizeStudioVrmExpressionAuthoring({
      presets: { aa: { mouthOpen: 0.5, eyeClose: 0.5, browRaise: 0.5 } },
    });
    expect(sanitized).toEqual({ presets: { aa: { mouthOpen: 0.5 } } });
  });

  it("accepts only template keys for custom expressions and derives the template from the key", () => {
    const sanitized = sanitizeStudioVrmExpressionAuthoring({
      custom: [
        { name: "wink", template: "laugh", delta: { eyeClose: 1 }, eyeSide: "left" },
        { name: "wink", delta: { eyeClose: 0.5 } },
        { name: "happy", delta: { eyeClose: 0.5 } },
        { name: "Wink", delta: {} },
        { name: "unknown", delta: {} },
        { name: "wink_2", delta: { mouthOpen: 0.3 }, eyeSide: "up" },
      ],
    });
    expect(sanitized?.custom).toEqual([
      { name: "wink", template: "wink", delta: { eyeClose: 1 }, eyeSide: "left" },
      { name: "wink_2", template: "wink", delta: { mouthOpen: 0.3 } },
    ]);
  });

  it("returns undefined for empty or malformed input so the forge state stays key-free", () => {
    expect(sanitizeStudioVrmExpressionAuthoring(undefined)).toBeUndefined();
    expect(sanitizeStudioVrmExpressionAuthoring([])).toBeUndefined();
    expect(sanitizeStudioVrmExpressionAuthoring({ presets: { happy: { mouthCurve: 0 } } })).toBeUndefined();
  });

  it("caps the number of custom expressions", () => {
    const custom = Array.from({ length: STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS + 4 }, (_unused, index) => ({
      name: index === 0 ? "mine" : `mine_${index + 1}`,
      delta: { mouthOpen: 0.1 },
    }));
    expect(sanitizeStudioVrmExpressionAuthoring({ custom })?.custom).toHaveLength(
      STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS,
    );
  });
});

describe("resolveStudioVrmFaceMorphs", () => {
  it("adjusts only the patches a preset edit touches", () => {
    const morphs = resolveStudioVrmFaceMorphs({ presets: { happy: { mouthCurve: 0.5 } } });
    const happy = morphNamed(morphs, "happy");
    const original = morphNamed(STUDIO_VRM_DEFAULT_FACE_MORPHS, "happy");
    expect(happy.ops.mouth).toEqual({ scaleX: 1.5, scaleY: 1.5, bow: -0.006 - 0.004 });
    expect(happy.ops.eye).toEqual(original.ops.eye);
    expect(happy.ops.brow).toEqual(original.ops.brow);
    // 편집하지 않은 표정은 같은 객체를 그대로 쓴다.
    expect(morphNamed(morphs, "angry")).toBe(morphNamed(STUDIO_VRM_DEFAULT_FACE_MORPHS, "angry"));
  });

  it("keeps the centre anchor of presets that already narrow the eye", () => {
    const angry = morphNamed(resolveStudioVrmFaceMorphs({ presets: { angry: { eyeClose: 0.5 } } }), "angry");
    expect(angry.ops.eye?.collapse).toBeUndefined();
    expect(angry.ops.eye?.scaleY).toBeCloseTo(0.82 + (0.06 - 0.82) * 0.5, 9);
    // 윗눈꺼풀 선은 줄어든 만큼 따라 내려온다.
    expect(angry.ops.eyeline?.offsetHeadY).toBeLessThan(-0.03);

    const happy = morphNamed(resolveStudioVrmFaceMorphs({ presets: { happy: { eyeClose: -1 } } }), "happy");
    expect(happy.ops.eye).toMatchObject({ collapse: "bottom", scaleY: 1 });
    expect(happy.ops.eyeline?.offsetHeadY).toBeCloseTo(-0.26 + 0.383 * 0.7, 9);
  });

  it("closes neutral-based custom eyes from the top lid and scales irises from their centre", () => {
    const morphs = resolveStudioVrmFaceMorphs({
      custom: [
        { name: "sleepy", template: "sleepy", delta: { eyeClose: 0.5 } },
        { name: "mine", template: "mine", delta: { irisSize: 0.5 } },
      ],
    });
    expect(morphNamed(morphs, "sleepy").ops.eye).toMatchObject({ collapse: "bottom" });
    const mine = morphNamed(morphs, "mine");
    expect(mine.ops.eye).toBeUndefined();
    expect(mine.ops.iris?.collapse).toBeUndefined();
    expect(mine.ops.iris?.scaleX).toBeCloseTo(1.3 ** 0.5, 9);
    expect(mine.ops.glint?.scaleY).toBeCloseTo(1.3 ** 0.5, 9);
  });

  it("restricts only the eye patches of a wink to one side", () => {
    const wink = morphNamed(
      resolveStudioVrmFaceMorphs({
        custom: [{ name: "wink", template: "wink", delta: { eyeClose: 1, mouthCurve: 0.5 }, eyeSide: "left" }],
      }),
      "wink",
    );
    expect(wink.side).toBeUndefined();
    expect(wink.patchSides).toEqual({ eye: "left", iris: "left", glint: "left", eyeline: "left" });
    expect(wink.ops.mouth?.bow).toBeCloseTo(-0.004, 9);
  });

  it("appends custom morphs after the preset table in authoring order", () => {
    const names = resolveStudioVrmFaceMorphs({
      custom: [
        { name: "shock", template: "shock", delta: { eyeWiden: 1 } },
        { name: "pout", template: "pout", delta: { mouthWidth: -0.5 } },
      ],
    }).map((morph) => morph.name);
    expect(names).toEqual([...STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES, "shock", "pout"]);
  });
});

describe("expression override policy", () => {
  it("blocks blinking for strong eye shapes and blends for subtle ones", () => {
    expect(studioVrmExpressionOverridePolicy({ eyeWiden: 1, mouthOpen: 0.5 })).toEqual({
      overrideBlink: "block",
      overrideMouth: "blend",
    });
    expect(studioVrmExpressionOverridePolicy({ eyeClose: 0.15 })).toEqual({ overrideBlink: "blend" });
    expect(studioVrmExpressionOverridePolicy({ browRaise: 1 })).toEqual({});
  });

  it("keeps the stronger of two blink overrides", () => {
    expect(strongerStudioVrmBlinkOverride("blend", "block")).toBe("block");
    expect(strongerStudioVrmBlinkOverride(undefined, "blend")).toBe("blend");
    expect(strongerStudioVrmBlinkOverride(undefined, undefined)).toBeUndefined();
  });
});

describe("expression editing helpers", () => {
  it("sets, resets and counts preset edits", () => {
    let authoring: StudioVrmExpressionAuthoring | undefined = setStudioVrmPresetExpressionParam(
      undefined,
      "sad",
      "browAngle",
      -0.5,
    );
    expect(authoring).toEqual({ presets: { sad: { browAngle: -0.5 } } });
    expect(countStudioVrmEditedExpressions(authoring)).toBe(1);
    authoring = setStudioVrmPresetExpressionParam(authoring, "sad", "browAngle", 0);
    expect(authoring).toBeUndefined();
    authoring = setStudioVrmPresetExpressionParam(undefined, "oh", "mouthOpen", 0.3);
    expect(resetStudioVrmPresetExpression(authoring, "oh")).toBeUndefined();
  });

  it("names repeated templates with a suffix and copies the template delta", () => {
    const first = addStudioVrmCustomExpression(undefined, "wink");
    const second = addStudioVrmCustomExpression(first.authoring, "wink");
    expect(first.name).toBe("wink");
    expect(second.name).toBe("wink_2");
    expect(second.authoring?.custom?.[0]).toMatchObject({ name: "wink", eyeSide: "left", delta: { eyeClose: 1 } });
    expect(studioVrmCustomExpressionLabel("wink_2")).toBe("윙크 2");
    expect(studioVrmCustomExpressionLabel("happy")).toBeNull();

    const edited = setStudioVrmCustomExpressionParam(second.authoring, "wink_2", "eyeClose", 0.5);
    expect(edited?.custom?.[1]?.delta.eyeClose).toBe(0.5);
    const bothEyes = setStudioVrmCustomExpressionEyeSide(edited, "wink_2", "both");
    expect(bothEyes?.custom?.[1]?.eyeSide).toBeUndefined();
    const removed = removeStudioVrmCustomExpression(bothEyes, "wink");
    expect(removed?.custom?.map((entry) => entry.name)).toEqual(["wink_2"]);
  });

  it("refuses to add beyond the limit without changing the state", () => {
    let authoring: StudioVrmExpressionAuthoring | undefined;
    for (let index = 0; index < STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS; index += 1) {
      authoring = addStudioVrmCustomExpression(authoring, "laugh").authoring;
    }
    const overflow = addStudioVrmCustomExpression(authoring, "smug");
    expect(overflow.name).toBeNull();
    expect(overflow.authoring?.custom).toHaveLength(STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS);
  });
});

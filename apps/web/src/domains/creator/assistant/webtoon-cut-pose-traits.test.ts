import { describe, expect, it } from "vitest";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import { CUT_POSE_TRAITS } from "./webtoon-cut-pose-traits";
import { CUT_CAMERA_ANGLE_ORDER, CUT_EMOTION_ORDER } from "./webtoon-cut-vocabulary";

const CATALOG_IDS = [...NATURAL_IDLE_POSES, ...EXTRA_POSE_PRESETS].map((preset) => preset.id);

describe("CUT_POSE_TRAITS vs the real pose preset catalog", () => {
  it("has a trait row for every shipped pose preset, so no pose is silently unrankable", () => {
    const missing = CATALOG_IDS.filter((id) => !Object.hasOwn(CUT_POSE_TRAITS, id));
    expect(missing).toEqual([]);
  });

  it("has no row for an id the catalog no longer ships", () => {
    const known = new Set(CATALOG_IDS);
    const stale = Object.keys(CUT_POSE_TRAITS).filter((id) => !known.has(id));
    expect(stale).toEqual([]);
  });

  it("uses only the storyboard vocabulary, without duplicates inside a row", () => {
    for (const [id, row] of Object.entries(CUT_POSE_TRAITS)) {
      expect(row.emotions.length, `${id} emotions`).toBeGreaterThanOrEqual(1);
      expect(row.emotions.length, `${id} emotions`).toBeLessThanOrEqual(3);
      expect(new Set(row.emotions).size, `${id} duplicate emotion`).toBe(row.emotions.length);
      expect(new Set(row.angles).size, `${id} duplicate angle`).toBe(row.angles.length);
      for (const emotion of row.emotions) expect(CUT_EMOTION_ORDER, id).toContain(emotion);
      for (const angle of row.angles) {
        expect(CUT_CAMERA_ANGLE_ORDER, id).toContain(angle);
        // 아이레벨은 모든 포즈에 무난하다고 보므로 특성으로 적지 않는다
        expect(angle, id).not.toBe("eye-level");
      }
      expect(["upper", "full"]).toContain(row.body);
    }
  });

  it("gives every emotion enough poses that a top-3 list can always be filled", () => {
    for (const emotion of CUT_EMOTION_ORDER) {
      const eligible = Object.values(CUT_POSE_TRAITS).filter((row) => row.emotions.includes(emotion));
      expect(eligible.length, emotion).toBeGreaterThanOrEqual(5);
    }
  });

  it("marks at least one pose as the primary choice for every emotion", () => {
    for (const emotion of CUT_EMOTION_ORDER) {
      const primary = Object.values(CUT_POSE_TRAITS).filter((row) => row.emotions[0] === emotion);
      expect(primary.length, emotion).toBeGreaterThanOrEqual(3);
    }
  });

  it("is frozen, so a consumer cannot rewrite the classification at runtime", () => {
    expect(Object.isFrozen(CUT_POSE_TRAITS)).toBe(true);
    const row = CUT_POSE_TRAITS.xp_kick;
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.emotions)).toBe(true);
  });
});

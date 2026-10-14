import { describe, expect, it } from "vitest";

import { LEARNING_PATHS } from "./learning-paths";
import { LEARNING_PATH_TINTS, learningPathTint, learningPathTintStyle } from "./learning-path-tints";

describe("학습 경로 틴트 (S3-18)", () => {
  it("모든 학습 경로가 틴트를 가진다", () => {
    for (const path of LEARNING_PATHS) {
      expect(learningPathTint(path.id), path.id).toBeDefined();
    }
    expect(Object.keys(LEARNING_PATH_TINTS).sort()).toEqual(
      LEARNING_PATHS.map((path) => path.id).sort(),
    );
  });

  it("경로마다 틴트가 서로 다르다", () => {
    const tints = LEARNING_PATHS.map((path) => learningPathTint(path.id));
    expect(new Set(tints).size).toBe(LEARNING_PATHS.length);
  });

  it("틴트 스타일은 --domain-tint 하나만 덮어쓴다", () => {
    const style = learningPathTintStyle(LEARNING_PATHS[0].id);
    expect(Object.keys(style ?? {})).toEqual(["--domain-tint"]);
    expect(learningPathTintStyle("no-such-path")).toBeUndefined();
  });
});

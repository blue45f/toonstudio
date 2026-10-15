import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_PUBLISH_PACKAGE_AI_TRAINING,
  normalizeStudioPublishPackageAiTraining,
  readStudioPublishPackageRights,
} from "./rights";

describe("게시 패키지 rights.aiTraining 읽기", () => {
  it("기본값은 미지정이다", () => {
    expect(DEFAULT_STUDIO_PUBLISH_PACKAGE_AI_TRAINING).toBe("unspecified");
  });

  it("세 값만 받아들이고 나머지는 모두 미지정으로 읽는다", () => {
    expect(normalizeStudioPublishPackageAiTraining("allowed")).toBe("allowed");
    expect(normalizeStudioPublishPackageAiTraining("prohibited")).toBe("prohibited");
    expect(normalizeStudioPublishPackageAiTraining("unspecified")).toBe("unspecified");
    for (const junk of [undefined, null, "", "yes", "Allowed", " allowed", 1, true, {}, []]) {
      expect(normalizeStudioPublishPackageAiTraining(junk)).toBe("unspecified");
    }
  });

  it("rights 객체에서만 읽고 객체가 아니거나 비어 있으면 미지정이다", () => {
    expect(readStudioPublishPackageRights({ aiTraining: "prohibited" })).toEqual({
      aiTraining: "prohibited",
    });
    for (const junk of [undefined, null, "allowed", 1, true, [], ["allowed"], {}]) {
      expect(readStudioPublishPackageRights(junk)).toEqual({ aiTraining: "unspecified" });
    }
  });

  it("읽은 결과에는 aiTraining 외의 키를 싣지 않는다", () => {
    const rights = readStudioPublishPackageRights({
      aiTraining: "allowed",
      licenseUrl: "https://example.test/license",
      trainingAllowed: true,
    });
    expect(Object.keys(rights)).toEqual(["aiTraining"]);
  });
});

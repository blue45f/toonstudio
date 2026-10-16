import { describe, expect, it } from "vitest";

import { findToneViolations, registersInFlow } from "@/shared/language/tone-policy";
import { violatesErrorPattern } from "@/shared/language/error-pattern";

import {
  combineStudioBg3dImportAiUseStatus,
  describeStudioBg3dImportAiUseNotice,
  hasStudioBg3dImportAiUse,
  readStudioBg3dImportAiUse,
  type StudioBg3dImportAiUseStatus,
} from "./studio-bg3d-import-ai-use";

describe("readStudioBg3dImportAiUse", () => {
  it("권리 폼 값에서 올바른 AI 표기만 골라 내고 모름·알 수 없는 값은 없음으로 본다", () => {
    expect(readStudioBg3dImportAiUse({ aiGenerated: "yes", aiTraining: "prohibited", status: "owned" }))
      .toEqual({ aiGenerated: "yes", aiTraining: "prohibited" });
    expect(readStudioBg3dImportAiUse({ aiGenerated: "unknown", aiTraining: "maybe" })).toEqual({});
    for (const bad of [null, undefined, "yes", 3, []]) expect(readStudioBg3dImportAiUse(bad)).toEqual({});
    expect(hasStudioBg3dImportAiUse({})).toBe(false);
    expect(hasStudioBg3dImportAiUse({ aiTraining: "allowed" })).toBe(true);
    expect(hasStudioBg3dImportAiUse(undefined)).toBe(false);
  });
});

describe("combineStudioBg3dImportAiUseStatus", () => {
  it("쓸 것이 없던 묶음은 결과에 영향을 주지 않는다", () => {
    for (const status of ["saved", "existing", "partial", "failed", "cancelled", "skipped"] as const) {
      expect(combineStudioBg3dImportAiUseStatus("skipped", status)).toBe(status);
      expect(combineStudioBg3dImportAiUseStatus(status, "skipped")).toBe(status);
    }
  });

  it("실패와 취소는 다른 결과에 가려지지 않고, 서로 다른 성공은 일부만 기록한 것이다", () => {
    expect(combineStudioBg3dImportAiUseStatus("saved", "failed")).toBe("failed");
    expect(combineStudioBg3dImportAiUseStatus("failed", "existing")).toBe("failed");
    expect(combineStudioBg3dImportAiUseStatus("saved", "cancelled")).toBe("cancelled");
    expect(combineStudioBg3dImportAiUseStatus("saved", "existing")).toBe("partial");
    expect(combineStudioBg3dImportAiUseStatus("saved", "saved")).toBe("saved");
    expect(combineStudioBg3dImportAiUseStatus("existing", "existing")).toBe("existing");
  });
});

describe("describeStudioBg3dImportAiUseNotice", () => {
  const SHOWN: readonly StudioBg3dImportAiUseStatus[] = ["saved", "existing", "partial", "failed", "cancelled"];

  it("쓸 답이 없었다면 알리지 않고, 나머지는 결과에 맞는 톤으로 알린다", () => {
    expect(describeStudioBg3dImportAiUseNotice("skipped")).toBeNull();
    expect(describeStudioBg3dImportAiUseNotice("saved")).toMatchObject({ tone: "success" });
    expect(describeStudioBg3dImportAiUseNotice("existing")).toMatchObject({ tone: "info" });
    expect(describeStudioBg3dImportAiUseNotice("partial")).toMatchObject({ tone: "info" });
    expect(describeStudioBg3dImportAiUseNotice("cancelled")).toMatchObject({ tone: "info" });
    expect(describeStudioBg3dImportAiUseNotice("failed")).toMatchObject({ tone: "error" });
  });

  it("문구에 다음 행동이나 현재 표시를 담는다", () => {
    expect(describeStudioBg3dImportAiUseNotice("failed")?.message).toContain("AI 미확인");
    expect(describeStudioBg3dImportAiUseNotice("existing")?.message).toContain("기존 기록");
    expect(describeStudioBg3dImportAiUseNotice("partial")?.message).toContain("나머지");
    expect(describeStudioBg3dImportAiUseNotice("cancelled")?.message).toContain("저장되지 않았을 수");
  });

  it("모든 안내가 해요체 한 가지이고 실패 안내에는 다음 행동이 있다", () => {
    for (const status of SHOWN) {
      const message = describeStudioBg3dImportAiUseNotice(status)?.message ?? "";
      expect(findToneViolations(message, "polite"), status).toEqual([]);
      expect(registersInFlow([message]).has("formal"), status).toBe(false);
      expect(registersInFlow([message]).has("polite"), status).toBe(true);
      expect(violatesErrorPattern(message), status).toBe(false);
    }
  });
});

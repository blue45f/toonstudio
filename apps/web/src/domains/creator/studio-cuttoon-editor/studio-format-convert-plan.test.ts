import { describe, expect, it } from "vitest";

import { buildConvertPlan } from "../studio-format-convert-plan";

describe("studio-format-convert-plan", () => {
  it("지원 경로는 단계를 돌려준다", () => {
    const plan = buildConvertPlan("psd", "toonstudio");
    expect(plan.supported).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.reason).toBe("");
  });

  it("독점 포맷은 브릿지 제안을 포함한다", () => {
    const plan = buildConvertPlan("clip", "psd");
    expect(plan.supported).toBe(true);
    expect(plan.bridge).toContain("PSD");
  });

  it("미지원 쌍은 fail-closed로 사유를 돌려준다", () => {
    const plan = buildConvertPlan("kra", "toonstudio");
    expect(plan.supported).toBe(false);
    expect(plan.steps).toEqual([]);
    expect(plan.reason).not.toBe("");
  });

  it("3D 정규화 경로는 원본 구조 미보존을 명시한다", () => {
    const plan = buildConvertPlan("fbx", "glb");
    expect(plan.supported).toBe(true);
    expect(plan.steps[0].action).toContain("원본 구조 미보존");
  });
});

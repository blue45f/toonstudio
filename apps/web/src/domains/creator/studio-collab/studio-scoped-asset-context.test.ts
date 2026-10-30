import { describe, expect, it } from "vitest";
import { appendStudioScopedAssetContext } from "./studio-scoped-asset-context";

const context = { version: 1 as const, policyVersion: 1, grantIds: ["grant"], creations: [], restorations: [] };
describe("업로드의 명시적 목적 문맥", () => {
  it("기존 full 업로드는 그대로 두고 현재 purpose만 JSON field로 보존한다", () => {
    const form = new FormData(); form.set("descriptor", "unchanged"); appendStudioScopedAssetContext(form);
    expect(form.has("writeContext")).toBe(false); appendStudioScopedAssetContext(form, context);
    expect(JSON.parse(String(form.get("writeContext")))).toEqual(context); expect(form.get("descriptor")).toBe("unchanged");
  });
  it("CRDT의 대기 생성·복원 선언을 업로드 성공으로 소비하지 않는다", () => {
    for (const entry of [{ ...context, creations: [{ kind: "stroke" as const, id: "fresh", targetId: "target" }] },
      { ...context, restorations: [{ kind: "stroke" as const, id: "old", targetId: "target" }] }]) {
      const form = new FormData(); expect(() => appendStudioScopedAssetContext(form, entry)).toThrow(); expect(form.has("writeContext")).toBe(false);
    }
  });
});

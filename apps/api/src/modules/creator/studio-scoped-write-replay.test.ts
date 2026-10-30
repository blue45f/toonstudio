import { describe, expect, it } from "vitest";
import { assertStudioScopedWriteReplay } from "./studio-scoped-write-replay";
import { scopedFixture } from "./studio-scoped-write.test-fixture";
import type { StudioScopedReceipt } from "./studio-scoped-write-store";

const receipt = (): StudioScopedReceipt => ({ actorUserId: "actor", requestHash: "same-body", policyVersion: 1, targetIds: ["target"], response: { sequence: "1" } });
describe("제한 저장의 실제 승인 receipt 재사용", () => {
  it("현재 권한의 실제 scoped receipt만 같은 ACK로 재사용한다", () => {
    expect(() => assertStudioScopedWriteReplay(scopedFixture().authorization, receipt())).not.toThrow();
  });
  it("과거 full write ID에 scoped receipt가 없으면 새 제한 성공으로 채택하지 않는다", () => {
    expect(() => assertStudioScopedWriteReplay(scopedFixture().authorization, null)).toThrow();
  });
  it("이전 policyVersion과 현재 선택 grant 밖 target을 거절한다", () => {
    for (const invalid of [{ ...receipt(), policyVersion: 2 }, { ...receipt(), targetIds: ["different-target"] }, { ...receipt(), actorUserId: "different-account" }]) {
      expect(() => assertStudioScopedWriteReplay(scopedFixture().authorization, invalid)).toThrow();
    }
  });
  it("기존 전체 편집자의 dedupe 계약에는 scoped receipt를 요구하지 않는다", () => {
    expect(() => assertStudioScopedWriteReplay({ ...scopedFixture().authorization, context: null }, null)).not.toThrow();
  });
});

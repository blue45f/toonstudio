import { describe, expect, it } from "vitest";
import { createStudioScopedWriteFixture as fixture } from "./studio-scoped-write.test-fixture";

describe("별도 담당 원고 권위", () => {
  it("선택 전에는 타인·첫 target을 자동 차용하지 않는다", () => {
    const f = fixture(); expect(f.authority.targetId).toBeNull(); expect(() => f.authority.purposeContext()).toThrow();
    expect(() => f.authority.chooseTarget("target-1", "foreign-grant")).toThrow();
  });
  it("실제 새 ID 선언은 첫 update에만 넣고 이후 append는 빈 선언을 사용한다", () => {
    const f = fixture(); f.choose(); const ticket = f.authority.captureDrawingTicket("page-1", null);
    f.authority.registerCreation(ticket, "stroke", "actual-id"); const first = f.authority.captureWriteContext();
    expect(first.creations).toEqual([{ kind: "stroke", id: "actual-id", targetId: "target-1" }]);
    f.authority.assertCreationContinuation("stroke", "actual-id"); expect(f.authority.captureWriteContext().creations).toEqual([]);
    f.authority.setPolicy({ ...f.policy, policyVersion: 2 }); expect(first.policyVersion).toBe(1); expect(first.creations).toHaveLength(1);
  });
  it("저장 hold는 새 변경만 막고 현재 목적 확인과 원래 대기열 문맥은 보존한다", () => {
    const f = fixture(); f.choose(); const ticket = f.authority.captureDrawingTicket("page-1", null);
    f.authority.registerCreation(ticket, "stroke", "held-id"); const release = f.authority.holdMutations();
    expect(() => f.authority.captureDrawingTicket("page-1", null)).toThrow(); expect(f.authority.purposeContext().creations).toEqual([]);
    expect(f.authority.captureWriteContext().creations[0]?.id).toBe("held-id"); release(); release();
    expect(() => f.authority.captureDrawingTicket("page-1", null)).not.toThrow();
  });
  it("기간·계정·비동기 문서 세대가 바뀌면 이전 ticket을 거절한다", () => {
    const f = fixture(); f.choose(); const ticket = f.authority.captureDrawingTicket("page-1", null);
    f.fence.documentGeneration++; expect(f.authority.allows(ticket)).toBe(false);
    f.fence.documentGeneration--; f.fence.authScopeKey = "actor-2"; expect(f.authority.allows(ticket)).toBe(false);
    f.fence.authScopeKey = "actor-1"; f.expire(); expect(() => f.authority.purposeContext()).toThrow();
  });
  it("동일 group ID는 실제 page와 target을 함께 대조하고 원래 ID를 유지한다", () => {
    const f = fixture(); f.choose(); expect(f.authority.ownerOf("group", "same-group")).toBe("target-1");
    f.authority.chooseTarget("target-2", "grant-2"); expect(f.authority.ownerOf("group", "same-group")).toBe("target-2");
    const ticket = f.authority.captureDrawingTicket("page-2", null); f.authority.registerRestoration(ticket, "group", "same-group");
    expect(f.authority.captureWriteContext().restorations).toEqual([{ kind: "group", id: "same-group", targetId: "target-2" }]);
  });
  it("현재 문서와 권한 세대에서 기록한 자기 이력만 다시 사용할 수 있다", () => {
    const f = fixture(); f.choose(); f.authority.recordHistoryEdge("actual-edge"); expect(f.authority.allowsHistoryEdge("actual-edge")).toBe(true);
    f.fence.documentGeneration++; expect(f.authority.allowsHistoryEdge("actual-edge")).toBe(false);
    f.fence.documentGeneration--; f.fence.accessGeneration++; expect(f.authority.allowsHistoryEdge("actual-edge")).toBe(false);
  });
  it("첫 생성의 ACK가 불명확해도 같은 ID의 redo는 새 생성 대신 복원으로 선언한다", () => {
    const f = fixture(); f.choose(); const ticket = f.authority.captureDrawingTicket("page-1", null);
    f.authority.registerCreation(ticket, "stroke", "original-id"); const original = f.authority.captureWriteContext();
    expect(f.authority.requiresRestoration("stroke", "original-id")).toBe(true);
    f.authority.registerRestoration(ticket, "stroke", "original-id");
    expect(f.authority.captureWriteContext()).toMatchObject({ creations: [], restorations: [{ kind: "stroke", id: "original-id", targetId: "target-1" }] });
    expect(original.creations).toEqual([{ kind: "stroke", id: "original-id", targetId: "target-1" }]);
  });
  it("소유 귀속 충돌 정책은 부분 적용하지 않고 새 그리기를 닫아 원래 초안을 보존한다", () => {
    const f = fixture(); f.choose(); f.authority.registerCreation(f.authority.captureDrawingTicket("page-1", null), "stroke", "local-draft");
    const original = f.authority.snapshot;
    expect(() => f.authority.setPolicy({ ...f.policy, policyVersion: 2, ownedEntities: [{ kind: "stroke", id: "local-draft", targetId: "target-2" }] })).toThrow("로컬 초안");
    expect(f.authority.snapshot).toBe(original); expect(f.authority.drawingAllowed).toBe(false);
    expect(() => f.authority.captureDrawingTicket("page-1", null)).toThrow(); expect(f.authority.ownerOf("stroke", "local-draft")).toBe("target-1");
    f.authority.setPolicy({ ...f.policy, ownedEntities: [{ kind: "stroke", id: "local-draft", targetId: "target-1" }] });
    expect(f.authority.drawingAllowed).toBe(true);
  });
});

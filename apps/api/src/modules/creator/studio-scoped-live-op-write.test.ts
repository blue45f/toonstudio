import { describe, expect, it } from "vitest";
import { admitStudioScopedLiveOp } from "./studio-scoped-live-op-write";
import { projectStudioScopedAuthoringDocument } from "./studio-scoped-write-effects";
import { scopedDocument, scopedFixture } from "./studio-scoped-write.test-fixture";
import { InMemoryStudioLiveOpLogStore, StudioLiveOpIdConflictError, StudioLiveOpRoom,
  type SequencedStudioLiveOp, type StudioLiveOp } from "./studio-live-op";

const add: SequencedStudioLiveOp = { opId: "device:1", actorId: "device", lamport: 1, baseSeq: 0, seq: 1,
  body: { kind: "add", stroke: { id: "own", pageId: "page", layerId: "page-root",
    payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#111111", strokeWidth: 3, points: [20, 20, 50, 50] } } } };
const op = (body: StudioLiveOp["body"]): StudioLiveOp => ({ opId: "device:2", actorId: "device", lamport: 2, baseSeq: 1, body });

describe("별도 journal의 현재 배정·실제 durable 후보", () => {
  it("이미 기록된 담당 획의 삭제를 허용하고 새 ID는 명시 creations와 대조한다", () => {
    const fixture = scopedFixture(), base = projectStudioScopedAuthoringDocument(scopedDocument());
    expect(admitStudioScopedLiveOp(fixture.authorization, base, [add], op({ kind: "remove", strokeId: "own" }))?.targetIds).toEqual(["target"]);
    if (add.body.kind !== "add") throw new Error("추가 fixture가 필요합니다.");
    const creation = op({ kind: "add", stroke: { ...add.body.stroke, id: "fresh" } });
    expect(() => admitStudioScopedLiveOp(fixture.authorization, base, [add], creation)).toThrow();
    const authorization = { ...fixture.authorization, context: { ...fixture.context, creations: [{ kind: "stroke" as const, id: "fresh", targetId: "target" }] } };
    expect(admitStudioScopedLiveOp(authorization, base, [add], creation)?.created).toEqual(authorization.context.creations);
  });
  it("다른 ID와 아직 도착하지 않은 선행 획을 cache 상태로 허가하지 않는다", () => {
    const fixture = scopedFixture(), base = projectStudioScopedAuthoringDocument(scopedDocument());
    expect(() => admitStudioScopedLiveOp(fixture.authorization, base, [add], op({ kind: "remove", strokeId: "outside" }))).toThrow();
    expect(() => admitStudioScopedLiveOp(fixture.authorization, base, [], op({ kind: "remove", strokeId: "own" }))).toThrow();
  });
  it("실제 렌더 소비를 입증하지 못한 비identity transform은 제한 쓰기에서 추정하지 않는다", () => {
    const fixture = scopedFixture(), base = projectStudioScopedAuthoringDocument(scopedDocument());
    expect(() => admitStudioScopedLiveOp(fixture.authorization, base, [add], op({ kind: "transform", strokeId: "own",
      transform: { dx: 500, dy: 0, scale: 1, rotation: 0 }, prev: { dx: 0, dy: 0, scale: 1, rotation: 0 } }))).toThrow();
  });
  it("전체 편집자의 정상 중복 ACK를 유지하되 같은 ID의 다른 본문은 재사용하지 않는다", async () => {
    const room = await StudioLiveOpRoom.open("work", new InMemoryStudioLiveOpLogStore());
    const input: StudioLiveOp = { opId: add.opId, actorId: add.actorId, lamport: add.lamport, baseSeq: add.baseSeq, body: add.body };
    expect((await room.submit(input, "actor")).status).toBe("accepted");
    expect((await room.submit(input, "actor")).status).toBe("duplicate");
    await expect(room.submit({ ...input, body: { kind: "remove", strokeId: "outside" } }, "actor")).rejects.toBeInstanceOf(StudioLiveOpIdConflictError);
    expect(room.lastSeq).toBe(1);
  });
});

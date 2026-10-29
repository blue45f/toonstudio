import { describe, expect, it, vi } from "vitest";
import { applyProductionTaskOutput, type SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import { StudioWriterRoomDocumentSchema, type StudioWriterRoomCaptureRequest } from "@toonstudio/contracts/studio-writer-room";
import { scopedCaptureFixture } from "./studio-scoped-write-capture.test-fixture";
import { SCOPED_AT, scopedDocument, scopedFixture } from "./studio-scoped-write.test-fixture";
import { readStudioWriterRoomCapture } from "./studio-writer-room-capture.repository";
import type { StudioScopedSql } from "./studio-scoped-write-store";

/** 계약용 합성 문서다. 실제 Writer Room 사용·저장·캡처 완주의 증거가 아니다. */
function script() {
  return StudioWriterRoomDocumentSchema.parse({ version: 1, stages: {
    premise: { text: "기획 첫 문단\n\n기획 마지막 문단", characterIds: ["character"] }, synopsis: { text: "시놉시스\n마지막 줄", characterIds: [] },
    "episode-outline": { title: "첫 회차", summary: "회차 개요\n두 번째 문단", characterIds: [] },
    beats: { items: [{ id: "beat", order: 0, title: "비트", summary: "비트 본문", characterIds: [] }] },
    scenes: { items: [{ id: "scene", order: 0, beatIds: ["beat"], heading: "장면", summary: "장면 본문", location: "방", time: "아침", characterIds: [] }] },
    "panel-plan": { items: Array.from({ length: 60 }, (_, index) => ({ id: `panel-${index}`, order: index, sceneId: "scene", shot: "중경", action: `동작 ${index}\n마지막 문단 ${index}`, characterIds: [] })) },
    "dialogue-sfx": { dialogue: [{ id: "dialogue", order: 0, panelId: "panel-0", characterId: "character", text: "대사\n마지막 대사" }],
      sfx: [{ id: "sfx", order: 0, panelId: "panel-0", presetId: null, customText: "효과음", style: { emphasis: "normal", scale: "medium" } }] },
  }, completion: { premise: true, synopsis: true, "episode-outline": true, beats: true, scenes: true, "panel-plan": true, "dialogue-sfx": false }, suggestions: [] });
}
function fixture(writerRoom: unknown = script(), include = true) {
  const f = scopedFixture(), capture = scopedCaptureFixture({ ...scopedDocument(), ...(include ? { writerRoom } : {}) });
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: "task", submissionId: "story-submission", submittedByAssignmentId: "role",
    documentRole: "story", source: { subject: capture.capture.subject }, selection: { mode: "document" },
    inputs: { mode: "initial-capture", source: { subject: capture.capture.subject } },
    target: { kind: "create", deliverableId: "story-deliverable", type: "story", expectedFormat: "writer-room", completionCriteria: ["고정 대본 확인"] } };
  const aggregate = applyProductionTaskOutput(f.aggregate, command, "actor", SCOPED_AT, { output: capture.capture, initial: capture.capture }).aggregate;
  const request: StudioWriterRoomCaptureRequest = { productionProjectId: aggregate.projectId, submissionId: command.submissionId, subject: capture.capture.subject };
  const query = { query: vi.fn().mockResolvedValueOnce([{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }])
    .mockResolvedValueOnce([capture.row]).mockResolvedValueOnce([{ status: "open" }]) } satisfies StudioScopedSql;
  return { ...f, aggregate, capture, request, query };
}

describe("제출본에 고정한 Writer Room 전체 본문", () => {
  it("3단계 capture·receipt·digest·실제 제출 귀속으로 7단계와 60컷의 모든 문단을 읽는다", async () => {
    const f = fixture(), response = await readStudioWriterRoomCapture(f.query, f.authorization.work, f.request);
    expect(response.status).toBe("available");
    if (response.status !== "available") throw new Error("고정 본문이 없습니다.");
    expect(response.writerRoom).toEqual(script());
    expect(response.writerRoom.stages["panel-plan"].items.at(-1)?.action).toBe("동작 59\n마지막 문단 59");
    expect(response).toMatchObject({ subject: f.capture.capture.subject, submissionId: "story-submission", sourceServerRevision: 3, captureSequence: 7 });
  });

  it("현재 working doc의 다른 대본을 대체 원고로 읽지 않는다", async () => {
    const f = fixture(), current = { ...f.authorization.work, document: { ...scopedDocument(), writerRoom: { currentOnly: "현재 초안" } } };
    const response = await readStudioWriterRoomCapture(f.query, current, f.request);
    expect(JSON.stringify(response)).not.toContain("현재 초안");
    expect(response.status).toBe("available");
  });

  it("본문 누락·손상은 missing/invalid로 표시하며 빈 문서나 일부 prefix를 반환하지 않는다", async () => {
    const missing = fixture(undefined, false);
    expect(await readStudioWriterRoomCapture(missing.query, missing.authorization.work, missing.request)).toMatchObject({ status: "missing" });
    for (const invalid of [{ version: 99 }, { ...script(), unrecognized: "오염된 필드" }, { ...script(), stages: { ...script().stages,
      beats: { items: [script().stages.beats.items[0], script().stages.beats.items[0]] } } }]) {
      const f = fixture(invalid), response = await readStudioWriterRoomCapture(f.query, f.authorization.work, f.request);
      expect(response).toMatchObject({ status: "invalid", reason: "invalid-document" });
      expect(response).not.toHaveProperty("writerRoom");
    }
  });

  it("현재 view 회수·다른 subject·다른 제출 버전·capture 오염은 읽기를 거절한다", async () => {
    const revoked = fixture();
    await expect(readStudioWriterRoomCapture(revoked.query, { ...revoked.authorization.work, access: { ...revoked.authorization.work.access, view: false } }, revoked.request)).rejects.toMatchObject({ status: 403 });
    const wrong = fixture();
    await expect(readStudioWriterRoomCapture(wrong.query, wrong.authorization.work, { ...wrong.request, subject: { ...wrong.request.subject, rootGraphHash: "f".repeat(64) } })).rejects.toMatchObject({ status: 404 });
    const changed = fixture(), aggregate = { ...changed.aggregate, submissions: changed.aggregate.submissions.map((submission) => ({ ...submission, revisionRef: { ...submission.revisionRef, revision: 99 } })) };
    const query = { query: vi.fn().mockResolvedValueOnce([{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }]).mockResolvedValueOnce([changed.capture.row]).mockResolvedValueOnce([{ status: "open" }]) } satisfies StudioScopedSql;
    await expect(readStudioWriterRoomCapture(query, changed.authorization.work, changed.request)).rejects.toMatchObject({ status: 409 });
    const poisoned = fixture(), row = { ...poisoned.capture.row, receipt: { ...poisoned.capture.row.receipt, response: { ...poisoned.capture.row.receipt.response, status: "pending" } } };
    const bad = { query: vi.fn().mockResolvedValueOnce([{ id: poisoned.aggregate.projectId, workId: "work", revision: poisoned.aggregate.revision, aggregate: poisoned.aggregate }]).mockResolvedValueOnce([row]) } satisfies StudioScopedSql;
    await expect(readStudioWriterRoomCapture(bad, poisoned.authorization.work, poisoned.request)).rejects.toMatchObject({ status: 404 });
  });
});

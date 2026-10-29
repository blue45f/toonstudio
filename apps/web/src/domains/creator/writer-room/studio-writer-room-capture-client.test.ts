import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/platform/api";
import { StudioWriterRoomDocumentSchema as sharedSchema } from "@toonstudio/contracts/studio-writer-room";
import { createEmptyStudioWriterRoomDocument, StudioWriterRoomDocumentSchema, admitStudioWriterRoomDocument } from "../studio-writer-room";
import { getStudioWriterRoomCapture } from "./studio-writer-room-capture-client";
import { scopedManagementUiFixture } from "../production-hub/studio-scoped-write-management.test-fixture";

afterEach(() => vi.restoreAllMocks());
describe("공용 작가실 정본과 고정 대본 HTTP 계약", () => {
  it("기존 Web 작성자가 API와 같은 schema를 소비하며 본문을 정규화·축약하지 않는다", () => {
    expect(StudioWriterRoomDocumentSchema).toBe(sharedSchema);
    const original = createEmptyStudioWriterRoomDocument(), changed = { ...original, stages: { ...original.stages,
      premise: { text: "첫 문단\n\n마지막 문단", characterIds: ["c".repeat(120)] } } };
    const receipt = admitStudioWriterRoomDocument(changed, original);
    expect(receipt.kind).toBe("accepted");
    expect(sharedSchema.parse(changed)).toEqual(changed);
  });

  it("실제 submissionID·Productionproject·고정subject를경로와query에고정한다", async () => {
    const f = scopedManagementUiFixture(), input = { productionProjectId: "production", submissionId: "submission", subject: f.choice.subject };
    const response = { contract: "studio-writer-room-capture-v1", ...input, status: "available", sourceServerRevision: 3,
      captureSequence: 7, reviewStatus: "open", writerRoom: createEmptyStudioWriterRoomDocument() };
    const get = vi.spyOn(api, "get").mockResolvedValue(response);
    expect(await getStudioWriterRoomCapture(input)).toEqual(response);
    const call = get.mock.calls[0]?.[0];
    if (!call) throw new Error("읽기 요청이 없습니다.");
    const url = new URL(call, "https://api.unit.test");
    expect(url.pathname).toBe("/creator/works/work/writer-room-captures/review");
    expect(url.searchParams.get("projectId")).toBe("graph/project@one");
    expect(url.searchParams.get("productionProjectId")).toBe("production");
    expect(url.searchParams.get("submissionId")).toBe("submission");
    get.mockResolvedValue({ ...response, submissionId: "different" });
    await expect(getStudioWriterRoomCapture(input)).rejects.toThrow("선택한 제출본");
  });
});

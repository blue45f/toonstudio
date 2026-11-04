import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeStudioSharedDocumentPatch, updateStudioScopedSharedDocument, updateStudioSharedDocument } from "../studio-shared-document-client";

const mocks = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { patch: mocks.patch }, isHttpError: () => false, toApiError: async (error: unknown) => error }));
const context = { version: 1 as const, policyVersion: 1, grantIds: ["grant"], creations: [], restorations: [] };
const input = () => ({ baseRevision: 3, crdtServerSequence: "7", doc: { pagesList: [] }, mutationId: "00000000-0000-8000-8000-000000000001", writeContext: context });
describe("현재 배정의 별도 본문 REST client", () => {
  beforeEach(() => mocks.patch.mockReset().mockResolvedValue({ workId: "work", revision: 4, updatedAt: "2026-10-29T06:00:00.000Z" }));
  it("역할과 metadata를 보내지 않고 정확한 ID·정책·sequence를 그대로 전송한다", async () => {
    const body = input(); await expect(updateStudioScopedSharedDocument("work", body)).resolves.toMatchObject({ revision: 4 });
    expect(mocks.patch).toHaveBeenCalledWith("/creator/works/work/team/document",
      { ...body, readerCapabilities: ["bg3d-sixpass-bundle.v1"] }, { signal: undefined });
  });
  it("게시 metadata·대기 중 creations·누락 ID는 네트워크 전에 거절한다", async () => {
    for (const body of [{ ...input(), status: "published" }, { ...input(), mutationId: "invalid" },
      { ...input(), writeContext: { ...context, creations: [{ kind: "stroke", id: "fresh", targetId: "target" }] } }]) {
      await expect(updateStudioScopedSharedDocument("work", body as never)).rejects.toThrow();
    }
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it("기존 generic client에 context를 끼워 edit 권한을 승격하지 않는다", () => {
    expect(() => normalizeStudioSharedDocumentPatch({ baseRevision: 3, crdtServerSequence: "7", doc: {}, writeContext: context })).toThrow();
    expect(normalizeStudioSharedDocumentPatch({ baseRevision: 3, crdtServerSequence: "7", doc: {} })).toEqual({ baseRevision: 3, crdtServerSequence: "7", doc: {} });
  });
  it("잘못된 서버 revision을 성공 ACK로 처리하지 않는다", async () => {
    mocks.patch.mockResolvedValueOnce({ workId: "work", revision: 9, updatedAt: "2026-10-29T06:00:00.000Z" });
    await expect(updateStudioScopedSharedDocument("work", input())).rejects.toThrow();
  });
  it("전체 편집의 명시 grant 문맥과 같은 전체 본문은 같은 mutation ID를 보낸다", async () => {
    const body = { baseRevision: 3, crdtServerSequence: "7", doc: { pagesList: [] }, title: "보존할 제목" };
    await updateStudioSharedDocument("work", "editor", body, undefined, context);
    await updateStudioSharedDocument("work", "editor", body, undefined, context);
    const first = mocks.patch.mock.calls[0]?.[1], second = mocks.patch.mock.calls[1]?.[1];
    expect(first).toMatchObject({ ...body, writeContext: context, mutationId: expect.stringMatching(/^[\da-f-]{36}$/u) });
    expect(second).toEqual(first);
    await updateStudioSharedDocument("work", "editor", { ...body, title: "바뀐 제목" }, undefined, context);
    expect(mocks.patch.mock.calls[2]?.[1].mutationId).not.toBe(first.mutationId);
  });
});

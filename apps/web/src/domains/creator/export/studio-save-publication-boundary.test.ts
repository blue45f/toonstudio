import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCreatorPublicationAudit, readCreatorPublicationSource } from "@toonstudio/contracts/creator-publication-integrity";
import { writeStudioPublicationIntegrity, type WriteStudioPublicationIntegrityInput } from "../studio-publication-integrity";
import { prepareStudioSavePublicationBase } from "./studio-save-publication-boundary";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

async function existingDocument() {
  return writeStudioPublicationIntegrity({ document: { pagesList: [], customExtension: { preserved: true } }, sourceKind: "studio_document",
    revisionId: "existing-revision", pageImages: ["https://example.test/original-page.png"], ownerApproved: true, ownerUserId: "original-owner",
    publisherActor: "owner", approvedAt: "2026-11-04T00:00:00.000Z" });
}
function interactiveSave(document: unknown, published = false): WriteStudioPublicationIntegrityInput {
  return { document, sourceKind: "studio_document", revisionId: "new-local-generation", pageImages: ["https://example.test/edited-page.png"],
    ownerApproved: published, ownerUserId: "current-editor", publisherActor: "collaborator", approvedAt: published ? "2026-11-04T01:00:00.000Z" : null };
}

describe("공동 초안의 게시 감사 경계", () => {
  it("RBAC 공동 초안은 현재 편집계정과 새 캡처가 있어도 기존 감사·출처 전체를 보존한다", async () => {
    const document = await existingDocument(), original = structuredClone(document);
    const result = await prepareStudioSavePublicationBase(interactiveSave(document), { status: "draft", shared: true, mappedFullEdit: true });
    expect(result).toBe(document);
    expect(result).toEqual(original);
    expect(readCreatorPublicationAudit(result)).toMatchObject({ ownerUserId: "original-owner", publisherActor: "owner", ownerApproved: true });
    expect(readCreatorPublicationSource(result)?.contentChecksum).toBe(readCreatorPublicationSource(original)?.contentChecksum);
  });
  it("게시 감사 정보가 없는 RBAC 공동 초안에 새 전역 metadata를 추가하지 않는다", async () => {
    const document = { pagesList: [] };
    expect(await prepareStudioSavePublicationBase(interactiveSave(document), { status: "draft", shared: true, mappedFullEdit: true })).toEqual(document);
  });
  it.each([
    { status: "published", shared: true, mappedFullEdit: true },
    { status: "draft", shared: false, mappedFullEdit: true },
    { status: "draft", shared: true, mappedFullEdit: false },
  ] as const)("기존 무결성 계산을 유지한다: %j", async (boundary) => {
    const document = await existingDocument();
    const result = await prepareStudioSavePublicationBase(interactiveSave(document, boundary.status === "published"), boundary);
    expect(readCreatorPublicationAudit(result)).toMatchObject({ ownerUserId: "current-editor", publisherActor: "collaborator", ownerApproved: boundary.status === "published" });
    expect(readCreatorPublicationSource(result)?.contentChecksum).not.toBe(readCreatorPublicationSource(document)?.contentChecksum);
    expect(document.customExtension).toEqual({ preserved: true });
  });
  it("기존 공동 문서를 확인하지 못하면 빈 문서로 대체하지 않는다", async () => {
    await expect(prepareStudioSavePublicationBase(interactiveSave(null), { status: "draft", shared: true, mappedFullEdit: true })).rejects.toThrow("공동 문서 저장 범위");
  });
});

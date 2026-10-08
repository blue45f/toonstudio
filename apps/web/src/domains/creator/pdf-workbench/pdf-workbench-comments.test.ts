import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  createEmptyStudioCommentsDocument,
  listStudioCommentThreadsForAnchor,
  type StudioCommentActor,
  type StudioCommentsDocument,
} from "../studio-comments";
import { createPdfPageAnchor } from "./pdf-workbench-anchor";
import {
  createPdfWorkbenchCommentStore,
  parsePdfWorkbenchCommentScopeId,
  pdfWorkbenchCommentScopeId,
  pdfWorkbenchCommentsStorageKey,
  type PdfWorkbenchCommentStorage,
} from "./pdf-workbench-comments";

const AUTHOR: StudioCommentActor = { id: "author-1", displayName: "윤 편집" };
const CREATED_AT = new Date("2026-10-08T01:00:00.000Z");

function memoryStorage(): { storage: PdfWorkbenchCommentStorage; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
      removeItem: (key) => {
        entries.delete(key);
      },
    },
  };
}

function documentWithPdfThread(documentId: string, body: string): StudioCommentsDocument {
  return addStudioCommentThread(
    createEmptyStudioCommentsDocument(),
    {
      id: `thread-${documentId}`,
      anchor: createPdfPageAnchor({ documentId, sourcePageIndex: 1, x: 0.5, y: 0.5 }),
      author: AUTHOR,
      body,
    },
    CREATED_AT,
  );
}

describe("PDF 워크벤치 댓글 스코프", () => {
  it("지문으로 스코프 id를 만들고 되뽑는다", () => {
    expect(pdfWorkbenchCommentScopeId("abc123")).toBe("pdf:abc123");
    expect(parsePdfWorkbenchCommentScopeId("pdf:abc123")).toBe("abc123");
    expect(parsePdfWorkbenchCommentScopeId("work:abc123")).toBeNull();
    expect(parsePdfWorkbenchCommentScopeId("pdf:")).toBeNull();
    expect(pdfWorkbenchCommentsStorageKey("abc123")).toBe(
      "toonstudio-pdf-workbench-comments:pdf:abc123",
    );
  });
});

describe("PDF 워크벤치 댓글 저장 어댑터", () => {
  it("댓글을 저장하고 같은 문서에서 그대로 재조회한다", () => {
    const { storage } = memoryStorage();
    const store = createPdfWorkbenchCommentStore(() => storage);
    const document = documentWithPdfThread("doc-a", "원본 2페이지 도판 확인");

    store.save("doc-a", document);
    const loaded = store.load("doc-a");

    expect(loaded.threads).toHaveLength(1);
    expect(loaded.threads[0].body).toBe("원본 2페이지 도판 확인");
    expect(loaded.threads[0].anchor).toEqual({
      type: "pdf-page",
      documentId: "doc-a",
      sourcePageIndex: 1,
      x: 0.5,
      y: 0.5,
    });
    expect(
      listStudioCommentThreadsForAnchor(
        loaded,
        createPdfPageAnchor({ documentId: "doc-a", sourcePageIndex: 1, x: 0.5, y: 0.5 }),
      ),
    ).toHaveLength(1);
  });

  it("문서마다 스코프가 격리돼 다른 PDF의 댓글이 섞이지 않는다", () => {
    const { storage, entries } = memoryStorage();
    const store = createPdfWorkbenchCommentStore(() => storage);

    store.save("doc-a", documentWithPdfThread("doc-a", "A 문서 댓글"));
    store.save("doc-b", documentWithPdfThread("doc-b", "B 문서 댓글"));

    expect([...entries.keys()].sort()).toEqual([
      "toonstudio-pdf-workbench-comments:pdf:doc-a",
      "toonstudio-pdf-workbench-comments:pdf:doc-b",
    ]);
    expect(store.load("doc-a").threads.map((thread) => thread.body)).toEqual(["A 문서 댓글"]);
    expect(store.load("doc-b").threads.map((thread) => thread.body)).toEqual(["B 문서 댓글"]);
    expect(store.load("doc-c")).toEqual(createEmptyStudioCommentsDocument());
  });

  it("손상된 저장값은 빈 문서로 읽고, 지우면 다시 빈 문서가 된다", () => {
    const { storage } = memoryStorage();
    const store = createPdfWorkbenchCommentStore(() => storage);
    storage.setItem(pdfWorkbenchCommentsStorageKey("doc-a"), "{깨진 json");

    expect(store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());

    store.save("doc-a", documentWithPdfThread("doc-a", "복구 후 댓글"));
    expect(store.load("doc-a").threads).toHaveLength(1);
    store.clear("doc-a");
    expect(store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());
  });

  it("저장소가 없어도 읽기는 빈 문서, 쓰기는 조용한 포기다", () => {
    const store = createPdfWorkbenchCommentStore(() => null);
    expect(store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());
    expect(() => store.save("doc-a", documentWithPdfThread("doc-a", "저장 불가"))).not.toThrow();
    expect(() => store.clear("doc-a")).not.toThrow();
  });
});

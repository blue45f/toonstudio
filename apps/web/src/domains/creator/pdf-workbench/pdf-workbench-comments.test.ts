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
  PDF_WORKBENCH_COMMENTS_KV_NAMESPACE,
  parsePdfWorkbenchCommentScopeId,
  type PdfWorkbenchCommentDatabase,
  pdfWorkbenchCommentScopeId,
  pdfWorkbenchCommentsStorageKey,
} from "./pdf-workbench-comments";

const AUTHOR: StudioCommentActor = { id: "author-1", displayName: "윤 편집" };
const CREATED_AT = new Date("2026-10-08T01:00:00.000Z");

/** 메모리 키-값 포트. 호출된 네임스페이스를 함께 기록해 워크벤치 전용인지 검증한다. */
function memoryDatabase(): {
  database: PdfWorkbenchCommentDatabase;
  entries: Map<string, string>;
  namespaces: Set<string>;
} {
  const entries = new Map<string, string>();
  const namespaces = new Set<string>();
  return {
    entries,
    namespaces,
    database: {
      async kvGet(namespace, key) {
        namespaces.add(namespace);
        return entries.get(key) ?? null;
      },
      async kvSet(namespace, key, value) {
        namespaces.add(namespace);
        entries.set(key, value);
      },
      async kvDelete(namespace, key) {
        namespaces.add(namespace);
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
  it("댓글을 저장하고 같은 문서에서 그대로 재조회한다", async () => {
    const { database } = memoryDatabase();
    const store = createPdfWorkbenchCommentStore(async () => database);
    const document = documentWithPdfThread("doc-a", "원본 2페이지 도판 확인");

    await store.save("doc-a", document);
    const loaded = await store.load("doc-a");

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

  it("문서마다 스코프가 격리되고, 워크벤치 댓글 네임스페이스만 쓴다", async () => {
    const { database, entries, namespaces } = memoryDatabase();
    const store = createPdfWorkbenchCommentStore(async () => database);

    await store.save("doc-a", documentWithPdfThread("doc-a", "A 문서 댓글"));
    await store.save("doc-b", documentWithPdfThread("doc-b", "B 문서 댓글"));

    expect([...entries.keys()].sort()).toEqual([
      "toonstudio-pdf-workbench-comments:pdf:doc-a",
      "toonstudio-pdf-workbench-comments:pdf:doc-b",
    ]);
    expect([...namespaces]).toEqual([PDF_WORKBENCH_COMMENTS_KV_NAMESPACE]);
    expect((await store.load("doc-a")).threads.map((thread) => thread.body)).toEqual(["A 문서 댓글"]);
    expect((await store.load("doc-b")).threads.map((thread) => thread.body)).toEqual(["B 문서 댓글"]);
    expect(await store.load("doc-c")).toEqual(createEmptyStudioCommentsDocument());
  });

  it("손상된 저장값은 빈 문서로 읽고, 지우면 다시 빈 문서가 된다", async () => {
    const { database, entries } = memoryDatabase();
    const store = createPdfWorkbenchCommentStore(async () => database);
    entries.set(pdfWorkbenchCommentsStorageKey("doc-a"), "{깨진 json");

    expect(await store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());

    await store.save("doc-a", documentWithPdfThread("doc-a", "복구 후 댓글"));
    expect((await store.load("doc-a")).threads).toHaveLength(1);
    await store.clear("doc-a");
    expect(await store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());
  });

  it("저장소가 없어도 읽기는 빈 문서, 쓰기는 조용한 포기다", async () => {
    const store = createPdfWorkbenchCommentStore(async () => null);
    expect(await store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());
    await expect(
      store.save("doc-a", documentWithPdfThread("doc-a", "저장 불가")),
    ).resolves.toBeUndefined();
    await expect(store.clear("doc-a")).resolves.toBeUndefined();
  });

  it("데이터베이스 호출이 실패해도 던지지 않는다", async () => {
    const failing: PdfWorkbenchCommentDatabase = {
      async kvGet() {
        throw new Error("disk full");
      },
      async kvSet() {
        throw new Error("disk full");
      },
      async kvDelete() {
        throw new Error("disk full");
      },
    };
    const store = createPdfWorkbenchCommentStore(async () => failing);
    expect(await store.load("doc-a")).toEqual(createEmptyStudioCommentsDocument());
    await expect(
      store.save("doc-a", documentWithPdfThread("doc-a", "기록 실패")),
    ).resolves.toBeUndefined();
    await expect(store.clear("doc-a")).resolves.toBeUndefined();
  });
});

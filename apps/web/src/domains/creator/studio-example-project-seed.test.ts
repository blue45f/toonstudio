import { describe, expect, it } from "vitest";

import {
  readStudioSaveProfiles,
  studioSaveProfileNeedsDestination,
} from "./save-first/studio-save-profile";
import { studioAutosaveKey } from "./studio-autosave";
import {
  EXAMPLE_DOCUMENT_ID,
  EXAMPLE_EDITOR_HREF,
  EXAMPLE_PROJECT_ID,
} from "./studio-example-project-content";
import { ensureExampleProjectSeeded } from "./studio-example-project-seed";
import { readStudioProjectDocuments } from "./studio-project-document-store";
import {
  createStudioProject,
  readStudioProjectLibrary,
  trashStudioProject,
} from "./studio-project-library-store";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const AT = "2026-10-14T00:00:00.000Z";

describe("ensureExampleProjectSeeded", () => {
  it("seeds exactly one openable example project on a fresh library", () => {
    const storage = new MemoryStorage();
    const result = ensureExampleProjectSeeded(storage, { at: AT });

    expect(result.status).toBe("seeded");
    expect(result.status !== "full" && result.status !== "trashed" ? result.editorHref : null)
      .toBe(EXAMPLE_EDITOR_HREF);

    const library = readStudioProjectLibrary(storage);
    expect(library.projects).toHaveLength(1);
    expect(library.projects[0]).toMatchObject({
      id: EXAMPLE_PROJECT_ID,
      kind: "webtoon",
      status: "active",
      lastOpenedDocumentId: EXAMPLE_DOCUMENT_ID,
    });

    const documents = readStudioProjectDocuments(storage, EXAMPLE_PROJECT_ID).documents;
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: EXAMPLE_DOCUMENT_ID,
      width: 720,
      height: 1200,
      status: "active",
    });

    // 예제는 사용자의 미저장 임시 작업이 아니라 미리 저장된 완성본으로 분류된다.
    const profile = readStudioSaveProfiles(storage).profiles[EXAMPLE_PROJECT_ID];
    expect(profile).toBeTruthy();
    expect(profile ? studioSaveProfileNeedsDestination(profile) : true).toBe(false);

    // 초안은 호출자가 편집기와 같은 소유자 키의 내구 저장소(OPFS/SQLite)에 심도록 결과로 돌려준다.
    if (result.status !== "seeded") throw new Error("expected a seeded result");
    expect(result.autosave.workId).toBe(EXAMPLE_DOCUMENT_ID);
    const autosave = result.autosave.build();
    expect(autosave.pagesList).toHaveLength(1);
    const elements = (autosave.pagesList[0]?.elements ?? []) as Array<Record<string, unknown>>;
    expect(elements.some((element) => element.type === "bubble")).toBe(true);
    expect(elements.some((element) => element.type === "draw" && element.fill)).toBe(true);
    expect(elements.some((element) => element.type === "draw" && element.kind === "freehand")).toBe(true);

    // 브라우저 저장소(localStorage)에는 초안을 심지 않는다 — 거기 있는 기록은 편집기가 복구를 거부하는 호환 후보일 뿐이다.
    expect(storage.getItem(studioAutosaveKey({ workId: EXAMPLE_DOCUMENT_ID }))).toBeNull();
  });

  it("is idempotent and never touches a browser record the user already holds", () => {
    const storage = new MemoryStorage();
    ensureExampleProjectSeeded(storage, { at: AT });

    const key = studioAutosaveKey({ workId: EXAMPLE_DOCUMENT_ID });
    const edited = '{"version":2,"title":"내가 바꾼 대사"}';
    storage.setItem(key, edited);

    const second = ensureExampleProjectSeeded(storage, { at: "2026-10-14T01:00:00.000Z" });
    expect(second.status).toBe("already-seeded");
    // 이미 심어진 뒤에도 내구 저장소에 심을 초안을 다시 돌려준다(없을 때만 심는 것은 심는 쪽의 계약이다).
    expect(second.status === "already-seeded" ? second.autosave.workId : null).toBe(EXAMPLE_DOCUMENT_ID);
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(1);
    expect(storage.getItem(key)).toBe(edited);
  });

  it("does not resurrect an example the user trashed, and leaves other projects alone", () => {
    const storage = new MemoryStorage();
    createStudioProject(storage, {
      id: "my-own-work",
      title: "내 작품",
      kind: "webtoon",
      createdAt: AT,
    });
    ensureExampleProjectSeeded(storage, { at: AT });
    trashStudioProject(storage, EXAMPLE_PROJECT_ID, { at: "2026-10-14T00:10:00.000Z" });

    const result = ensureExampleProjectSeeded(storage, { at: "2026-10-14T00:20:00.000Z" });
    expect(result.status).toBe("trashed");
    const projects = readStudioProjectLibrary(storage).projects;
    expect(projects.find((project) => project.id === EXAMPLE_PROJECT_ID)?.status).toBe("trashed");
    expect(projects.find((project) => project.id === "my-own-work")?.status).toBe("active");
  });
});

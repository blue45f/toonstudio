import { describe, expect, it } from "vitest";

import {
  readStudioSaveProfiles,
  studioSaveProfileNeedsDestination,
} from "./save-first/studio-save-profile";
import { parseStudioAutosave, studioAutosaveKey } from "./studio-autosave";
import type { PageState } from "./studio-page-state";
import {
  SAMPLE_DOCUMENT_ID,
  SAMPLE_EDITOR_HREF,
  SAMPLE_PROJECT_ID,
} from "./studio-sample-manuscript-content";
import {
  buildPracticeCopyPages,
  createSampleManuscriptPracticeCopy,
  ensureSampleManuscriptSeeded,
  findSampleManuscriptPracticeCopy,
} from "./studio-sample-manuscript-seed";
import { readStudioProjectDocuments } from "./studio-project-document-store";
import {
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

function samplePages(storage: MemoryStorage): PageState[] {
  const parsed = parseStudioAutosave(storage.getItem(studioAutosaveKey({ workId: SAMPLE_DOCUMENT_ID })));
  return (parsed?.pagesList ?? []) as unknown as PageState[];
}

describe("ensureSampleManuscriptSeeded", () => {
  it("seeds one openable two-page sample classified as a saved project", () => {
    const storage = new MemoryStorage();
    const result = ensureSampleManuscriptSeeded(storage, { at: AT });

    expect(result.status).toBe("seeded");
    expect(result.status !== "full" && result.status !== "trashed" ? result.editorHref : null)
      .toBe(SAMPLE_EDITOR_HREF);

    const library = readStudioProjectLibrary(storage);
    expect(library.projects.map((project) => project.id)).toEqual([SAMPLE_PROJECT_ID]);

    const documents = readStudioProjectDocuments(storage, SAMPLE_PROJECT_ID).documents;
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ id: SAMPLE_DOCUMENT_ID, pageCount: 2 });

    const pages = samplePages(storage);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.groups?.map((group) => group.id)).toContain("sample-g-tone");

    const profile = readStudioSaveProfiles(storage).profiles[SAMPLE_PROJECT_ID];
    expect(profile).toBeTruthy();
    expect(studioSaveProfileNeedsDestination(profile!)).toBe(false);
  });

  it("is idempotent and never overwrites a user-touched original autosave", () => {
    const storage = new MemoryStorage();
    ensureSampleManuscriptSeeded(storage, { at: AT });
    const key = studioAutosaveKey({ workId: SAMPLE_DOCUMENT_ID });
    const edited = storage.getItem(key)!.replace("촤아아", "콰아아");
    storage.setItem(key, edited);

    const again = ensureSampleManuscriptSeeded(storage, { at: AT });
    expect(again.status).toBe("already-seeded");
    expect(storage.getItem(key)).toBe(edited);
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(1);
  });

  it("does not revive a trashed sample, and practice copies are blocked too", () => {
    const storage = new MemoryStorage();
    ensureSampleManuscriptSeeded(storage, { at: AT });
    trashStudioProject(storage, SAMPLE_PROJECT_ID);

    expect(ensureSampleManuscriptSeeded(storage, { at: AT }).status).toBe("trashed");
    expect(createSampleManuscriptPracticeCopy(storage, { at: AT }).status).toBe("sample-trashed");
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(1);
  });
});

describe("createSampleManuscriptPracticeCopy", () => {
  it("creates a trace copy with the original locked and faded, original untouched", () => {
    const storage = new MemoryStorage();
    ensureSampleManuscriptSeeded(storage, { at: AT });
    const originalKey = studioAutosaveKey({ workId: SAMPLE_DOCUMENT_ID });
    const originalBefore = storage.getItem(originalKey);

    const result = createSampleManuscriptPracticeCopy(storage, { at: AT });
    expect(result.status).toBe("created");
    if (result.status !== "created" && result.status !== "already-created") return;
    expect(result.mode).toBe("trace");
    expect(result.editorHref)
      .toBe("/studio/p/sample-practice-1/d/sample-practice-1-ep01?workspace=comic");

    // 원본은 바이트 단위로 그대로다.
    expect(storage.getItem(originalKey)).toBe(originalBefore);

    const copyPages = (parseStudioAutosave(
      storage.getItem(studioAutosaveKey({ workId: result.documentId })),
    )?.pagesList ?? []) as unknown as PageState[];
    expect(copyPages).toHaveLength(2);
    const [firstPage] = copyPages;
    expect(firstPage!.groups?.at(-1)?.name).toContain("내 연습");
    expect(firstPage!.groups?.at(-1)?.locked).toBe(false);
    expect(firstPage!.groups?.slice(0, -1).every((group) => group.locked === true)).toBe(true);

    const originalIds = new Set(samplePages(storage).flatMap((page) => page.elements.map((el) => el.id)));
    for (const page of copyPages) {
      for (const element of page.elements) {
        expect(element.id.endsWith("--sample-practice-1")).toBe(true);
        expect(originalIds.has(element.id)).toBe(false);
        if (element.id.startsWith("sample-practice-guide")) continue;
        expect(element.locked).toBe(true);
        expect(element.opacity ?? 1).toBeLessThanOrEqual(0.45);
      }
    }
    // 첫 페이지 연습 그룹에는 안내 문구가 하나 들어 있다.
    const guide = firstPage!.elements.find((element) => element.id.startsWith("sample-practice-guide"));
    expect(guide?.groupId).toBe(firstPage!.groups?.at(-1)?.id);
    expect(guide?.locked).not.toBe(true);
  });

  it("returns the same copy on a second request instead of piling up projects", () => {
    const storage = new MemoryStorage();
    const first = createSampleManuscriptPracticeCopy(storage, { at: AT });
    const second = createSampleManuscriptPracticeCopy(storage, { at: AT });
    expect(first.status).toBe("created");
    expect(second.status).toBe("already-created");
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(2);
    expect(findSampleManuscriptPracticeCopy(storage)?.project.id).toBe("sample-practice-1");
  });

  it("study mode clones without locks or fading and without a practice group", () => {
    const storage = new MemoryStorage();
    const result = createSampleManuscriptPracticeCopy(storage, { at: AT, mode: "study" });
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    const copyPages = (parseStudioAutosave(
      storage.getItem(studioAutosaveKey({ workId: result.documentId })),
    )?.pagesList ?? []) as unknown as PageState[];
    const sketch = copyPages[0]!.elements.find((element) => element.groupId?.startsWith("sample-g-sketch"));
    expect(sketch?.locked).toBeUndefined();
    expect(sketch?.opacity).toBe(0.55);
    expect(copyPages[0]!.groups?.some((group) => group.name.includes("내 연습"))).toBe(false);
  });
});

describe("buildPracticeCopyPages", () => {
  it("preserves group contiguity while remapping ids", async () => {
    const { buildSampleManuscriptPages } = await import("./studio-sample-manuscript-content");
    const { hasContiguousLayerGroups } = await import("./studio-layers");
    const pages = buildPracticeCopyPages(buildSampleManuscriptPages(), "sample-practice-9", "trace");
    for (const page of pages) {
      expect(hasContiguousLayerGroups(page.elements)).toBe(true);
      expect(page.id.endsWith("--sample-practice-9")).toBe(true);
    }
  });
});

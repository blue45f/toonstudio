import { describe, expect, it, vi } from "vitest";

import { createDefaultStudioSaveProfile } from "./studio-save-profile";
import {
  buildStudioProjectPackage,
  studioPackageCrc32,
  writeStudioProjectPackageToTarget,
} from "./studio-project-package";

const project = {
  id: "project-1",
  title: "비공개 원고",
  kind: "webtoon" as const,
  status: "active" as const,
  statusBeforeTrash: null,
  templateId: null,
  description: "",
  primaryLocale: "ko-KR",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  lastOpenedAt: "2026-09-15T00:00:00.000Z",
  lastOpenedDocumentId: null,
  thumbnailUrl: null,
};

describe("studio project package", () => {
  it("creates a real ZIP container with private manifest metadata", async () => {
    const result = buildStudioProjectPackage({
      project,
      documents: [],
      profile: createDefaultStudioSaveProfile(project.id, {
        now: "2026-09-15T00:00:00.000Z",
      }),
      exportedAt: "2026-09-15T01:00:00.000Z",
      additionalEntries: {
        "documents/index.json": JSON.stringify({ documents: [] }),
        "documents/document-0001.autosave.json": JSON.stringify({
          savedAt: "2026-09-15T00:30:00.000Z",
          pagesList: [{ id: "page-1", elements: [{ id: "stroke-1", type: "draw" }] }],
        }),
      },
    });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());

    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.fileName).toBe("비공개 원고.toonstudio");
    expect(result.manifest.accessMode).toBe("owner-only");
    expect(result.manifest.distributionState).toBe("none");
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("manifest.json");
    expect(result.manifest.entryNames).toContain("workspace/documents/index.json");
    expect(result.manifest.entryNames).toContain("workspace/documents/document-0001.autosave.json");
    expect(decoded).toContain("stroke-1");
  });

  it("computes a standard CRC32", () => {
    expect(studioPackageCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});


it("6패스 묶음 원고는 불완전한 구형 package를 만들지 않고 실제 본문 ZIP 경로를 안내한다", () => {
  expect(() => buildStudioProjectPackage({ project, documents: [], profile: createDefaultStudioSaveProfile(project.id),
    additionalEntries: { "documents/document-0001.autosave.json": JSON.stringify({ pagesList: [{ id: "p", elements: [], bg3dLtBundles: {} }] }) } })).toThrow(/\.toonproject\.zip/);
  expect(() => buildStudioProjectPackage({ project, documents: [], profile: createDefaultStudioSaveProfile(project.id),
    additionalEntries: { "documents/document-0001.autosave.json": JSON.stringify({ pagesList: [{ id: "p", note: "bg3dLtBundles 사용 설명", elements: [] }] }) } })).not.toThrow();
});

it("writeStudioProjectPackageToTarget는 스트림 쓰기 실패 시 writable.abort()를 호출해 파일 핸들 잠금을 해제한다", async () => {
  const pkg = buildStudioProjectPackage({
    project,
    documents: [],
    profile: createDefaultStudioSaveProfile(project.id),
  });
  const abort = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const handle = {
    kind: "file" as const,
    name: "비공개 원고.toonstudio",
    createWritable: async () => ({
      write: async () => {
        throw new Error("disk full");
      },
      close,
      abort,
    }),
  };

  await expect(writeStudioProjectPackageToTarget(pkg, { kind: "file-handle", handle })).rejects.toThrow("disk full");
  expect(abort).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});

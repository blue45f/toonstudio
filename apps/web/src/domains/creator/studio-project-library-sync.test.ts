// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  createStudioProject,
  readStudioProjectLibrary,
  type StudioProjectLibraryEntry,
} from "./studio-project-library-store";
import {
  mergeStudioProjectLibraryEntries,
  readPendingDeletedIds,
  recordPendingDeletedId,
  syncStudioProjectLibrary,
  type StudioProjectLibraryTransport,
} from "./studio-project-library-sync";

function memoryStorage(): Map<string, string> & {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const map = new Map<string, string>();
  return Object.assign(map, {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  });
}

function entry(overrides: Partial<StudioProjectLibraryEntry> = {}): StudioProjectLibraryEntry {
  return {
    id: "project-1",
    title: "별빛 항해자",
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: null,
    description: "",
    primaryLocale: "ko-KR",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    lastOpenedAt: "2026-10-02T00:00:00.000Z",
    lastOpenedDocumentId: null,
    thumbnailUrl: null,
    definition: null,
    ...overrides,
  } as StudioProjectLibraryEntry;
}

describe("mergeStudioProjectLibraryEntries (웹 병합 규칙)", () => {
  it("서버에만 있는 작품이 로컬로 내려오고, 로컬에만 있는 작품은 올라갈 준비를 마친다", () => {
    const localOnly = entry({ id: "local-only" });
    const serverOnly = entry({ id: "server-only" });
    const merged = mergeStudioProjectLibraryEntries([localOnly], [serverOnly], []);
    expect(merged.map((item) => item.id).sort()).toEqual(["local-only", "server-only"]);
  });

  it("같은 작품은 최신 updatedAt 쪽으로 합쳐진다", () => {
    const stale = entry({ title: "옛 제목", updatedAt: "2026-10-02T00:00:00.000Z" });
    const fresh = entry({ title: "새 제목", updatedAt: "2026-10-03T00:00:00.000Z" });
    expect(mergeStudioProjectLibraryEntries([stale], [fresh], [])).toEqual([fresh]);
    expect(mergeStudioProjectLibraryEntries([fresh], [stale], [])).toEqual([fresh]);
  });
});

describe("syncStudioProjectLibrary", () => {
  it("다른 기기에서 만든 작품이 이 기기 이어가기에 나타난다", async () => {
    const storage = memoryStorage();
    createStudioProject(storage, { id: "mine", title: "내 작품", kind: "webtoon" });
    const otherDeviceWork = entry({ id: "other-device", title: "다른 기기 작품" });
    const pushed: { projects: readonly StudioProjectLibraryEntry[] }[] = [];
    const transport: StudioProjectLibraryTransport = {
      fetchServer: async () => ({ projects: [otherDeviceWork] }),
      pushServer: async (body) => {
        pushed.push(body);
        return { projects: body.projects };
      },
    };

    const result = await syncStudioProjectLibrary({ storage, transport });

    expect(result.kind).toBe("synced");
    const local = readStudioProjectLibrary(storage);
    expect(local.projects.map((project) => project.id).sort()).toEqual(["mine", "other-device"]);
    // 병합본 전체가 서버로 올라간다 — 내 작품도 계정 정본에 포함된다.
    expect(pushed[0]?.projects.map((project) => project.id).sort()).toEqual(["mine", "other-device"]);
  });

  it("영구 삭제는 서버로 전파되고 삭제 명단이 비워진다", async () => {
    const storage = memoryStorage();
    createStudioProject(storage, { id: "kept", title: "남는 작품", kind: "webtoon" });
    recordPendingDeletedId(storage, "gone");
    let sentDeleted: readonly string[] = [];
    const transport: StudioProjectLibraryTransport = {
      fetchServer: async () => ({ projects: [entry({ id: "gone", title: "지운 작품" })] }),
      pushServer: async (body) => {
        sentDeleted = body.deletedIds;
        return { projects: body.projects };
      },
    };

    const result = await syncStudioProjectLibrary({ storage, transport });

    expect(result.kind).toBe("synced");
    expect(sentDeleted).toEqual(["gone"]);
    expect(readStudioProjectLibrary(storage).projects.map((project) => project.id)).toEqual(["kept"]);
    expect(readPendingDeletedIds(storage)).toEqual([]);
  });

  it("서버에 닿지 못하면 로컬은 건드리지 않고 실패로 남긴다", async () => {
    const storage = memoryStorage();
    createStudioProject(storage, { id: "mine", title: "내 작품", kind: "webtoon" });
    const transport: StudioProjectLibraryTransport = {
      fetchServer: async () => {
        throw new Error("offline");
      },
      pushServer: async () => {
        throw new Error("offline");
      },
    };

    const result = await syncStudioProjectLibrary({ storage, transport });

    expect(result.kind).toBe("failed");
    expect(readStudioProjectLibrary(storage).projects.map((project) => project.id)).toEqual(["mine"]);
  });
});

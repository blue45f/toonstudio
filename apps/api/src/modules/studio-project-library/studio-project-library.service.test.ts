import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  StudioProjectLibraryEntrySchema,
  SyncStudioProjectLibraryBodySchema,
  type StudioProjectLibraryEntryDto,
} from "./studio-project-library.dto";
import {
  StudioProjectLibraryService,
  mergeStudioProjectLibraryEntries,
} from "./studio-project-library.service";

function entry(overrides: Partial<StudioProjectLibraryEntryDto> = {}): StudioProjectLibraryEntryDto {
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
    ...overrides,
  };
}

describe("mergeStudioProjectLibraryEntries (항목 단위 병합)", () => {
  it("서버에만 있는 작품은 그대로 남는다 — 부재는 삭제가 아니다", () => {
    const serverOnly = entry({ id: "server-only" });
    expect(mergeStudioProjectLibraryEntries([serverOnly], [], [])).toEqual([serverOnly]);
  });

  it("같은 작품은 updatedAt이 최신인 쪽이 이긴다", () => {
    const older = entry({ title: "옛 제목", updatedAt: "2026-10-02T00:00:00.000Z" });
    const newer = entry({ title: "새 제목", updatedAt: "2026-10-03T00:00:00.000Z" });
    expect(mergeStudioProjectLibraryEntries([older], [newer], [])).toEqual([newer]);
    expect(mergeStudioProjectLibraryEntries([newer], [older], [])).toEqual([newer]);
  });

  it("deletedIds에 명시된 작품만 사라지고, 들어온 신규 작품은 더해진다", () => {
    const kept = entry({ id: "kept" });
    const removed = entry({ id: "removed" });
    const added = entry({ id: "added", lastOpenedAt: "2026-10-04T00:00:00.000Z" });
    const merged = mergeStudioProjectLibraryEntries([kept, removed], [added], ["removed"]);
    expect(merged.map((item) => item.id)).toEqual(["added", "kept"]);
  });

  it("삭제 목록에 오른 작품은 최신본이 들어와도 부활하지 않는다", () => {
    const ghost = entry({ id: "ghost", updatedAt: "2026-10-05T00:00:00.000Z" });
    expect(mergeStudioProjectLibraryEntries([], [ghost], ["ghost"])).toEqual([]);
  });
});

describe("StudioProjectLibrary 계약 검증", () => {
  it("웹 라이브러리 항목 형태를 그대로 받는다", () => {
    expect(StudioProjectLibraryEntrySchema.safeParse(entry()).success).toBe(true);
    const body = SyncStudioProjectLibraryBodySchema.parse({ projects: [entry()] });
    expect(body.deletedIds).toEqual([]);
  });

  it("알 수 없는 작품 종류와 깨진 시각은 거절한다", () => {
    expect(StudioProjectLibraryEntrySchema.safeParse(entry({ kind: "hologram" as never })).success).toBe(false);
    expect(StudioProjectLibraryEntrySchema.safeParse(entry({ updatedAt: "어제" })).success).toBe(false);
  });

  it("로그인 없이는 읽기도 쓰기도 할 수 없다", async () => {
    const service = new StudioProjectLibraryService();
    await expect(service.getLibrary(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.syncLibrary("  ", { projects: [], deletedIds: [] })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

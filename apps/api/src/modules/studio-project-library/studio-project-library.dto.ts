import { z } from "zod";

/**
 * 작품 라이브러리 동기화 계약 (웹 studio-project-library-store의 항목 형태와 1:1).
 * 서버는 동기화 정본이지 항목 의미의 소유자가 아니다 — 스칼라 필드는 경계에서
 * 구조 검증을 하고, definition(작품 정의 JSON)은 웹 리더가 읽을 때 재검증하므로
 * 여기서는 크기만 제한해 통과시킨다.
 */
const isoTimestamp = z.string().datetime({ offset: true });

export const StudioProjectLibraryEntrySchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(120),
  kind: z.enum([
    "webtoon",
    "illustration",
    "image",
    "design",
    "slides",
    "storyboard",
    "three-d",
    "animation",
  ]),
  status: z.enum(["active", "archived", "trashed"]),
  statusBeforeTrash: z.enum(["active", "archived"]).nullable(),
  templateId: z.string().max(200).nullable(),
  description: z.string().max(1_000),
  primaryLocale: z.string().min(2).max(35),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  lastOpenedAt: isoTimestamp,
  lastOpenedDocumentId: z.string().max(200).nullable(),
  thumbnailUrl: z.string().max(2_048).nullable(),
  definition: z.unknown().optional(),
});

export type StudioProjectLibraryEntryDto = z.infer<typeof StudioProjectLibraryEntrySchema>;

/** 웹 MAX_PROJECTS와 같은 상한. 동기화는 전체 집합을 한 번에 주고받는다. */
export const STUDIO_PROJECT_LIBRARY_MAX_ENTRIES = 5_000;

export const SyncStudioProjectLibraryBodySchema = z.object({
  projects: z.array(StudioProjectLibraryEntrySchema).max(STUDIO_PROJECT_LIBRARY_MAX_ENTRIES),
  /** 영구 삭제된 작품 id. 삭제는 이 명시 목록으로만 일어난다 — 부재는 삭제가 아니다. */
  deletedIds: z.array(z.string().min(1).max(200)).max(STUDIO_PROJECT_LIBRARY_MAX_ENTRIES).default([]),
});

export type SyncStudioProjectLibraryBody = z.infer<typeof SyncStudioProjectLibraryBodySchema>;

export interface StudioProjectLibraryDto {
  readonly projects: readonly StudioProjectLibraryEntryDto[];
  /** 병합 결과 집합의 최신 updatedAt. 항목이 없으면 null. */
  readonly updatedAt: string | null;
}

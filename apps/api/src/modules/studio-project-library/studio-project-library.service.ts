import {
  Injectable,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { db, studioProjectLibraryEntries } from "../../platform/database";
import type {
  StudioProjectLibraryDto,
  StudioProjectLibraryEntryDto,
  SyncStudioProjectLibraryBody,
} from "./studio-project-library.dto";

/** 동기화 전체 집합의 직렬화 상한. 항목 메타데이터만이라 정상 사용에선 닿지 않는다. */
const MAX_SYNC_PAYLOAD_BYTES = 8 * 1024 * 1024;

function entryTime(entry: StudioProjectLibraryEntryDto): number {
  return Date.parse(entry.updatedAt);
}

/**
 * 항목 단위 병합의 단일 규칙 (서버·클라이언트가 같은 규칙을 쓴다).
 * - 삭제는 deletedIds로 명시된 것만. 집합에서 빠졌다는 이유로는 지우지 않는다
 *   (다른 기기가 방금 추가한 작품을 오래된 기기의 동기화가 지우면 안 된다).
 * - 같은 작품은 updatedAt이 최신인 쪽이 이긴다. 동률이면 들어온 쪽을 택한다.
 */
export function mergeStudioProjectLibraryEntries(
  server: readonly StudioProjectLibraryEntryDto[],
  incoming: readonly StudioProjectLibraryEntryDto[],
  deletedIds: readonly string[],
): readonly StudioProjectLibraryEntryDto[] {
  const deleted = new Set(deletedIds);
  const byId = new Map<string, StudioProjectLibraryEntryDto>();
  for (const entry of server) {
    if (!deleted.has(entry.id)) byId.set(entry.id, entry);
  }
  for (const entry of incoming) {
    if (deleted.has(entry.id)) continue;
    const current = byId.get(entry.id);
    if (!current || entryTime(entry) >= entryTime(current)) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => {
    const byOpened = Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt);
    return byOpened !== 0 ? byOpened : a.id.localeCompare(b.id);
  });
}

function toDto(projects: readonly StudioProjectLibraryEntryDto[]): StudioProjectLibraryDto {
  let updatedAt: string | null = null;
  for (const entry of projects) {
    if (updatedAt === null || entryTime(entry) > Date.parse(updatedAt)) updatedAt = entry.updatedAt;
  }
  return { projects, updatedAt };
}

@Injectable()
export class StudioProjectLibraryService {
  private requireUserId(userId: string | undefined): string {
    const id = userId?.trim();
    if (!id) throw new UnauthorizedException("로그인이 필요해요.");
    return id;
  }

  async getLibrary(userId: string | undefined): Promise<StudioProjectLibraryDto> {
    const id = this.requireUserId(userId);
    const rows = await db
      .select()
      .from(studioProjectLibraryEntries)
      .where(eq(studioProjectLibraryEntries.userId, id));
    return toDto(rows.map((row) => row.entry as StudioProjectLibraryEntryDto));
  }

  /**
   * 클라이언트의 전체 집합을 받아 병합하고, 병합 결과 전체를 돌려준다 —
   * 클라이언트는 응답을 그대로 로컬 정본으로 삼아 수렴한다.
   * 쓰기는 최소로: 삭제 명시분 삭제 + 병합에서 이긴 들어온 항목만 upsert.
   */
  async syncLibrary(
    userId: string | undefined,
    body: SyncStudioProjectLibraryBody,
  ): Promise<StudioProjectLibraryDto> {
    const id = this.requireUserId(userId);
    if (JSON.stringify(body).length > MAX_SYNC_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException("동기화할 작품 목록이 너무 큽니다.");
    }
    const rows = await db
      .select()
      .from(studioProjectLibraryEntries)
      .where(eq(studioProjectLibraryEntries.userId, id));
    const serverEntries = rows.map((row) => row.entry as StudioProjectLibraryEntryDto);
    const merged = mergeStudioProjectLibraryEntries(serverEntries, body.projects, body.deletedIds);
    const mergedById = new Map(merged.map((entry) => [entry.id, entry]));

    await db.transaction(async (tx) => {
      for (const deletedId of body.deletedIds) {
        await tx
          .delete(studioProjectLibraryEntries)
          .where(
            and(
              eq(studioProjectLibraryEntries.userId, id),
              eq(studioProjectLibraryEntries.projectId, deletedId),
            ),
          );
      }
      for (const entry of body.projects) {
        if (mergedById.get(entry.id) !== entry) continue;
        await tx
          .insert(studioProjectLibraryEntries)
          .values({
            userId: id,
            projectId: entry.id,
            entry,
            entryUpdatedAt: new Date(entry.updatedAt),
          })
          .onConflictDoUpdate({
            target: [studioProjectLibraryEntries.userId, studioProjectLibraryEntries.projectId],
            set: { entry, entryUpdatedAt: new Date(entry.updatedAt), syncedAt: new Date() },
          });
      }
    });
    return toDto(merged);
  }
}

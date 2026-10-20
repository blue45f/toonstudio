import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { db, studioUnitySpaceLayouts } from "../../platform/database";
import { CreatorService } from "../creator/creator.service";
import {
  type UnitySpaceLayoutDto,
  type SaveUnitySpaceLayoutBody,
} from "./studio-unity-space-layout.dto";

/**
 * 작품 멤버십이 공간 정의 접근의 권한 경계다 (voice ICE 정책과 동일).
 * 팀에 없는 작품은 존재 자체를 숨기기 위해 404로 답한다.
 *
 * 읽기는 활성 구성원(view) 전원에게 열리지만 저장은 편집 권한(edit)이 있는 역할만 한다.
 * viewer·commenter 는 협업 역할 정책상 읽기 전용이라 공간 정의를 덮어쓸 수 없다.
 */
@Injectable()
export class StudioUnitySpaceLayoutService {
  constructor(
    @Inject(CreatorService) private readonly creatorService: CreatorService,
  ) {}

  private async requireViewer(
    userId: string | undefined,
    workId: string,
    need: "view" | "edit" = "view",
  ) {
    const id = userId?.trim();
    if (!id) throw new ForbiddenException("로그인이 필요합니다.");

    const { viewer } = await this.creatorService.getWorkTeam(id, workId);
    if (!viewer || viewer.status !== "active" || !viewer.capabilities.view) {
      throw new ForbiddenException("이 작품의 공간 정의를 볼 권한이 없습니다.");
    }
    if (need === "edit" && !viewer.capabilities.edit) {
      throw new ForbiddenException("이 작품의 공간 정의를 수정할 권한이 없습니다.");
    }
    return viewer;
  }

  async getLayout(
    userId: string | undefined,
    workId: string,
    spaceId: string,
  ): Promise<UnitySpaceLayoutDto> {
    await this.requireViewer(userId, workId);

    const [row] = await db
      .select()
      .from(studioUnitySpaceLayouts)
      .where(
        and(
          eq(studioUnitySpaceLayouts.workId, workId),
          eq(studioUnitySpaceLayouts.spaceId, spaceId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("저장된 공간 정의가 없습니다.");

    return {
      workId: row.workId,
      spaceId: row.spaceId,
      definition: row.definition as UnitySpaceLayoutDto["definition"],
      revision: row.revision,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * 저장은 낙관적 동시성으로 직행한다. expectedRevision=0 + 행 없음이면
   * 신규 저장, 그 외에는 revision 일치 행만 갱신한다. 어느 쪽도 아니면
   * 현재 revision을 실어 409 — 클라이언트가 재조회 후 다시 시도하게 한다.
   */
  async saveLayout(
    userId: string | undefined,
    workId: string,
    spaceId: string,
    body: SaveUnitySpaceLayoutBody,
  ): Promise<UnitySpaceLayoutDto> {
    const viewer = await this.requireViewer(userId, workId, "edit");
    if (body.definition.id !== spaceId) {
      throw new BadRequestException("경로의 spaceId와 정의의 id가 다릅니다.");
    }
    const now = new Date();

    if (body.expectedRevision === 0) {
      const inserted = await db
        .insert(studioUnitySpaceLayouts)
        .values({
          workId,
          spaceId,
          definition: body.definition,
          revision: 1,
          updatedByUserId: viewer.userId,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [studioUnitySpaceLayouts.workId, studioUnitySpaceLayouts.spaceId],
        })
        .returning();
      if (inserted[0]) return this.toDto(inserted[0]);
    } else {
      const updated = await db
        .update(studioUnitySpaceLayouts)
        .set({
          definition: body.definition,
          revision: body.expectedRevision + 1,
          updatedByUserId: viewer.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(studioUnitySpaceLayouts.workId, workId),
            eq(studioUnitySpaceLayouts.spaceId, spaceId),
            eq(studioUnitySpaceLayouts.revision, body.expectedRevision),
          ),
        )
        .returning();
      if (updated[0]) return this.toDto(updated[0]);
    }

    const [current] = await db
      .select({ revision: studioUnitySpaceLayouts.revision })
      .from(studioUnitySpaceLayouts)
      .where(
        and(
          eq(studioUnitySpaceLayouts.workId, workId),
          eq(studioUnitySpaceLayouts.spaceId, spaceId),
        ),
      )
      .limit(1);
    throw new ConflictException({
      message: "다른 편집자가 먼저 저장했습니다. 최신 정의를 다시 불러온 뒤 저장하세요.",
      currentRevision: current?.revision ?? 0,
    });
  }

  private toDto(row: typeof studioUnitySpaceLayouts.$inferSelect): UnitySpaceLayoutDto {
    return {
      workId: row.workId,
      spaceId: row.spaceId,
      definition: row.definition as UnitySpaceLayoutDto["definition"],
      revision: row.revision,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

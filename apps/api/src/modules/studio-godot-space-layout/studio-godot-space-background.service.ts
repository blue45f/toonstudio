import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { db, studioGodotSpaceBackgrounds } from "../../platform/database";
import { CreatorService } from "../creator/creator.service";
import {
  godotSpaceBackgroundRef,
  type GodotSpaceBackgroundDto,
} from "./studio-godot-space-background.dto";
import {
  GODOT_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK,
  GODOT_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK,
  validateGodotBackgroundGlb,
} from "./studio-godot-background-glb";

export interface GodotSpaceBackgroundUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export interface GodotSpaceBackgroundContent {
  payload: Buffer;
  sha256: string;
  byteSize: number;
  fileName: string;
}

const MAX_FILE_NAME_LENGTH = 120;

/**
 * 작품 멤버십이 배경 자산의 권한 경계다 (공간 정의와 동일).
 * 목록은 활성 팀 멤버(view)에게, 업로드·삭제는 편집 권한(edit)이 있는 역할만 허용한다 —
 * viewer·commenter 는 협업 역할 정책상 읽기 전용이다. content 서빙만 예외로
 * 인증을 요구하지 않는다 — assetId(UUID)가 capability이고,
 * 배경은 방 안 전원에게 보이는 장식층이며, Godot 무대는
 * 커스텀 인증 헤더를 실을 수 없기 때문이다. 기존 카탈로그
 * 배경(spaces/*.glb)이 공개 정적 파일인 것과 같은 가시성이다.
 */
@Injectable()
export class StudioGodotSpaceBackgroundService {
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
      throw new ForbiddenException("이 작품의 공간 배경을 관리할 권한이 없습니다.");
    }
    if (need === "edit" && !viewer.capabilities.edit) {
      throw new ForbiddenException("이 작품의 공간 배경을 수정할 권한이 없습니다.");
    }
    return viewer;
  }

  async upload(
    userId: string | undefined,
    workId: string,
    file: GodotSpaceBackgroundUploadFile | undefined,
  ): Promise<GodotSpaceBackgroundDto> {
    const viewer = await this.requireViewer(userId, workId, "edit");
    if (!file || !file.buffer || file.buffer.byteLength === 0) {
      throw new BadRequestException("올릴 GLB 파일이 없습니다.");
    }

    const verdict = validateGodotBackgroundGlb(file.buffer);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    await this.assertWithinWorkStorageLimits(workId, file.buffer.byteLength);

    const assetId = randomUUID();
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const fileName = sanitizeFileName(file.originalname);
    const now = new Date();

    const [row] = await db
      .insert(studioGodotSpaceBackgrounds)
      .values({
        workId,
        assetId,
        fileName,
        byteSize: file.buffer.byteLength,
        sha256,
        payload: file.buffer,
        uploadedByUserId: viewer.userId,
        createdAt: now,
      })
      .returning();
    return this.toDto(row);
  }

  /**
   * 페이로드가 DB bytea 라서 작품별 보관 개수·총 용량에 상한을 둔다(파일 하나의 상한만으로는
   * 업로드를 반복하는 계정이 DB 용량을 끝없이 쓸 수 있다). 조회와 삽입 사이에 락을 잡지 않는
   * 느슨한 상한이라 동시 업로드가 겹치면 요청 수만큼(최대 파일 하나 20MB씩) 넘을 수 있다.
   */
  private async assertWithinWorkStorageLimits(
    workId: string,
    incomingBytes: number,
  ): Promise<void> {
    const [usage] = await db
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<string>`coalesce(sum(${studioGodotSpaceBackgrounds.byteSize}), 0)::bigint`,
      })
      .from(studioGodotSpaceBackgrounds)
      .where(eq(studioGodotSpaceBackgrounds.workId, workId));
    const storedCount = Number(usage?.count ?? 0);
    const storedBytes = Number(usage?.bytes ?? 0);
    if (storedCount >= GODOT_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK) {
      throw new PayloadTooLargeException(
        `배경 자산은 작품당 최대 ${GODOT_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK}개까지 올릴 수 있어요. 쓰지 않는 배경을 삭제한 뒤 다시 올려 주세요.`,
      );
    }
    if (storedBytes + incomingBytes > GODOT_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK) {
      throw new PayloadTooLargeException(
        `배경 자산의 총 용량은 작품당 ${GODOT_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK / (1024 * 1024)}MB까지예요. 쓰지 않는 배경을 삭제한 뒤 다시 올려 주세요.`,
      );
    }
  }

  async list(
    userId: string | undefined,
    workId: string,
  ): Promise<GodotSpaceBackgroundDto[]> {
    await this.requireViewer(userId, workId);
    const rows = await db
      .select({
        workId: studioGodotSpaceBackgrounds.workId,
        assetId: studioGodotSpaceBackgrounds.assetId,
        fileName: studioGodotSpaceBackgrounds.fileName,
        byteSize: studioGodotSpaceBackgrounds.byteSize,
        sha256: studioGodotSpaceBackgrounds.sha256,
        uploadedByUserId: studioGodotSpaceBackgrounds.uploadedByUserId,
        createdAt: studioGodotSpaceBackgrounds.createdAt,
      })
      .from(studioGodotSpaceBackgrounds)
      .where(eq(studioGodotSpaceBackgrounds.workId, workId))
      .orderBy(desc(studioGodotSpaceBackgrounds.createdAt));
    return rows.map((row) => this.toDto(row));
  }

  /**
   * 무대 서빙 전용 조회 — 인증 없음 (클래스 주석의 capability
   * 근거). workId까지 함께 맞춰 남의 작품 배경을 id만으로
   * 긁어오는 경계도 닫는다.
   */
  async getContent(
    workId: string,
    assetId: string,
  ): Promise<GodotSpaceBackgroundContent> {
    const [row] = await db
      .select()
      .from(studioGodotSpaceBackgrounds)
      .where(
        and(
          eq(studioGodotSpaceBackgrounds.workId, workId),
          eq(studioGodotSpaceBackgrounds.assetId, assetId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("배경 자산을 찾을 수 없습니다.");
    return {
      payload: Buffer.from(row.payload),
      sha256: row.sha256,
      byteSize: row.byteSize,
      fileName: row.fileName,
    };
  }

  async remove(
    userId: string | undefined,
    workId: string,
    assetId: string,
  ): Promise<{ deleted: true }> {
    await this.requireViewer(userId, workId, "edit");
    const deleted = await db
      .delete(studioGodotSpaceBackgrounds)
      .where(
        and(
          eq(studioGodotSpaceBackgrounds.workId, workId),
          eq(studioGodotSpaceBackgrounds.assetId, assetId),
        ),
      )
      .returning({ assetId: studioGodotSpaceBackgrounds.assetId });
    if (deleted.length === 0) {
      throw new NotFoundException("배경 자산을 찾을 수 없습니다.");
    }
    return { deleted: true };
  }

  private toDto(
    row: Omit<typeof studioGodotSpaceBackgrounds.$inferSelect, "payload">,
  ): GodotSpaceBackgroundDto {
    return {
      assetId: row.assetId,
      glbRef: godotSpaceBackgroundRef(row.assetId),
      fileName: row.fileName,
      byteSize: row.byteSize,
      sha256: row.sha256,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function sanitizeFileName(originalname: string | undefined): string {
  const base = (originalname ?? "")
    .split(/[\\/]/)
    .pop()
    ?.trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_FILE_NAME_LENGTH);
  return base && base.length > 0 ? base : "background.glb";
}

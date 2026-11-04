import { BadRequestException, type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { creatorWorks, db } from "../../platform/database";
import { assertStudioBg3dBundleAuthorizedReader } from "./studio-bg3d-bundle.repository";

const features = z.array(z.string().min(1).max(96)).max(32);
export function parseStudioBg3dReaderCapabilities(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (typeof value !== "string" || value.length > 4096) throw new BadRequestException("문서 reader capability 요청이 올바르지 않습니다.");
  try { return features.parse(value.trim().startsWith("[") ? JSON.parse(value) : value.split(",").map((item) => item.trim()).filter(Boolean)); }
  catch { throw new BadRequestException("문서 reader capability 요청이 올바르지 않습니다."); }
}
@Injectable()
export class StudioBg3dBundleReaderGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params?: { id?: string }; headers?: Record<string, unknown> }>();
    const actor = request.headers?.["x-user-id"], workId = request.params?.id;
    if (typeof actor !== "string" || !actor || typeof workId !== "string" || !workId) throw new ForbiddenException("로그인이 필요합니다.");
    const required = await assertStudioBg3dBundleAuthorizedReader(actor, workId, parseStudioBg3dReaderCapabilities(request.headers?.["x-studio-reader-capabilities"]));
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader("x-studio-required-reader-capabilities", JSON.stringify(required));
    return true;
  }
}

/** 공개 열람은 기존 경로를 쓰고 소유자의 편집용 원문 응답만 reader 요구로 보호한다. */
@Injectable()
export class StudioBg3dBundleOwnerReaderGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params?: { id?: string }; headers?: Record<string, unknown> }>();
    const actor = request.headers?.["x-user-id"], workId = request.params?.id;
    if (typeof actor !== "string" || !actor || typeof workId !== "string" || !workId) return true;
    const [owned] = await db.select({ id: creatorWorks.id }).from(creatorWorks).where(and(eq(creatorWorks.id, workId), eq(creatorWorks.userId, actor))).limit(1);
    if (!owned) return true;
    return new StudioBg3dBundleReaderGuard().canActivate(context);
  }
}

import {
  Controller, ForbiddenException, Get, Inject, Injectable, Param, Req, Res,
  UnauthorizedException, UseGuards, type CanActivate, type ExecutionContext,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { resolveSessionCookieValue } from "../../session-cookie";
import { getSessionAuthenticationPrincipal, getSessionAuthenticationSource } from "../../session-middleware";
import { CreatorTeamWorkParamsDto } from "./creator.dto";
import { CreatorService } from "./creator.service";
import { StudioBg3dBundleReaderGuard } from "./studio-bg3d-bundle-reader.guard";

const MAX_OWNER_RECEIPT_AGE_MS = 5 * 60 * 1000;

@Injectable()
export class OfflineOwnerReceiptCookieGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // 다음 reader 검사와 DTO 검증까지 통과한 응답만 브라우저가 재사용할 수 있다.
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.vary("Cookie, Authorization, X-Api-Key, X-User-Id, X-Studio-Reader-Capabilities");
    if (
      getSessionAuthenticationSource(request) !== "cookie" ||
      !resolveSessionCookieValue(request.headers.cookie) ||
      request.headers.authorization !== undefined ||
      request.headers["x-api-key"] !== undefined
    ) {
      throw new UnauthorizedException("로그인한 기기에서만 원고 사본을 열 수 있어요.");
    }
    return true;
  }
}

@Controller()
export class CreatorOfflineOwnerReceiptController {
  constructor(@Inject(CreatorService) private readonly creatorService: CreatorService) {}

  @Get("/creator/works/:id/team/document/offline-owner-receipt")
  @UseGuards(OfflineOwnerReceiptCookieGuard, StudioBg3dBundleReaderGuard)
  async issue(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const principal = getSessionAuthenticationPrincipal(request);
    if (!principal || principal.userId !== request.headers["x-user-id"]) {
      throw new UnauthorizedException("로그인 세션을 확인해 주세요.");
    }
    const { userId } = principal;
    const meta = await this.creatorService.getSharedWorkDocumentMeta(userId, params.id);
    if (meta.workId !== params.id || meta.role !== "owner") {
      throw new ForbiddenException("원고 소유자만 기기 사본을 열 수 있어요.");
    }
    const access = await this.creatorService.getWorkAuthorization(userId, params.id);
    if (access.workId !== params.id || access.viewer.userId !== userId || access.viewer.role !== "owner") {
      throw new ForbiddenException("원고 소유자를 확인할 수 없어요.");
    }
    const now = Date.now();
    if (principal.expiresAt <= now) throw new UnauthorizedException("로그인 세션이 만료됐어요.");
    const expiresAt = Math.min(
      now + MAX_OWNER_RECEIPT_AGE_MS,
      principal.expiresAt,
      access.authorizationExpiresAt === undefined ? Infinity : Date.parse(access.authorizationExpiresAt),
    );
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
      throw new ForbiddenException("원고 열람 시간이 만료됐어요.");
    }
    const maxAgeSeconds = Math.floor((expiresAt - now) / 1000);
    response.setHeader("Cache-Control", `private, max-age=${maxAgeSeconds}, must-revalidate`);
    return { userId, workId: params.id, revision: meta.revision, expiresAt };
  }
}

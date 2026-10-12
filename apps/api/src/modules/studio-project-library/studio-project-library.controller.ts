import { Body, Controller, Get, Headers, Inject, Put } from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  SyncStudioProjectLibraryBodySchema,
  type StudioProjectLibraryDto,
  type SyncStudioProjectLibraryBody,
} from "./studio-project-library.dto";
import { StudioProjectLibraryService } from "./studio-project-library.service";

/**
 * 작품 라이브러리(이어가기 목록) 계정 동기화 경계.
 * 인증은 세션 미들웨어가 치환한 x-user-id 헤더 규약을 따른다 (브라우저는 쿠키 인증).
 * 게스트는 이 경계를 쓰지 않는다 — 게스트 라이브러리는 기기 로컬이 정본이다.
 */
@Controller("studio-project-library")
export class StudioProjectLibraryController {
  constructor(
    @Inject(StudioProjectLibraryService)
    private readonly libraryService: StudioProjectLibraryService,
  ) {}

  @Get()
  getLibrary(@Headers("x-user-id") userId?: string): Promise<StudioProjectLibraryDto> {
    return this.libraryService.getLibrary(userId);
  }

  @Put()
  syncLibrary(
    @Body(new ZodValidationPipe(SyncStudioProjectLibraryBodySchema))
    body: SyncStudioProjectLibraryBody,
    @Headers("x-user-id") userId?: string,
  ): Promise<StudioProjectLibraryDto> {
    return this.libraryService.syncLibrary(userId, body);
  }
}

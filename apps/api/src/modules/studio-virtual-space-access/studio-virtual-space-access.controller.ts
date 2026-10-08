import { Body, Controller, ForbiddenException, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  IssueSpaceEntryCodeDto, SpaceEntryCodeParamsDto, VerifySpaceEntryCodeDto, VerifySpatialInviteDto,
} from "./studio-virtual-space-access.dto";
import { StudioVirtualSpaceAccessRepository } from "./studio-virtual-space-access.repository";

function actor(value: string | undefined): string {
  // 세션 미들웨어가 클라이언트 신원 헤더를 제거한 뒤 검증된 사용자를 주입한다.
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}

/**
 * 가상 스튜디오 게스트 자격 검증 API (F-B06-1).
 * 초대 토큰·입장코드는 전부 서버 판정을 거친 뒤에만 게스트 세션을 만들 수 있다.
 * 검증 엔드포인트는 자격을 소모하지 않는다 — 소모는 워크스페이스 수락의 몫이다.
 */
@Controller("studio/space")
export class StudioVirtualSpaceAccessController {
  constructor(
    @Inject(StudioVirtualSpaceAccessRepository)
    private readonly repository: StudioVirtualSpaceAccessRepository,
  ) {}

  @Post("access/invite/verify")
  @Header("Cache-Control", "private, no-store")
  verifyInvite(@Body(new ZodValidationPipe(VerifySpatialInviteDto)) body: VerifySpatialInviteDto) {
    return this.repository.verifyInvite(body);
  }

  @Post("access/entry-codes")
  @Header("Cache-Control", "private, no-store")
  issueEntryCode(@Body(new ZodValidationPipe(IssueSpaceEntryCodeDto)) body: IssueSpaceEntryCodeDto,
    @Headers("x-user-id") userId?: string) {
    return this.repository.issueEntryCode(actor(userId), body);
  }

  @Post("access/entry-codes/verify")
  @Header("Cache-Control", "private, no-store")
  verifyEntryCode(@Body(new ZodValidationPipe(VerifySpaceEntryCodeDto)) body: VerifySpaceEntryCodeDto) {
    return this.repository.verifyEntryCode(body);
  }

  @Post("access/entry-codes/:id/revoke")
  @Header("Cache-Control", "private, no-store")
  revokeEntryCode(@Param(new ZodValidationPipe(SpaceEntryCodeParamsDto)) params: SpaceEntryCodeParamsDto,
    @Headers("x-user-id") userId?: string) {
    return this.repository.revokeEntryCode(actor(userId), params.id);
  }
}

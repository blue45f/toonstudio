import {
  Body,
  Controller,
  Inject,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";

import { createAnonymousClientLimiter } from "../../platform/http/anonymous-client-limit";

import { CreatorEcosystemService } from "./creator-ecosystem.service";

import type { Request } from "express";

// 로그인 없이 서버 키(도서관 정보나루)로 외부 API를 부르는 조회다. 클라이언트별로 제한한다.
const libraryHoldingsLimiter = createAnonymousClientLimiter({
  name: "creator-ecosystem-library-holdings",
  limit: 20,
  windowMs: 60_000,
});

@Controller()
export class CreatorEcosystemController {
  constructor(@Inject(CreatorEcosystemService) private readonly service: CreatorEcosystemService) {}

  @Get("creator-ecosystem/collaboration/creators")
  @Header("Cache-Control", "no-store, max-age=0")
  listCreators() {
    return this.service.listCollaborationCreators();
  }

  @Get("creator-ecosystem/collaboration/me/preferences")
  @Header("Cache-Control", "no-store, max-age=0")
  getPreferences(@Headers("x-user-id") userId?: string) {
    return this.service.getMyCollaborationPreference(userId ?? "");
  }

  @Put("creator-ecosystem/collaboration/me/preferences")
  @Header("Cache-Control", "no-store, max-age=0")
  savePreferences(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.saveMyCollaborationPreference(userId ?? "", body);
  }

  @Get("creator-ecosystem/collaboration/me/business-profile")
  @Header("Cache-Control", "no-store, max-age=0")
  getBusinessProfile(@Headers("x-user-id") userId?: string) {
    return this.service.getMyBusinessProfile(userId ?? "");
  }

  @Put("creator-ecosystem/collaboration/me/business-profile")
  @Header("Cache-Control", "no-store, max-age=0")
  saveBusinessProfile(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.saveMyBusinessProfile(userId ?? "", body);
  }

  @Post("creator-ecosystem/collaboration/me/business-profile/submit-verification")
  @Header("Cache-Control", "no-store, max-age=0")
  submitBusinessVerification(@Headers("x-user-id") userId?: string) {
    return this.service.submitBusinessVerification(userId ?? "");
  }

  @Post("creator-ecosystem/collaboration/proposals")
  @Header("Cache-Control", "no-store, max-age=0")
  createProposal(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createProposal(userId ?? "", body);
  }

  @Get("creator-ecosystem/collaboration/me/inbox")
  @Header("Cache-Control", "no-store, max-age=0")
  proposalInbox(@Headers("x-user-id") userId?: string) {
    return this.service.listMyProposalInbox(userId ?? "");
  }

  @Get("creator-ecosystem/collaboration/me/sent")
  @Header("Cache-Control", "no-store, max-age=0")
  sentProposals(@Headers("x-user-id") userId?: string) {
    return this.service.listMySentProposals(userId ?? "");
  }

  @Patch("creator-ecosystem/collaboration/proposals/:id/status")
  @Header("Cache-Control", "no-store, max-age=0")
  setProposalStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { status?: unknown },
  ) {
    return this.service.updateProposalStatus(userId ?? "", id, body?.status);
  }

  @Get("creator-ecosystem/library/me")
  @Header("Cache-Control", "no-store, max-age=0")
  myCollection(@Headers("x-user-id") userId?: string) {
    return this.service.listMyCollection(userId ?? "");
  }

  @Post("creator-ecosystem/library/me/items")
  @Header("Cache-Control", "no-store, max-age=0")
  addCollectionItem(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.addCollectionItem(userId ?? "", body);
  }

  @Patch("creator-ecosystem/library/me/items/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  updateCollectionItem(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateCollectionItem(userId ?? "", id, body);
  }

  @Delete("creator-ecosystem/library/me/items/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  removeCollectionItem(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.service.removeCollectionItem(userId ?? "", id);
  }

  @Get("creator-ecosystem/library/holdings")
  @Header("Cache-Control", "private, max-age=300")
  libraryHoldings(
    @Query("isbn") isbn?: string,
    @Query("region") region?: string,
    @Req() request?: Request,
  ) {
    if (request) libraryHoldingsLimiter.enforce(request);
    return this.service.getLibraryHoldings(isbn, region);
  }

  @Get("admin/creator-ecosystem/business-verifications")
  @Header("Cache-Control", "no-store, max-age=0")
  verificationQueue(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
  ) {
    return this.service.listBusinessVerificationQueue(userId ?? "", status);
  }

  @Patch("admin/creator-ecosystem/business-verifications/:userId")
  @Header("Cache-Control", "no-store, max-age=0")
  reviewVerification(
    @Headers("x-user-id") operatorId: string | undefined,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    return this.service.reviewBusinessVerification(operatorId ?? "", userId, body);
  }
}

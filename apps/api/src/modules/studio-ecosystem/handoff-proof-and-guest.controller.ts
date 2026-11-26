import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";

import {
  HandoffProofAndGuestService,
  type VerifiedAssetEntryInput,
} from "./handoff-proof-and-guest.service";

@Controller("api/studio-ecosystem")
export class HandoffProofAndGuestController {
  constructor(
    @Inject(HandoffProofAndGuestService)
    private readonly proofService: HandoffProofAndGuestService,
  ) {}

  @Post("handoff/rights-certificate")
  issueCertificate(
    @Body()
    body: {
      workTitle: string;
      episodeLabel: string;
      creatorName: string;
      verifiedAssets: VerifiedAssetEntryInput[];
      zeroUnauthorizedAiConfirmed: boolean;
    },
  ) {
    return this.proofService.issueDeliveryRightsCertificate(body);
  }

  @Get("handoff/rights-certificate/:certificateId")
  verifyCertificate(
    @Param("certificateId") certificateId: string,
    @Query("digest") digest?: string,
  ) {
    return this.proofService.verifyDeliveryRightsCertificate(
      certificateId,
      digest,
    );
  }

  @Post("handoff/guest-links")
  createGuestLink(
    @Body()
    body: {
      workspaceId: string;
      episodeCutLabel: string;
      createdByUserId: string;
      ttlHours?: number;
    },
  ) {
    return this.proofService.createGuestReviewLink(body);
  }

  @Get("handoff/guest-links/:token")
  getGuestSession(@Param("token") token: string) {
    return this.proofService.getGuestReviewSession(token);
  }

  @Post("handoff/guest-links/:token/pins")
  submitGuestPin(
    @Param("token") token: string,
    @Body()
    body: {
      reviewerLabel: string;
      cutNumber: number;
      noteKo: string;
      mandatory?: boolean;
    },
  ) {
    return this.proofService.submitGuestReviewPin(token, body);
  }

  @Post("handoff/guest-links/:token/revoke")
  revokeGuestLink(@Param("token") token: string) {
    return this.proofService.revokeGuestReviewLink(token);
  }

  @Get("handoff/byok/:workspaceId")
  getByokPolicy(@Param("workspaceId") workspaceId: string) {
    return this.proofService.getStudioByokPolicy(workspaceId);
  }

  @Post("handoff/byok/:workspaceId")
  configureByokPolicy(
    @Param("workspaceId") workspaceId: string,
    @Body()
    body: {
      enabled: boolean;
      provider: "openai" | "anthropic" | "gemini" | "local";
      keyTailHint?: string;
    },
  ) {
    return this.proofService.configureStudioByokPolicy({
      workspaceId,
      ...body,
    });
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";

import type { ApiRevocationReasonCode } from "./ip-governance.repository";
import {
  IpGovernanceService,
  type ApiEscrowSettlementResponse,
  type ApiTrustSealLiveResponse,
} from "./ip-governance.service";

interface HeaderResponseLike {
  setHeader(name: string, value: string): void;
}

const ALLOWED_GOVERNANCE_ROLES = new Set(["studio-admin", "legal-ops"]);

function assertGovernanceOperatorRole(roleHeader: string | undefined): void {
  const normalized = (roleHeader ?? "").trim().toLowerCase();
  if (!ALLOWED_GOVERNANCE_ROLES.has(normalized)) {
    throw new ForbiddenException(
      "트러스트 배지 철회·재발급은 studio-admin 또는 legal-ops 권한이 필요합니다.",
    );
  }
}

@Controller("api/ip-governance")
export class IpGovernanceController {
  constructor(
    @Inject(IpGovernanceService)
    private readonly governanceService: IpGovernanceService,
  ) {}

  @Get("titles/:slug/trust-seal")
  getTitleTrustSeal(
    @Param("slug") slug: string,
    @Query("title") title: string | undefined,
    @Res({ passthrough: true }) res?: HeaderResponseLike,
  ): ApiTrustSealLiveResponse {
    const result = this.governanceService.getLiveTrustSeal(slug, title);
    if (res) {
      res.setHeader("TDM-Reservation", String(result.tdmReservation));
      res.setHeader("X-ToonStudio-Seal-Digest", result.seal.sealDigestHash);
    }
    return result;
  }

  @Post("titles/:slug/trust-seal")
  issueTitleTrustSeal(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly seriesTitle?: string;
      readonly verifiedStagesCount?: number;
      readonly totalStagesCount?: number;
      readonly commercialAssetsCleared?: boolean;
      readonly aiTrainingOptOut?: boolean;
      readonly voiceConsentVerified?: boolean;
      readonly globalLocalesCount?: number;
      readonly masterAuditHash?: string;
    },
  ): ApiTrustSealLiveResponse {
    return this.governanceService.issueTrustSeal({
      slug,
      seriesTitle: body.seriesTitle ?? slug,
      verifiedStagesCount: body.verifiedStagesCount,
      totalStagesCount: body.totalStagesCount,
      commercialAssetsCleared: body.commercialAssetsCleared,
      aiTrainingOptOut: body.aiTrainingOptOut,
      voiceConsentVerified: body.voiceConsentVerified,
      globalLocalesCount: body.globalLocalesCount,
      masterAuditHash: body.masterAuditHash,
    });
  }

  @Post("titles/:slug/revoke")
  revokeTitleTrustSeal(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly reasonCode: ApiRevocationReasonCode;
      readonly reasonDetail: string;
    },
    @Headers("x-toonstudio-governance-role") governanceRole?: string,
  ): ApiTrustSealLiveResponse {
    assertGovernanceOperatorRole(governanceRole);
    return this.governanceService.revokeTrustSeal({
      slug,
      reasonCode: body.reasonCode,
      reasonDetail: body.reasonDetail,
    });
  }

  @Post("titles/:slug/reissue")
  reissueTitleTrustSeal(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly replacementAssetLabel: string;
      readonly evidenceReferenceId: string;
    },
    @Headers("x-toonstudio-governance-role") governanceRole?: string,
  ): ApiTrustSealLiveResponse {
    assertGovernanceOperatorRole(governanceRole);
    return this.governanceService.reissueTrustSeal({
      slug,
      replacementAssetLabel: body.replacementAssetLabel,
      evidenceReferenceId: body.evidenceReferenceId,
    });
  }

  @Post("titles/:slug/escrow-settlement")
  executeTitleEscrowSettlement(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly grossRevenueKrw: number;
      readonly unrecoupedAdvanceKrw?: number;
      readonly creatorSplitPercent?: number;
    },
  ): ApiEscrowSettlementResponse {
    return this.governanceService.executeEscrowSettlement({
      slug,
      grossRevenueKrw: body.grossRevenueKrw,
      unrecoupedAdvanceKrw: body.unrecoupedAdvanceKrw ?? 0,
      creatorSplitPercent: body.creatorSplitPercent ?? 60,
    });
  }
}

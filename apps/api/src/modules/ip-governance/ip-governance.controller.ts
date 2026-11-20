import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";

import type { CreatorGovernanceAlert } from "./ip-governance-notification.service";
import { IpGovernanceOperatorGuard } from "./ip-governance.guard";
import type { ApiRevocationReasonCode } from "./ip-governance.repository";
import {
  IpGovernanceService,
  type ApiEscrowSettlementResponse,
  type ApiTrustSealLiveResponse,
} from "./ip-governance.service";

interface HeaderResponseLike {
  setHeader(name: string, value: string): void;
}

@Controller("api/ip-governance")
export class IpGovernanceController {
  constructor(
    @Inject(IpGovernanceService)
    private readonly governanceService: IpGovernanceService,
  ) {}

  @Get("titles/:slug/trust-seal")
  async getTitleTrustSeal(
    @Param("slug") slug: string,
    @Query("title") title: string | undefined,
    @Res({ passthrough: true }) res?: HeaderResponseLike,
  ): Promise<ApiTrustSealLiveResponse> {
    const result = await this.governanceService.getLiveTrustSeal(slug, title);
    if (res) {
      res.setHeader("TDM-Reservation", String(result.tdmReservation));
      res.setHeader("X-ToonStudio-Seal-Digest", result.seal.sealDigestHash);
    }
    return result;
  }

  @Post("titles/:slug/trust-seal")
  async issueTitleTrustSeal(
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
  ): Promise<ApiTrustSealLiveResponse> {
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
  @UseGuards(IpGovernanceOperatorGuard)
  async revokeTitleTrustSeal(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly reasonCode: ApiRevocationReasonCode;
      readonly reasonDetail: string;
    },
  ): Promise<ApiTrustSealLiveResponse> {
    return this.governanceService.revokeTrustSeal({
      slug,
      reasonCode: body.reasonCode,
      reasonDetail: body.reasonDetail,
    });
  }

  @Post("titles/:slug/reissue")
  @UseGuards(IpGovernanceOperatorGuard)
  async reissueTitleTrustSeal(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly replacementAssetLabel: string;
      readonly evidenceReferenceId: string;
    },
  ): Promise<ApiTrustSealLiveResponse> {
    return this.governanceService.reissueTrustSeal({
      slug,
      replacementAssetLabel: body.replacementAssetLabel,
      evidenceReferenceId: body.evidenceReferenceId,
    });
  }

  @Post("titles/:slug/escrow-settlement")
  async executeTitleEscrowSettlement(
    @Param("slug") slug: string,
    @Body()
    body: {
      readonly grossRevenueKrw: number;
      readonly unrecoupedAdvanceKrw?: number;
      readonly creatorSplitPercent?: number;
    },
  ): Promise<ApiEscrowSettlementResponse> {
    return this.governanceService.executeEscrowSettlement({
      slug,
      grossRevenueKrw: body.grossRevenueKrw,
      unrecoupedAdvanceKrw: body.unrecoupedAdvanceKrw ?? 0,
      creatorSplitPercent: body.creatorSplitPercent ?? 60,
    });
  }

  @Get("titles/:slug/creator-alerts")
  getTitleCreatorAlerts(@Param("slug") slug: string): readonly CreatorGovernanceAlert[] {
    return this.governanceService.listCreatorAlerts(slug);
  }
}

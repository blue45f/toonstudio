// apps/api/src/modules/fortune/fortune.controller.ts

import { randomUUID } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";

import {
  FortuneUsedDto,
  PrescriptionDto,
  TarotDto,
} from "./fortune.dto";
import { FortuneService } from "./fortune.service";
import {
  MEMBERSHIP_REWARD_SERVICE,
  type MembershipRewardService,
} from "../membership-wallet/membership-wallet.tokens";

// 2026-10-08 (F-B10-1): 생년월일을 받던 POST today/saju/compatibility/zodiac
// 엔드포인트를 제거했다. 유일한 소비자였던 웹 운세 페이지가 @toonstudio/core
// 엔진으로 기기에서 직접 계산하도록 이관됐고(민감정보 로컬 전용 정책 — 생년월일은
// 서버로 전송하지 않는다), 서버에는 리워드 기록용 POST used(mode만)만 남는다.
// FortuneService의 drawSaju/drawTodayFortune/drawCompatibility도 함께 제거했다.
// drawZodiac은 provenance 프로바이더가 내부 계산용으로 쓰므로 서비스에 남긴다.
@Controller("fortune")
export class FortuneController {
  constructor(
    @Inject(FortuneService)
    private readonly fortuneService: FortuneService,
    @Optional()
    @Inject(MEMBERSHIP_REWARD_SERVICE)
    private readonly membershipWallet?: MembershipRewardService,
  ) {}

  private async rewardFortuneUse(
    userId: string | undefined,
    mode: string,
  ): Promise<void> {
    if (!userId || !this.membershipWallet) return;
    try {
      await this.membershipWallet.grantActivityPoints({
        userId,
        activity: "fortune.used",
        sourceRef: randomUUID(),
        metadata: { mode },
      });
    } catch {
      // Fortune results stay available even if reward accounting is unavailable.
    }
  }

  // 페르소나 캐릭터 목록 조회
  @Get("characters")
  getCharacters() {
    return this.fortuneService.getCharacters();
  }

  // 운세 이용 기록 — 오늘·사주·궁합·별자리는 클라이언트에서 계산하므로
  // 서버는 mode만 받아 활동 포인트를 기록한다. 생년월일·출생시간 같은
  // 프로필 원본은 어떤 필드로도 받지 않는다.
  @Post("used")
  @HttpCode(HttpStatus.OK)
  async recordFortuneUse(
    @Body() body: FortuneUsedDto,
    @Headers("x-user-id") userId?: string,
  ) {
    await this.rewardFortuneUse(userId, body.mode);
    return { ok: true };
  }

  // 타로 운세 뽑기
  @Post("tarot")
  @HttpCode(HttpStatus.OK)
  async drawTarot(
    @Body() body: TarotDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawTarot(
      body.characterId,
      body.cardIdx ?? 0,
      body.spread ?? "one",
    );
    await this.rewardFortuneUse(userId, "tarot");
    return result;
  }

  // 독서 처방전
  @Post("prescription")
  @HttpCode(HttpStatus.OK)
  async drawPrescription(
    @Body() body: PrescriptionDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawPrescription(
      body.query,
      body.characterId,
    );
    await this.rewardFortuneUse(userId, "prescription");
    return result;
  }
}

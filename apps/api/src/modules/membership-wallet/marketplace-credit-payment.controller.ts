/**
 * marketplace-credit-payment.controller.ts — POST /membership/marketplace/credit-payment
 * 전용 컨트롤러 (2단계 수익화 가동, 2026-10-25).
 * 기존 MembershipWalletController를 늘리지 않고 spend 컨트롤러와 같은
 * 분리 패턴을 쓴다. 인증은 기존 컨트롤러와 같은 x-user-id 헤더 관례를 따른다.
 *
 * 보안 경계:
 *  - 구매자는 헤더에서만 온다. 본문에 buyerId가 있어도 읽지 않는다.
 *  - 가격·판매자는 본문에서 받지 않는다. 서비스가 상거래 판정에서
 *    서버 결정으로 조회한다 (클라이언트 제시 가격·판매자 스푸핑 방지).
 *  - 본문은 상품 식별자(releaseId)와 요청 식별자(requestId)만 받는다.
 *  - 진입부 게이트: 유료 운영 OFF면 서비스를 호출하지 않고
 *    PAID_OPERATIONS_DISABLED(403)로 거부한다 (서비스 내부 게이트와 이중 검사).
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  Headers,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";

import { MarketplaceCreditPaymentService } from "./marketplace-credit-payment.service";
import {
  PAID_OPERATIONS_DISABLED,
  PAID_OPERATIONS_SETTING_STORE,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

type MarketplaceCreditPaymentBody = {
  releaseId?: unknown;
  requestId?: unknown;
};

@Controller()
export class MarketplaceCreditPaymentController {
  constructor(
    @Inject(MarketplaceCreditPaymentService)
    private readonly paymentService: MarketplaceCreditPaymentService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  @Post("membership/marketplace/credit-payment")
  @Header("Cache-Control", "no-store, max-age=0")
  async payWithCredits(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: MarketplaceCreditPaymentBody,
  ) {
    // 진입부 게이트: 서비스 내부 게이트와 같은 스토어 인스턴스의
    // 현재 값을 호출마다 읽는다 (스토어 미주입 시 미설정=false로 거부).
    if (!(await resolvePaidOperationsEnabled(this.paidOperations))) {
      throw new ForbiddenException({
        code: PAID_OPERATIONS_DISABLED,
        message:
          "유료 운영이 비활성화되어 있어 마켓 크레딧 결제를 실행할 수 없습니다.",
      });
    }
    return this.paymentService.checkout(userId, {
      userId,
      releaseId: body?.releaseId,
      requestId: body?.requestId,
    });
  }
}

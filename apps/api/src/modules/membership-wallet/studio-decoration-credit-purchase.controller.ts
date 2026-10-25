/**
 * studio-decoration-credit-purchase.controller.ts — 꾸미기 크레딧 카탈로그
 * 조회·결제 전용 컨트롤러 (2단계 수익화 가동, 2026-10-25).
 * 기존 MembershipWalletController를 늘리지 않고 spend 컨트롤러와 같은
 * 분리 패턴을 쓴다. 인증은 기존 컨트롤러와 같은 x-user-id 헤더 관례를 따른다.
 *
 *  - GET /membership/decorations/catalog: 과금이 아니므로 게이트를 검사하지
 *    않는다 (기존 /membership/catalog과 동일하게 목록만 반환한다).
 *  - POST /membership/decorations/credit-purchase: 진입부 게이트를 먼저
 *    검사한다 (유료 운영 OFF면 서비스를 호출하지 않고
 *    PAID_OPERATIONS_DISABLED(403)로 거부 — 서비스 내부 게이트와 이중 검사).
 *    구매자는 헤더에서만 오며, 가격은 서버 카탈로그 권위이다.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";

import {
  PAID_OPERATIONS_DISABLED,
  PAID_OPERATIONS_SETTING_STORE,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";
import { StudioDecorationCreditPurchaseService } from "./studio-decoration-credit-purchase.service";
import type { DecorationCreditPurchaseInput } from "./studio-decoration-credit-purchase";

@Controller()
export class StudioDecorationCreditPurchaseController {
  constructor(
    @Inject(StudioDecorationCreditPurchaseService)
    private readonly purchaseService: StudioDecorationCreditPurchaseService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  @Get("membership/decorations/catalog")
  @Header("Cache-Control", "no-store, max-age=0")
  getCatalog() {
    return this.purchaseService.getCatalog();
  }

  @Post("membership/decorations/credit-purchase")
  @Header("Cache-Control", "no-store, max-age=0")
  async purchaseWithCredits(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: DecorationCreditPurchaseInput,
  ) {
    // 진입부 게이트: 서비스 내부 게이트와 같은 스토어 인스턴스의
    // 현재 값을 호출마다 읽는다 (스토어 미주입 시 미설정=false로 거부).
    if (!(await resolvePaidOperationsEnabled(this.paidOperations))) {
      throw new ForbiddenException({
        code: PAID_OPERATIONS_DISABLED,
        message:
          "유료 운영이 비활성화되어 있어 꾸미기 아이템 결제를 실행할 수 없습니다.",
      });
    }
    return this.purchaseService.purchase(userId, body ?? {});
  }
}

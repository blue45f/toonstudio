/**
 * paid-operations-admin.service.ts — 유료 운영 마스터 스위치 어드민 변경
 * 서비스 (2026-10-25).
 *
 * 분리 이유: `MembershipWalletService`(1,884줄)는 소스 파일 크기 래칫
 * 기준선에 묶여 있어 한 줄도 늘릴 수 없으므로, 어드민 변경 메서드를
 * 별도 형제 서비스로 두어 기준선을 건드리지 않는다. 동작은 분리 전과
 * 동일하다: 어드민 전용(`AdminMutationGuard` + `requireAdmin` 이중 확인),
 * 미설정 시 false, 변경 즉시 다음 게이트 호출부터 반영(캐시 없음),
 * 감사 로그 기록. 실효 게이트와 동일 스토어 인스턴스를 쓴다.
 */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";

import { isAdminUser } from "../../server/app-config";
import { logAuditAction } from "../admin/admin-types";
import {
  PAID_OPERATIONS_SETTING_STORE,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";
import { paidOperationsSettingStore } from "./paid-operations-setting";
import { requireUserId } from "./membership-wallet.service";

@Injectable()
export class PaidOperationsAdminService {
  /**
   * 유료 운영 스토어. Nest에서는 모듈이 `PAID_OPERATIONS_SETTING_STORE`
   * 토큰에 바인딩한 싱글턴(실효 게이트와 동일 인스턴스)이 주입되고,
   * 직접 생성되는 경우(`new PaidOperationsAdminService()`)에는 폴백
   * 싱글턴을 쓴다. 토큰 인스턴스와 다른 저장소를 쓰면 어드민 토글
   * 변경이 게이트에 반영되지 않으므로, 이 폴백은 운영 경로가 아니다.
   */
  private readonly paidOperationsStore: PaidOperationsSettingStore;

  constructor(
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    paidOperationsStore?: PaidOperationsSettingStore,
  ) {
    this.paidOperationsStore =
      paidOperationsStore ?? paidOperationsSettingStore;
  }

  private async requireAdmin(
    userIdValue: string | undefined,
  ): Promise<string> {
    const userId = requireUserId(userIdValue);
    if (!(await isAdminUser(userId))) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }
    return userId;
  }

  /**
   * 유료 운영 마스터 스위치 조회. 어드민 전용이며, 미설정 시 false를
   * 반환한다. 실효 게이트와 동일 스토어 인스턴스를 읽는다.
   */
  async adminGetPaidOperations(adminIdValue: string | undefined) {
    await this.requireAdmin(adminIdValue);
    return {
      paidOperationsEnabled:
        await this.paidOperationsStore.getPaidOperationsEnabled(),
    };
  }

  /**
   * 유료 운영 마스터 스위치 변경. 어드민 전용(컨트롤러의
   * AdminMutationGuard + requireAdmin 이중 확인)이며, 변경 즉시 다음
   * 게이트 호출부터 반영된다(캐시 없음). 감사 로그를 남긴다.
   */
  async adminSetPaidOperations(input: {
    adminId: string | undefined;
    enabled: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    if (typeof input.enabled !== "boolean") {
      throw new BadRequestException("유료 운영 값은 true/false여야 합니다.");
    }
    await this.paidOperationsStore.setPaidOperationsEnabled(input.enabled);
    await logAuditAction(
      adminId,
      "membership_wallet.paid_operations",
      "membership_policy",
      "paidOperationsEnabled",
      { enabled: input.enabled },
    );
    return { paidOperationsEnabled: input.enabled };
  }
}

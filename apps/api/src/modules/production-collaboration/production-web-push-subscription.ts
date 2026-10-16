import { ConflictException } from "@nestjs/common";

import {
  ProductionPushSubscriptionLimitError,
  type ProductionIntegrationRepository,
  type ProductionPushSubscriptionRecord,
} from "./production-integration.repository";
import type { WebPushPolicy } from "./production-web-push-policy";

/**
 * 웹 푸시 구독을 저장하고, 프로젝트 또는 사용자 상한에 걸리면 이유가 분명한 409 로 바꾼다.
 * (production-integration.service.ts 는 파일 크기 래칫 1,000줄에 맞물려 있어 이 로직을 따로 둔다.)
 */
export async function registerWebPushSubscription(
  repository: Pick<ProductionIntegrationRepository, "upsertPushSubscription">,
  policy: Pick<WebPushPolicy, "maxSubscriptionsPerProject" | "maxSubscriptionsPerUser">,
  record: ProductionPushSubscriptionRecord,
): Promise<void> {
  try {
    await repository.upsertPushSubscription(record, {
      maxPerProject: policy.maxSubscriptionsPerProject,
      maxPerUser: policy.maxSubscriptionsPerUser,
    });
  } catch (error) {
    if (!(error instanceof ProductionPushSubscriptionLimitError)) throw error;
    throw new ConflictException({
      code: "production_push_subscription_limit",
      scope: error.scope,
      limit: error.limit,
      message: error.scope === "user"
        ? `이 프로젝트에 등록할 수 있는 내 알림 기기는 최대 ${error.limit}대예요. 쓰지 않는 기기의 알림을 끈 뒤 다시 시도해 주세요.`
        : `이 프로젝트에 등록할 수 있는 알림 기기가 가득 찼어요(최대 ${error.limit}대). 쓰지 않는 기기의 알림이 정리된 뒤 다시 시도해 주세요.`,
    });
  }
}

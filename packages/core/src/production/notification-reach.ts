import type { ProductionNotification, ProductionNotificationPolicy } from "./types";

/**
 * 알림 도달 설계 (G1) — 하나의 결정 규칙으로 통일한다.
 *
 * 지금까지는 표면마다 도달 규칙이 흩어져 있었다: 다이제스트는 묶기·조용 시간을,
 * 통합 작업함은 투영만, 메시지 받은함은 자체 읽음만 알았다. 이 함수가 정본이다.
 *
 * 입력: 담당자 정책(유형별 on/off·묶음 주기·조용 시간) + 알림(유형·긴급도) + 현재
 * 조용 시간 상태(productionQuietHours 결과). 출력: 도달 결정 5종.
 *
 * 규칙 (위에서부터 우선):
 * 1. 정책이 없으면 기본 도달 — 즉시 표시. 정책 부재가 알림 유실이 되면 안 된다.
 * 2. 정책이 꺼져 있으면 off (담당자가 명시적으로 끈 경우만).
 * 3. 유형별 끄기(mutedTypes)에 든 유형은 muted — 긴급도 예외 없음 (정책 편집
 *    화면이 그 사실을 고지한다).
 * 4. 조용 시간에는 hold-quiet 로 묶어 두되, critical 은 즉시 도달시킨다 —
 *    마감 사고를 조용 시간 때문에 놓치는 쪽이 더 비싸다.
 * 5. 묶음 주기가 daily/weekly 면 digest, immediate 면 즉시.
 *
 * 이 결정은 "표시 방식"만 정한다. 알림 자체는 항상 aggregate에 남고, 사용자가
 * 직접 열면 언제든 읽을 수 있다 (도달 보류 ≠ 삭제).
 */
export type NotificationReachDecision =
  | "deliver-now"
  | "digest"
  | "hold-quiet"
  | "muted"
  | "off";

export type NotificationQuietState = "off" | "quiet" | "active" | "unknown";

export function decideNotificationReach(input: {
  readonly policy: ProductionNotificationPolicy | undefined;
  readonly type: ProductionNotification["type"];
  readonly urgency: ProductionNotification["urgency"];
  readonly quiet: NotificationQuietState;
}): NotificationReachDecision {
  const { policy, type, urgency, quiet } = input;
  if (!policy) return "deliver-now";
  if (!policy.enabled) return "off";
  if ((policy.mutedTypes ?? []).includes(type)) return "muted";
  if (quiet === "quiet" && urgency !== "critical") return "hold-quiet";
  if (policy.digest === "daily" || policy.digest === "weekly") return "digest";
  return "deliver-now";
}

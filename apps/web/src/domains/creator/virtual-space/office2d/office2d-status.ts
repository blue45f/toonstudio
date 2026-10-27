/**
 * 이름표 아래 상태 문구. 명시 사용자 상태(회의 중·발표 중 등)가 프레즌스 활동(집중·검토·자리 비움)보다 먼저다.
 */
import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";
import { STUDIO_USER_STATUSES, userStatusBadge, type StudioUserStatus } from "../studio-virtual-space-user-status";

const ACTIVITY_LABELS: Readonly<Record<Exclude<StudioVirtualSpaceActivity, "available">, { readonly ko: string; readonly en: string }>> = Object.freeze({
  focused: { ko: "🎯 집중 작업 중", en: "🎯 Focusing" },
  reviewing: { ko: "🔍 원고 검토 중", en: "🔍 Reviewing" },
  away: { ko: "🟡 자리 비움", en: "🟡 Away" },
});

export function studioUserStatusLabel(
  status: StudioUserStatus | undefined,
  activity: StudioVirtualSpaceActivity,
  language: "ko" | "en",
): string | null {
  if (status && status !== "available" && STUDIO_USER_STATUSES.has(status)) {
    const badge = userStatusBadge(status);
    return `${badge.emoji} ${language === "en" ? badge.en : badge.ko}`;
  }
  if (activity === "available") return null;
  const label = ACTIVITY_LABELS[activity];
  return language === "en" ? label.en : label.ko;
}

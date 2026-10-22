import "@/shared/ai/claude/claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";

/** 실행기가 돌려주는 사유 코드를 화면 문구로 옮긴다. 그 밖의 값은 바인딩이 준 사용자용 문장 그대로다. */
const REASON_KEY: Readonly<Record<string, string>> = {
  stopped: "claudeAssist.plan.reasonStopped",
  missing: "claudeAssist.plan.reasonMissing",
  disabled: "claudeAssist.plan.reasonDisabled",
  previous_failed: "claudeAssist.plan.reasonPreviousFailed",
};

export function useReasonText() {
  const t = useT();
  return (reason: string | undefined): string | null => {
    if (!reason) return null;
    return Object.hasOwn(REASON_KEY, reason) ? t(REASON_KEY[reason] as string) : reason;
  };
}

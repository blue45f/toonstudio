import "./claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";

import type { ReactNode } from "react";

/**
 * 비용 청구·외부 전송 고지. 사용자 결제 키로 Anthropic에 직접 보내는 모든 Claude 화면이
 * 같은 문구를 쓰도록 한곳에 둔다(문구를 따로 두면 화면마다 고지가 어긋난다).
 */
export function ClaudeNotices({ children }: { readonly children?: ReactNode }) {
  const t = useT();
  return (
    <div className="space-y-1 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-fg-2">
      <p>{t("claudeAssist.common.costNotice")}</p>
      <p>{t("claudeAssist.common.dataNotice")}</p>
      {children}
    </div>
  );
}

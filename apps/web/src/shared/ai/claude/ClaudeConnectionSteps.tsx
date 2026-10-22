import "./claude-assist-i18n";

import { ExternalLink } from "lucide-react";

import { useT } from "@/shared/lib/i18n";

/** Anthropic 콘솔의 API 키 화면. console.anthropic.com 은 이 주소로 넘어간다. */
export const ANTHROPIC_KEYS_URL = "https://platform.claude.com/settings/keys";

/**
 * 처음 연결하는 사람을 위한 3단계 안내. 키를 만드는 곳, 붙여 넣는 곳, 확인하는 방법과 요금이 언제 생기는지를
 * 연결 전에 먼저 말해 둔다(확인은 무료 호출이고 요금은 실제로 AI를 쓸 때만 생긴다).
 */
export function ClaudeConnectionSteps() {
  const t = useT();
  return (
    <ol className="space-y-2 rounded-xl border border-line bg-raised/40 p-3 text-sm" data-claude-connection-steps="true">
      <li className="flex gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent" aria-hidden>1</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">{t("claudeAssist.steps.createKey")}</span>
          <span className="block text-xs text-fg-3">{t("claudeAssist.steps.createKeyHint")}</span>
          <a
            href={ANTHROPIC_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("claudeAssist.steps.openConsole")}
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only">{t("claudeAssist.steps.newTab")}</span>
          </a>
        </span>
      </li>
      <li className="flex gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent" aria-hidden>2</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">{t("claudeAssist.steps.paste")}</span>
          <span className="block text-xs text-fg-3">{t("claudeAssist.steps.pasteHint")}</span>
        </span>
      </li>
      <li className="flex gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent" aria-hidden>3</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">{t("claudeAssist.steps.verify")}</span>
          <span className="block text-xs text-fg-3">{t("claudeAssist.steps.verifyHint")}</span>
        </span>
      </li>
    </ol>
  );
}

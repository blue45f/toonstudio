import "@/shared/ai/claude/claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";

/** 복사 결과를 화면 읽기 프로그램에도 알린다. 성공은 조용한 안내(`status`), 실패는 눈에 띄는 경고(`alert`)로 보여 준다. */
export function ClaudeCopyStatus({ copied, failed }: { readonly copied: boolean; readonly failed: boolean }) {
  const t = useT();
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">{copied ? t("claudeAssist.art.copied") : ""}</span>
      {failed ? <p role="alert" className="text-xs text-bad" data-claude-copy-failed="true">{t("claudeAssist.common.copyFailed")}</p> : null}
    </>
  );
}

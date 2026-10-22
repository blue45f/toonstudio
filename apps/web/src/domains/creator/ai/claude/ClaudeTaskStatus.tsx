import "@/shared/ai/claude/claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface ClaudeTaskStatusProps {
  readonly running: boolean;
  readonly elapsedSeconds: number;
  /** 진행 중일 때 읽히는 문장. 시간은 넣지 않는다 — 한 번만 읽히도록 경과 시간은 따로 그린다. */
  readonly runningText: string;
  /** 진행 중이 아닐 때 보이는 상태 문장(준비 중·중단·완료 등). 없으면 비워 둔다. */
  readonly message?: string | null;
  readonly className?: string;
}

/**
 * 작업 상태 줄. 상태 문장만 `role="status"`로 알리고, 매초 바뀌는 경과 시간은 화면에만 보이게(`aria-hidden`) 둔다 —
 * 시간까지 안내 영역에 넣으면 화면 읽기 프로그램이 문장 전체를 매초 반복해 읽는다.
 */
export function ClaudeTaskStatus({ running, elapsedSeconds, runningText, message, className }: ClaudeTaskStatusProps) {
  const t = useT();
  return (
    <div data-claude-task-status="true" className={cn("min-h-5 text-sm text-fg-2", running && "font-semibold", className)}>
      <span role="status" aria-live="polite">{running ? runningText : message ?? ""}</span>
      {running ? <span aria-hidden="true">{` · ${t("claudeAssist.common.elapsed", { seconds: elapsedSeconds })}`}</span> : null}
    </div>
  );
}

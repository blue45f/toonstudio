"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { PanelNotice } from "./PanelNotice";
import { bi } from "./panel-import-copy";
import { PANEL_SKELETON } from "./panel-import-styles";

import type { ReactElement, ReactNode } from "react";
import type { JobState } from "./use-panel-job";

interface PanelJobStatusProps {
  readonly state: JobState<unknown>;
  /** 실행 중 문구. 진행률이 있으면 "n / m" 이 함께 보인다. */
  readonly runningLabel: string;
  readonly cancelledLabel: string;
  readonly errorText: (error: unknown) => string;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  /** 성공했을 때 보여 줄 안내(없으면 아무것도 그리지 않는다). */
  readonly success?: ReactNode;
  readonly className?: string;
}

/**
 * 취소할 수 있는 작업의 상태 표시 — 실행 중(진행률·취소) / 취소됨(다시 시도) / 오류(이유와 다시 시도) / 성공.
 * 로딩은 스피너 대신 스켈레톤과 진행률 막대로 보여 주고, 모션 감소 설정에서는 정지한다.
 */
export function PanelJobStatus(props: PanelJobStatusProps): ReactElement | null {
  const { state } = props;
  if (state.status === "idle") return null;
  if (state.status === "running") {
    const progress = state.progress;
    return (
      <div className={cn("grid gap-2", props.className)} aria-busy="true">
        <PanelNotice
          tone="info"
          live="status"
          actions={
            <button type="button" onClick={props.onCancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              {bi("취소", "Cancel")}
            </button>
          }
        >
          {props.runningLabel}
          {progress ? <span className="ml-1.5 font-bold tabular-nums text-fg">{progress.done} / {progress.total}</span> : null}
        </PanelNotice>
        {progress ? (
          <progress value={progress.done} max={Math.max(1, progress.total)} aria-label={props.runningLabel} className="h-2 w-full overflow-hidden rounded-full accent-accent" />
        ) : (
          <div className={cn(PANEL_SKELETON, "h-2 w-full")} aria-hidden="true" />
        )}
      </div>
    );
  }
  if (state.status === "cancelled") {
    return (
      <PanelNotice
        tone="warn"
        className={props.className}
        actions={<button type="button" onClick={props.onRetry} className={buttonClass({ variant: "outline", size: "sm" })}>{bi("다시 시도", "Try again")}</button>}
      >
        {props.cancelledLabel}
      </PanelNotice>
    );
  }
  if (state.status === "error") {
    return (
      <PanelNotice
        tone="bad"
        className={props.className}
        actions={<button type="button" onClick={props.onRetry} className={buttonClass({ variant: "outline", size: "sm" })}>{bi("다시 시도", "Try again")}</button>}
      >
        {props.errorText(state.error)}
      </PanelNotice>
    );
  }
  return props.success ? <PanelNotice tone="good" className={props.className}>{props.success}</PanelNotice> : null;
}

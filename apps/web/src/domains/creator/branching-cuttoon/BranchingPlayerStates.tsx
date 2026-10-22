"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { Component, useId, type ReactElement, type ReactNode } from "react";

import { BC_PRIMARY_BUTTON, BC_SURFACE } from "./branching-cuttoon-styles";
import { BranchingNotice } from "./BranchingNotice";
import { useBranchingT } from "./use-branching-t";

interface PlayerStateNoticeProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

/** 읽을 수 없는 이유(비어 있음, 고칠 항목이 남음)를 제목·설명·돌아갈 행동으로 알리는 빈 상태. */
export function PlayerStateNotice({ title, body, actionLabel, onAction }: PlayerStateNoticeProps): ReactElement {
  const headingId = useId().replace(/:/gu, "");
  return (
    <section aria-labelledby={headingId} role="status" className={BC_SURFACE}>
      <h3 id={headingId} className="text-lg font-black text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-fg-2">{body}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className={`${BC_PRIMARY_BUTTON} mt-4`}>{actionLabel}</button>
      ) : null}
    </section>
  );
}

function PlayerErrorFallback({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  const t = useBranchingT();
  return (
    <BranchingNotice
      tone="bad"
      live="alert"
      actions={<button type="button" onClick={onRetry} className={BC_PRIMARY_BUTTON}>{t("branchingCuttoon.common.retry")}</button>}
    >
      {t("branchingCuttoon.player.renderFailed")}
    </BranchingNotice>
  );
}

interface PlayerBoundaryProps {
  readonly children: ReactNode;
}

interface PlayerBoundaryState {
  readonly failed: boolean;
  /** 다시 시도할 때마다 올려 자식을 새로 마운트한다. */
  readonly attempt: number;
}

/** 읽기 화면을 그리다 던져도 만들기 화면과 페이지 나머지는 남기고 이 구역만 안내와 다시 시도로 바꾼다. */
export class PlayerBoundary extends Component<PlayerBoundaryProps, PlayerBoundaryState> {
  state: PlayerBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<PlayerBoundaryState> {
    return { failed: true };
  }

  private readonly retry = (): void => {
    this.setState((current) => ({ failed: false, attempt: current.attempt + 1 }));
  };

  render(): ReactNode {
    if (this.state.failed) return <PlayerErrorFallback onRetry={this.retry} />;
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

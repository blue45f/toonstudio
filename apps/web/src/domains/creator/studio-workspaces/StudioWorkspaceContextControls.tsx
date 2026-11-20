import type { ComponentProps } from "react";

import { StudioWorkspaceMenuGate } from "../StudioWorkspaceMenuGate";
import type { StudioWorkspaceLoadResult } from "../studio-workspaces";

type StudioWorkspaceContextControlsProps = Omit<ComponentProps<typeof StudioWorkspaceMenuGate>, "persistence"> & {
  readonly currentOwnerScope: string;
  readonly menuEpoch: number;
  readonly persistence: StudioWorkspaceLoadResult;
  readonly syncNotice: string | null;
};

/** 원고·상세 셸에서 같은 소유자 경계와 요청 시점의 관리자 로딩을 유지한다. */
export function StudioWorkspaceContextControls({
  currentOwnerScope, menuEpoch, syncNotice, ...props
}: StudioWorkspaceContextControlsProps) {
  const ownerMatches = props.persistence.ownerScope === currentOwnerScope;
  return <>
    {ownerMatches ? (
      <StudioWorkspaceMenuGate key={`${currentOwnerScope}:${menuEpoch}`} {...props} />
    ) : (
      <span role="status" className="inline-flex min-h-8 items-center text-[0.65rem] text-fg-3">전환 중…</span>
    )}
    {syncNotice && ownerMatches ? (
      <span role="status" title={syncNotice} className="max-w-40 truncate text-[0.62rem] font-medium text-cool">
        {syncNotice}
      </span>
    ) : null}
  </>;
}

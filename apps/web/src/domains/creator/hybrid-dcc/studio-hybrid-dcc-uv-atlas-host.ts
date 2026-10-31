import type { StudioHybridDccWorkspaceEdit, StudioHybridDccWorkspaceEditResult } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

/** 계산 완료와 실제 문서 발행 완료를 구분하는 자동 UV 전용 호스트 계약이다. */
export type StudioHybridDccUvAtlasRun = (
  label: string,
  edit: StudioHybridDccWorkspaceEdit,
  canCommit: () => boolean,
  onCommitted: () => void,
) => Promise<void>;

export function createStudioHybridDccUvAtlasHost({ workspace, selection, busy, generation, getGeneration, run }: {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: Parameters<StudioHybridDccWorkspaceEdit>[1];
  readonly busy: boolean;
  readonly generation: number;
  readonly getGeneration: () => number;
  readonly run: (label: string, edit: () => StudioHybridDccWorkspaceEditResult, canCommit: () => boolean, onCommitted: () => void) => Promise<void>;
}): StudioHybridDccUvAtlasRun {
  return (label, edit, canCommit, onCommitted) => {
    // React가 busy를 다시 그리기 전 시작한 다른 명령도 세대로 구분한다.
    if (busy || getGeneration() !== generation || !canCommit()) return Promise.resolve();
    return run(label, () => edit(workspace, selection), canCommit, onCommitted);
  };
}

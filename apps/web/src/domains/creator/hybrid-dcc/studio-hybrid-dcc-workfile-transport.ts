import { restoreStudioCommandJournal, serializeStudioCommandJournal } from "../studio-command-journal";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

type TransferWorkspace = Omit<StudioHybridDccWorkspace, "session"> & {
  readonly session: Omit<StudioHybridDccWorkspace["session"], "journal"> & { readonly journal: string };
};

/** 구조화 복제가 보존하지 않는 저널 클래스만 공개 직렬화 계약으로 옮긴다. */
export function packWorkfileWorkspace(workspace: StudioHybridDccWorkspace): TransferWorkspace {
  return {
    ...workspace,
    clothRuntimeCache: null,
    session: { ...workspace.session, journal: serializeStudioCommandJournal(workspace.session.journal) },
  };
}

export function unpackWorkfileWorkspace(workspace: TransferWorkspace): StudioHybridDccWorkspace {
  return { ...workspace, session: { ...workspace.session, journal: restoreStudioCommandJournal(workspace.session.journal) } };
}

export type WorkfileRequest =
  | { readonly kind: "encode"; readonly workspace: TransferWorkspace }
  | { readonly kind: "decode"; readonly bytes: Uint8Array<ArrayBuffer>; readonly documentId: string };

export type WorkfileResponse =
  | { readonly kind: "encoded"; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: "decoded"; readonly workspace: TransferWorkspace }
  | { readonly kind: "error"; readonly message: string };

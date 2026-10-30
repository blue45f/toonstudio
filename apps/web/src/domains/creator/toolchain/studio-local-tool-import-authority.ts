import { createContext } from "react";

import type { StudioEditorMutationTicket } from "../studio-editor-scope";

/** 로컬 도구 결과도 원고 편집과 같은 권한·문서 세대에서만 수락한다. */
export interface StudioLocalToolImportAuthority {
  readonly locked: boolean;
  capture(): StudioEditorMutationTicket;
  isCurrent(ticket: StudioEditorMutationTicket): boolean;
}

export const StudioLocalToolImportAuthorityContext =
  createContext<StudioLocalToolImportAuthority | null>(null);

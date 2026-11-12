import { useState, type ReactNode } from "react";

import {
  AssetWorkspaceSessionContext,
  createAssetWorkspaceSession,
} from "./studio-unified-asset-workspace-state";

/** 도구 메뉴의 안정된 소유자에만 둔다. 전역 저장소·원고 저장 계약을 추가하지 않는다. */
export function StudioUnifiedAssetWorkspaceSessionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [session] = useState(createAssetWorkspaceSession);
  return (
    <AssetWorkspaceSessionContext.Provider value={session}>
      {children}
    </AssetWorkspaceSessionContext.Provider>
  );
}

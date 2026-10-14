import { useEffect, useLayoutEffect } from "react";

import { AppearanceDialogHost } from "./AppearanceDialogHost";

import { installAppearanceSync, setAppearanceScope } from "@/shared/lib/theme";
import { installWorkspaceSceneArtSync } from "@/shared/lib/workspace-scene-art";

/** Apply at document level so dialogs portaled to body share the active workspace palette. */
export function AppearanceBridge({ studio }: { studio: boolean }) {
  useLayoutEffect(() => setAppearanceScope(studio ? "studio" : "site"), [studio]);
  useEffect(installAppearanceSync, []);
  // 씬 아트는 기본 끔(opt-in) — 저장된 선택만 :root 속성에 반영한다.
  useEffect(installWorkspaceSceneArtSync, []);
  return <AppearanceDialogHost />;
}

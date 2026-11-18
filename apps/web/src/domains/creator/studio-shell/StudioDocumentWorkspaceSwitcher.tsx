import { useLocation, useNavigate } from "react-router-dom";

import {
  parseStudioDocumentLocation,
  studioDocumentHref,
  type StudioDocumentWorkspaceId,
} from "../studio-document-workspace";
import { withStudioDrawingPresentation } from "../studio-drawing-presentation";
import { readStudioLaunchDensity } from "../studio-launch-mode";
import { StudioDocumentWindowHub } from "./StudioDocumentWindowHub";

import { useI18n } from "@/shared/lib/i18n";
import { getActiveI18nLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";



function localeFromLanguage(_language: string): "ko" | "en" {
  return getActiveI18nLocale() === "ko" ? "ko" : "en";
}

/**
 * Owns the canonical document workspace projection and its multi-window UI.
 * Document identity, focus, language, version, collaboration room and unrelated query values
 * remain on the canonical URL while each tab or window chooses its own workspace projection.
 */
export function StudioDocumentWorkspaceSwitcher() {
  useBilingualI18nRevision();
  const location = useLocation();
  const navigate = useNavigate();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const resolution = parseStudioDocumentLocation({
    pathname: location.pathname,
    search: location.search,
  });

  if (resolution.kind !== "document") return null;

  // 설치형 홈을 거친 기록은 현재 원고의 퀵모드 선택이 아니다.
  const quickMode = resolution.workspace === "draw" && readStudioLaunchDensity(location.search) === "focus";
  const navigateWorkspace = (
    workspace: StudioDocumentWorkspaceId,
    search: string | URLSearchParams,
  ): void => {
    navigate(studioDocumentHref({
      projectId: resolution.projectId,
      documentId: resolution.documentId,
      draftId: resolution.draftId,
      workspace,
      focus: resolution.focus,
      language: resolution.language,
      version: resolution.version,
      search,
    }) + location.hash, { state: location.state });
  };
  const changeWorkspace = (workspace: StudioDocumentWorkspaceId): void => {
    if (workspace === resolution.workspace) return;
    navigateWorkspace(workspace, location.search);
  };
  const toggleQuickMode = (): void => {
    const search = withStudioDrawingPresentation(
      location.search,
      quickMode ? "integrated" : "app",
    );
    search.set("uiMode", quickMode ? "basic" : "focus");
    search.set("startTool", quickMode ? "select" : "draw");
    navigateWorkspace(resolution.workspace, search);
  };

  return (
    <StudioDocumentWindowHub
      locale={locale}
      resolution={resolution}
      search={location.search}
      quickMode={quickMode}
      onChangeWorkspace={changeWorkspace}
      onToggleQuickMode={toggleQuickMode}
    />
  );
}

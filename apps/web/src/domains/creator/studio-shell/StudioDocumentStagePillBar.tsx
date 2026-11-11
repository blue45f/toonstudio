import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioDocumentStagePillBar", ko, en);

export type StudioCanonicalStageId = "storyboard" | "3d" | "draw" | "comic" | "review";

interface StagePillDefinition {
  readonly id: StudioCanonicalStageId;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly labelKo: string;
  readonly labelEn: string;
}

const STAGE_PILLS: readonly StagePillDefinition[] = [
  { id: "storyboard", workspace: "storyboard", labelKo: "1. 콘티", labelEn: "1. Storyboard" },
  { id: "3d", workspace: "3d", labelKo: "2. 3D·배경", labelEn: "2. 3D Stage" },
  { id: "draw", workspace: "draw", labelKo: "3. 작화·채색", labelEn: "3. Draw & Ink" },
  { id: "comic", workspace: "comic", labelKo: "4. 식자", labelEn: "4. Lettering" },
  { id: "review", workspace: "review", labelKo: "5. 검수·출고", labelEn: "5. Review & Ship" },
] as const;

function resolveCanonicalStageForWorkspace(
  workspace: StudioDocumentWorkspaceId,
): StudioCanonicalStageId {
  switch (workspace) {
    case "storyboard":
    case "whiteboard":
      return "storyboard";
    case "3d":
      return "3d";
    case "draw":
    case "image":
      return "draw";
    case "comic":
    case "localization":
    case "audio":
    case "animation":
    case "motion":
      return "comic";
    case "review":
    case "design":
    case "slides":
      return "review";
  }
}

export function StudioDocumentStagePillBar({
  workspace,
  onSelectWorkspace,
  className,
}: {
  readonly workspace: StudioDocumentWorkspaceId;
  readonly onSelectWorkspace: (workspace: StudioDocumentWorkspaceId) => void;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const activeStage = resolveCanonicalStageForWorkspace(workspace);

  return (
    <nav
      aria-label={bi("5단계 제작 공정 전환", "5-stage production pipeline switcher")}
      data-studio-stage-pill-bar="true"
      className={cn("pointer-events-auto flex items-center justify-center", className)}
    >
      <div className="flex max-w-full snap-x snap-mandatory items-center gap-1 overflow-x-auto rounded-full border border-accent/30 bg-panel/95 p-0.5 shadow-sm [scrollbar-width:none]">
        {STAGE_PILLS.map((stage) => {
          const active = stage.id === activeStage;
          return (
            <button
              key={stage.id}
              type="button"
              aria-pressed={active}
              data-studio-stage-pill={stage.id}
              onClick={() => onSelectWorkspace(stage.workspace)}
              className={cn(
                "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full px-3 text-[0.72rem] font-black tracking-tight transition-colors",
                active
                  ? "bg-accent text-on-accent shadow-sm"
                  : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {bi(stage.labelKo, stage.labelEn)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

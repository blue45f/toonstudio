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
  { id: "storyboard", workspace: "storyboard", labelKo: "콘티", labelEn: "Storyboard" },
  { id: "3d", workspace: "3d", labelKo: "3D 배경", labelEn: "3D scene" },
  { id: "draw", workspace: "draw", labelKo: "그리기·채색", labelEn: "Draw & color" },
  { id: "comic", workspace: "comic", labelKo: "웹툰 편집", labelEn: "Edit webtoon" },
  { id: "review", workspace: "review", labelKo: "검토·내보내기", labelEn: "Review & export" },
] as const;

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

  return (
    <nav
      aria-label={bi("작업공간 바로가기", "Workspace shortcuts")}
      data-studio-stage-pill-bar="true"
      className={cn("pointer-events-auto flex items-center", className)}
    >
      <div className="flex max-w-full flex-wrap items-center gap-1">
        {STAGE_PILLS.map((stage) => {
          // 작업공간은 문서 종류다. 이를 실제 회차 공정이나 진행 상태로 추정하지 않는다.
          const active = stage.workspace === workspace;
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

import { Accessibility, ImageIcon, Languages, ListChecks, type LucideIcon } from "lucide-react";

import { AltTextDialog, ArtDirectorDialog, CommandPlanDialog, LocalizeDialog } from "./claude-assist-lazy-dialogs";

import type { ClaudeAssistFeatureId } from "./claude-assist-dialog-store";
import type { ComponentType, LazyExoticComponent } from "react";

export type { ClaudeAssistFeatureId } from "./claude-assist-dialog-store";

export interface ClaudeAssistDialogProps {
  readonly onClose: () => void;
}

export interface ClaudeAssistFeature {
  readonly id: ClaudeAssistFeatureId;
  readonly Icon: LucideIcon;
  readonly titleKey: string;
  readonly descriptionKey: string;
  /** 무엇이 필요한지 짧게 알리는 칩(예: "이미지 필요"). */
  readonly requirementKey: string;
  readonly Dialog: LazyExoticComponent<ComponentType<ClaudeAssistDialogProps>>;
}

/**
 * Claude 보조 기능 목록의 단일 출처. 허브 카드와 검색 줄 메뉴가 같은 목록을 돌면서 같은 이름·설명·대화상자를 쓰므로,
 * 기능을 더할 때 한 곳만 고치면 두 진입점이 함께 바뀐다. 대화상자는 처음 열 때만 내려받고, 열고 닫는 상태는
 * `claude-assist-dialog-store`가, 그리는 일은 스튜디오가 늘 마운트해 두는 `ClaudeAssistDialogHostEntry`가 맡는다.
 */
export const CLAUDE_ASSIST_FEATURES: readonly ClaudeAssistFeature[] = Object.freeze([
  {
    id: "art-director",
    Icon: ImageIcon,
    titleKey: "claudeAssist.art.title",
    descriptionKey: "claudeAssist.hub.artDescription",
    requirementKey: "claudeAssist.hub.artRequirement",
    Dialog: ArtDirectorDialog,
  },
  {
    id: "command-helper",
    Icon: ListChecks,
    titleKey: "claudeAssist.plan.title",
    descriptionKey: "claudeAssist.hub.planDescription",
    requirementKey: "claudeAssist.hub.planRequirement",
    Dialog: CommandPlanDialog,
  },
  {
    id: "localize",
    Icon: Languages,
    titleKey: "claudeAssist.localize.title",
    descriptionKey: "claudeAssist.hub.localizeDescription",
    requirementKey: "claudeAssist.hub.localizeRequirement",
    Dialog: LocalizeDialog,
  },
  {
    id: "alt-text",
    Icon: Accessibility,
    titleKey: "claudeAssist.altText.title",
    descriptionKey: "claudeAssist.hub.altTextDescription",
    requirementKey: "claudeAssist.hub.altTextRequirement",
    Dialog: AltTextDialog,
  },
]);

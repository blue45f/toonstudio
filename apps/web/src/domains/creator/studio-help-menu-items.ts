/**
 * Help group entries: task-oriented help home, search, current-tool help and
 * technical troubleshooting. External manuals always open in a separate tab so
 * an unsaved editor is never replaced.
 */
import {
  BookOpen,
  Bug,
  Command,
  Compass,
  HelpCircle,
  LifeBuoy,
  Scale,
  Search,
  Stethoscope,
} from "lucide-react";

import {
  openStudioHelpCenter,
  requestStudioCommandSearch,
} from "./studio-help-center-channel";
import { openStudioHelpHub } from "./studio-help-hub-channel";
import { buildStudioHelpMenuItems } from "./studio-main-menu-items-workspace";

import type { StudioHelpMenuItemsInput } from "./studio-main-menu-items-workspace";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

const LABELS = {
  ko: {
    "help-home": "도움말 홈 · 단계별 가이드",
    "command-search": "명령 · 속성 통합 검색",
    "terminology-search": "다른 앱 용어 찾기",
    "current-tool": "현재 도구 도움말",
    "user-manual": "사용자 매뉴얼 (새 탭)",
    diagnostics: "기기 · 브라우저 진단…",
    recovery: "복구 가이드…",
    licenses: "라이선스 · 서드파티 고지…",
    "bug-report": "버그 리포트 패키지…",
  },
  en: {
    "help-home": "Help home and guided learning",
    "command-search": "Command search",
    "terminology-search": "Other app terminology",
    "current-tool": "Current tool help",
    "user-manual": "User manual · Korean (new tab)",
    diagnostics: "Device and browser diagnosis…",
    recovery: "Recovery guide…",
    licenses: "Licenses and third-party notices…",
    "bug-report": "Bug report package…",
  },
} as const;

export function buildStudioHelpGroupItems(
  input: StudioHelpMenuItemsInput,
): StudioMainMenuItem[] {
  const activeToolCommandId = input.state.activeToolCommandId;
  const label = LABELS[input.helpGroupLabel === "도움말" ? "ko" : "en"];
  const openHelpHome = () => {
    openStudioHelpHub({
      initialTab: "home",
      ...(activeToolCommandId === null ? {} : { toolCommandId: activeToolCommandId }),
      actions: {
        openFeatureTutorial: () => input.editor.openFeatureTutorial(),
        openShortcuts: () => input.ui.openShortcuts(),
      },
    });
  };

  // Keep the existing catalog id/origin (`help.feature-tutorials` →
  // `help/feature-tutorials`) while upgrading that entry into the broader help
  // home. The original tutorial surface remains one click away inside the hub.
  const learning = buildStudioHelpMenuItems(input).map((item) =>
    item.id === "feature-tutorials"
      ? {
          ...item,
          label: label["help-home"],
          labelKey: undefined,
          icon: Compass,
          searchActivation: "execute" as const,
          onSelect: openHelpHome,
        }
      : item,
  );

  const finding: StudioMainMenuItem[] = [
    {
      id: "command-search",
      commandId: "help.command-search",
      label: label["command-search"],
      icon: Search,
      shortcut: "F1",
      onSelect: () => {
        requestStudioCommandSearch();
      },
    },
    {
      id: "terminology-search",
      commandId: "help.terminology-search",
      label: label["terminology-search"],
      icon: Command,
      onSelect: () => {
        openStudioHelpCenter({ section: "terminology" });
      },
    },
    {
      id: "current-tool",
      commandId: "help.current-tool",
      label: label["current-tool"],
      icon: HelpCircle,
      separatorAfter: true,
      onSelect: () => {
        openStudioHelpCenter({
          section: "current-tool",
          ...(activeToolCommandId === null
            ? {}
            : { toolCommandId: activeToolCommandId }),
        });
      },
    },
  ];

  const troubleshooting: StudioMainMenuItem[] = [
    {
      id: "diagnostics",
      commandId: "help.diagnostics",
      label: label["diagnostics"],
      icon: Stethoscope,
      onSelect: () => {
        openStudioHelpCenter({ section: "diagnostics" });
      },
    },
    {
      id: "recovery",
      commandId: "help.recovery",
      label: label["recovery"],
      icon: LifeBuoy,
      separatorAfter: true,
      onSelect: () => {
        openStudioHelpCenter({ section: "recovery" });
      },
    },
    {
      id: "licenses",
      commandId: "help.licenses",
      label: label["licenses"],
      icon: Scale,
      onSelect: () => {
        openStudioHelpCenter({ section: "license" });
      },
    },
    {
      id: "bug-report",
      commandId: "help.bug-report",
      label: label["bug-report"],
      icon: Bug,
      onSelect: () => {
        openStudioHelpCenter({ section: "bug-report" });
      },
    },
  ];

  const manual: StudioMainMenuItem = {
    id: "user-manual",
    commandId: "help.user-manual",
    label: label["user-manual"],
    icon: BookOpen,
    searchActivation: "execute",
    onSelect: () => {
      window.open("/studio/manual", "_blank", "noopener,noreferrer");
    },
  };
  // 기능 튜토리얼 도달성(first-run F4.4): 학습 블록(튜토리얼 허브로 가는
  // 도움말 홈 + 단축키)과 매뉴얼을 도움말 그룹 최상단에 고정한다. 첫 실행
  // 사용자가 코치를 닫은 뒤에도 메뉴만으로 튜토리얼을 재발견할 수 있어야
  // 하며, 순서는 STUDIO_MENU_ITEM_INVENTORY 와 한 쌍으로 움직인다.
  const learningWithSeparator = [...learning, manual].map((item, index, items) =>
    index === items.length - 1 ? { ...item, separatorAfter: true } : item,
  );

  return [...learningWithSeparator, ...finding, ...troubleshooting];
}

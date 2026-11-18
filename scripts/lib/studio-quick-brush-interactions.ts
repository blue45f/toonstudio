import { visibleStudioControl } from "./studio-shell-interactions";

import type { StudioInAppStep } from "./studio-inapp-sweep-harness.mjs";
import type { Locator, Page } from "playwright";

interface QuickBrushOption {
  readonly id: string | null;
  readonly selected: string | null;
  readonly visible: boolean;
  readonly disabled: boolean;
}

/** 현재 보이는 목록에서 식별자가 유일한 비활성 브러시를 골라 실제 전환을 요구한다. */
export function selectStudioQuickBrushIdentity(options: readonly QuickBrushOption[]): string {
  const visible = options.filter(option => option.visible);
  const ids = new Set<string>();
  for (const option of visible) {
    if (!option.id || ids.has(option.id)) throw new Error("빠른 브러시의 식별자가 없거나 중복됐습니다.");
    if (option.selected !== "true" && option.selected !== "false") {
      throw new Error("빠른 브러시의 실제 선택 상태가 없습니다.");
    }
    ids.add(option.id);
  }
  const candidate = visible.find(option => option.selected === "false" && !option.disabled);
  if (!candidate?.id) throw new Error("선택 가능한 비활성 빠른 브러시가 없습니다.");
  return candidate.id;
}

export function createStudioQuickBrushStep(interaction: {
  openSettings: (page: Page) => Promise<Locator>;
  click: (locator: Locator) => Promise<void>;
  settle: (page: Page) => Promise<void>;
}): StudioInAppStep {
  return {
    id: "brush-quick-tray", label: "빠른 브러시 트레이",
    run: async page => {
      const sheet = await interaction.openSettings(page);
      const tray = await visibleStudioControl(sheet.locator('[data-studio-brush-tray="true"]'), "빠른 브러시 목록");
      const options = await tray.locator('[role="option"]').evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return {
          id: node.getAttribute("data-studio-brush-chip"), selected: node.getAttribute("aria-selected"),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" &&
            !node.closest('[hidden], [inert], [aria-hidden="true"]'),
          disabled: node.matches(':disabled, [aria-disabled="true"]'),
        };
      }));
      const brushId = selectStudioQuickBrushIdentity(options);
      const selector = `[role="option"][data-studio-brush-chip=${JSON.stringify(brushId)}]`;
      const target = await visibleStudioControl(tray.locator(selector), `빠른 브러시 ${brushId}`);
      if (await target.getAttribute("aria-selected") !== "false") throw new Error("클릭 전에 빠른 브러시 선택이 바뀌었습니다.");
      await interaction.click(target);
      await interaction.settle(page);
      // 선택으로 목록이 닫히거나 정렬돼도 같은 식별자의 실제 활성 상태를 검사한다.
      const after = await interaction.openSettings(page);
      const selected = await visibleStudioControl(after.locator('[data-studio-brush-tray="true"]').locator(selector), `선택한 빠른 브러시 ${brushId}`);
      if (await selected.getAttribute("aria-selected") !== "true") throw new Error(`빠른 브러시 ${brushId} 선택이 적용되지 않았습니다.`);
      return "ok";
    },
  };
}

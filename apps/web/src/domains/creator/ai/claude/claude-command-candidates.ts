/**
 * 스튜디오의 라이브 실행 바인딩 + 명령 카탈로그를 AI 명령 후보로 바꾼다.
 *
 * 후보의 권위는 **라이브 바인딩**이다. 카탈로그에만 있고 바인딩이 없는 명령(저장·게시·삭제처럼 검색에서
 * 직접 실행하지 않기로 검토된 명령)은 후보가 되지 않으므로 AI도 계획하거나 실행할 수 없다.
 * 카탈로그는 모델이 비슷한 명령을 구분하도록 설명·별칭만 보태 준다.
 */
import type { StudioCommandCatalogEntry } from "../../studio-command-catalog";
import type { StudioCommandExecutionBinding } from "../../studio-command-execution-registry";

import type { AiCommandCandidate } from "./claude-command-plan";

export function candidatesFromStudioBindings(
  bindings: ReadonlyMap<string, StudioCommandExecutionBinding>,
  catalog: readonly StudioCommandCatalogEntry[],
  locale = "ko",
): AiCommandCandidate[] {
  const entries = new Map(catalog.map((entry) => [entry.id, entry]));
  const result: AiCommandCandidate[] = [];
  for (const binding of bindings.values()) {
    const entry = entries.get(binding.commandId);
    const label = entry?.labels.find((item) => item.locale === locale);
    const aliases = (entry?.aliases ?? [])
      .filter((alias) => alias.vendor !== "toonstudio" && (!alias.locale || alias.locale === locale || alias.locale === "en"))
      .map((alias) => alias.term);
    result.push({
      commandId: binding.commandId,
      label: binding.label || label?.label || binding.commandId,
      // 메뉴 이름은 상태에 따라 바뀔 수 있어(켜기/끄기) 프롬프트에는 카탈로그의 고정 이름을 싣는다.
      ...(label?.label ? { stableLabel: label.label } : {}),
      ...(label?.description ? { description: label.description } : {}),
      ...(aliases.length > 0 ? { aliases: [...new Set(aliases)] } : {}),
      ...(entry?.shortcut ? { shortcut: entry.shortcut } : {}),
      disabled: binding.disabled,
      ...(binding.unavailableReason ? { unavailableReason: binding.unavailableReason } : {}),
    });
  }
  return result;
}

/**
 * "방법 알려 줘" 모드의 지식: 도우미가 **직접 실행하지 못하는** 기능(저장·게시 같은 메뉴 명령)까지 포함한 카탈로그 전체.
 * 후보(`candidatesFromStudioBindings`)는 실행할 수 있는 명령만 담지만, 방법을 묻는 질문에는 단축키와 이름을 알려 주는 것이
 * 가장 도움이 되기 때문이다. 실행 가능 여부는 라이브 바인딩으로 따로 표시해 모델이 "메뉴에서 직접 하세요"라고 안내하게 한다.
 */
export function knowledgeFromStudioCatalog(
  bindings: ReadonlyMap<string, StudioCommandExecutionBinding>,
  catalog: readonly StudioCommandCatalogEntry[],
  locale = "ko",
): AiCommandCandidate[] {
  return catalog.map((entry) => {
    const label = entry.labels.find((item) => item.locale === locale) ?? entry.labels.find((item) => item.locale === "en") ?? entry.labels[0];
    const aliases = entry.aliases
      .filter((alias) => alias.vendor !== "toonstudio" && (!alias.locale || alias.locale === locale || alias.locale === "en"))
      .map((alias) => alias.term);
    const binding = bindings.get(entry.id);
    return {
      commandId: entry.id,
      label: label?.label ?? entry.id,
      ...(label?.description ? { description: label.description } : {}),
      ...(aliases.length > 0 ? { aliases: [...new Set(aliases)] } : {}),
      ...(entry.shortcut ? { shortcut: entry.shortcut } : {}),
      executable: Boolean(binding),
      disabled: false,
    };
  });
}

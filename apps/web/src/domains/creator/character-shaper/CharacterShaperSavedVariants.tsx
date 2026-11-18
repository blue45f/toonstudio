import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { FullVrmState } from "../vrm/studio-vrm-poser-utils";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

export function CharacterShaperSavedVariants({ h, disabled, onRestore, query = "" }: {
  readonly h: StudioVrmPoserHost;
  readonly disabled: boolean;
  readonly onRestore?: () => void;
  readonly query?: string;
}) {
  const bt = useBilingual("CharacterShaperSavedVariants");
  const id = useId();
  const states: Record<string, FullVrmState> = h.savedFullStates ?? {};
  const names = Object.keys(states).filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const entries: readonly VrmLibraryEntry[] = h.libraryEntries ?? [];
  if (names.length === 0) return null;
  return <label htmlFor={id} className="grid gap-1 px-1 py-2 text-xs font-medium text-fg-2">
    <span id={`${id}-label`}>{bt("저장한 변형 열기", "Open a saved look")}</span>
    <select id={id} aria-labelledby={`${id}-label`} value="" disabled={disabled || h.vrmCreativeReadOnly || h.status === "empty"}
      className="min-h-11 w-full rounded border border-line bg-panel px-2 text-fg"
      onChange={(event) => {
        const name = event.currentTarget.value;
        if (!Object.hasOwn(states, name)) return;
        h.handleLoadFullLocal(name);
        onRestore?.();
      }}>
      <option value="">{bt("변형 선택", "Choose a look")}</option>
      {names.map((name) => {
        const model = states[name]?.modelId;
        const other = Boolean(model && model !== h.activeModelId);
        const source = entries.find((entry) => entry.id === model)?.name ?? model;
        return <option key={name} value={name} disabled={other}>
          {other ? `${name} · ${bt("원본 모델", "Source model")} ${source}` : name}
        </option>;
      })}
    </select>
  </label>;
}

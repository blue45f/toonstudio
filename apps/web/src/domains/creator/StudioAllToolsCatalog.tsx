import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { ArrowLeft, ChevronRight, Pin, PinOff, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { STUDIO_RAIL_TOOL_CATALOG, studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";
import { STUDIO_CHROME_RAIL_TOOL_GROUPS } from "./studio-chrome-ia-map";
import type { StudioRailToolButtonProps } from "./studio-chrome-ui";
import { matchesStudioRailToolQuery } from "./studio-rail-tool-search";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function StudioAllToolsCatalog({ definitions, pinned, query, onQuery, onPin, onUsed }: {
  definitions: Record<StudioRailToolId, StudioRailToolButtonProps>;
  pinned: readonly StudioRailToolId[];
  query: string;
  onQuery: (value: string) => void;
  onPin: (id: StudioRailToolId, pinned: boolean) => void;
  onUsed: () => void;
}) {
  const t = useT(), bt = useBilingual("StudioAllToolsCatalog");
  const [groupId, setGroupId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const searching = query.trim().length > 0;
  const groupLabel = (id: string, ko: string) => bt(ko, ({ "navigate-select": "Select and move", draw: "Draw", "paint-retouch": "Paint and retouch", selection: "Select an area", transform: "Crop", objects: "Add objects", "media-3d": "3D and reference", view: "View" } as Record<string, string>)[id] ?? ko);
  const selectedGroup = STUDIO_CHROME_RAIL_TOOL_GROUPS.find(group => group.id === groupId);
  const rootId = useId();
  const matches = (id: StudioRailToolId) => matchesStudioRailToolQuery(id, query, t);
  return <div className="space-y-2">
    <label className="relative block"><Search size={16} aria-hidden className="absolute left-3 top-3.5 text-fg-2" />
      <input type="search" aria-label="전체 도구 검색" value={query}
        placeholder="이름 · 스포이드 · 3D · 단축키" onChange={(event) => onQuery(event.currentTarget.value.slice(0, 80))}
        className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm text-fg focus-visible:outline-accent" />
    </label>
    {!searching && !selectedGroup ? <nav aria-label={bt("도구 분류 고르기", "Choose a tool category")} className="grid gap-2 sm:grid-cols-2">
      {STUDIO_CHROME_RAIL_TOOL_GROUPS.map(group => {
        const Icon = definitions[group.toolIds[0]].icon;
        return <button key={group.id} type="button" data-studio-tool-category={group.id}
          onClick={() => { setGroupId(group.id); requestAnimationFrame(() => heading.current?.focus()); }}
          className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card p-3 text-left text-sm text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <Icon size={20} aria-hidden /><span className="min-w-0 flex-1"><strong className="block">{groupLabel(group.id, group.labelKo)}</strong><small className="text-fg-2">{bt(`${group.toolIds.length}개 도구`, `${group.toolIds.length} tools`)}</small></span><ChevronRight size={16} aria-hidden />
        </button>;
      })}
    </nav> : <>
      <header className="flex items-center gap-2 border-b border-line pb-2">
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-raised" aria-label={bt("도구 분류로 돌아가기", "Back to tool categories")}
          onClick={() => { const previous = groupId; onQuery(""); setGroupId(null); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-studio-tool-category="${previous ?? "draw"}"]`)?.focus()); }}><ArrowLeft size={18} aria-hidden /></button>
        <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold">{searching ? bt("전체 도구 검색 결과", "Results across all tools") : selectedGroup ? groupLabel(selectedGroup.id, selectedGroup.labelKo) : ""}</h3>
      </header>
      <p className="text-xs text-fg-2">{bt("도구 이름을 누르면 사용하고, 핀은 도구막대 배치만 바꿉니다.", "Choose a tool to use it. Pinning only changes the toolbar.")}</p>
    {STUDIO_CHROME_RAIL_TOOL_GROUPS.filter(group => searching || group.id === groupId).map((group) => {
      const ids = group.toolIds.filter(matches);
      if (!ids.length) return null;
      return <section key={group.id} aria-labelledby={`${rootId}-${group.id}`}>
        <h3 id={`${rootId}-${group.id}`} className="px-2 py-2 text-xs font-semibold text-fg-2">{groupLabel(group.id, group.labelKo)}</h3>
        {ids.map((id) => {
          const definition = definitions[id];
          const Icon = definition.icon;
          const label = studioRailToolLabel(id, t);
          const isPinned = pinned.includes(id);
          const shortcut = STUDIO_RAIL_TOOL_CATALOG.find((item) => item.id === id)?.defaultShortcut;
          return <div key={id} className="flex items-start gap-1 rounded-lg hover:bg-raised">
            <button type="button" aria-label={`${label} 사용`} aria-disabled={definition.disabled || undefined}
              data-studio-catalog-tool-id={id} data-studio-hidden-tool-id={!isPinned ? id : undefined}
              aria-describedby={definition.disabled ? `${rootId}-${id}-reason` : undefined}
              onClick={(event) => { if (definition.disabled) return; definition.onClick?.(event); onUsed(); }}
              onFocus={definition.onFocus} onPointerEnter={definition.onPointerEnter}
              className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-3 text-left text-sm text-fg focus-visible:ring-2 focus-visible:ring-accent">
              <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block">{label}</span>
                {definition.disabled ? <span id={`${rootId}-${id}-reason`} className="mt-1 block text-xs leading-relaxed text-fg-2">{definition.unavailableReason ?? "선택 항목과 편집 권한을 확인하세요."}</span> : null}
              </span>
              {shortcut ? <kbd className="text-xs text-fg-2">{shortcut}</kbd> : null}
            </button>
            <button type="button" aria-label={`${label} ${isPinned ? "고정 해제" : "고정"}`} aria-pressed={isPinned}
              disabled={isPinned && pinned.length <= 1} onClick={() => onPin(id, !isPinned)}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-card focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
              {isPinned ? <PinOff size={17} aria-hidden /> : <Pin size={17} aria-hidden />}
            </button>
          </div>;
        })}
      </section>;
    })}
    </>}
    {!STUDIO_RAIL_TOOL_CATALOG.some(({ id }) => matches(id)) ? <p role="status" className="py-4 text-sm text-fg-2">{r3c07StatusText("studio.panelStatus.r3c07.allToolsCatalog.searchEmpty", "일치하는 도구가 없습니다. 이름이나 단축키를 바꿔 검색하세요.")}</p> : null}
  </div>;
}

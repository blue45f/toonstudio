import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { ArrowLeft, Pin, PinOff, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { STUDIO_RAIL_TOOL_CATALOG, studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";
import {
  StudioAllToolsCrossSurfaceGuidance,
  StudioAllToolsDisabledItemGuidance,
} from "./planning/StudioAllToolsUnavailableGuidance";
import { useAllToolsCrossSurfaceMatches } from "./planning/studio-command-search-unavailability";
import { STUDIO_CHROME_RAIL_TOOL_GROUPS } from "./studio-chrome-ia-map";
import type { StudioRailToolButtonProps } from "./studio-chrome-ui";
import { matchesStudioRailToolQuery } from "./studio-rail-tool-search";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const QUICK_TOOL_ALIASES = [
  { query: "손떨림 보정", ko: "손떨림 보정", en: "Stabilizer" },
  { query: "틈 닫기", ko: "틈 닫기", en: "Close gap" },
  { query: "원근 자", ko: "원근 자", en: "Perspective" },
  { query: "칸 나누기", ko: "칸 나누기", en: "Cut split" },
  { query: "말풍선", ko: "말풍선", en: "Bubble" },
  { query: "캐릭터 셰이퍼", ko: "캐릭터 셰이퍼", en: "Shaper" },
  { query: "3D 배치", ko: "3D 배치", en: "3D place" },
  { query: "컷 댓글", ko: "컷 댓글", en: "Review pin" },
] as const;

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
  const visibleGroups = STUDIO_CHROME_RAIL_TOOL_GROUPS.filter(group => searching || groupId === null || group.id === groupId);
  const crossSurfaceMatches = useAllToolsCrossSurfaceMatches(query);
  const hasRailMatch = STUDIO_RAIL_TOOL_CATALOG.some(({ id }) => matches(id));

  return <div className="space-y-2" data-studio-all-tools-direct="true">
    <label className="relative block"><Search size={16} aria-hidden className="absolute left-3 top-3.5 text-fg-2" />
      <input type="search" aria-label="전체 도구 검색" value={query}
        placeholder={bt("이름 · 손떨림 보정 · 틈 닫기 · 원근 자 · 단축키", "Name · stabilizer · close gap · perspective · shortcut")} onChange={(event) => onQuery(event.currentTarget.value.slice(0, 80))}
        className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm text-fg focus-visible:outline-accent" />
    </label>
    {!searching ? <>
      <div data-studio-all-tools-alias-chips="true" className="flex flex-wrap gap-1" aria-label={bt("자주 찾는 별칭", "Popular aliases")}>
        {QUICK_TOOL_ALIASES.map((chip) => (
          <button key={chip.query} type="button" data-studio-tool-alias-chip={chip.query} onClick={() => onQuery(chip.query)}
            className="min-h-7 rounded-full border border-line bg-card px-2.5 text-[0.68rem] font-medium text-fg-2 hover:border-accent/50 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {bt(chip.ko, chip.en)}
          </button>
        ))}
      </div>
      <nav aria-label={bt("도구 분류 고르기", "Choose a tool category")} className="flex flex-wrap gap-1.5">
        <button type="button" data-studio-tool-category="all" aria-pressed={groupId === null}
          onClick={() => setGroupId(null)}
          className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${groupId === null ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"}`}>
          {bt(`전체 ${STUDIO_RAIL_TOOL_CATALOG.length}개 한눈에`, `All ${STUDIO_RAIL_TOOL_CATALOG.length} tools`)}
        </button>
        {STUDIO_CHROME_RAIL_TOOL_GROUPS.map(group => {
          const Icon = definitions[group.toolIds[0]]?.icon;
          const active = groupId === group.id;
          return <button key={group.id} type="button" data-studio-tool-category={group.id} aria-pressed={active}
            onClick={() => { setGroupId(active ? null : group.id); requestAnimationFrame(() => heading.current?.focus()); }}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${active ? "border-accent bg-accent-soft font-bold" : "border-line bg-card hover:bg-raised"}`}>
            {Icon ? <Icon size={14} aria-hidden /> : null}
            <span><strong className="font-semibold">{groupLabel(group.id, group.labelKo)}</strong> <small className="text-fg-2">{bt(`${group.toolIds.length}개 도구`, `${group.toolIds.length} tools`)}</small></span>
          </button>;
        })}
      </nav>
    </> : null}
    {searching || selectedGroup ? (
      <header className="flex items-center gap-2 border-b border-line pb-2">
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-raised" aria-label={bt("도구 분류로 돌아가기", "Back to tool categories")}
          onClick={() => { const previous = groupId; onQuery(""); setGroupId(null); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-studio-tool-category="${previous ?? "all"}"]`)?.focus()); }}><ArrowLeft size={18} aria-hidden /></button>
        <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold">{searching ? bt("전체 도구 검색 결과", "Results across all tools") : selectedGroup ? groupLabel(selectedGroup.id, selectedGroup.labelKo) : ""}</h3>
      </header>
    ) : null}
    <p className="text-xs text-fg-2">{bt("도구 이름을 누르면 바로 전환되고, 핀 아이콘으로 좌측 도구막대에 고정할 수 있습니다.", "Click any tool to switch immediately, or pin it to the left toolbar.")}</p>
    {visibleGroups.map((group) => {
      const ids = group.toolIds.filter(matches);
      if (!ids.length) return null;
      return <section key={group.id} aria-labelledby={`${rootId}-${group.id}`}>
        <h3 id={`${rootId}-${group.id}`} className="px-2 py-1.5 text-xs font-semibold text-fg-2">{`${groupLabel(group.id, group.labelKo)} (${ids.length})`}</h3>
        {ids.map((id) => {
          const definition = definitions[id];
          if (!definition) return null;
          const Icon = definition.icon;
          const label = studioRailToolLabel(id, t);
          const isPinned = pinned.includes(id);
          const shortcut = STUDIO_RAIL_TOOL_CATALOG.find((item) => item.id === id)?.defaultShortcut;
          return <div key={id} className="rounded-lg hover:bg-raised">
            <div className="flex items-start gap-1">
              <button type="button" aria-label={`${label} 사용`} aria-disabled={definition.disabled || undefined}
                data-studio-catalog-tool-id={id} data-studio-hidden-tool-id={!isPinned ? id : undefined}
                aria-describedby={definition.disabled ? `${rootId}-${id}-reason` : undefined}
                onClick={(event) => { if (definition.disabled) return; definition.onClick?.(event); onUsed(); }}
                onFocus={definition.onFocus} onPointerEnter={definition.onPointerEnter}
                className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2.5 text-left text-sm text-fg focus-visible:ring-2 focus-visible:ring-accent">
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block">{label}</span>
                  {definition.disabled ? <span id={`${rootId}-${id}-reason`} className="mt-1 block text-xs leading-relaxed text-fg-2">{definition.unavailableReason ?? "선택 항목과 편집 권한을 확인하세요."}</span> : null}
                </span>
                {shortcut ? <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-fg-2">{shortcut}</kbd> : null}
              </button>
              <button type="button" aria-label={`${label} ${isPinned ? "고정 해제" : "고정"}`} aria-pressed={isPinned}
                disabled={isPinned && pinned.length <= 1} onClick={() => onPin(id, !isPinned)}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-card focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
                {isPinned ? <PinOff size={17} aria-hidden /> : <Pin size={17} aria-hidden />}
              </button>
            </div>
            {definition.disabled ? <StudioAllToolsDisabledItemGuidance toolLabel={label} unavailableReason={definition.unavailableReason} onUsed={onUsed} /> : null}
          </div>;
        })}
      </section>;
    })}
    {!hasRailMatch && crossSurfaceMatches.length > 0 ? <StudioAllToolsCrossSurfaceGuidance query={query} onUsed={onUsed} /> : null}
    {!hasRailMatch && crossSurfaceMatches.length === 0 ? <p role="status" className="py-4 text-sm text-fg-2">{r3c07StatusText("studio.panelStatus.r3c07.allToolsCatalog.searchEmpty", "일치하는 도구가 없습니다. 이름이나 단축키를 바꿔 검색하세요.")}</p> : null}
  </div>;
}

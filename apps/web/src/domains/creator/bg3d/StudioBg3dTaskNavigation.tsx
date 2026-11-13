import type { ComponentType, KeyboardEvent } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface Bg3dTaskTab { readonly id: string; readonly label: string; readonly hint?: string; readonly icon: ComponentType<{ size?: number; "aria-hidden"?: boolean; className?: string }> }
const TASKS = [
  { id: "build", ko: "장면 만들기", en: "Build scene", tabs: ["templates", "shapes", "models"] },
  { id: "compose", ko: "구도·작화", en: "Frame and render", tabs: ["view", "lt"] },
  { id: "layers", ko: "장면 레이어", en: "Scene layers", tabs: ["layers"] },
] as const;

/** 장면 작업을 고르면 관련 패널만 보인다. 기존 탭 ID·명령·선택 상태는 호스트가 소유한다. */
export function StudioBg3dTaskNavigation({ tabs, active, onSelect, blocked = false }: {
  readonly tabs: readonly Bg3dTaskTab[];
  readonly active: string;
  readonly onSelect: (id: string) => void;
  readonly blocked?: boolean;
}) {
  const bt = useBilingual("StudioBg3dTaskNavigation");
  const task = TASKS.find(group => (group.tabs as readonly string[]).includes(active)) ?? TASKS[0];
  const visible = tabs.filter(tab => (task.tabs as readonly string[]).includes(tab.id));
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1
      : ["ArrowRight", "ArrowDown"].includes(event.key) ? (index + 1) % visible.length
      : ["ArrowLeft", "ArrowUp"].includes(event.key) ? (index - 1 + visible.length) % visible.length : null;
    if (next === null) return;
    const tab = visible[next]; if (!tab) return;
    event.preventDefault(); onSelect(tab.id); document.getElementById(`bg3d-tab-${tab.id}`)?.focus();
  };
  return <div inert={blocked} className="shrink-0 border-b border-line bg-panel">
    <div role="group" aria-label={bt("3D 작업 선택", "Choose a 3D task")} className="grid grid-cols-3 gap-1 p-2">
      {TASKS.map(group => <button key={group.id} type="button" aria-pressed={task.id === group.id}
        onClick={() => { if (task.id !== group.id) onSelect(group.tabs[0]); }}
        className={`min-h-12 rounded-xl border px-2 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${task.id === group.id ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}>{bt(group.ko, group.en)}</button>)}
    </div>
    <div role="tablist" aria-label={bt("컨트롤 카테고리", "Control categories")} className="flex gap-1 px-2 pb-2">
      {visible.map((tab, index) => { const Icon = tab.icon; return <button key={tab.id} id={`bg3d-tab-${tab.id}`} type="button" role="tab"
        aria-selected={active === tab.id} aria-controls="bg3d-panel-body" aria-label={tab.label} title={tab.hint} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => onSelect(tab.id)} onKeyDown={event => move(event, index)}
        className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${active === tab.id ? "bg-raised text-fg" : "text-fg-2 hover:bg-raised"}`}><Icon size={17} aria-hidden />{tab.label}</button>; })}
    </div>
  </div>;
}

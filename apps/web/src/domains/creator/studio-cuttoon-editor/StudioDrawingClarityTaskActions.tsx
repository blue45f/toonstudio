import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { splitStudioMainMenuSections, type StudioMainMenuItem } from "../studio-main-menu-model";
import type { StudioDrawingClarityAction } from "./StudioDrawingClarityMore";

const TASKS = [
  { id: "document", ko: "원고와 레이어", en: "Draft and layers", detailKo: "페이지 · 레이어 · 소재", detailEn: "Pages, layers and assets", ids: ["pages", "layers", "assets", "history"], art: "storyboard" },
  { id: "drawing", ko: "그리기 도구", en: "Drawing tools", detailKo: "펜 설정 · 필터 · 전체 도구", detailEn: "Pen settings, filters and all tools", ids: ["brush", "bubble", "character3d", "all", "expanded", "search"], art: "drawingDesk" },
  { id: "output", ko: "내보내기와 협업", en: "Export and collaboration", detailKo: "파일 출력 · 함께 작업", detailEn: "Output files and work together", ids: ["export", "team"], art: "manuscript" },
  { id: "workspace", ko: "화면과 도움말", en: "Display and help", detailKo: "작업 배치 · 사용 방법 · 문제 해결", detailEn: "Workspace, guides and recovery", ids: ["windows", "view", "help", "device", "status"], art: "tools" },
] as const;

/** 목적을 고른 뒤 해당 명령만 보여 준다. 실행은 기존 명령과 native 화면 종료에 맡긴다. */
export function StudioDrawingClarityTaskActions({ actions, filterItems, run }: {
  readonly actions: readonly StudioDrawingClarityAction[];
  readonly filterItems?: readonly StudioMainMenuItem[];
  readonly run: (action: StudioDrawingClarityAction) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const lastTask = useRef<string | null>(null), heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const known = new Set<string>(TASKS.flatMap(task => [...task.ids]));
  const groups = TASKS.map(task => ({ ...task, actions: actions.filter(action => (task.ids as readonly string[]).includes(action.id) || (task.id === "workspace" && !known.has(action.id))) })).filter(task => task.actions.length > 0);
  const active = groups.find(task => task.id === taskId);
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (name: string) => name.normalize("NFKC").toLocaleLowerCase().includes(needle);
  const found = needle ? actions.filter(action => matches(action.label)) : [];
  const filters = needle ? filterItems?.filter(item => matches(item.label)) ?? [] : [];
  const actionRow = (action: StudioDrawingClarityAction) => <button key={action.id} type="button" data-studio-clarity-action={action.id}
    className="studio-drawing-task-action" onClick={() => run(action)}><span>{action.label}</span><ArrowUpRight size={18} aria-hidden /></button>;
  useLayoutEffect(() => {
    if (taskId) { lastTask.current = taskId; heading.current?.focus(); }
    else if (lastTask.current) root.current?.querySelector<HTMLButtonElement>(`[data-drawing-task-category="${lastTask.current}"]`)?.focus();
  }, [taskId]);
  return <div ref={root} data-studio-drawing-task-browser="true">
    {!active && <label className="studio-drawing-task-search"><Search size={19} aria-hidden />
      <input type="search" aria-label={bt("원고 명령 검색", "Search draft commands")}
        placeholder={bt("도구 또는 필터 이름 검색", "Find a tool or filter")} value={query} onChange={event => setQuery(event.target.value)} />
    </label>}
    {active ? <>
      <header className="studio-drawing-task-category-heading">
        <button type="button" className="studio-drawing-clarity-button" onClick={() => setTaskId(null)} aria-label={bt("원고 도구 분류로 돌아가기", "Back to draft tool categories")}><ArrowLeft size={18} aria-hidden /></button>
        <div><h3 ref={heading} tabIndex={-1}>{bt(active.ko, active.en)}</h3><p>{bt(active.detailKo, active.detailEn)}</p></div>
      </header>
      {active.id === "drawing" && filterItems && filterItems.length > 0 && (
        <label className="studio-drawing-filter-choice">
          <span>{bt("필터", "Filters")}</span>
          <select value="" aria-label={bt("필터 선택", "Choose a filter")} onChange={(event) => {
            const item = filterItems.find(option => option.id === event.currentTarget.value);
            if (item && !item.disabled) run({ id: item.id, label: item.label, run: item.onSelect });
          }}>
            <option value="" disabled>{bt("필터 선택", "Choose a filter")}</option>
            {splitStudioMainMenuSections(filterItems).map(section => {
              const options = section.rows.map(({ item }) => <option key={item.id} value={item.id} disabled={item.disabled}>
                {item.disabled && item.unavailableReason ? `${item.label} — ${item.unavailableReason}` : item.label}
              </option>);
              return section.label ? <optgroup key={section.rows[0]?.index} label={section.label}>{options}</optgroup> : options;
            })}
          </select>
        </label>
      )}
      <div className="studio-drawing-task-list">{active.actions.map(actionRow)}</div>
    </> : needle ? <div className="studio-drawing-task-list">
      {found.map(actionRow)}
      {filters.map(item => <button type="button" key={item.id} disabled={item.disabled} className="studio-drawing-task-action"
        onClick={() => run({ id: item.id, label: item.label, run: item.onSelect })}>
        <span>{item.label}{item.disabled && item.unavailableReason ? ` — ${item.unavailableReason}` : ""}</span><ArrowUpRight size={18} aria-hidden />
      </button>)}
      {!found.length && !filters.length && <p role="status">{bt("일치하는 도구나 필터가 없습니다.", "No matching tools or filters.")}</p>}
    </div> : <nav aria-label={bt("원고 도구 목적 고르기", "Choose a draft task")} className="studio-drawing-task-grid">
      {groups.map(task => <button key={task.id} type="button" className="studio-drawing-task-purpose"
        data-drawing-task-category={task.id} onClick={() => setTaskId(task.id)}><StudioToolArtwork tool={task.art} className="studio-drawing-task-art" /><strong>{bt(task.ko, task.en)}</strong><span>{bt(task.detailKo, task.detailEn)}</span></button>)}
    </nav>}
  </div>;
}

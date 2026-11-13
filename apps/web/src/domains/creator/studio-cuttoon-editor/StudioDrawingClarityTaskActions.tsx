import { ArrowLeft, ArrowUpRight, BookOpen, Brush, MonitorCog, Send } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioDrawingClarityAction } from "./StudioDrawingClarityMore";

const TASKS = [
  { id: "document", ko: "원고와 레이어", en: "Draft and layers", detailKo: "페이지 · 레이어 · 소재", detailEn: "Pages, layers and assets", ids: ["pages", "layers", "assets"], icon: BookOpen },
  { id: "drawing", ko: "그리기 도구", en: "Drawing tools", detailKo: "펜 설정 · 전체 도구", detailEn: "Pen settings and all tools", ids: ["brush", "all"], icon: Brush },
  { id: "output", ko: "내보내기와 협업", en: "Export and collaboration", detailKo: "파일 출력 · 함께 작업", detailEn: "Output files and work together", ids: ["export", "team"], icon: Send },
  { id: "workspace", ko: "화면과 도움말", en: "Display and help", detailKo: "작업 배치 · 사용 방법 · 문제 해결", detailEn: "Workspace, guides and recovery", ids: ["windows", "view", "help", "device", "status"], icon: MonitorCog },
] as const;

/** 목적을 고른 뒤 해당 명령만 보여 준다. 실행은 기존 명령과 native 화면 종료에 맡긴다. */
export function StudioDrawingClarityTaskActions({ actions, run }: {
  readonly actions: readonly StudioDrawingClarityAction[];
  readonly run: (action: StudioDrawingClarityAction) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const [taskId, setTaskId] = useState<string | null>(null);
  const lastTask = useRef<string | null>(null), heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const known = new Set<string>(TASKS.flatMap(task => [...task.ids]));
  const groups = TASKS.map(task => ({ ...task, actions: actions.filter(action => (task.ids as readonly string[]).includes(action.id) || (task.id === "workspace" && !known.has(action.id))) })).filter(task => task.actions.length > 0);
  const active = groups.find(task => task.id === taskId);
  useLayoutEffect(() => {
    if (taskId) { lastTask.current = taskId; heading.current?.focus(); }
    else if (lastTask.current) root.current?.querySelector<HTMLButtonElement>(`[data-drawing-task-category="${lastTask.current}"]`)?.focus();
  }, [taskId]);
  return <div ref={root} data-studio-drawing-task-browser="true">
    {active ? <>
      <header className="studio-drawing-task-category-heading">
        <button type="button" className="studio-drawing-clarity-button" onClick={() => setTaskId(null)} aria-label={bt("원고 도구 분류로 돌아가기", "Back to draft tool categories")}><ArrowLeft size={18} aria-hidden /></button>
        <div><h3 ref={heading} tabIndex={-1}>{bt(active.ko, active.en)}</h3><p>{bt(active.detailKo, active.detailEn)}</p></div>
      </header>
      <div className="studio-drawing-task-list">{active.actions.map(action => <button key={action.id} type="button" data-studio-clarity-action={action.id}
        className="studio-drawing-task-action" onClick={() => run(action)}><span>{action.label}</span><ArrowUpRight size={18} aria-hidden /></button>)}</div>
    </> : <nav aria-label={bt("원고 도구 목적 고르기", "Choose a draft task")} className="studio-drawing-task-grid">
      {groups.map(task => { const Icon = task.icon; return <button key={task.id} type="button" className="studio-drawing-task-purpose"
        data-drawing-task-category={task.id} onClick={() => setTaskId(task.id)}><Icon size={24} aria-hidden /><strong>{bt(task.ko, task.en)}</strong><span>{bt(task.detailKo, task.detailEn)}</span></button>; })}
    </nav>}
  </div>;
}

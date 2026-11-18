import { useEffect, useId, useRef } from "react";

import type { Link, NestBoardDocument, NestBoardView, Status, Task } from "@toonstudio/contracts/admin-nestjs-quality";
import type { ReactNode } from "react";

const statusClass: Record<Status, string> = { "미확인": "unknown", "진행 중": "progress", "검토 필요": "review", "승인 대기": "approval", "검증 완료": "verified", "main 머지 완료": "merged" };

export function NestStatus({ status }: { status: Status }) {
  return <span className={`nest-status nest-status-${statusClass[status]}`}>{status}</span>;
}

export function nestDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미확인";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))} KST`;
}

export function NestSource({ link }: { link: Link }) {
  return <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>;
}

export function NestLinks({ links }: { links: Link[] }) {
  return <div className="nest-links">{links.map((link, index) => <NestSource key={`${link.url}-${index}`} link={link} />)}</div>;
}

export function nestExport(document: NestBoardDocument, view: NestBoardView, draft = false): void {
  const content = JSON.stringify({ exportedAt: new Date().toISOString(), draft, serverHistoryFormat: "summary", document, revision: view.revision,
    history: view.history, updatedAt: view.updatedAt }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = draft ? "toonstudio-nestjs-draft.json" : "toonstudio-nestjs-evidence.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function isNestClosed(task: Task): boolean {
  return task.archived || task.status === "검증 완료" || task.status === "main 머지 완료";
}

export function NestTaskList({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  if (!tasks.length) return <p className="nest-empty">조건에 맞는 항목이 없습니다. 검색·필터 또는 완료·보관 포함을 확인하세요.</p>;
  return <div className="nest-task-list">{tasks.map((task) => <button type="button" className="nest-task-row" key={task.id} onClick={() => onOpen(task)}>
    <span className="nest-priority">{task.priority}</span><span className="nest-task-title"><strong>{task.title}</strong><small>{task.category} · {task.kind} · {task.owner || "미지정"}</small></span>
    <span><NestStatus status={task.status} /><small>확인 결과: {task.result || "미확인"}</small></span>
  </button>)}</div>;
}

export function NestDialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const descriptionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dismiss.current?.focus();
    function onKeyDown(event: KeyboardEvent): void {
      if (container.current?.closest("[hidden]")) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]") ?? [])
        .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!container.current?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first?.focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <div className="nest-overlay"><div className="nest-dialog" ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header className="nest-dialog-header"><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" ref={dismiss} onClick={onClose} aria-label="NestJS 대화상자 닫기">닫기</button></header>{children}
  </div></div>;
}

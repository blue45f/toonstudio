import { freshness, matchingCI, safeUrl, stageTone } from "@toonstudio/contracts/admin-cloud-workboard";
import { useEffect, useId, useRef } from "react";

import type { Task } from "@toonstudio/contracts/admin-cloud-workboard";
import type { ReactNode } from "react";

const paths = {
  add: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "m5 12 4 4L19 6",
  cloud: "M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 0 9Z",
  compare: "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4",
  download: "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4",
  history: "M3 4v6h6M3 10a9 9 0 1 1 1 8M12 7v5l4 2",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v6m0-10v1",
  kanban: "M3 4h5v16H3ZM10 4h5v10h-5ZM17 4h4v13h-4Z",
  link: "m9 15 6-6M8 13l-2 2a3 3 0 0 0 4 4l3-3M11 8l3-3a3 3 0 0 1 4 4l-2 2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Zm7 5v2",
  refresh: "M20 4v6h-6M4 20v-6h6M4 8a8 8 0 0 1 13-4l3 6M4 14l3 6a8 8 0 0 0 13-4",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  upload: "M12 16V4m-5 5 5-5 5 5M5 17v4h14v-4",
  warning: "m12 3 10 18H2Zm0 6v5m0 3v1",
  x: "m6 6 12 12M18 6 6 18",
} as const;
export type WorkIconName = keyof typeof paths;

export function WorkIcon({ name, size = 17, className = "" }: { name: WorkIconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}

export function WorkBadge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className={`cw-badge cw-badge--${tone}`}>{children}</span>;
}

export function WorkStage({ value }: { value: string }) {
  return <WorkBadge tone={stageTone(value)}>{value}</WorkBadge>;
}

export function WorkCiBadge({ task, now }: { task: Task; now: number }) {
  if (task.ciStatus !== "미확인" && freshness(task, now) !== "24시간 내 확인") return <WorkBadge>CI 미확인 · 재확인</WorkBadge>;
  const tone = task.ciStatus.includes("실패") ? "red" : task.ciStatus === "통과" && matchingCI(task) ? "green" : task.ciStatus === "대기·실행 중" ? "blue" : "gray";
  const text = task.ciStatus === "통과" && !matchingCI(task) ? "다른 SHA 통과" : task.ciStatus === "미확인" ? "CI 미확인" : `CI ${task.ciStatus}`;
  return <WorkBadge tone={tone}>{text}</WorkBadge>;
}

export function WorkLink({ url, children }: { url: string; children: ReactNode }) {
  const href = safeUrl(url);
  return href ? <a className="cw-source-link" href={href} target="_blank" rel="noopener noreferrer">{children}<WorkIcon name="link" size={12} /></a> : <span className="cw-muted">{children}</span>;
}

export function WorkEmpty({ title = "조건에 맞는 작업이 없습니다", detail = "검색어와 필터를 변경해 보세요." }: { title?: string; detail?: string }) {
  return <div className="cw-empty"><WorkIcon name="list" size={28} /><h3>{title}</h3><p>{detail}</p></div>;
}

export function WorkField({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`cw-field${wide ? " cw-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function WorkSelect({ value, options, onChange, label }: { value: string; options: readonly string[]; onChange: (value: string) => void; label: string }) {
  return <select value={value} aria-label={label} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select>;
}

export function WorkCallout({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "warning" | "danger"; title?: string }) {
  return <div className={`cw-callout cw-callout--${tone}`}><WorkIcon name={tone === "info" ? "info" : "warning"} /><div>{title && <strong>{title}</strong>}{children}</div></div>;
}

export function WorkDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    container.current?.querySelector<HTMLElement>("[data-autofocus],button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],summary,[tabindex]") ?? [])
        .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = elements[0];
      const last = elements.at(-1);
      if (!container.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <div className="cw-overlay" onClick={event => { if (event.target === event.currentTarget) close.current(); }}>
    <div ref={container} className={`cw-dialog${wide ? " cw-dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header className="cw-dialog-header"><div><p className="cw-eyebrow">보드 기록 · 외부 실행 없음</p><h2 id={id}>{title}</h2></div><button type="button" className="cw-icon-button" aria-label="대화상자 닫기" onClick={onClose}><WorkIcon name="x" /></button></header>
      {children}
    </div>
  </div>;
}

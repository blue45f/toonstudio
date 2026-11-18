import { useEffect, useId, useRef } from "react";

import type { AdminWorkspace } from "@toonstudio/contracts/admin-workspace";
import type { ReactNode } from "react";

export function WorkspaceBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" | "approval" }) {
  return <span className={"workspace-badge workspace-badge--" + tone}>{children}</span>;
}

export function statusTone(value: string): "neutral" | "good" | "warn" | "bad" | "info" | "approval" {
  if (value === "확인" || value === "최종 확인" || value === "보완 완료") return "good";
  if (value === "상충") return "bad";
  if (value === "승인 대기") return "approval";
  if (value === "확인 중" || value === "근거 확인 중") return "info";
  if (value === "미확인" || value === "검토 필요") return "warn";
  return "neutral";
}

export function workspaceDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미기록";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) + " KST";
}

export function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function formDate(data: FormData, name: string, previous: string): string {
  const value = formText(data, name);
  return value && previous.slice(0, 10) === value ? previous : value;
}

export function WorkspaceLink({ url, children = "원문 열기" }: { url: string; children?: ReactNode }) {
  let href = "";
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) href = parsed.href;
  } catch { /* 연결되지 않은 근거는 텍스트로만 표시한다. */ }
  return href ? <a className="workspace-source-link" href={href} target="_blank" rel="noopener noreferrer">{children} <span aria-hidden="true">↗</span></a> : <span className="workspace-muted">원문 미연결</span>;
}

type FieldOption = string | { value: string; label: string };
interface FieldProps {
  name: string; label: string; value?: string | number | null; type?: "text" | "url" | "date" | "number";
  options?: readonly FieldOption[]; area?: boolean; full?: boolean; required?: boolean;
  help?: string; maxLength?: number; rows?: number; disabled?: boolean;
}
export function WorkspaceField({ name, label, value, type = "text", options, area, full, required, help, maxLength = 20000, rows = 3, disabled }: FieldProps) {
  const id = useId();
  const helpId = id + "-help";
  const control = { id, name, defaultValue: value ?? "", required, disabled, "aria-describedby": help ? helpId : undefined };
  return <div className={"workspace-field" + (full ? " workspace-field--full" : "")}>
    <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
    {options
      ? <select {...control}>{options.map(option => typeof option === "string"
        ? <option key={option} value={option}>{option}</option>
        : <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : area
        ? <textarea {...control} rows={rows} maxLength={maxLength} />
        : <input {...control} type={type} maxLength={maxLength} step={type === "number" ? "any" : undefined} max={type === "date" ? todayDate() : undefined} autoComplete="off" />}
    {help ? <small id={helpId}>{help}</small> : null}
  </div>;
}

export function WorkspaceSection({ title, children, help }: { title: string; children: ReactNode; help?: string }) {
  return <section className="workspace-form-section"><h3>{title}</h3>{help ? <p className="workspace-muted">{help}</p> : null}<div className="workspace-field-grid">{children}</div></section>;
}

export function WorkspaceFormError({ error }: { error: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return error ? <div ref={ref} role="alert" tabIndex={-1} className="workspace-alert workspace-alert--bad">{error}</div> : null;
}

export function WorkspaceDialog({ title, description, children, onClose, busy = false }: { title: string; description: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const heading = useId();
  const detail = useId();
  const container = useRef<HTMLDivElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  const blocked = useRef(busy);
  useEffect(() => { close.current = onClose; blocked.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dismiss.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!blocked.current) close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],[tabindex]") ?? [])
        .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!container.current?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <div className="workspace-overlay"><div ref={container} className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={detail}>
    <header className="workspace-dialog-header"><div><p className="workspace-eyebrow">기록과 근거</p><h2 id={heading}>{title}</h2><p id={detail}>{description}</p></div><button ref={dismiss} type="button" onClick={onClose} disabled={busy} aria-label="상세창 닫기">닫기</button></header>
    {children}
  </div></div>;
}

export function downloadWorkspace(state: AdminWorkspace, label = "backup"): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "toonstudio-workspace-" + label + "-" + todayDate() + ".json";
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

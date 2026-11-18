import { todayKst } from "@toonstudio/contracts/business-plan";
import { useEffect, useId, useRef, useState } from "react";

import { useBusinessPlanPermissions } from "./business-plan-permissions";

import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";
import type { ReactNode } from "react";

export type BusinessPlanCommit = (candidate: BusinessPlanState, description: string) => string | null;

export function businessPlanDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미확인";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))} KST`;
}

export function businessPlanDateInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  return value && Number.isFinite(Date.parse(value)) ? todayKst(new Date(value)) : "";
}

export function businessPlanId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function formText(data: FormData, name: string, preserveWhitespace = false): string {
  const value = data.get(name);
  return typeof value === "string" ? preserveWhitespace ? value : value.trim() : "";
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "기록을 처리하지 못했습니다. 입력과 연결을 확인하세요.";
}

export function BusinessPlanError({ error }: { error: string }) {
  return error ? <p className="bp-notice bp-notice--error" role="alert">{error}</p> : null;
}

export function BusinessPlanBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" | "info" }) {
  return <span className={`bp-badge bp-badge--${tone}`}>{children}</span>;
}

export function BusinessPlanPanel({ title, eyebrow, description, actions, children, id, className = "" }: { title: string; eyebrow?: string; description?: string; actions?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  const titleId = useId();
  return <section id={id} className={`bp-panel ${className}`} aria-labelledby={titleId}>
    <header className="bp-panel-header"><div>{eyebrow && <p className="bp-eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2>{description && <p className="bp-muted">{description}</p>}</div>{actions && <div className="bp-actions">{actions}</div>}</header>
    {children}
  </section>;
}

export function BusinessPlanDialog({ title, description, children, onClose, dirty = false, wide = false }: { title: string; description: string; children: ReactNode; onClose: () => void; dirty?: boolean; wide?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = useRef(() => undefined as void);
  requestClose.current = () => dirty ? setConfirmClose(true) : onClose();

  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dismiss.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]") ?? [])
        .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!container.current?.contains(document.activeElement)) {
        event.preventDefault(); first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return <div className="bp-overlay">
    <div className={`bp-dialog ${wide ? "bp-dialog--wide" : ""}`} ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="bp-dialog-header"><div><p className="bp-eyebrow">사업계획서 작업 기록</p><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" ref={dismiss} className="bp-button bp-button--quiet" onClick={() => requestClose.current()} aria-label="대화상자 닫기">닫기</button></header>
      {confirmClose && <div className="bp-close-confirm" role="alert"><p>이 창의 입력을 아직 보드에 반영하지 않았습니다.</p><div className="bp-actions"><button type="button" className="bp-button" onClick={() => setConfirmClose(false)}>계속 작성</button><button type="button" className="bp-button bp-button--danger" onClick={onClose}>입력을 버리고 닫기</button></div></div>}
      {children}
    </div>
  </div>;
}

export function TextField({ label, name, value = "", type = "text", maxLength = 4000, hint, required = false, full = false }: { label: string; name: string; value?: string; type?: "text" | "url" | "date" | "datetime-local" | "number"; maxLength?: number; hint?: string; required?: boolean; full?: boolean }) {
  const id = useId(); const { canWrite } = useBusinessPlanPermissions();
  return <label className={`bp-field ${full ? "bp-full" : ""}`} htmlFor={id}><span><span id={`${id}-label`}>{label}</span>{required && <span className="bp-required" aria-hidden="true"> *</span>}</span><input disabled={!canWrite} id={id} name={name} type={type} defaultValue={value} maxLength={maxLength} required={required} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}

export function TextAreaField({ label, name, value = "", hint, rows = 3, maxLength = 40000, full = false, required = false }: { label: string; name: string; value?: string; hint?: string; rows?: number; maxLength?: number; full?: boolean; required?: boolean }) {
  const id = useId(); const { canWrite } = useBusinessPlanPermissions();
  return <label className={`bp-field ${full ? "bp-full" : ""}`} htmlFor={id}><span><span id={`${id}-label`}>{label}</span>{required && <span className="bp-required" aria-hidden="true"> *</span>}</span><textarea disabled={!canWrite} id={id} name={name} defaultValue={value} rows={rows} maxLength={maxLength} required={required} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}

export function SelectField({ label, name, value = "", options, full = false }: { label: string; name: string; value?: string; options: readonly (string | { value: string; label: string })[]; full?: boolean }) {
  const id = useId(); const { canWrite } = useBusinessPlanPermissions();
  return <label className={`bp-field ${full ? "bp-full" : ""}`} htmlFor={id}><span>{label}</span><select disabled={!canWrite} id={id} name={name} defaultValue={value}>{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function CheckField({ label, name, checked = false, hint }: { label: string; name: string; checked?: boolean; hint?: string }) {
  const id = useId(); const { canWrite } = useBusinessPlanPermissions();
  return <label className="bp-checkbox" htmlFor={id}><input disabled={!canWrite} id={id} name={name} type="checkbox" defaultChecked={checked} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} /><span><span id={`${id}-label`}>{label}</span>{hint && <small id={`${id}-hint`}>{hint}</small>}</span></label>;
}

export function BusinessPlanFormFooter({ label = "보드에 반영", children }: { label?: string; children?: ReactNode }) {
  const { canWrite } = useBusinessPlanPermissions();
  return <footer className="bp-dialog-footer"><span>{children ?? "반영한 내용은 상단의 ‘서버에 저장’으로 저장합니다."}</span><button disabled={!canWrite} type="submit" className="bp-button bp-button--primary">{label}</button></footer>;
}

export function BusinessPlanLink({ url, children }: { url: string; children: ReactNode }) {
  let safe = "";
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) safe = parsed.href;
  } catch { safe = ""; }
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className="bp-text-link">{children}<span aria-hidden="true"> ↗</span><span className="bp-sr-only"> 새 창에서 열기</span></a> : <span className="bp-muted">출처 미등록</span>;
}

export function downloadBusinessPlan(name: string, text: string, type = "application/json;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

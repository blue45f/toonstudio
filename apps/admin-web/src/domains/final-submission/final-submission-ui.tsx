import { isFinalSubmissionDate, isSafeUrl } from "@toonstudio/contracts/final-submission";
import { useEffect, useId, useRef, useState } from "react";

import type { BoardState, Link } from "@toonstudio/contracts/final-submission";
import type { ReactNode } from "react";

export type FinalSubmissionCommit = (candidate: BoardState, summary: string) => string | null;
export const submissionValue = (value: string) => value.trim() || "미확인";
export const SUBMISSION_DATE_HINT = "날짜만 알면 YYYY-MM-DD, 시각은 +09:00 또는 Z를 포함하세요. 시간대가 없으면 ‘시간대 미확인’으로 표시합니다.";

export function submissionDate(value: string | null | undefined): string {
  if (!value || !isFinalSubmissionDate(value)) return "미확인";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/u.test(value)) return `${value} · 시간대 미확인`;
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value.replace(" ", "T")))} KST`;
}

export function SubmissionBadge({ status }: { status: string }) {
  const tone = status === "최종 확인" || status === "일치 확인" || status === "제출 확인" ? "confirmed"
    : status === "승인 대기" ? "pending" : status === "보완 중" ? "working"
      : status === "검토 필요" || status === "차이 확인" || status === "미제출 확인" || status === "문제 확인" ? "review" : "unknown";
  return <span className={`fs-badge fs-badge--${tone}`}>{status}</span>;
}

export function SubmissionError({ error }: { error: string }) {
  return error ? <p className="fs-notice fs-notice--error" role="alert">{error}</p> : null;
}

export function SubmissionLink({ href, children }: { href: string; children: ReactNode }) {
  return isSafeUrl(href) ? <a className="fs-link" href={href} target="_blank" rel="noopener noreferrer">{children}<span className="fs-sr-only"> · 새 창</span></a> : <span className="fs-muted">{children} · 링크 미확인</span>;
}

export function SubmissionPanel({ title, description, actions, children, id }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  const titleId = useId();
  return <section className="fs-panel" id={id} aria-labelledby={titleId}>
    <header className="fs-panel-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="fs-actions">{actions}</div>}</header>
    {children}
  </section>;
}

export function SubmissionField({ label, value, onChange, hint, multiline = false, disabled = false, type = "text", required = false, wide = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; multiline?: boolean; disabled?: boolean; type?: "text" | "url" | "date"; required?: boolean; wide?: boolean }) {
  const id = useId();
  const common = { id, value, disabled, required, maxLength: 12000, "aria-labelledby": `${id}-label`, "aria-describedby": hint ? `${id}-hint` : undefined };
  return <label className={`fs-field ${wide ? "fs-full" : ""}`} htmlFor={id}><span id={`${id}-label`}>{label}</span>
    {multiline ? <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} /> : <input {...common} type={type} onChange={(event) => onChange(event.target.value)} />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </label>;
}

export function SubmissionSelect({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: readonly (string | { value: string; label: string })[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <label className="fs-field" htmlFor={id}><span>{label}</span><select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function SubmissionLinksEditor({ title, links, onChange, disabled = false }: { title: string; links: Link[]; onChange: (links: Link[]) => void; disabled?: boolean }) {
  return <fieldset className="fs-fieldset"><legend>{title}</legend>
    {!links.length && <p className="fs-muted">등록된 참조가 없습니다.</p>}
    {links.map((link, index) => <div className="fs-link-row" key={index}>
      <SubmissionField label={`${title} ${index + 1} 이름`} value={link.label} disabled={disabled} onChange={(label) => onChange(links.map((item, position) => position === index ? { ...item, label } : item))} />
      <SubmissionField label={`${title} ${index + 1} 링크`} type="url" value={link.url} disabled={disabled} onChange={(url) => onChange(links.map((item, position) => position === index ? { ...item, url } : item))} />
      <button type="button" className="fs-button" disabled={disabled} aria-label={`${title} ${index + 1} 제거`} onClick={() => onChange(links.filter((_, position) => position !== index))}>제거</button>
    </div>)}
    <button type="button" className="fs-button" disabled={disabled || links.length >= 30} onClick={() => onChange([...links, { label: "", url: "" }])}>{title} 추가</button>
    <p className="fs-muted">파일명과 참조 링크만 기록합니다. 원본 파일을 업로드하거나 교체하지 않습니다.</p>
  </fieldset>;
}

export function SubmissionDialog({ title, description, children, onClose, dirty = false }: { title: string; description: string; children: ReactNode; onClose: () => void; dirty?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = useRef<() => void>(() => undefined);
  requestClose.current = () => dirty ? setConfirmClose(true) : onClose();

  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (container.current?.closest("[hidden]")) return;
      if (event.key === "Escape") { event.preventDefault(); requestClose.current(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]") ?? [])
        .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0]; const last = controls.at(-1);
      if (!container.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return <div className="fs-overlay"><div className="fs-dialog" ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header className="fs-dialog-header"><div><p className="fs-eyebrow">1R · 최종 제출 점검</p><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button ref={close} type="button" className="fs-button" onClick={() => requestClose.current()} aria-label="점검 대화상자 닫기">닫기</button></header>
    {confirmClose && <div className="fs-close-confirm" role="alert"><p>아직 반영하지 않은 입력이 있습니다.</p><div className="fs-actions"><button type="button" className="fs-button" onClick={() => setConfirmClose(false)}>계속 작성</button><button type="button" className="fs-button" onClick={onClose}>입력을 버리고 닫기</button></div></div>}
    {children}
  </div></div>;
}

export function downloadSubmission(name: string, text: string, type = "application/json;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function submissionCsv(board: BoardState): string {
  const cell = (input: string) => `"${(/^(?:\s*[=+\-@]|[\t\r\n])/u.test(input) ? `'${input}` : input).replaceAll('"', '""')}"`;
  const rows = [["항목 ID", "점검 항목", "분류", "상태", "파일명", "버전", "작성일", "수정일", "근거 링크", "첨부 증빙", "불일치 내용", "다음 조치", "최종 확인 시점", "확인자", "확인 결과", "실행 승인 필요"]];
  for (const task of board.tasks) rows.push([task.id, task.title, task.category, task.status, task.fileName, task.version, task.authoredAt, task.modifiedAt, task.evidenceLinks.map((item) => `${item.label}: ${item.url}`).join("\n"), task.attachments.map((item) => `${item.label}: ${item.url}`).join("\n"), task.discrepancy, task.nextAction, task.lastConfirmedAt, task.confirmedBy, task.confirmationNote, task.approvalRequired ? "승인 대기" : "해당 없음"]);
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
}

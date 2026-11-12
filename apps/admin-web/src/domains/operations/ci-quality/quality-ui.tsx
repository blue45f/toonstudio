import { useEffect, useId, useRef } from "react";


import { statusLabels } from "./ci-quality-model";

import type { QualityStatus } from "./ci-quality-model";
import type { ReactNode } from "react";

export function QualityStatusBadge({ status }: { status: QualityStatus }) {
  return <span className={`ci-quality-status ci-quality-status--${status}`}>{statusLabels[status]}</span>;
}

export function qualityDate(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미확인";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))} KST`;
}

export function qualityLocalTime(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function qualityIsoTime(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

export function QualityDialog({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dismiss.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>("*") ?? [])
        .filter((element) => element.matches("button, input, select, textarea, a[href]") && !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!container.current?.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="ci-quality-overlay">
    <div className="ci-quality-dialog" ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="ci-quality-dialog-header">
        <div><p className="ci-quality-eyebrow">수동 기록 · 외부 실행 없음</p><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button type="button" ref={dismiss} onClick={onClose} aria-label="대화상자 닫기">닫기</button>
      </header>
      {children}
    </div>
  </div>;
}

export function QualityFormError({ error }: { error: string }) {
  return error ? <p role="alert" className="ci-quality-error">{error}</p> : null;
}

export function qualityFormValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

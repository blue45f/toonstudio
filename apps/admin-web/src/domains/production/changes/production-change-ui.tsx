import { dateLabel, FRESHNESS_LABEL, fromLocalDateTime, localDateTime, STATUS_LABEL, freshness } from "@toonstudio/contracts/admin-production-change";
import { useEffect, useId, useRef, useState } from "react";

import type { RequestData, RequestRecord, Status } from "@toonstudio/contracts/admin-production-change";
import type { ReactNode } from "react";

const iconPaths = {
  plus: "M12 5v14M5 12h14", close: "m6 6 12 12M6 18 18 6", search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", refresh: "M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 11-3L20 7M4 17l3.5 3a7 7 0 0 0 11-3", file: "M14 2H5v20h14V7l-5-5v5h5M8 12h8M8 16h8", compare: "M3 5h6v14H3zM15 5h6v14h-6zM9 12h6", shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3m-4 9 3 3 5-6", clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l4 2", check: "m5 12 4 4L19 6", image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01", upload: "M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6", download: "M12 3v13m-5-5 5 5 5-5M3 15v6h18v-6", external: "M14 3h7v7M21 3 10 14M10 3H3v18h18v-7", trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7", info: "M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", board: "M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z", lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4", save: "M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8", warning: "m12 3 10 18H2L12 3M12 9v5M12 17h.01",
} as const;
export function ChangeIcon({ name, size = 18 }: { name: keyof typeof iconPaths; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}
export function ChangeStatus({ status }: { status: Status }) { return <span className={`pc-status pc-status--${status}`}>{STATUS_LABEL[status]}</span>; }
export function ChangeFreshness({ record }: { record: RequestRecord }) { const value = freshness(record); return <span className={`pc-fresh pc-fresh--${value.key}`} title={value.reason}><ChangeIcon name={value.key === "fresh" ? "check" : "clock"} size={15} />{FRESHNESS_LABEL[value.key]}</span>; }
export function ChangeSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) { return <section className="pc-section"><header><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</header>{children}</section>; }
export function ChangeInfo({ children }: { children: ReactNode }) { return <p className="pc-info"><ChangeIcon name="info" /><span>{children}</span></p>; }
export function ChangeError({ children }: { children: ReactNode }) { return children ? <div className="pc-error" role="alert"><ChangeIcon name="warning" /><span>{children}</span></div> : null; }
export function readDataPath(data: RequestData, path: string): unknown { return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? Reflect.get(value, key) : undefined, data); }
/** 폼이 정의한 기존 속성만 바꾸며 외부 입력으로 프로토타입이나 새 경로를 추가하지 않는다. */
export function writeDataPath(data: RequestData, path: string, value: unknown): RequestData {
  const keys = path.split(".");
  if (keys.some(key => ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("허용하지 않는 입력 경로입니다.");
  const next = structuredClone(data);
  let current: object = next;
  for (const key of keys.slice(0, -1)) {
    const entry: unknown = Reflect.get(current, key);
    if (!entry || typeof entry !== "object") throw new Error("입력 경로를 찾지 못했습니다.");
    current = entry;
  }
  const key = keys.at(-1);
  if (!key || !Object.prototype.hasOwnProperty.call(current, key)) throw new Error("등록된 입력 항목이 아닙니다.");
  Reflect.set(current, key, value);
  return next;
}
export type ChangeEdit = (path: string, value: unknown) => void;
export type ChangeOptions = readonly { value: string; label: string }[];
export const labelOptions = (labels: Record<string, string>): ChangeOptions => Object.entries(labels).map(([value, label]) => ({ value, label }));
export function ChangeField({ label, path, data, onEdit, type = "text", options, disabled, placeholder, full = false }: {
  label: string; path: string; data: RequestData; onEdit: ChangeEdit; type?: "text" | "textarea" | "date" | "number"; options?: ChangeOptions; disabled?: boolean; placeholder?: string; full?: boolean;
}) {
  const id = useId();
  const raw = readDataPath(data, path);
  const value = typeof raw === "string" || typeof raw === "number" ? raw : "";
  return <label className={`pc-field${full || type === "textarea" ? " pc-full" : ""}`} htmlFor={id}><span>{label}</span>{options
    ? <select id={id} value={value} disabled={disabled} onChange={event => onEdit(path, event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    : type === "textarea" ? <textarea id={id} rows={3} value={value} disabled={disabled} placeholder={placeholder || "미확인 · 확인한 내용을 기록하세요"} onChange={event => onEdit(path, event.target.value)} />
      : <input id={id} type={type === "date" ? "datetime-local" : type} step={type === "date" ? 1 : undefined} min={type === "number" ? 1 : undefined} max={type === "number" ? 720 : undefined} value={type === "date" ? localDateTime(String(value)) : value} disabled={disabled} placeholder={placeholder || "미확인"} onChange={event => { const next = event.target.value; onEdit(path, type === "date" ? fromLocalDateTime(next) : type === "number" ? Number(next) : next); }} />}</label>;
}
export function safeCaptureUrl(value: string): boolean { try { const url = new URL(value, window.location.origin); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && (value.startsWith("http") || /^\/api\/admin\/production-changes\/captures\/[0-9a-f-]{36}$/iu.test(value)); } catch { return false; } }
export function ChangeCapture({ label, path, data, onEdit, onUpload, disabled, onBusy }: { label: string; path: string; data: RequestData; onEdit: ChangeEdit; onUpload: (file: File) => Promise<string | null>; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const raw = readDataPath(data, path); const value = typeof raw === "string" ? raw : "";
  useEffect(() => setFailed(false), [value]);
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true); onBusy(true);
    try { const url = await onUpload(file); if (url) onEdit(path, url); }
    finally { setUploading(false); onBusy(false); }
  }
  return <section className="pc-capture"><header><h4><ChangeIcon name="image" />{label}</h4><label className={`pc-button pc-button--small${disabled ? " pc-disabled" : ""}`}><ChangeIcon name="upload" size={15} />{uploading ? "업로드 중" : "캡처 올리기"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label></header>{value && safeCaptureUrl(value) ? <a className="pc-capture-image" href={value} target="_blank" rel="noopener noreferrer">{failed ? <span>이미지 미리보기를 불러오지 못했습니다. 원본 확인</span> : <img src={value} alt={`${label} 사용자 등록 캡처`} onError={() => setFailed(true)} />}<span>원본 보기 <ChangeIcon name="external" size={14} /></span></a> : <div className="pc-capture-empty"><ChangeIcon name="image" size={26} /><span>캡처 미등록</span><small>PNG · JPEG · WebP, 최대 5MiB</small></div>}<ChangeField label={`${label} 캡처 URL`} path={path} data={data} onEdit={onEdit} disabled={disabled} placeholder="이미지 URL 또는 업로드된 캡처" /><p className="pc-help">실제 확인 시각과 대상 Revision도 함께 기록하세요.</p></section>;
}
export function ChangeDialog({ title, description, onClose, children, className = "", active = true }: { title: string; description?: string; onClose: () => void; children: ReactNode; className?: string; active?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    if (!active) return;
    const dialog = ref.current; const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button:not(:disabled)")?.focus();
    }
    const bodyOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { if (dialog?.open && typeof dialog.close === "function") dialog.close(); document.body.style.overflow = bodyOverflow; prior?.focus(); };
  }, [active]);
  return <dialog ref={ref} hidden={!active} className={`pc-dialog ${className}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose(); }}><header className="pc-dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="pc-icon-button" aria-label="상세 닫기" onClick={onClose}><ChangeIcon name="close" size={22} /></button></header>{children}</dialog>;
}
export function saveDownload(filename: string, data: string, mime = "application/json") {
  const href = URL.createObjectURL(new Blob([data], { type: mime }));
  const anchor = document.createElement("a"); anchor.href = href; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function changeCsv(records: RequestRecord[]): string {
  const cell = (value: unknown) => { let text = String(value ?? ""); if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  return "\ufeff" + [["요청", "제목", "상태", "프로젝트", "에피소드", "에셋", "담당자", "기준 Revision", "결과 Revision", "최신 증빙 KST", "다음 조치"], ...records.map(record => [record.code, record.data.title, STATUS_LABEL[record.status], record.data.project, record.data.episode, record.data.assets, record.data.owner, record.data.baseRevision, record.data.application.resultRevision, dateLabel(freshness(record).latestAt), record.data.nextAction])].map(row => row.map(cell).join(",")).join("\r\n");
}

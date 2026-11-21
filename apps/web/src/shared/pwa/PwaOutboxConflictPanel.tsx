import { AlertTriangle, Check, CloudOff, GitMerge, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  getBrowserPwaOfflineOutbox,
  summarizeOutboxConflictDiff,
  type PwaOutboxConflictStrategy,
  type PwaOutboxItem,
} from "./pwa-offline-outbox";

import "./pwa-outbox-conflict.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-outbox-conflict", ko, en);

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return String(timestamp);
  }
}

function previewValue(value: unknown): string {
  if (value === undefined) return bi("없음", "None");
  if (value === null) return bi("비어 있음", "Empty");
  if (typeof value === "string") return value.length > 48 ? `${value.slice(0, 48)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return bi(`${value.length}개 항목`, `${value.length} items`);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 48 ? `${serialized.slice(0, 48)}…` : serialized;
  } catch {
    return bi("복합 데이터", "Structured data");
  }
}

function ConflictRow({
  item,
  onResolve,
}: {
  item: PwaOutboxItem;
  onResolve: (id: string, strategy: PwaOutboxConflictStrategy) => void;
}) {
  const conflict = item.conflict;
  const diff = useMemo(
    () => summarizeOutboxConflictDiff(item.payload, conflict?.remotePayload),
    [conflict?.remotePayload, item.payload],
  );
  const interestingFields = useMemo(
    () => diff.fields.filter((entry) => entry.status !== "same").slice(0, 4),
    [diff.fields],
  );

  return (
    <li className="pwa-conflict__row">
      <span className="pwa-conflict__icon" aria-hidden="true">
        <AlertTriangle size={18} />
      </span>
      <div className="pwa-conflict__body">
        <strong>{item.label}</strong>
        <span className="pwa-conflict__times">
          {bi("내 버전", "My version")}: {formatTime(conflict?.localUpdatedAt ?? item.updatedAt)}
          {conflict && (
            <>
              {" · "}
              {bi("원격 버전", "Remote version")}: {formatTime(conflict.remoteUpdatedAt)}
              {conflict.remoteLabel ? ` (${conflict.remoteLabel})` : ""}
            </>
          )}
        </span>

        {/* 차이 비교 요약 */}
        <div
          data-testid={`pwa-conflict-diff-${item.id}`}
          className="pwa-conflict__diff"
        >
          {diff.hasPayloadComparison ? (
            <>
              <div className="pwa-conflict__diff-badges">
                <span className="pwa-conflict__badge pwa-conflict__badge--local">
                  {bi(`내 버전만 ${diff.localOnlyCount}건`, `${diff.localOnlyCount} local only`)}
                </span>
                <span className="pwa-conflict__badge pwa-conflict__badge--remote">
                  {bi(`원격만 ${diff.remoteOnlyCount}건`, `${diff.remoteOnlyCount} remote only`)}
                </span>
                <span className="pwa-conflict__badge pwa-conflict__badge--both">
                  {bi(`동시 변경 ${diff.bothChangedCount}건`, `${diff.bothChangedCount} both edited`)}
                </span>
              </div>
              {interestingFields.length > 0 ? (
                <dl className="pwa-conflict__diff-list">
                  {interestingFields.map((field) => (
                    <div key={field.key} className="pwa-conflict__diff-item">
                      <dt>{field.key}</dt>
                      <dd>
                        {field.status === "local-only" ? (
                          <span>{bi("내 버전", "Mine")}: {previewValue(field.localValue)}</span>
                        ) : field.status === "remote-only" ? (
                          <span>{bi("원격", "Remote")}: {previewValue(field.remoteValue)}</span>
                        ) : (
                          <span>
                            {bi("내 버전", "Mine")}: {previewValue(field.localValue)}
                            {" / "}
                            {bi("원격", "Remote")}: {previewValue(field.remoteValue)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : (
            <p className="pwa-conflict__diff-note">
              {bi(
                "상세 필드 스냅샷이 없어 저장 시각 기준으로 비교합니다. 병합을 선택하면 내 작업 내용을 유지하면서 충돌 기록을 함께 보관합니다.",
                "Comparing by save timestamp. Merging keeps your local changes while preserving conflict metadata.",
              )}
            </p>
          )}
        </div>

        <div className="pwa-conflict__actions" role="group" aria-label={bi("충돌 해결 선택", "Conflict resolution choices")}>
          <button
            type="button"
            className="pwa-conflict__keep"
            onClick={() => onResolve(item.id, "mine")}
          >
            <Check size={15} aria-hidden="true" />
            {bi("내 버전 유지", "Keep my version")}
          </button>
          <button
            type="button"
            className="pwa-conflict__merge"
            onClick={() => onResolve(item.id, "merge")}
          >
            <GitMerge size={15} aria-hidden="true" />
            {bi("병합해서 저장", "Merge and save")}
          </button>
          <button
            type="button"
            className="pwa-conflict__theirs"
            onClick={() => onResolve(item.id, "theirs")}
          >
            <CloudOff size={15} aria-hidden="true" />
            {bi("원격 버전 사용", "Use remote version")}
          </button>
        </div>
      </div>
    </li>
  );
}

export interface PwaOutboxConflictPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * 오프라인 아웃박스 3지선다 충돌 해결 패널.
 * 온라인 복귀 후 원격과 버전이 엇갈린 항목을 내 버전·원격 버전·병합 중 선택해 해결한다.
 */
export function PwaOutboxConflictPanel({ open, onClose }: PwaOutboxConflictPanelProps) {
  useBilingualI18nRevision();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [conflicts, setConflicts] = useState<readonly PwaOutboxItem[]>([]);
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setConflicts(
      getBrowserPwaOfflineOutbox()
        .list()
        .filter((item) => item.status === "conflicted"),
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    setResolvedNotice(null);
    refresh();
    const unsubscribe = getBrowserPwaOfflineOutbox().subscribe(refresh);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      unsubscribe();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, refresh]);

  const handleResolve = useCallback(
    (id: string, strategy: PwaOutboxConflictStrategy) => {
      getBrowserPwaOfflineOutbox().resolveConflict(id, strategy);
      setResolvedNotice(
        strategy === "merge"
          ? bi("충돌하지 않는 항목을 안전하게 병합해 저장 대기열에 올렸어요.", "Merged non-conflicting fields and queued for sync.")
          : strategy === "mine"
            ? bi("내 버전을 유지해 다시 동기화 대기열에 올렸어요.", "Kept your version and queued it for sync.")
            : bi("원격 버전을 기준으로 정리했어요.", "Adopted the remote version."),
      );
      refresh();
    },
    [refresh],
  );

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 오버레이 클릭 닫기. 키보드 닫기는 Escape 리스너로 제공.
    <div className="pwa-conflict__overlay" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 다이얼로그 내부 클릭 전파 차단용. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pwa-conflict__dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="pwa-conflict__ribbon" aria-hidden="true" />
        <button
          type="button"
          className="pwa-conflict__close"
          onClick={onClose}
          aria-label={bi("닫기", "Close")}
          data-autofocus
        >
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pwa-conflict__title">
          {bi("동기화 충돌 확인", "Review sync conflicts")}
        </h2>
        <p className="pwa-conflict__description">
          {bi(
            "오프라인에서 작업하는 동안 원격에서도 같은 항목이 바뀌었어요. 차이를 비교한 뒤 내 버전 유지, 원격 버전 사용, 병합해서 저장 중 선택해 주세요.",
            "While you were offline, the same items changed remotely. Review the differences and keep your version, use remote, or merge both.",
          )}
        </p>
        {resolvedNotice ? (
          <p role="status" className="pwa-conflict__notice">
            {resolvedNotice}
          </p>
        ) : null}
        {conflicts.length === 0 ? (
          <p className="pwa-conflict__empty">
            {bi("확인할 충돌이 없어요. 모두 해결됐습니다.", "No conflicts to review — all resolved.")}
          </p>
        ) : (
          <ul className="pwa-conflict__list">
            {conflicts.map((item) => (
              <ConflictRow key={item.id} item={item} onResolve={handleResolve} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

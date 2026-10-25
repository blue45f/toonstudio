import { useCallback, useEffect, useState } from "react";

import { adminFetch, type AdminApiError } from "./admin-client";
import { adminButtonClass } from "./admin-ui-utils";
import { AdminCard, AdminSpinner } from "./admin-ui";
import "./paid-operations-i18n";

import { useT } from "@/shared/lib/i18n";

interface PaidOperationsState {
  paidOperationsEnabled: boolean;
}

/**
 * 유료 운영 마스터 스위치(어드민 전용).
 *
 * 토글은 초안 저장 방식이 아니라 즉시 서버에 반영된다: 클릭 즉시
 * POST /admin/membership/paid-operations 로 새 값을 보내고, 실효 게이트는
 * 호출마다 현재 설정값을 읽으므로(캐시 없음) 다음 유료 호출부터 바로
 * 적용된다. OFF가 기본값이며, OFF면 유료 호출이 거부되고 무료 기능은
 * 스위치와 무관하게 동작한다.
 */
export function AdminPaidOperationsToggle({ uid }: { uid: string }) {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await adminFetch<PaidOperationsState>(
        "/membership/paid-operations",
        uid,
      );
      setEnabled(next.paidOperationsEnabled === true);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (enabled === null || busy) return;
    const next = !enabled;
    setBusy(true);
    setError("");
    try {
      const saved = await adminFetch<PaidOperationsState>(
        "/membership/paid-operations",
        uid,
        { method: "POST", body: JSON.stringify({ enabled: next }) },
      );
      // 서버가 반환한 실효값을 그대로 표시한다 — 낙관적 표시가 아니다.
      setEnabled(saved.paidOperationsEnabled === true);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard className="border-accent/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            PAID OPERATIONS GATE
          </p>
          <h2 className="mt-1 text-xl font-bold text-fg">
            {t("admin.paidOperations.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-3">
            {t("admin.paidOperations.desc")}
          </p>
        </div>
        <span
          className={
            "rounded-full border px-3 py-1 text-xs font-bold "
            + (enabled
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-good/40 bg-good/10 text-good")
          }
        >
          {enabled
            ? t("admin.paidOperations.enabled")
            : t("admin.paidOperations.disabled")}
        </span>
      </div>

      {enabled === null ? (
        error ? (
          <div className="mt-5" role="alert">
            <p className="text-sm text-bad">
              {t("admin.paidOperations.loadFailed")}
            </p>
            <button
              type="button"
              className={`${adminButtonClass("ghost")} mt-3`}
              onClick={() => void load()}
            >
              {t("admin.paidOperations.retry")}
            </button>
          </div>
        ) : (
          <AdminSpinner />
        )
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={
              enabled
                ? t("admin.paidOperations.toggleOff")
                : t("admin.paidOperations.toggleOn")
            }
            disabled={busy}
            onClick={() => void toggle()}
            className={
              "min-h-10 rounded-full border px-4 text-sm font-bold "
              + (enabled
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2")
            }
          >
            {busy
              ? t("admin.paidOperations.saving")
              : enabled
                ? t("admin.paidOperations.toggleOff")
                : t("admin.paidOperations.toggleOn")}
          </button>
          <p className="text-[11px] leading-4 text-fg-3">
            {t("admin.paidOperations.freeNote")}
          </p>
        </div>
      )}
      {enabled !== null && error ? (
        <p role="alert" className="mt-3 text-xs text-bad">
          {t("admin.paidOperations.saveFailed")}
        </p>
      ) : null}
    </AdminCard>
  );
}

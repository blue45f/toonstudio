import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { MarketplaceCommerceQuote } from "@toonstudio/core/commerce";

import { getMarketplaceCommerceQuote } from "../commerce-api";
import { MarketPointPurchaseOption } from "./MarketPointPurchaseOption";
import { useMarketLibrary } from "../hooks/use-market-library";
import {
  resolveCurrentMarketAcquisitionRecord,
} from "../models/market-acquisition-target";
import type {
  ResolvedMarketAcquisitionRecord,
} from "../models/market-acquisition-target";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { MarketStudioHandoff } from "../models/market-studio-handoff";
import { pointPriceForKrw, useAssetPointsStore } from "@/domains/account/public/asset-points";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";

interface MarketAcquisitionModalProps {
  open: boolean;
  onClose: () => void;
  record: CreatorMarketplaceResourceRecord;
  studioHandoff: MarketStudioHandoff;
  onAcquiredSuccess?: () => void;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError"
  );
}

export function MarketAcquisitionModal({
  open,
  onClose,
  record,
  studioHandoff,
  onAcquiredSuccess,
}: MarketAcquisitionModalProps) {
  const navigate = useNavigate();
  const { acquireResource } = useMarketLibrary();
  const acquisitionAbortRef = useRef<AbortController | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionNotice, setVersionNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<MarketplaceCommerceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [acquisition, setAcquisition] =
    useState<ResolvedMarketAcquisitionRecord | null>(null);

  useEffect(() => {
    acquisitionAbortRef.current?.abort();
    acquisitionAbortRef.current = null;
    setAgreed(false);
    setSubmitting(false);
    setError(null);
    setVersionNotice(null);
    setQuote(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setAcquisition(null);

    return () => {
      acquisitionAbortRef.current?.abort();
      acquisitionAbortRef.current = null;
    };
  }, [open, record.id]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const resourceId = acquisition?.record.id ?? record.id;
    setQuoteLoading(true);
    setQuoteError(null);
    void getMarketplaceCommerceQuote(resourceId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setQuote(next);
        setQuoteError(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setQuote(null);
        setQuoteError("가격과 결제 정책을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 열어 주세요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [acquisition?.record.id, open, record.id]);

  if (!open) return null;

  const activeRecord = acquisition?.record ?? record;
  const kind = marketKindMeta(activeRecord.kind);
  const license = marketLicenseMeta(activeRecord.license);
  const closeModal = () => {
    acquisitionAbortRef.current?.abort();
    acquisitionAbortRef.current = null;
    onClose();
  };

  const handleAcquire = async () => {
    if (!agreed || submitting) return;

    acquisitionAbortRef.current?.abort();
    const controller = new AbortController();
    acquisitionAbortRef.current = controller;
    setSubmitting(true);
    setError(null);

    try {
      const resolved = await resolveCurrentMarketAcquisitionRecord(activeRecord, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
      ) return;

      const retainedResolution = acquisition?.redirectedToCurrentHead
        ? {
            ...resolved,
            requestedReleaseId: acquisition.requestedReleaseId,
            redirectedToCurrentHead: true,
          }
        : resolved;

      if (resolved.redirectedToCurrentHead) {
        setAcquisition(retainedResolution);
        setAgreed(false);
        setVersionNotice(
          `현재 공개 버전 v${resolved.record.resourceVersion}으로 설치 대상이 변경되었습니다. 최신 라이선스와 출처 조건을 확인한 뒤 다시 동의해 주세요.`,
        );
        return;
      }

      const currentQuote = await getMarketplaceCommerceQuote(
        resolved.record.id,
        controller.signal,
      );
      setQuote(currentQuote);
      setQuoteError(null);
      if (currentQuote.checkoutRequired) {
        if (!currentQuote.checkoutEnabled) {
          setError("현재 유료 운영 중이지만 결제 공급자 설정이 아직 준비되지 않았습니다.");
          return;
        }
        acquisitionAbortRef.current = null;
        onClose();
        navigate("/market/checkout/" + encodeURIComponent(resolved.record.id));
        return;
      }

      const acquired = await acquireResource(
        resolved.record,
        resolved.target.logicalPackId,
      );
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
      ) return;
      if (!acquired) {
        setError(
          "내 에셋에 추가하지 못했습니다. 아직 계정에 보관되지 않았습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      setAcquisition(retainedResolution);
      setVersionNotice(null);
      onAcquiredSuccess?.();
      continueToStudio(resolved.record);
    } catch (caught) {
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
        || isAbortError(caught)
      ) return;
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "내 에셋에 추가하지 못했습니다. 현재 에셋은 계정에 보관되지 않았습니다.");
    } finally {
      if (acquisitionAbortRef.current === controller) {
        acquisitionAbortRef.current = null;
        setSubmitting(false);
      }
    }
  };

  /**
   * 포인트 구매 사가: 최신 릴리스·가격 재확인 → 포인트 차감 → 서버 보관 확정.
   * 보관 확정이 실패하면 차감을 환불 이벤트로 되돌린다(성공으로 포장하지 않는다).
   */
  const handlePointPurchase = async () => {
    if (!agreed || submitting) return;

    acquisitionAbortRef.current?.abort();
    const controller = new AbortController();
    acquisitionAbortRef.current = controller;
    setSubmitting(true);
    setError(null);

    let spendEventId: string | null = null;
    try {
      const resolved = await resolveCurrentMarketAcquisitionRecord(activeRecord, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
      ) return;

      const retainedResolution = acquisition?.redirectedToCurrentHead
        ? {
            ...resolved,
            requestedReleaseId: acquisition.requestedReleaseId,
            redirectedToCurrentHead: true,
          }
        : resolved;

      if (resolved.redirectedToCurrentHead) {
        setAcquisition(retainedResolution);
        setAgreed(false);
        setVersionNotice(
          `현재 공개 버전 v${resolved.record.resourceVersion}으로 설치 대상이 변경되었습니다. 최신 라이선스와 출처 조건을 확인한 뒤 다시 동의해 주세요.`,
        );
        return;
      }

      const currentQuote = await getMarketplaceCommerceQuote(
        resolved.record.id,
        controller.signal,
      );
      setQuote(currentQuote);
      setQuoteError(null);
      if (!currentQuote.checkoutRequired) {
        setError("가격 정책이 바뀌어 포인트로 살 수 없게 됐습니다. 일반 구매 버튼으로 다시 시도해 주세요.");
        return;
      }

      const spend = useAssetPointsStore.getState().spendForResource({
        resourceId: resolved.record.id,
        resourceName: resolved.record.name,
        pointPrice: pointPriceForKrw(currentQuote.amount),
      });
      if (!spend.ok) {
        setError(
          spend.reason === "already-owned"
            ? "이미 포인트로 구매한 에셋입니다. 내 에셋에서 확인해 주세요."
            : "포인트 잔액이 부족합니다. 지갑에서 적립 방법을 확인해 주세요.",
        );
        return;
      }
      spendEventId = spend.eventId;

      const acquired = await acquireResource(
        resolved.record,
        resolved.target.logicalPackId,
      );
      if (!acquired) {
        useAssetPointsStore.getState().refundSpend(spendEventId);
        setError(
          "내 에셋에 추가하지 못해 차감한 포인트를 되돌렸습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      setAcquisition(retainedResolution);
      setVersionNotice(null);
      onAcquiredSuccess?.();
      continueToStudio(resolved.record);
    } catch (caught) {
      if (spendEventId) {
        useAssetPointsStore.getState().refundSpend(spendEventId);
      }
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
        || isAbortError(caught)
      ) return;
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "포인트 구매를 마치지 못했습니다. 차감한 포인트는 되돌렸습니다.");
    } finally {
      if (acquisitionAbortRef.current === controller) {
        acquisitionAbortRef.current = null;
        setSubmitting(false);
      }
    }
  };

  /**
   * 획득→적용 원자화(MKT-05): 보관이 성공하면 별도 클릭 없이 곧바로 Studio로 이어진다.
   * Studio 딥링크가 그 정확한 릴리스를 다운로드·검증·설치/삽입까지 자동으로 수행하므로
   * 사용자는 에디터에서 바로 쓸 수 있다. 보관만 원하는 경로는 상세 화면의
   * 계정 라이브러리 액션이 따로 제공한다.
   * 핸드오프가 만들어진 레코드와 획득한 레코드가 같으면 캠퍼스 문서 대상이 담긴
   * studioHandoff.href를 그대로 써서 작업 중이던 프로젝트에 장착하고,
   * 현재 공개 버전으로 바뀐 경우에만 그 릴리스 기준으로 href를 다시 만든다.
   */
  const continueToStudio = (acquiredRecord: CreatorMarketplaceResourceRecord) => {
    acquisitionAbortRef.current = null;
    onClose();
    navigate(
      acquiredRecord.id === record.id
        ? studioHandoff.href
        : marketStudioResourceHref(acquiredRecord.id),
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-acquire-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card shadow-2xl animate-hud-in duration-200">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="market-acquire-title" className="flex items-center gap-2 text-base font-bold text-fg">
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            <span>내 에셋에 추가</span>
          </h2>
          <button
            type="button"
            onClick={closeModal}
            aria-label="닫기"
            className="rounded-lg p-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-raised font-bold text-accent">
              <kind.icon className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded bg-accent/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-accent">
                {kind.label}
              </span>
              <h3 className="truncate text-sm font-bold leading-snug text-fg">{activeRecord.name}</h3>
              <p className="text-[0.68rem] text-fg-3">
                제작자: {activeRecord.publisher.name} · 설치 대상 v{activeRecord.resourceVersion}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl border border-line bg-panel/60 p-3 text-[0.7rem] leading-relaxed text-fg-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[0.62rem] font-bold text-on-accent">1</span>
            <span>서버에서 같은 패키지의 현재 공개 릴리스와 제작자·종류·안정 식별자를 확인합니다.</span>
            <span className="flex size-5 items-center justify-center rounded-full bg-raised text-[0.62rem] font-bold text-fg">2</span>
            <span>현재 릴리스를 내 계정에 보관하면 곧바로 Studio로 이동해 그 정확한 버전을 설치·적용합니다. 별도의 설치 단계는 없습니다.</span>
          </div>

          <div className="space-y-2 rounded-xl border border-good/40 bg-good/10 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-fg">이용 비용</span>
              <span className={quoteError && !quote && !quoteLoading ? "text-sm font-extrabold text-bad" : "text-sm font-extrabold text-good"}>
                {quoteLoading
                  ? "확인 중…"
                  : quote?.checkoutRequired
                    ? new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(quote.amount)
                    : quoteError
                      ? "확인 불가"
                      : "무료"}
              </span>
            </div>
            <p className="text-[0.68rem] leading-relaxed text-fg-3">
              {quote?.policyNotice ?? "운영 정책과 사용권 조건을 함께 확인해 주세요. 상업 이용·수정·출처 표기 범위는 리소스별 라이선스를 따릅니다."}
            </p>
            <div className="border-t border-good/20 pt-2 text-xs text-fg-2">
              <p className="flex items-center gap-1.5 font-semibold text-good">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>{license.label}</span>
              </p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
              {activeRecord.attributionText ? (
                <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                  출처 표기: {activeRecord.attributionText}
                </p>
              ) : null}
            </div>
          </div>

          {quote?.checkoutRequired && !quoteLoading ? (
            <MarketPointPurchaseOption
              resourceId={activeRecord.id}
              resourceName={activeRecord.name}
              krwAmount={quote.amount}
              agreed={agreed}
              submitting={submitting}
              onPurchase={() => void handlePointPurchase()}
            />
          ) : null}

          {quoteError && !quoteLoading ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs leading-relaxed text-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{quoteError}</span>
            </div>
          ) : null}

          {versionNotice ? (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs leading-relaxed text-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{versionNotice}</span>
            </div>
          ) : null}

          <label className="flex cursor-pointer select-none items-start gap-2 rounded-xl border border-line/70 bg-panel/45 p-3 text-xs text-fg-2 transition-colors hover:border-line-strong">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 rounded border-line text-accent focus:ring-accent"
            />
            <span className="text-[0.72rem] leading-relaxed">
              표시된 라이선스와 출처 조건을 확인했습니다. 이 에셋을 내 계정에 보관하고, 받는 즉시 Studio에 설치·적용하겠습니다.
            </span>
          </label>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs leading-relaxed text-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={closeModal}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleAcquire()}
              disabled={
                !agreed
                || submitting
                || quoteLoading
                || Boolean(quote?.checkoutRequired && !quote.checkoutEnabled)
              }
              aria-busy={submitting || undefined}
              title={!agreed ? "라이선스와 출처 조건을 확인하면 추가할 수 있습니다." : undefined}
              className={buttonClass({
                variant: "solid",
                size: "md",
                className: "min-w-36 gap-2 disabled:opacity-40",
              })}
            >
              <Download className="size-4" aria-hidden="true" />
              <span>{submitting
                ? "현재 버전 확인 중…"
                : versionNotice
                  ? `현재 v${activeRecord.resourceVersion} 조건 확인 후 추가`
                  : quote?.checkoutRequired
                    ? "결제하고 내 에셋에 추가"
                    : quoteError && !quote
                      ? "가격 확인하고 추가"
                      : "내 에셋에 추가"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

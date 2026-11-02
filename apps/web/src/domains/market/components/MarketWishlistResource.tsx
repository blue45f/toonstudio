import { FolderHeart, HeartOff, LoaderCircle, MessageSquareText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";

import { MarketResourceCard } from "./MarketResourceCard";

import type { MarketWishlistCollection } from "../hooks/use-market-collections";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface MarketWishlistResourceProps {
  readonly resourceId: string;
  readonly onRemove: (id: string) => void;
  readonly onResolved?: (
    resourceId: string,
    record: CreatorMarketplaceResourceRecord | null,
  ) => void;
  readonly collections?: readonly MarketWishlistCollection[];
  readonly onToggleInCollection?: (collectionId: string, resourceId: string) => void;
  readonly memo?: string;
  readonly onSaveMemo?: (resourceId: string, memo: string) => void;
}

/** 찜한 ID를 실제 서버 상세로 확인한다. 로컬 초안을 공개 소재로 대체하지 않는다. */
export function MarketWishlistResource({
  resourceId,
  onRemove,
  onResolved,
  collections = [],
  onToggleInCollection,
  memo = "",
  onSaveMemo,
}: MarketWishlistResourceProps) {
  const { record, loading, notFound, staleSavedAt, reload } =
    useMarketResourceDetail(resourceId);
  const bt = useBilingual("MarketWishlistResource");
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState(memo);

  useEffect(() => {
    setMemoDraft(memo);
  }, [memo]);

  useEffect(() => {
    onResolved?.(resourceId, record ?? null);
  }, [onResolved, record, resourceId]);

  if (loading) {
    return (
      <div
        role="status"
        className="min-h-56 rounded-xl border border-line bg-card p-5 text-sm text-fg-2"
      >
        <LoaderCircle
          className="mr-2 inline size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {bt("찜한 소재 정보를 확인하는 중", "Checking saved material")}
      </div>
    );
  }

  if (record) {
    return (
      <div className="flex flex-col gap-2">
        {staleSavedAt ? (
          <div
            role="status"
            className="rounded-xl border border-warn/40 bg-panel p-3 text-xs leading-6 text-fg"
          >
            {bt(
              "마지막으로 확인한 사본입니다. 현재 공개 상태는 확인되지 않았어요.",
              "This is a previously verified copy. Current availability is unconfirmed.",
            )}
            <button
              type="button"
              onClick={reload}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "mt-2 min-h-11",
              })}
            >
              {bt("다시 확인", "Check again")}
            </button>
          </div>
        ) : null}

        <MarketResourceCard record={record} />

        {collections.length > 0 || onSaveMemo ? (
          <div className="space-y-2 rounded-xl border border-line bg-panel/70 p-2.5 text-xs">
            {collections.length > 0 && onToggleInCollection ? (
              <div className="flex flex-wrap items-center gap-1">
                <FolderHeart className="size-3.5 text-accent" aria-hidden="true" />
                {collections.map((collection) => {
                  const assigned = collection.resourceIds.includes(resourceId);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      aria-pressed={assigned}
                      onClick={() => onToggleInCollection(collection.id, resourceId)}
                      className={cn(
                        "min-h-6 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        assigned
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-3 hover:text-fg",
                      )}
                    >
                      {assigned ? `✓ ${collection.name}` : `+ ${collection.name}`}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {onSaveMemo ? (
              editingMemo ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSaveMemo(resourceId, memoDraft);
                    setEditingMemo(false);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={memoDraft}
                    onChange={(event) => setMemoDraft(event.target.value)}
                    maxLength={240}
                    aria-label={bt(`${record.name} 제작 메모`, `Production note for ${record.name}`)}
                    placeholder={bt("예: 3화 18컷 주인공 방 창가 앵글용", "e.g. Ep.3 Cut 18 bedroom window angle")}
                    className="h-8 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className={buttonClass({ variant: "solid", size: "sm", className: "min-h-8" })}
                  >
                    {bt("메모 저장", "Save")}
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-fg-2">
                    {memo ? (
                      <>
                        <strong className="text-fg">{bt("제작 메모:", "Note:")}</strong> {memo}
                      </>
                    ) : (
                      <span className="text-fg-3">
                        {bt("컷 번호·조명·용도 메모 없음", "No cut/scene production note")}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingMemo(true)}
                    className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-accent hover:bg-raised"
                  >
                    <MessageSquareText className="size-3" aria-hidden="true" />
                    {memo ? bt("메모 수정", "Edit note") : bt("제작 메모 추가", "Add note")}
                  </button>
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-56 rounded-xl border border-line bg-card p-5">
      <h2 className="text-sm font-bold text-fg">
        {notFound
          ? bt("현재 공개되지 않은 소재입니다", "This material is not currently listed")
          : bt("찜한 소재를 불러오지 못했어요", "Could not load this saved material")}
      </h2>
      <p className="mt-2 text-xs leading-6 text-fg-2">
        {bt(
          "찜한 항목은 그대로 유지됩니다. 다시 확인하거나 이 브라우저의 찜 목록에서 제거할 수 있습니다.",
          "Your bookmark has been kept. Retry or remove it from this browser's wishlist.",
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reload}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {bt("다시 확인", "Check again")}
        </button>
        <button
          type="button"
          onClick={() => onRemove(resourceId)}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
        >
          <HeartOff className="size-4" aria-hidden="true" />
          {bt("찜 목록에서 제거", "Remove bookmark")}
        </button>
      </div>
    </div>
  );
}

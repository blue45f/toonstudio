import { Eye, LockKeyhole, PenLine } from "lucide-react";

import type { PageEditLock } from "./page-edit-lock-model";
import { ProductionAvatar, ProductionPill } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface ProductionPagePresenceProps {
  readonly lock: PageEditLock;
  /** 로그인 사용자와 연결된 참여 배정 ID. 없으면 잠금 잡기 버튼을 보여 주지 않는다. */
  readonly selfActorId: string | null;
  /** 편집 권한이 있는 사람만 잠금을 잡을 수 있다. */
  readonly canAcquire: boolean;
  readonly onAcquire: () => void;
  readonly onRelease: () => void;
}

/**
 * 페이지 프레즌스 바: 누가 이 페이지를 열고 있는지(아바타·이름·편집/열람 상태)와
 * 페이지 편집 잠금을 한 줄로 보여 준다. 다른 사람이 편집 중이면 그 사실과
 * "보는 것만 가능"을 먼저 알리고, 잠금이 비어 있으면 편집 시작 버튼을 낸다.
 */
export function ProductionPagePresence({
  lock,
  selfActorId,
  canAcquire,
  onAcquire,
  onRelease,
}: ProductionPagePresenceProps) {
  const bt = useBilingual("ProductionPagePresence");
  const holder = lock.holder;
  const selfIsHolder = Boolean(holder && selfActorId && holder.actorId === selfActorId);
  const lockedByOther = Boolean(holder && !selfIsHolder);

  const statusText = selfIsHolder
    ? bt("내가 이 페이지를 편집 중입니다. 다른 사람은 보는 것만 할 수 있어요.", "You are editing this page. Everyone else can only view it.")
    : holder
      ? bt(`${holder.displayName}님이 이 페이지를 편집 중입니다. 충돌을 막기 위해 지금은 보는 것만 할 수 있어요.`, `${holder.displayName} is editing this page. To prevent conflicts, you can only view it for now.`)
      : bt("지금은 아무도 이 페이지를 편집하지 않습니다.", "Nobody is editing this page right now.");

  return (
    <div
      data-page-presence="true"
      data-page-lock={selfIsHolder ? "mine" : lockedByOther ? "other" : "free"}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5",
        lockedByOther ? "border-warn/35 bg-warn/10" : "border-line bg-panel",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {holder
          ? <LockKeyhole className="size-4 shrink-0 text-warn" aria-hidden="true" />
          : <Eye className="size-4 shrink-0 text-fg-3" aria-hidden="true" />}
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg" role="status">
          {statusText}
        </p>
      </div>

      {lock.present.length ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={bt("이 페이지를 열고 있는 사람", "People on this page")}>
          {lock.present.map((entry) => {
            const isHolder = holder?.actorId === entry.actorId;
            const isSelf = selfActorId !== null && entry.actorId === selfActorId;
            return (
              <li key={entry.actorId}>
                <span
                  className={cn(
                    "inline-flex min-h-7 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[0.6875rem] font-semibold",
                    isHolder ? "border-warn/40 bg-card text-fg" : "border-line bg-card text-fg-2",
                  )}
                  title={isHolder
                    ? bt(`${entry.displayName} · 편집 중`, `${entry.displayName} · editing`)
                    : bt(`${entry.displayName} · 보는 중`, `${entry.displayName} · viewing`)}
                >
                  <ProductionAvatar name={entry.displayName} size="sm" />
                  <span className="max-w-28 truncate">
                    {entry.displayName}
                    {isSelf ? bt(" (나)", " (you)") : ""}
                  </span>
                  {isHolder
                    ? (
                      <span className="inline-flex items-center gap-0.5 text-warn">
                        <PenLine className="size-3" aria-hidden="true" />
                        {bt("편집 중", "Editing")}
                      </span>
                    )
                    : (
                      <span className="inline-flex items-center gap-0.5 text-fg-3">
                        <Eye className="size-3" aria-hidden="true" />
                        {bt("보는 중", "Viewing")}
                      </span>
                    )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="ml-auto">
        {selfIsHolder ? (
          <button type="button" onClick={onRelease} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
            <LockKeyhole className="size-4" aria-hidden="true" />
            {bt("편집 마치기", "Finish editing")}
          </button>
        ) : lockedByOther ? (
          <ProductionPill tone="warning">
            <LockKeyhole className="size-3" aria-hidden="true" />
            {bt("편집 잠김", "Editing locked")}
          </ProductionPill>
        ) : selfActorId && canAcquire ? (
          <button type="button" onClick={onAcquire} className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}>
            <PenLine className="size-4" aria-hidden="true" />
            {bt("이 페이지 편집 시작", "Start editing this page")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

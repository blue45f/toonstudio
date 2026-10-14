/**
 * 병합 표면(드로잉 캔버스) 프레즌스 바 — 강등된 잠금의 표시 자리.
 *
 * 가드 표면의 ProductionPagePresence와 역할이 다르다:
 * - 잠금 잡기/해제 버튼이 없다 (resolveSurfaceLockPolicy.showPageLockControls=false).
 * - "편집 잠김·보는 것만 가능" 같은 차단 문구가 없다. 전원이 동시에 그릴 수
 *   있다는 안내 + 누가 이 페이지·어느 레이어를 작업 중인지가 전부다.
 * - 레이어 점유 표시는 (b)의 StudioLayerOccupancyBadge를 그대로 재사용해
 *   레이어 패널 행 배지와 같은 모양·문구로 맞춘다.
 *
 * 이 컴포넌트는 병합 표면 전용이다. policy.mode가 "guarded"면 아무것도
 * 그리지 않으므로, 호스트가 표면을 잘못 연결해도 가드 표면의 잠금 UI를
 * 이 바가 대체하는 일은 없다(가드 표면은 기존 ProductionPagePresence 유지).
 */

import { Eye, PenLine, Users } from "lucide-react";

import { StudioLayerOccupancyBadge } from "../layer/StudioLayerOccupancy";

import type { SurfacePresenceSummary } from "./engine-surface-lock-policy";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface EngineSurfacePresenceBarProps {
  readonly summary: SurfacePresenceSummary;
  /** 로그인 사용자와 연결된 참여 배정 ID. */
  readonly selfActorId: string | null;
  /** layerId → 사람이 읽는 레이어 이름. 없으면 레이어 ID를 말하지 않고 배지만 단다. */
  readonly layerNames?: Readonly<Record<string, string>>;
  readonly className?: string;
}

export function EngineSurfacePresenceBar({
  summary,
  selfActorId,
  layerNames,
  className,
}: EngineSurfacePresenceBarProps) {
  const bt = useBilingual("EngineSurfacePresenceBar");
  if (summary.policy.mode !== "merge") return null;

  const present = summary.pageLock.present;
  const othersEditing = present.filter(
    (entry) => entry.mode === "editing" && entry.actorId !== selfActorId,
  );
  const statusText =
    othersEditing.length > 0
      ? bt(
          `${othersEditing.map((entry) => entry.displayName).join(", ")}님과 함께 그리는 중입니다. 동시에 그려도 작업이 합쳐져요.`,
          `Drawing together with ${othersEditing.map((entry) => entry.displayName).join(", ")}. You can draw at the same time — work is merged.`,
        )
      : bt(
          "함께 그릴 수 있는 페이지입니다. 다른 사람이 들어와도 동시에 그릴 수 있어요.",
          "This page supports drawing together. Others can join and draw at the same time.",
        );

  return (
    <div
      data-engine-surface-presence="true"
      data-surface-lock-mode="merge"
      className={cn("flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5", className)}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Users className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg" role="status">
          {statusText}
        </p>
      </div>

      {present.length ? (
        <ul
          className="flex flex-wrap items-center gap-1.5"
          aria-label={bt("이 페이지를 열고 있는 사람", "People on this page")}
        >
          {present.map((entry) => {
            const isSelf = selfActorId !== null && entry.actorId === selfActorId;
            const editing = entry.mode === "editing";
            return (
              <li key={entry.actorId}>
                <span
                  className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2"
                  title={
                    editing
                      ? bt(`${entry.displayName} · 그리는 중`, `${entry.displayName} · drawing`)
                      : bt(`${entry.displayName} · 보는 중`, `${entry.displayName} · viewing`)
                  }
                >
                  <span className="max-w-28 truncate">
                    {entry.displayName}
                    {isSelf ? bt(" (나)", " (you)") : ""}
                  </span>
                  {editing ? (
                    <span className="inline-flex items-center gap-0.5 text-fg-2">
                      <PenLine className="size-3" aria-hidden="true" />
                      {bt("그리는 중", "Drawing")}
                    </span>
                  ) : (
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

      {summary.layers.length ? (
        <ul
          className="flex flex-wrap items-center gap-1.5"
          aria-label={bt("레이어를 작업 중인 사람", "People working on layers")}
        >
          {summary.layers.map((layer) => (
            <li key={layer.layerId} className="inline-flex items-center gap-1.5">
              {layerNames?.[layer.layerId] ? (
                <span className="text-[0.6875rem] font-medium text-fg-3">{layerNames[layer.layerId]}</span>
              ) : null}
              <StudioLayerOccupancyBadge holder={layer.holder} selfActorId={selfActorId} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

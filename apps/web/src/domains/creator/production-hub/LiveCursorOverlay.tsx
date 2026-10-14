import { Crosshair, EyeOff, LockKeyhole, MousePointer2, Pause, Play } from "lucide-react";

import {
  deriveLiveViewFocus,
  liveCursorColor,
  type LiveViewState,
} from "./live-view-sync-model";
import type { FollowState } from "./observe-follow-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface LiveCursorOverlayProps {
  /** null이면 아직 첫 동기화 전(로딩). 빈 배열이면 함께 보는 사람이 없다. */
  readonly views: readonly LiveViewState[] | null;
  readonly selfActorId: string | null;
  /** 페이지 편집 잠금을 잡은 사람. 커서에 잠금 배지를 붙여 "지금 이 사람이 고치는 중"을 구분한다. */
  readonly lockHolderActorId: string | null;
  /** 관찰(팔로우) 세션의 대상. 없으면 팔로우 중이 아니다. */
  readonly followTargetId: string | null;
  /** 관찰 세션 상태. off면 대상이 있어도 팔로우 중이 아니다. */
  readonly followState: FollowState;
  /** 사람별 팔로우 시작 가능 여부 (observe-follow-model의 deriveObserveEligibility 결과). */
  readonly observeAllowedByActorId: Readonly<Record<string, boolean>>;
  /** 내가 "따라오기 차단"을 켰는가 — 다른 사람이 내 화면을 따라올 수 없게 하는 대상 측 스위치. */
  readonly selfObserveBlocked: boolean;
  readonly onFollowStart: (actorId: string) => void;
  readonly onFollowStop: () => void;
  readonly onFollowResume: () => void;
  readonly onToggleSelfObserveBlocked: () => void;
  /** 전송 상태. 끊겼으면 마지막 위치를 흐리게 유지하고 그 사실을 알린다. */
  readonly syncState: "live" | "offline";
  /** 커서를 그릴 페이지. 다른 페이지를 보는 사람의 커서는 그리지 않는다. */
  readonly pageId: string;
  readonly now: Date;
}

/**
 * 라이브 커서 오버레이 + 관찰(팔로우) 컨트롤.
 *
 * - 커서는 페이지 정규화 좌표로 얹는다. 위치 전이에 짧은 선형 트랜지션을 걸어
 *   띄엄띄엄 오는 갱신이 부드럽게 이어지게 한다(모델의 보간과 같은 목적).
 * - 관찰 컨트롤은 오버레이 오른쪽 위 칩에 둔다. 상태 기계(observe-follow-model)를
 *   그대로 드러낸다: following(따라가는 중 — 눌러서 해제) / paused-manual(내가 직접
 *   조작해 일시정지 — 눌러서 다시 따라가기, 옆 버튼으로 완전 해제) / blocked(대상이
 *   차단 — 누를 수 없고 사유를 말한다). 직접 스크롤·조작하면 호스트가 일시정지로
 *   전이시키며, 팔로우가 멋대로 빠져나가지는 않는다.
 * - "따라오기 차단"은 대상 측 스위치다. 켜면 나를 따라오는 전원의 세션이 즉시
 *   blocked로 해제된다(호스트가 채널로 전파한다).
 * - 편집 잠금 보유자의 커서에는 잠금 배지를 붙인다. "저 사람이 보고만 있는지,
 *   실제로 고치는 중인지"가 커서만으로 구분되는 것이 검수 표면의 차이다.
 */
export function LiveCursorOverlay({
  views,
  selfActorId,
  lockHolderActorId,
  followTargetId,
  followState,
  observeAllowedByActorId,
  selfObserveBlocked,
  onFollowStart,
  onFollowStop,
  onFollowResume,
  onToggleSelfObserveBlocked,
  syncState,
  pageId,
  now,
}: LiveCursorOverlayProps) {
  const bt = useBilingual("LiveCursorOverlay");
  const remote = (views ?? []).filter((view) => view.actorId !== selfActorId);
  const onThisPage = remote.filter((view) => view.pageId === pageId && view.cursor !== null);

  return (
    <div className="pointer-events-none absolute inset-0" data-live-cursor-overlay="true">
      {/* 관찰 컨트롤 — 함께 보는 사람이 있을 때만, 없을 때는 빈 상태를 말한다 */}
      <div className="pointer-events-auto absolute right-2 top-2 flex max-w-[80%] flex-wrap justify-end gap-1.5">
        {views === null ? (
          <span className="rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-fg-3" role="status">
            {bt("함께 보는 사람을 불러오는 중…", "Loading who is here…")}
          </span>
        ) : remote.length === 0 ? (
          <span className="rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-fg-3">
            {bt("지금은 혼자 보고 있어요", "You are the only one here")}
          </span>
        ) : (
          remote.map((view) => {
            const isTarget = followTargetId === view.actorId && followState !== "off";
            const color = liveCursorColor(view.actorId);
            if (isTarget && followState === "blocked") {
              return (
                <span key={view.actorId} className="inline-flex items-center gap-1.5" data-observe-state="blocked">
                  <span
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-warn/50 bg-warn/10 px-2.5 py-1 text-[0.6875rem] font-bold text-warn"
                    role="status"
                  >
                    <EyeOff className="size-3" aria-hidden="true" />
                    {bt(`${view.displayName}님이 따라오기를 차단했어요`, `${view.displayName} blocked following`)}
                  </span>
                  <button
                    type="button"
                    onClick={onFollowStop}
                    className="inline-flex min-h-8 items-center rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2 shadow-sm outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    {bt("확인", "Dismiss")}
                  </button>
                </span>
              );
            }
            if (isTarget && followState === "paused-manual") {
              return (
                <span key={view.actorId} className="inline-flex items-center gap-1.5" data-observe-state="paused-manual">
                  <button
                    type="button"
                    onClick={onFollowResume}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-bold text-accent shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                    title={bt("내가 직접 움직여서 잠시 멈췄어요. 누르면 다시 따라갑니다.", "Paused because you scrolled yourself. Tap to follow again.")}
                  >
                    <Play className="size-3" aria-hidden="true" />
                    {bt(`${view.displayName}님 화면 일시정지 — 다시 따라가기`, `Paused — follow ${view.displayName} again`)}
                  </button>
                  <button
                    type="button"
                    onClick={onFollowStop}
                    className="inline-flex min-h-8 items-center rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2 shadow-sm outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    {bt("그만두기", "Stop")}
                  </button>
                </span>
              );
            }
            if (isTarget && followState === "following") {
              return (
                <button
                  key={view.actorId}
                  type="button"
                  data-observe-state="following"
                  aria-pressed={true}
                  onClick={onFollowStop}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent bg-accent px-2.5 py-1 text-[0.6875rem] font-bold text-on-accent shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  title={bt("따라가기 그만두기. 직접 스크롤하면 일시정지돼요.", "Stop following. Scrolling yourself pauses it.")}
                >
                  <Pause className="size-3" aria-hidden="true" />
                  {bt(`${view.displayName}님 화면 따라가는 중 — 눌러서 해제`, `Following ${view.displayName} — tap to stop`)}
                </button>
              );
            }
            const allowed = observeAllowedByActorId[view.actorId] ?? false;
            return (
              <button
                key={view.actorId}
                type="button"
                aria-pressed={false}
                disabled={!allowed}
                onClick={() => onFollowStart(view.actorId)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  allowed ? "border-line bg-card/90 text-fg hover:bg-raised" : "cursor-not-allowed border-line bg-card/60 text-fg-3",
                )}
                title={allowed
                  ? bt(`${view.displayName}님이 보는 화면 그대로 따라가기`, `Follow exactly what ${view.displayName} sees`)
                  : bt("지금은 따라갈 수 없어요 (세션 밖이거나 집중 중이거나 차단됨)", "Can't follow right now (outside the session, focusing, or blocked)")}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                {bt(`${view.displayName}님 화면 따라가기`, `Follow ${view.displayName}`)}
              </button>
            );
          })
        )}
        {remote.length > 0 && selfActorId ? (
          <button
            type="button"
            aria-pressed={selfObserveBlocked}
            onClick={onToggleSelfObserveBlocked}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
              selfObserveBlocked ? "border-warn/60 bg-warn/15 text-warn" : "border-line bg-card/90 text-fg-2 hover:bg-raised hover:text-fg",
            )}
            title={selfObserveBlocked
              ? bt("지금은 아무도 내 화면을 따라올 수 없어요. 누르면 허용합니다.", "Nobody can follow your screen right now. Tap to allow.")
              : bt("다른 사람이 내 화면을 따라오지 못하게 합니다. 따라오는 중이면 즉시 해제돼요.", "Stop others from following your screen. Anyone following is released right away.")}
          >
            <EyeOff className="size-3" aria-hidden="true" />
            {selfObserveBlocked ? bt("따라오기 차단 중", "Following blocked") : bt("내 화면 따라오기 차단", "Block following me")}
          </button>
        ) : null}
        {syncState === "offline" ? (
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[0.6875rem] font-bold text-warn" role="status">
            {bt("연결이 끊겨 마지막 위치를 표시 중이에요", "Connection lost — showing last known positions")}
          </span>
        ) : null}
      </div>

      {/* 라이브 커서들 */}
      {onThisPage.map((view) => {
        const cursor = view.cursor;
        if (!cursor) return null;
        const color = liveCursorColor(view.actorId);
        const focus = deriveLiveViewFocus(view, now);
        const isHolder = lockHolderActorId === view.actorId;
        return (
          <div
            key={view.actorId}
            data-live-cursor={view.actorId}
            className={cn("absolute z-10", focus === "idle" && "opacity-45")}
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
              transition: "left 120ms linear, top 120ms linear",
            }}
            aria-hidden="true"
          >
            <MousePointer2 className="size-4 drop-shadow" style={{ color, fill: color }} />
            <span
              className="ml-3 inline-flex -translate-y-1 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.625rem] font-bold text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {view.displayName}
              {isHolder ? (
                <span className="inline-flex items-center gap-0.5">
                  <LockKeyhole className="size-2.5" />
                  {bt("편집 중", "editing")}
                </span>
              ) : focus === "idle" ? bt("자리 비움", "away") : null}
            </span>
          </div>
        );
      })}

      {/* 다른 페이지를 보는 사람이 있으면 커서 없이 그 사실만 알린다 */}
      {remote.some((view) => view.pageId !== pageId) ? (
        <p className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-fg-3">
          <Crosshair className="size-3" aria-hidden="true" />
          {bt("다른 페이지를 보고 있는 사람이 있어요", "Someone is viewing another page")}
        </p>
      ) : null}
    </div>
  );
}

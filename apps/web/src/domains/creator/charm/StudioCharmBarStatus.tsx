/**
 * 참 바의 빈 상태와 안내(기본 참 안내 · 편집 잠금 · 저장소 연결 실패).
 *
 * 같은 문구를 두 길이로 그린다. 가로 띠와 떠 있는 창에서는 전체 문장을 보이고, 폭이 좁은 세로 레일에서는
 * 짧은 말만 보인다(전체 문장은 스크린리더용으로 남기고 마우스 올림 설명에도 쓴다). 전환은 CSS 가
 * 배치(`data-studio-region-floating`)로 정하므로 여기서는 두 번 그리기만 한다. 접근 가능한 이름은 항상 전체 문장이다.
 */

import { RotateCw, Sparkles, X } from "lucide-react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { bi, lockNoticeText } from "./studio-charm-copy";

import type { StudioCharmLock } from "./studio-charm-host-bridge";
import type { StudioCharmBarPersistence } from "./studio-charm-bar-store";

/** 전체 문장(스크린리더·넓은 배치)과 짧은 말(좁은 레일)을 함께 그린다. */
function Dual({ full, short }: { readonly full: string; readonly short: string }) {
  return (
    <>
      <span className="studio-charm-bar__full">{full}</span>
      <span aria-hidden="true" className="studio-charm-bar__short" title={full}>{short}</span>
    </>
  );
}

const NOTE_BASE = "studio-charm-bar__note rounded-lg border p-1.5 text-[0.7rem] leading-snug text-fg-2";
const NOTE_WARNING = "border-warning/40 bg-warning/10";

export function StudioCharmBarEmpty({ onAddStarter }: { readonly onAddStarter: () => void }) {
  useBilingualI18nRevision();
  return (
    <div className="studio-charm-bar__empty grid gap-1.5 p-1" data-studio-charm-empty="">
      <p className="text-xs font-semibold text-fg-2">
        <Dual full={bi("고정한 참이 없어요", "No charms pinned yet")} short={bi("비어 있음", "Empty")} />
      </p>
      <p className="studio-charm-bar__hint text-[0.7rem] leading-snug text-fg-3">
        {bi(
          "자주 쓰는 집중선·땀방울·소품을 고정해 한 번에 붙이세요.",
          "Pin your frequent focus lines, sweat drops and props to stamp them in one tap.",
        )}
      </p>
      <button
        type="button"
        onClick={onAddStarter}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-accent/50 bg-accent-soft px-3 text-xs font-semibold text-fg hover:border-accent",
          STUDIO_FOCUS_RING,
        )}
      >
        <Sparkles size={14} aria-hidden="true" />
        <span className="studio-charm-bar__label">{bi("기본 참 담기", "Add starter charms")}</span>
      </button>
    </div>
  );
}

export interface StudioCharmBarNoticesProps {
  /** 기본 참을 자동으로 담았다고 한 번 알린다. 0이면 안내하지 않는다. */
  readonly starterCount: number;
  readonly onDismissStarter: () => void;
  readonly lock: StudioCharmLock | null;
  readonly persistence: StudioCharmBarPersistence;
  readonly onRetryPersistence: () => void;
  /** 고정한 내 소재 참이 있는데 보관함 목록을 읽지 못했다. 그 참들은 읽을 때까지 자리표시로 남는다. */
  readonly libraryFailed: boolean;
  readonly onRetryLibrary: () => void;
}

export function StudioCharmBarNotices({
  starterCount,
  onDismissStarter,
  lock,
  persistence,
  onRetryPersistence,
  libraryFailed,
  onRetryLibrary,
}: StudioCharmBarNoticesProps) {
  useBilingualI18nRevision();
  const lockText = lockNoticeText(lock);
  return (
    <>
      {starterCount > 0 ? (
        <p role="status" data-studio-charm-note="starter" className={cn(NOTE_BASE, "flex items-start gap-1 border-line bg-card")}>
          <span className="min-w-0 flex-1">
            <Dual
              full={bi(
                `기본 참 ${starterCount}개를 담았어요. 필요 없는 건 편집에서 뺄 수 있어요.`,
                `Added ${starterCount} starter charms. Remove any you do not need while editing.`,
              )}
              short={bi(`기본 ${starterCount}개`, `${starterCount} starter`)}
            />
          </span>
          <button
            type="button"
            onClick={onDismissStarter}
            aria-label={bi("안내 닫기", "Dismiss this note")}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised pointer-coarse:size-11 max-lg:size-11",
              STUDIO_FOCUS_RING,
            )}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </p>
      ) : null}

      {lockText ? (
        <p role="status" data-studio-charm-note="lock" className={cn(NOTE_BASE, NOTE_WARNING)}>
          <Dual full={lockText} short={bi("잠김", "Locked")} />
        </p>
      ) : null}

      {libraryFailed ? (
        <div role="status" data-studio-charm-note="library" className={cn(NOTE_BASE, NOTE_WARNING, "grid gap-1")}>
          <span>
            <Dual
              full={bi(
                "내 소재 목록을 불러오지 못해 고정한 내 소재가 비어 보여요.",
                "Could not load your assets, so pinned items from My assets look empty.",
              )}
              short={bi("내 소재 오류", "Assets failed")}
            />
          </span>
          <button
            type="button"
            onClick={onRetryLibrary}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            <RotateCw size={12} aria-hidden="true" />
            <span className="studio-charm-bar__label">{bi("내 소재 다시 불러오기", "Reload my assets")}</span>
          </button>
        </div>
      ) : null}

      {persistence === "memory-only" ? (
        <div role="status" data-studio-charm-note="storage" className={cn(NOTE_BASE, NOTE_WARNING, "grid gap-1")}>
          <span>
            <Dual
              full={bi("저장소에 연결하지 못해 이번 탭에서만 유지돼요.", "Could not reach storage, so this stays only in this tab.")}
              short={bi("저장 안 됨", "Not saved")}
            />
          </span>
          <button
            type="button"
            onClick={onRetryPersistence}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            <RotateCw size={12} aria-hidden="true" />
            <span className="studio-charm-bar__label">{bi("저장 다시 시도", "Retry saving")}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

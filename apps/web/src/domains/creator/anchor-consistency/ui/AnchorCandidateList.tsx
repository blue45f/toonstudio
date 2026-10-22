/**
 * 후보 목록 — 썸네일, 이름, 분석 상태, 참고 점수. 방향키로 옮기며 고른다.
 *
 * 목록은 하나의 탭 정지점(선택한 후보)을 가진 로빙 tabindex 목록이다. 위/왼쪽은 이전, 아래/오른쪽은 다음, Home/End 는 처음과 끝.
 * 고른 후보는 aria-pressed 로 알린다. 상태와 점수는 색이 아니라 글로 쓴다.
 *
 * 카드의 점수는 `item.displayed`(견줄 앵커를 골랐으면 그 앵커, 자동이면 후보마다 가장 비슷한 앵커와의 비교)를 그린다.
 * 정렬 키와 나란히 보기가 같은 값을 읽으므로 숫자와 순서, 목록과 나란히 보기가 어긋나지 않는다.
 */
import { ImageOff } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { BAND_KEYS, CANDIDATE_STATUS_KEYS } from "../anchor-lab-copy";
import type { AnchorCandidateItem } from "./use-anchor-candidates";

export interface AnchorCandidateListProps {
  readonly items: readonly AnchorCandidateItem[];
  readonly selectedId: string | null;
  readonly previewUrls: ReadonlyMap<string, string>;
  readonly onSelect: (id: string) => void;
}

const BAND_TONE = {
  high: "border-good/40 text-good",
  medium: "border-line text-fg-2",
  low: "border-warn/40 text-warn",
} as const;

export function AnchorCandidateList({ items, selectedId, previewUrls, onSelect }: AnchorCandidateListProps) {
  const t = useT();
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const move = (event: KeyboardEvent<HTMLButtonElement>, current: number): void => {
    const last = items.length - 1;
    const targets: Readonly<Record<string, number>> = {
      ArrowDown: Math.min(last, current + 1),
      ArrowRight: Math.min(last, current + 1),
      ArrowUp: Math.max(0, current - 1),
      ArrowLeft: Math.max(0, current - 1),
      Home: 0,
      End: last,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onSelect(target.id);
    buttons.current.get(target.id)?.focus();
  };

  return (
    <ul
      aria-label={t("anchorLab.candidates.list")}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
    >
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        const url = previewUrls.get(item.id);
        return (
          <li key={item.id}>
            <button
              type="button"
              ref={(node) => {
                if (node) buttons.current.set(item.id, node);
                else buttons.current.delete(item.id);
              }}
              aria-pressed={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => { onSelect(item.id); }}
              onKeyDown={(event) => { move(event, index); }}
              className={cn(
                "flex min-h-11 w-full flex-col gap-2 rounded-2xl border bg-card p-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80",
                selected ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
              )}
            >
              <span className="grid aspect-[2/3] w-full place-items-center overflow-hidden rounded-xl bg-panel">
                {url ? (
                  <img src={url} alt="" aria-hidden="true" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <ImageOff size={22} aria-hidden="true" className="text-fg-3" />
                )}
              </span>
              <span className="block truncate text-sm font-medium text-fg" title={item.name}>{item.name}</span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full border border-line px-2 py-0.5 text-fg-2">{t(CANDIDATE_STATUS_KEYS[item.status])}</span>
                {item.displayed ? (
                  <>
                    <span className={cn("rounded-full border px-2 py-0.5 font-medium", BAND_TONE[item.displayed.comparison.band])}>
                      {t("anchorLab.candidates.card.score", { score: Math.round(item.displayed.comparison.score * 100) })}
                    </span>
                    <span className={cn("rounded-full border px-2 py-0.5", BAND_TONE[item.displayed.comparison.band])}>
                      {t(BAND_KEYS[item.displayed.comparison.band])}
                    </span>
                  </>
                ) : item.status === "done" ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{t("anchorLab.candidates.card.noScore")}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

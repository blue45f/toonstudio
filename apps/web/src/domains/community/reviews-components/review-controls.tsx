import { Eye, EyeOff } from "lucide-react";

import type { ReviewSort } from "@/shared/lib/types";

import { parseReviewRating, parseReviewSort, type ReviewRatingFilter } from "./review-query";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { usePathname, useRouter, useSearchParams } from "@/shared/navigation/navigation";

type Bilingual = readonly [ko: string, en: string];

const SORTS: ReadonlyArray<{ readonly value: ReviewSort; readonly label: Bilingual }> = [
  { value: "recent", label: ["최신순", "Newest"] },
  { value: "likes", label: ["공감순", "Most liked"] },
  { value: "high", label: ["별점 높은순", "Highest rated"] },
  { value: "low", label: ["별점 낮은순", "Lowest rated"] },
];

const RATINGS: ReadonlyArray<{ readonly value: ReviewRatingFilter; readonly label: Bilingual }> = [
  { value: "all", label: ["전체 평점", "All ratings"] },
  { value: "high", label: ["고평점 4★+", "4★ and up"] },
  { value: "low", label: ["저평점 ~3★", "3★ and below"] },
];

// 동심원 반경: 바깥 10px 패딩 4px -> 안쪽 8px. 좁은 화면에서는 바깥 레일이 가로 스크롤된다.
const SEGMENT_GROUP = "inline-flex w-max shrink-0 items-center gap-0.5 rounded-[10px] border border-line bg-panel p-1";
const SEGMENT_BUTTON = "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none";

/**
 * 리뷰 정렬·평점·스포일러 컨트롤 — 다른 검색 조건을 보존한 채 주소를 갱신한다.
 * 한 번에 하나만 고르는 세그먼트는 `aria-pressed` 토글 버튼 묶음으로 알린다.
 */
export function ReviewControls() {
  const bt = useBilingual("ReviewControls");
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sort = parseReviewSort(sp.get("sort"));
  const rating = parseReviewRating(sp.get("rating"));
  const spoilerHidden = sp.get("spoiler") === "hide";
  const summaryView = sp.get("view") === "summary";

  const setParam = (key: "sort" | "rating" | "spoiler" | "view", value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={bt("리뷰 정렬", "Sort reviews")} className={SEGMENT_GROUP}>
        {SORTS.map((option) => {
          const active = option.value === sort;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setParam("sort", option.value === "recent" ? null : option.value)}
              className={cn(
                SEGMENT_BUTTON,
                "text-[0.8125rem]",
                active ? "bg-raised font-semibold text-fg" : "text-fg-3 hover:text-fg",
              )}
            >
              {bt(...option.label)}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label={bt("평점 필터", "Rating filter")} className={SEGMENT_GROUP}>
        {RATINGS.map((option) => {
          const active = option.value === rating;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setParam("rating", option.value === "all" ? null : option.value)}
              className={cn(SEGMENT_BUTTON, active ? "bg-raised font-semibold text-fg" : "text-fg-3 hover:text-fg-2")}
            >
              {bt(...option.label)}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={spoilerHidden}
        onClick={() => setParam("spoiler", spoilerHidden ? null : "hide")}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none",
          spoilerHidden
            ? "border-accent/55 bg-accent-soft text-accent"
            : "border-line bg-panel text-fg-3 hover:text-fg-2",
        )}
      >
        {spoilerHidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {bt("스포일러 숨기기", "Hide spoilers")}
      </button>

      <div role="group" aria-label={bt("보기 방식", "View mode")} className={SEGMENT_GROUP}>
        <button
          type="button"
          aria-pressed={!summaryView}
          onClick={() => setParam("view", null)}
          className={cn(SEGMENT_BUTTON, !summaryView ? "bg-raised font-semibold text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {bt("원본 피드", "Original feed")}
        </button>
        <button
          type="button"
          aria-pressed={summaryView}
          onClick={() => setParam("view", "summary")}
          className={cn(SEGMENT_BUTTON, summaryView ? "bg-raised font-semibold text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {bt("반응 요약", "Reaction summary")}
        </button>
      </div>
    </div>
  );
}

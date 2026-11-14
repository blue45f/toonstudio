import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface StudioCommandSearchBeginnerGuideProps {
  readonly onPickQuery: (query: string) => void;
}

const BEGINNER_STEPS = [
  {
    step: "1",
    ko: "선화 그리기",
    en: "Draw lineart",
    hintKo: "펜(B) · 손떨림 보정",
    hintEn: "Pen (B) · Stabilization",
    query: "손떨림 보정",
  },
  {
    step: "2",
    ko: "밑색·컷 구성",
    en: "Fill and panels",
    hintKo: "틈 닫기 · 칸 나누기",
    hintEn: "Close gap · Split panel",
    query: "틈 닫기",
  },
  {
    step: "3",
    ko: "출력·함께 검수",
    en: "Export and review",
    hintKo: "내보내기 · 컷 댓글",
    hintEn: "Export · Cut comments",
    query: "협업 검수",
  },
] as const;

const KOREAN_ALIAS_CHIPS = [
  { query: "손떨림 보정", ko: "손떨림 보정", en: "Stabilization" },
  { query: "필압 곡선", ko: "필압 곡선", en: "Pressure curve" },
  { query: "틈 닫기", ko: "틈 닫기", en: "Close gap" },
  { query: "원근 자", ko: "원근 자", en: "Perspective ruler" },
  { query: "교차점 지우기", ko: "교차점 지우기", en: "Vector eraser" },
  { query: "칸 나누기", ko: "칸 나누기", en: "Split panels" },
  { query: "레이어 마스크", ko: "레이어 마스크", en: "Layer mask" },
  { query: "캐릭터 셰이퍼", ko: "캐릭터 셰이퍼", en: "Character Shaper" },
  { query: "3D 배치", ko: "3D 배치", en: "3D placement" },
  { query: "협업 검수", ko: "협업 검수", en: "Review pins" },
] as const;

/** 빈 검색창에서 초보자 첫 작업 동선과 자주 찾는 한국어 별칭 진입점을 안내한다. */
export function StudioCommandSearchBeginnerGuide({
  onPickQuery,
}: StudioCommandSearchBeginnerGuideProps) {
  const bt = useBilingual("studio.commandSearchGuide");

  return (
    <div
      data-studio-search-beginner-guide="true"
      className="space-y-3 px-2 pb-2"
    >
      <section aria-label={bt("초보자 3단계 빠른 시작", "Beginner 3-step quick start")} className="rounded-xl border border-line bg-card/70 p-2.5">
        <p className="mb-1.5 text-[0.68rem] font-semibold text-fg-2">
          {bt("처음 시작한다면 순서대로 눌러 보세요", "New here? Follow these 3 quick steps")}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {BEGINNER_STEPS.map((item) => (
            <button
              key={item.step}
              type="button"
              data-studio-search-step={item.step}
              onClick={() => onPickQuery(item.query)}
              className="flex min-h-11 flex-col items-start justify-center rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-[0.68rem] font-semibold text-fg">
                {item.step}. {bt(item.ko, item.en)}
              </span>
              <span className="text-[0.62rem] text-fg-3">
                {bt(item.hintKo, item.hintEn)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label={bt("자주 찾는 한국어 별칭", "Popular Korean aliases")} data-studio-search-alias-chips="true" className="px-0.5">
        <p className="mb-1.5 text-[0.66rem] font-semibold text-fg-3">
          {bt("자주 찾는 기능 별칭 · 누르면 바로 검색", "Popular aliases · Click to search")}
        </p>
        <div className="flex flex-wrap gap-1">
          {KOREAN_ALIAS_CHIPS.map((chip) => (
            <button
              key={chip.query}
              type="button"
              data-studio-search-alias-chip={chip.query}
              onClick={() => onPickQuery(chip.query)}
              className="min-h-7 rounded-full border border-line bg-card px-2.5 text-[0.66rem] font-medium text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {bt(chip.ko, chip.en)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

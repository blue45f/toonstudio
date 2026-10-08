/**
 * WikimediaInterestDashboard.tsx
 *
 * S4-09 위키미디어 관심 신호 대시보드 — 일반 검색 카드 대신, 한국어 위키백과
 * 문서의 일별 조회 추이 스펙트럼 바가 주인공인 카드.
 *
 * 정직성 계약:
 * - 바·지표는 전부 제공처 응답의 dailyViews 실측 시계열에서만 만든다.
 *   시계열이 없는 항목이면 대시보드 자체를 만들지 않는다(null) — 부모가 일반 카드로 폴백한다.
 * - 조회 기간은 제공처 계약이 최근 30일 고정이라 선택지를 만들지 않고 기간을 명시한다.
 * - 막대 색은 브랜드 장르 스펙트럼(genre-color.ts의 색상환 hue 궤적)을 시간축에 펼친
 *   그라디언트를 막대 위치별로 잘라 쓴다. 막대 자체는 장식이고 실제 수치는 지표 텍스트가 맡는다.
 */
import { RESOURCE_BUTTON } from "./navigation";
import { buildTrendBars, formatDateLabel, formatViews, summarizeDailyViews } from "./wikimedia-interest";

import type { CreatorResource } from "@/shared/lib/creator-resources";

import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";

/* 장르 스펙트럼 색상환(genre-color.ts GENRE_HUE)의 hue 궤적: SF 245 → 미스터리 205 →
   일상 162 → 코미디 100 → 역사 62 → 무협 22. 시간축 왼쪽(과거)에서 오른쪽(최근)으로 펼친다. */
const SPECTRUM_GRADIENT =
  "linear-gradient(90deg, oklch(0.72 0.15 245) 0%, oklch(0.72 0.14 205) 22%, oklch(0.72 0.13 162) 45%, oklch(0.72 0.16 100) 65%, oklch(0.72 0.13 62) 82%, oklch(0.72 0.17 22) 100%)";

function ChangeBadge({ changePct, halfDays }: { changePct: number | null; halfDays: number }) {
  if (changePct === null) {
    return (
      <div>
        <dt className="text-xs font-semibold text-fg-3">전반부 대비 후반부</dt>
        <dd className="mt-1 text-sm font-semibold text-fg-2">비교할 이전 기간 기록이 없습니다</dd>
      </div>
    );
  }
  const direction = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  // 상승·하락은 DESIGN.md 시맨틱 토큰(good=상승, bad=하락)이 맡는다. 토큰이 테마마다 명도를 바꾸므로
  // OS 색 구성표만 따르던 dark: 변형 없이도 밝은·어두운 테마 양쪽에서 대비가 유지된다.
  const tone = changePct > 0 ? "text-good" : changePct < 0 ? "text-bad" : "text-fg-2";
  return (
    <div>
      <dt className="text-xs font-semibold text-fg-3">전반 {halfDays}일 대비 최근 {halfDays}일</dt>
      <dd className={`mt-1 text-lg font-black tabular-nums ${tone}`}>
        {direction} {Math.abs(changePct)}%
      </dd>
    </div>
  );
}

export function WikimediaInterestDashboard({
  item,
  saved,
  onToggle,
  disabled,
}: {
  item: CreatorResource;
  saved: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const points = item.dailyViews ?? [];
  const summary = summarizeDailyViews(points);
  if (!summary) return null;
  const bars = buildTrendBars(points);
  const trendLabel = `일별 조회수 추이: 총 ${formatViews(summary.total)}회, 일평균 ${formatViews(summary.average)}회, 가장 많이 본 날은 ${summary.peak.date} ${formatViews(summary.peak.views)}회입니다.`;
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-panel" aria-label={`${item.title} 대시보드`}>
      <div className="space-y-6 p-5 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-fg-3">{RESOURCE_LABELS[item.provider]} · 한국어 위키백과</p>
            <h3 className="mt-1 break-words text-xl font-bold leading-snug">{item.title}</h3>
            <p className="mt-1 text-sm text-fg-2">
              조회 기간 고정 · 최근 {summary.days}일 ({summary.start} – {summary.end})
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-fg-3">기간 총 조회수</p>
            <p className="mt-0.5 text-4xl font-black tabular-nums leading-none">{formatViews(summary.total)}<span className="ml-1 text-base font-bold text-fg-2">회</span></p>
          </div>
        </header>

        <div>
          <div className="flex h-36 items-end gap-[3px] sm:h-44" role="img" aria-label={trendLabel}>
            {bars.map((bar) => (
              <div
                key={bar.date}
                title={`${bar.date} · ${formatViews(bar.views)}회`}
                className={`min-w-0 flex-1 rounded-t-[3px] ${bar.isPeak ? "ring-2 ring-fg/70 ring-offset-1 ring-offset-panel" : ""}`}
                style={{
                  height: `${bar.heightPct}%`,
                  backgroundImage: SPECTRUM_GRADIENT,
                  backgroundSize: bar.backgroundSize,
                  backgroundPosition: bar.backgroundPosition,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-3">
            <span>{formatDateLabel(summary.start)}</span>
            <span className="font-semibold text-fg-2">가장 많이 본 날 · {formatDateLabel(summary.peak.date)} {formatViews(summary.peak.views)}회</span>
            <span>{formatDateLabel(summary.end)}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-fg-3">일평균 조회수</dt>
            <dd className="mt-1 text-lg font-black tabular-nums">{formatViews(summary.average)}회</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-3">가장 많이 본 날</dt>
            <dd className="mt-1 text-lg font-black tabular-nums">
              {formatDateLabel(summary.peak.date)} <span className="text-sm font-bold text-fg-2">{formatViews(summary.peak.views)}회</span>
            </dd>
          </div>
          <ChangeBadge changePct={summary.changePct} halfDays={summary.halfDays} />
        </dl>

        <p className="text-sm leading-6 text-fg-2">
          백과 문서 조회 신호이며 독자 수·매출·작품 성공 가능성을 뜻하지 않습니다. 검색 관심 참고용으로만 사용하세요.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <a href={item.sourceUrl} className={RESOURCE_BUTTON} target="_blank" rel="noopener noreferrer">원문 확인 ↗</a>
          <button className={RESOURCE_BUTTON} aria-pressed={saved} disabled={disabled} onClick={onToggle}>{saved ? "저장 해제" : "보드에 저장"}</button>
          <details className="w-full text-xs leading-6 text-fg-2">
            <summary className="cursor-pointer py-1">출처·이용조건·조회일</summary>
            <p>{item.credit || "Wikimedia Pageviews API · ko.wikipedia"}</p>
            {item.provenance?.rightsStatement && <p>{item.provenance.rightsStatement}</p>}
            <p>조회: {item.fetchedAt}</p>
          </details>
        </div>
      </div>
    </article>
  );
}

/** 기본 주제 대시보드를 기다리는 동안의 자리 — 실제 바 자리와 같은 높이로 둔다. */
export function WikimediaDashboardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-hidden="true">
      <div className="h-6 w-1/2 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
      <div className="mt-5 flex h-36 items-end gap-[3px] sm:h-44">
        {Array.from({ length: 15 }, (_, index) => (
          <div key={index} className="flex-1 animate-pulse rounded-t-[3px] bg-raised [motion-reduce:animate-none]" style={{ height: `${30 + ((index * 37) % 60)}%` }} />
        ))}
      </div>
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
    </div>
  );
}

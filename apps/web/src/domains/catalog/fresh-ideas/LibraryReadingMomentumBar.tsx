/**
 * LibraryReadingMomentumBar.tsx — /library 내 서재 읽기 모멘텀 & 완독 마라톤 바.
 *
 * 실제 서재 상태(reading · want · done[completed] · hiatus) 카운트만 사용해
 * 오늘 이어 볼 추천 작품 1건, 완독률 진행 바(tabular-nums), 상태별 1탭 필터 전환,
 * 빈 서재일 때 /discover · /random 원클릭 이동 안내를 제공한다.
 */

import { ArrowRight, BookOpen, Compass, Flame, Shuffle } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiFetch } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import type { ReadState, Title } from "@/shared/lib/types";
import Link from "@/shared/navigation/router-link";

import "./catalog-wave4-fresh-ideas.css";
import {
  buildLibraryFilterSearchParams,
  buildLibraryMomentumSummary,
  type LibraryMomentumFilterKey,
} from "./library-momentum-model";

type MomentumTitlePreview = Pick<Title, "id" | "slug" | "title" | "genres" | "status">;

const EMPTY_READS: Readonly<Record<string, ReadState>> = {};
const EMPTY_RECENT: readonly string[] = [];

export interface LibraryReadingMomentumBarProps {
  /** 테스트·상위 주입용 제목 메타 맵. 없으면 이어 볼 후보 1건만 지연 조회한다. */
  readonly titlesById?: Readonly<Record<string, MomentumTitlePreview>>;
}

export function LibraryReadingMomentumBar({ titlesById }: LibraryReadingMomentumBarProps = {}) {
  const bt = useBilingual("LibraryReadingMomentumBar");
  const reads = useApp((s) => s.reads) ?? EMPTY_READS;
  const recentlyViewed = useApp((s) => s.recentlyViewed) ?? EMPTY_RECENT;
  const location = useLocation();
  const navigate = useNavigate();

  const summary = useMemo(
    () => buildLibraryMomentumSummary({ reads, recentlyViewed }),
    [reads, recentlyViewed],
  );

  const candidateId = summary.continueCandidate?.titleId ?? null;
  const injectedCandidate = candidateId && titlesById ? titlesById[candidateId] ?? null : null;
  const [fetchedCandidate, setFetchedCandidate] = useState<MomentumTitlePreview | null>(null);

  useEffect(() => {
    if (!candidateId || injectedCandidate) return;
    const controller = new AbortController();
    let alive = true;

    apiFetch(`/api/titles?ids=${encodeURIComponent(candidateId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((payload: { items?: MomentumTitlePreview[] }) => {
        if (!alive) return;
        const found = payload.items?.find((item) => item.id === candidateId) ?? null;
        setFetchedCandidate(found);
      })
      .catch(() => {
        if (alive) setFetchedCandidate(null);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [candidateId, injectedCandidate]);

  const resolvedCandidate =
    injectedCandidate ?? (fetchedCandidate?.id === candidateId ? fetchedCandidate : null);

  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get("tab") ?? "shelf";
  const currentReadParam = searchParams.get("libraryRead") ?? "want";
  const activeFilter: LibraryMomentumFilterKey | null =
    currentTab === "shelf" &&
    (currentReadParam === "reading" ||
      currentReadParam === "want" ||
      currentReadParam === "done" ||
      currentReadParam === "hiatus")
      ? currentReadParam
      : null;

  const handleSelectStatusFilter = (key: LibraryMomentumFilterKey) => {
    const nextSearch = buildLibraryFilterSearchParams(location.search, key);
    void navigate(
      { pathname: location.pathname, search: nextSearch, hash: location.hash },
      { replace: true, preventScrollReset: true },
    );
  };

  const progressScale = summary.completionPercent / 100;

  return (
    <section
      aria-labelledby="library-momentum-heading"
      data-testid="library-reading-momentum-bar"
      className="catalog-w4-card mb-6 p-4 sm:p-5"
    >
      <span aria-hidden="true" className="catalog-w4-spectrum-strip" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="library-momentum-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]"
          >
            <Flame size={15} strokeWidth={1.6} className="shrink-0 text-accent" aria-hidden="true" />
            {bt("읽기 모멘텀 · 완독 마라톤", "Reading momentum & completion marathon")}
          </h2>
          <p
            data-testid="library-momentum-ratio"
            className="text-xs font-semibold tabular-nums text-fg-2"
          >
            {bt("완독률", "Completion")}{" "}
            <strong className="text-sm text-fg">{summary.completionPercent}%</strong>{" "}
            <span className="text-fg-3">
              ({summary.counts.completed}/{summary.counts.totalTracked})
            </span>
          </p>
        </div>

        {/* 완독률 진행 바 (GPU scaleX, tabular-nums) */}
        <div
          role="progressbar"
          aria-label={bt("서재 완독 진행률", "Library completion progress")}
          aria-valuenow={summary.completionPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="catalog-w4-marathon-track"
        >
          <span
            className="catalog-w4-marathon-fill"
            style={{ transform: `scaleX(${progressScale})` }}
          />
        </div>

        {summary.isEmpty ? (
          /* 빈 서재 상태: 가짜 수치 0건, /discover · /random 원클릭 이동 안내 */
          <div
            data-testid="library-momentum-empty"
            className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-card/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-fg [word-break:keep-all]">
                {bt("아직 서재에 담은 작품이 없어요", "Your shelf is empty right now")}
              </p>
              <p className="mt-0.5 text-xs text-fg-3 [word-break:keep-all]">
                {bt(
                  "첫 작품을 담으면 완독률과 오늘 이어 볼 추천이 자동으로 채워집니다.",
                  "Save your first story to unlock completion tracking and your daily continue pick.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Link
                href="/discover"
                data-testid="library-empty-discover-link"
                className="catalog-w4-action inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent hover:bg-accent-2 [word-break:keep-all]"
              >
                <Compass size={14} strokeWidth={1.6} aria-hidden="true" />
                {bt("작품 발견하기", "Explore Discover")}
                <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
              </Link>
              <Link
                href="/random"
                data-testid="library-empty-random-link"
                className="catalog-w4-action inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg hover:border-accent hover:text-accent [word-break:keep-all]"
              >
                <Shuffle size={14} strokeWidth={1.6} aria-hidden="true" />
                {bt("랜덤 한 편 뽑기", "Random pick")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* 상태별 1탭 필터 전환 칩 (reading · want · completed[done] · hiatus) */}
            <div
              role="group"
              aria-label={bt("서재 상태별 빠른 필터", "Quick shelf status filters")}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {summary.statusChips.map((chip) => {
                const active = activeFilter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    data-testid={`library-momentum-filter-${chip.key}`}
                    aria-pressed={active}
                    onClick={() => handleSelectStatusFilter(chip.key)}
                    style={{ "--w4-tone": chip.toneOklch } as CSSProperties}
                    className="catalog-w4-chip flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold [word-break:keep-all]"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: chip.toneOklch }}
                      />
                      <span>{bt(chip.labelKo, chip.labelEn)}</span>
                    </span>
                    <span className="numeral tabular-nums text-fg">{chip.count}</span>
                  </button>
                );
              })}
            </div>

            {/* 오늘 이어 볼 추천 작품 1건 */}
            {summary.continueCandidate ? (
              <div
                data-testid="library-momentum-continue-card"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-accent">
                    <BookOpen size={16} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">
                      {bt("오늘 이어 볼 추천 1편", "Today's continue-reading pick")}
                    </p>
                    <p className="truncate text-sm font-semibold text-fg [word-break:keep-all]">
                      {resolvedCandidate
                        ? resolvedCandidate.title
                        : summary.continueCandidate.readState === "reading"
                          ? bt("보는 중인 작품에서 바로 이어 읽기", "Resume from your reading shelf")
                          : summary.continueCandidate.readState === "want"
                            ? bt("관심 작품 중 첫 편 시작하기", "Start a story from your want-to-read shelf")
                            : bt("휴재 대기 작품 상태 확인하기", "Check your hiatus shelf")}
                    </p>
                  </div>
                </div>

                {resolvedCandidate ? (
                  <Link
                    href={`/title/${encodeURIComponent(resolvedCandidate.slug)}`}
                    data-testid="library-continue-title-link"
                    className="catalog-w4-action inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent hover:bg-accent-2 [word-break:keep-all]"
                  >
                    {bt("이어 보기", "Continue")}
                    <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-testid="library-continue-shelf-jump"
                    onClick={() => handleSelectStatusFilter(summary.continueCandidate!.readState)}
                    className="catalog-w4-action inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-panel px-3.5 py-2 text-xs font-semibold text-fg hover:border-accent hover:text-accent [word-break:keep-all]"
                  >
                    {bt("해당 목록 열기", "Open shelf")}
                    <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <div
                data-testid="library-momentum-all-completed"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-good/35 bg-good-soft px-3.5 py-2.5 text-xs text-fg"
              >
                <span className="font-medium [word-break:keep-all]">
                  {bt("담아 둔 작품을 모두 완독했어요! 다음 이야기를 골라보세요.", "You completed every tracked story! Pick your next read.")}
                </span>
                <Link
                  href="/discover"
                  className="catalog-w4-action inline-flex min-h-11 items-center gap-1 font-semibold text-accent hover:underline"
                >
                  {bt("새 작품 찾기", "Find next story")}
                  <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

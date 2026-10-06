import { apiFetch } from "@/platform/api";
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ContentIntensity } from "./engagement-model";
import { useEngagement, useEngagementHydrated } from "./engagement-store";
import { TasteSpectrumBar } from "./taste-spectrum-bar";

import type { Title } from "@/shared/lib/types";

import { MiniPoster } from "@/shared/components/rank-row";
import { ONBOARDING_GENRES } from "@/shared/components/recommend-view-types";
import { Container } from "@/shared/components/section";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { PageIntro } from "@/shared/components/page-intro";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { genreColor } from "@/shared/lib/genre-color";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

const AVOID_TAGS = ["폭력", "피폐", "고어", "공포", "괴롭힘", "자해", "성적폭력", "집착"] as const;

const INTENSITY: readonly {
  value: ContentIntensity;
  label: string;
  description: string;
}[] = [
  { value: "gentle", label: "편안하게", description: "전체·12세 작품을 우선합니다." },
  { value: "balanced", label: "균형 있게", description: "19세 작품은 추천에서 제외합니다." },
  { value: "unrestricted", label: "제한 없음", description: "연령 필터는 적용하지 않습니다." },
];

const FORMAT_OPTIONS = [
  { value: "all", label: "웹툰 & 웹소설" },
  { value: "webtoon", label: "웹툰만" },
  { value: "webnovel", label: "웹소설만" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "completed", label: "정주행 완결작" },
  { value: "ongoing", label: "실시간 연재작" },
] as const;

const STEPS = [
  { id: 1, label: "장르" },
  { id: 2, label: "감상 강도" },
  { id: 3, label: "회피 태그" },
  { id: 4, label: "완료" },
] as const;

type TasteFormat = "all" | "webtoon" | "webnovel";
type TasteStatus = "all" | "ongoing" | "completed";

export function TasteOnboardingPage() {
  useDocumentTitle("취향 스펙트럼 만들기");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const navigate = useNavigate();
  const setRating = useApp((state) => state.setRating);
  const setRead = useApp((state) => state.setRead);
  const existing = useEngagement((state) => state.tastePreferences);
  const setTastePreferences = useEngagement((state) => state.setTastePreferences);
  const hydrated = useEngagementHydrated();
  const [popular, setPopular] = useState<Title[]>([]);
  const [step, setStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([...(existing?.genres ?? [])]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([...(existing?.selectedTitleIds ?? [])]);
  const [selectedFormat, setSelectedFormat] = useState<TasteFormat>(existing?.format ?? "all");
  const [selectedStatus, setSelectedStatus] = useState<TasteStatus>(existing?.status ?? "all");
  const [avoidTags, setAvoidTags] = useState<string[]>([...(existing?.avoidTags ?? [])]);
  const [contentIntensity, setContentIntensity] = useState<ContentIntensity>(
    existing?.contentIntensity ?? "balanced",
  );
  // 복원이 끝나면 저장돼 있던 취향을 폼에 반영한다. 단, 사용자가 이미 손댄 뒤에는
  // 복원값으로 되돌리지 않는다. 이 동기화가 없으면 재방문자가 기본값 폼을 그대로
  // 완료해 저장된 취향이 조용히 사라진다.
  const formTouchedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || formTouchedRef.current || !existing) return;
    setSelectedGenres([...existing.genres]);
    setSelectedTitles([...existing.selectedTitleIds]);
    setSelectedFormat(existing.format);
    setSelectedStatus(existing.status);
    setAvoidTags([...existing.avoidTags]);
    setContentIntensity(existing.contentIntensity);
  }, [hydrated, existing]);
  const [error, setError] = useState(false);
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/titles?sort=popular&limit=12", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("popular titles unavailable");
        const payload = await response.json() as { items?: Title[] };
        setPopular(Array.isArray(payload.items) ? payload.items : []);
        setError(false);
      })
      .catch((cause: unknown) => {
        if ((cause as Error)?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [loadTick]);

  const recommendedTitles = useMemo(() => {
    const matched = popular.filter((title) => title.genres.some((genre) => selectedGenres.includes(genre)));
    const rest = popular.filter((title) => !matched.includes(title));
    return { matched: matched.length, titles: [...matched, ...rest].slice(0, 3) };
  }, [popular, selectedGenres]);

  const touch = () => {
    formTouchedRef.current = true;
  };

  const complete = () => {
    for (const titleId of selectedTitles) {
      setRating(titleId, 5);
      setRead(titleId, "done");
    }
    setTastePreferences({
      genres: selectedGenres,
      selectedTitleIds: selectedTitles,
      format: selectedFormat,
      status: selectedStatus,
      avoidTags,
      contentIntensity,
      completedAt: new Date().toISOString(),
    });
    const query = new URLSearchParams();
    if (selectedGenres.length > 0) query.set("taste", selectedGenres.join(","));
    if (selectedFormat !== "all") query.set("types", selectedFormat);
    if (selectedStatus !== "all") query.set("status", selectedStatus);
    navigate(`/recommend${query.size > 0 ? `?${query.toString()}` : ""}`, { replace: true });
  };

  const intensityLabel = INTENSITY.find((option) => option.value === contentIntensity)?.label ?? "";

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <img
        src="/images/hero-main.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-8 h-36 w-full rounded-3xl object-cover sm:h-44"
      />
      <PageIntro variant="unfold">
      <header className="mx-auto max-w-3xl text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-4 text-accent">TASTE ONBOARDING</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">나의 취향 스펙트럼 만들기</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-fg-2">
          장르와 좋아한 작품을 고르면 추천의 시작점을 만듭니다. 아래 회피 태그는 카탈로그에
          같은 태그가 명시된 작품에만 적용하며, 공식 콘텐츠 경고를 대신하지 않습니다.
        </p>
      </header>

      {error ? (
        <ErrorState
          className="mx-auto mt-5 max-w-2xl"
          title="인기 작품 목록을 불러오지 못했습니다"
          message="장르와 형식만 선택해도 취향 설정을 완료할 수 있습니다."
          onRetry={() => setLoadTick((tick) => tick + 1)}
        />
      ) : null}

      <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-line bg-card p-5 sm:p-6" aria-label="취향 스펙트럼 단계">
        {/* 단계 표시 + 실시간 스펙트럼 바 — 어느 단계에서도 선택이 바로 색으로 채워진다 */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="진행 단계">
            {STEPS.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true" className="text-fg-3">→</span> : null}
                <span className={cn("font-bold", step === item.id ? "text-accent" : "text-fg-3")}>
                  {item.id}. {item.label}
                </span>
              </li>
            ))}
          </ol>
          <span className="shrink-0 font-semibold text-fg-3">{step}/4단계</span>
        </div>
        <div className="mt-4">
          <TasteSpectrumBar genres={selectedGenres} />
        </div>

        {step === 1 ? (
          <div className="mt-6">
            <h2 className="font-black text-fg">좋아하는 장르를 2개 이상 골라 주세요</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">고르는 대로 위 스펙트럼 바가 장르 색으로 채워집니다.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ONBOARDING_GENRES.map((genre) => {
                const selected = selectedGenres.includes(genre);
                const color = genreColor(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      touch();
                      setSelectedGenres((current) =>
                        selected ? current.filter((value) => value !== genre) : [...current, genre],
                      );
                    }}
                    style={{
                      borderColor: selected ? color : undefined,
                      backgroundColor: selected ? `${color}18` : undefined,
                    }}
                    className={cn(
                      "flex h-12 items-center justify-center rounded-xl border text-sm transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-line bg-panel font-bold text-fg"
                        : "border-line bg-panel font-semibold text-fg-2 hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      {genre}
                    </span>
                  </button>
                );
              })}
            </div>

            <h3 className="mt-6 text-sm font-black text-fg">재미있게 본 작품이 있으면 골라 주세요 <span className="font-semibold text-fg-3">(선택)</span></h3>
            {popular.length > 0 ? (
              <div className="mt-3 grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {popular.slice(0, 12).map((title) => {
                  const selected = selectedTitles.includes(title.id);
                  return (
                    <button
                      key={title.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        touch();
                        setSelectedTitles((current) =>
                          selected ? current.filter((id) => id !== title.id) : [...current, title.id],
                        );
                      }}
                      className={cn(
                        "relative flex flex-col items-center rounded-xl border bg-panel p-2 transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        selected ? "border-accent bg-accent-soft/30" : "border-line hover:border-line-strong",
                      )}
                    >
                      <MiniPoster title={title} className="aspect-[3/4] w-14 rounded shadow-sm" />
                      <span className="mt-1.5 block w-full px-1 text-center text-[0.65rem] font-semibold leading-4 text-fg line-clamp-1">
                        {title.title}
                      </span>
                      {selected ? (
                        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-on-accent shadow" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-fg-3">
                {error ? "작품 목록을 불러오지 못해 건너뜁니다. 장르만 골라도 완료할 수 있어요." : "작품 목록을 불러오는 중이에요."}
              </p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-good/10 text-good">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-black text-fg">감상 강도</h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">언제든 다시 바꿀 수 있으며, 선택 내용은 현재 브라우저의 추천 화면에 사용됩니다.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {INTENSITY.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={contentIntensity === option.value}
                  onClick={() => { touch(); setContentIntensity(option.value); }}
                  className={cn(
                    "min-h-20 rounded-2xl border p-3 text-left transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    contentIntensity === option.value
                      ? "border-accent bg-accent-soft/40"
                      : "border-line bg-panel hover:border-line-strong",
                  )}
                >
                  <strong className="text-sm text-fg">{option.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-good/10 text-good">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-black text-fg">회피 태그</h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">고른 태그가 명시된 작품은 추천에서 제외합니다. 공식 콘텐츠 경고를 대신하지 않습니다.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {AVOID_TAGS.map((tag) => {
                const selected = avoidTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { touch(); setAvoidTags((current) => selected
                      ? current.filter((value) => value !== tag)
                      : [...current, tag]); }}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-bold transition-colors",
                      "pointer-coarse:min-h-11",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-warn/45 bg-warn/10 text-warn"
                        : "border-line bg-panel text-fg-2 hover:border-line-strong",
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-6">
            <h2 className="font-black text-fg">취향 스펙트럼이 완성됐어요</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-panel p-3">
                <dt className="text-xs font-bold text-fg-3">고른 장르</dt>
                <dd className="mt-1 font-bold text-fg">{selectedGenres.length > 0 ? selectedGenres.join(" · ") : "없음"}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-panel p-3">
                <dt className="text-xs font-bold text-fg-3">감상 강도</dt>
                <dd className="mt-1 font-bold text-fg">{intensityLabel}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-panel p-3">
                <dt className="text-xs font-bold text-fg-3">회피 태그</dt>
                <dd className="mt-1 font-bold text-fg">{avoidTags.length > 0 ? `${avoidTags.length}개` : "없음"}</dd>
              </div>
            </dl>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-semibold text-fg-3">선호 포맷</span>
                <div className="mt-2 flex gap-2">
                  {FORMAT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selectedFormat === option.value}
                      onClick={() => { touch(); setSelectedFormat(option.value); }}
                      className={cn(
                        "flex-1 rounded-xl border p-2.5 text-xs font-semibold transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        selectedFormat === option.value
                          ? "border-accent bg-accent-soft/30 text-accent"
                          : "border-line bg-panel text-fg-2 hover:border-line-strong",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs font-semibold text-fg-3">선호 상태</span>
                <div className="mt-2 flex gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selectedStatus === option.value}
                      onClick={() => { touch(); setSelectedStatus(option.value); }}
                      className={cn(
                        "flex-1 rounded-xl border p-2.5 text-xs font-semibold transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        selectedStatus === option.value
                          ? "border-accent bg-accent-soft/30 text-accent"
                          : "border-line bg-panel text-fg-2 hover:border-line-strong",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="mt-6 text-sm font-black text-fg">
              {recommendedTitles.matched > 0 ? "고른 장르로 골라 본 추천 작품" : "지금 인기 있는 작품"}
            </h3>
            {recommendedTitles.titles.length > 0 ? (
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                {recommendedTitles.titles.map((title) => (
                  <li key={title.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3">
                    <MiniPoster title={title} className="aspect-[3/4] w-12 shrink-0 rounded shadow-sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-fg">{title.title}</p>
                      <p className="mt-0.5 truncate text-xs text-fg-3">{title.author}</p>
                      <p className="mt-0.5 truncate text-xs text-fg-3">{title.genres.join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs leading-5 text-fg-3">
                작품 목록을 불러오지 못해 추천 미리보기를 건너뜁니다. 저장한 취향은 추천 화면에 그대로 반영됩니다.
              </p>
            )}
          </div>
        ) : null}

        {/* 단계 이동 */}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-line/60 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-4 text-sm font-bold text-fg-2 transition-colors hover:border-line-strong"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              이전
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/recommend")}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 text-sm font-bold text-fg-2 transition-colors hover:border-line-strong"
            >
              닫기
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 && selectedGenres.length < 2}
              onClick={() => setStep((current) => Math.min(4, current + 1))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 1 && selectedGenres.length < 2 ? "장르를 2개 이상 골라 주세요" : "다음"}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={complete}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
            >
              <Wand2 size={14} aria-hidden="true" />
              추천 화면으로 이동
            </button>
          )}
        </div>
      </section>
      </PageIntro>
    </Container>
  );
}

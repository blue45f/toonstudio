/**
 * 장르별 60컷 세로 스크롤 레이아웃 자동 골격 생성기 UI 패널 (Calm Atelier · ₩0 로컬).
 *
 * StudioEpisodeStoryPage(이야기·콘티 진입점)에서 지연 마운트되며,
 * 액션·로맨스·스릴러·일상 4대 장르의 기승전결 컷 골격을 즉시 생성·조정·반영한다.
 */
import { CheckCircle2, Copy, Download, Layers, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { EpisodePlanWithSynopsis } from "../planning/studio-episode-synopsis";
import {
  buildGenreSkeletonSvgPreview,
  deriveEpisodePlanTurningPoints,
  formatGenreSkeletonTextConti,
  GENRE_SKELETON_CUT_COUNT_PRESETS,
  GENRE_SKELETON_DEFAULT_CUTS,
  GENRE_SKELETON_DEFAULT_WIDTH_PX,
  GENRE_SKELETON_IDS,
  GENRE_SKELETON_MAX_CUTS,
  GENRE_SKELETON_MIN_CUTS,
  GENRE_SKELETON_PRESETS,
  GENRE_SKELETON_WIDTH_PRESETS,
  generateGenreScrollSkeleton,
  loadGenreSkeletonSettings,
  normalizeGenreSkeletonId,
  saveGenreSkeletonSettings,
  updateGenreSkeletonCut,
  type GenreSkeletonActId,
  type GenreSkeletonId,
  type GenreSkeletonPlan,
} from "./genre-skeleton-engine";

export interface StudioGenreSkeletonPanelProps {
  readonly projectId: string;
  readonly initialGenre?: string;
  readonly activeEpisodePlan?: EpisodePlanWithSynopsis | null;
  readonly onApplyToEpisodePlan?: (plan: EpisodePlanWithSynopsis) => boolean | void;
}

type CutFilterMode = "all" | GenreSkeletonActId | "fullbleed";

function downloadTextBlob(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudioGenreSkeletonPanel({
  projectId,
  initialGenre,
  activeEpisodePlan,
  onApplyToEpisodePlan,
}: StudioGenreSkeletonPanelProps) {
  const initialSettings = useMemo(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const saved = loadGenreSkeletonSettings(storage, projectId);
    if (saved) return saved;
    return {
      genre: normalizeGenreSkeletonId(initialGenre),
      targetCutCount: GENRE_SKELETON_DEFAULT_CUTS,
      canvasWidthPx: GENRE_SKELETON_DEFAULT_WIDTH_PX,
      includeCliffhanger: true,
    };
  }, [initialGenre, projectId]);

  const [genre, setGenre] = useState<GenreSkeletonId>(initialSettings.genre);
  const [targetCutCount, setTargetCutCount] = useState<number>(initialSettings.targetCutCount);
  const [canvasWidthPx, setCanvasWidthPx] = useState<number>(initialSettings.canvasWidthPx);
  const [includeCliffhanger, setIncludeCliffhanger] = useState<boolean>(
    initialSettings.includeCliffhanger,
  );
  const [cutOverrides, setCutOverrides] = useState<
    Readonly<Record<number, { readonly heightPx?: number; readonly gutterAfterPx?: number; readonly fullBleed?: boolean }>>
  >({});
  const [filterMode, setFilterMode] = useState<CutFilterMode>("all");
  const [selectedCutIndex, setSelectedCutIndex] = useState<number>(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    saveGenreSkeletonSettings(storage, projectId, {
      genre,
      targetCutCount,
      canvasWidthPx,
      includeCliffhanger,
    });
  }, [canvasWidthPx, genre, includeCliffhanger, projectId, targetCutCount]);

  const basePlan = useMemo<GenreSkeletonPlan>(
    () =>
      generateGenreScrollSkeleton({
        genre,
        targetCutCount,
        canvasWidthPx,
        episodeTitle: activeEpisodePlan?.title,
        episodeNumber: activeEpisodePlan?.episodeNumber ?? 1,
        includeCliffhanger,
      }),
    [
      activeEpisodePlan?.episodeNumber,
      activeEpisodePlan?.title,
      canvasWidthPx,
      genre,
      includeCliffhanger,
      targetCutCount,
    ],
  );

  const plan = useMemo<GenreSkeletonPlan>(() => {
    const entries = Object.entries(cutOverrides);
    if (entries.length === 0) return basePlan;
    return entries.reduce<GenreSkeletonPlan>((acc, [indexKey, patch]) => {
      const cutIndex = Number(indexKey);
      if (!Number.isFinite(cutIndex) || !patch) return acc;
      return updateGenreSkeletonCut(acc, cutIndex, patch);
    }, basePlan);
  }, [basePlan, cutOverrides]);

  const visibleCuts = useMemo(() => {
    if (filterMode === "all") return plan.cuts;
    if (filterMode === "fullbleed") return plan.cuts.filter((c) => c.fullBleed);
    return plan.cuts.filter((c) => c.act === filterMode);
  }, [filterMode, plan.cuts]);

  const selectedCut =
    plan.cuts.find((c) => c.index === selectedCutIndex) ?? plan.cuts[0] ?? null;

  const handleSelectGenre = (nextGenre: GenreSkeletonId) => {
    setGenre(nextGenre);
    setCutOverrides({});
    setSelectedCutIndex(1);
    setStatusMessage(
      `${GENRE_SKELETON_PRESETS[nextGenre].labelKo} ${targetCutCount}컷 세로 스크롤 골격을 새로 배치했어요.`,
    );
  };

  const handleCutCountChange = (nextCount: number) => {
    const clamped = Math.max(
      GENRE_SKELETON_MIN_CUTS,
      Math.min(GENRE_SKELETON_MAX_CUTS, Math.round(nextCount)),
    );
    setTargetCutCount(clamped);
    setCutOverrides({});
    if (selectedCutIndex > clamped) setSelectedCutIndex(clamped);
  };

  const handleCopyTextConti = async () => {
    const text = formatGenreSkeletonTextConti(plan);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatusMessage(`${plan.cutCount}컷 텍스트 콘티 골격을 클립보드에 복사했어요.`);
        return;
      }
    } catch {
      // 클립보드 차단 환경에서는 파일 다운로드로 폴백한다.
    }
    downloadTextBlob(
      `ep${plan.episodeNumber}-${plan.genre}-${plan.cutCount}cuts-conti.txt`,
      text,
      "text/plain;charset=utf-8",
    );
    setStatusMessage(`${plan.cutCount}컷 텍스트 콘티 파일을 기기에 저장했어요.`);
  };

  const handleDownloadSvgMap = () => {
    const svg = buildGenreSkeletonSvgPreview(plan, plan.cutCount);
    downloadTextBlob(
      `ep${plan.episodeNumber}-${plan.genre}-${plan.cutCount}cuts-rhythm-map.svg`,
      svg,
      "image/svg+xml;charset=utf-8",
    );
    setStatusMessage("세로 스크롤 리듬 맵 SVG를 저장했어요.");
  };

  const handleDownloadJson = () => {
    downloadTextBlob(
      `ep${plan.episodeNumber}-${plan.genre}-${plan.cutCount}cuts-skeleton.json`,
      JSON.stringify(plan, null, 2),
      "application/json;charset=utf-8",
    );
    setStatusMessage("장르 컷 골격 JSON을 기기에 저장했어요.");
  };

  const handleApplyToEpisode = () => {
    if (!activeEpisodePlan || !onApplyToEpisodePlan) return;
    const turningPoints = deriveEpisodePlanTurningPoints(plan);
    const mergedTurningPoints = [...turningPoints];
    const summaryPrefix = `[${plan.preset.labelKo} ${plan.cutCount}컷 · 총 ${plan.totalHeightPx.toLocaleString("ko-KR")}px] ${plan.preset.signatureRhythmKo}`;
    const nextSynopsis = activeEpisodePlan.synopsis?.trim()
      ? `${activeEpisodePlan.synopsis.trim()}\n\n${summaryPrefix}`
      : summaryPrefix;
    onApplyToEpisodePlan({
      ...activeEpisodePlan,
      synopsis: nextSynopsis,
      turningPoints: mergedTurningPoints,
    });
    setStatusMessage(
      `${activeEpisodePlan.episodeNumber}화 줄거리와 전환점에 ${plan.preset.labelKo} ${plan.cutCount}컷 골격을 반영했어요.`,
    );
  };

  return (
    <section
      aria-label="장르별 60컷 세로 스크롤 골격 생성기"
      data-testid="genre-skeleton-pro-panel"
      className="space-y-5 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <Layers size={14} aria-hidden="true" />
            세로 스크롤 콘티 골격 · ₩0 로컬
          </p>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            장르별 60컷 세로 스크롤 레이아웃 자동 골격 생성기
          </h2>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            장르와 목표 컷 수를 고르면 기승전결 호흡, 컷 높이·여백, 클라이맥스 전면 컷, 말풍선 안전영역을 즉시 배치합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="genre-skeleton-speed-badge"
            className="inline-flex min-h-11 items-center rounded-lg border border-good/35 bg-good/10 px-3 text-xs font-semibold tabular-nums text-good"
          >
            {plan.generatedInMs}ms 생성 · {plan.metrics.pacingTempoLabelKo}
          </span>
        </div>
      </header>

      {/* 1. 4대 장르 프리셋 선택 */}
      <div
        role="radiogroup"
        aria-label="웹툰 장르 프리셋"
        className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
      >
        {GENRE_SKELETON_IDS.map((id) => {
          const preset = GENRE_SKELETON_PRESETS[id];
          const selected = genre === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`genre-skeleton-preset-${id}`}
              onClick={() => handleSelectGenre(id)}
              className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-bold text-fg">{preset.labelKo}</span>
                <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-xs font-medium text-fg-2">
                  {preset.shortTagKo}
                </span>
              </div>
              <p className="text-xs leading-5 text-fg-2 [word-break:keep-all]">
                {preset.signatureRhythmKo}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2. 목표 컷 수 · 폭 · 엔딩 훅 조절 */}
      <div className="grid gap-4 rounded-xl border border-line bg-card p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="genre-skeleton-cut-range"
              className="text-xs font-semibold text-fg"
            >
              목표 컷 수 ({GENRE_SKELETON_MIN_CUTS}~{GENRE_SKELETON_MAX_CUTS}컷)
            </label>
            <span
              data-testid="genre-skeleton-cut-count-value"
              className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-bold tabular-nums text-accent"
            >
              {targetCutCount}컷
            </span>
          </div>
          <input
            id="genre-skeleton-cut-range"
            data-testid="genre-skeleton-cut-range"
            type="range"
            min={GENRE_SKELETON_MIN_CUTS}
            max={GENRE_SKELETON_MAX_CUTS}
            value={targetCutCount}
            onChange={(event) => handleCutCountChange(Number(event.target.value))}
            className="min-h-11 w-full cursor-pointer accent-[var(--color-accent)]"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="빠른 컷 수 프리셋">
            {GENRE_SKELETON_CUT_COUNT_PRESETS.map((count) => (
              <button
                key={count}
                type="button"
                data-testid={`genre-skeleton-cuts-${count}`}
                aria-pressed={targetCutCount === count}
                onClick={() => handleCutCountChange(count)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  targetCutCount === count
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
                }`}
              >
                {count}컷
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-line pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-fg">원고 가로 폭</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="원고 가로 폭 선택">
              {GENRE_SKELETON_WIDTH_PRESETS.map((width) => (
                <button
                  key={width}
                  type="button"
                  aria-pressed={canvasWidthPx === width}
                  onClick={() => setCanvasWidthPx(width)}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    canvasWidthPx === width
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {width}px
                </button>
              ))}
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg">
            <span>마지막 컷 엔딩 클리프행어 배치</span>
            <input
              type="checkbox"
              checked={includeCliffhanger}
              onChange={(event) => setIncludeCliffhanger(event.target.checked)}
              className="size-5 cursor-pointer accent-[var(--color-accent)]"
            />
          </label>
        </div>
      </div>

      {/* 3. 기승전결 4막 호흡 바 & 핵심 지표 */}
      <div className="space-y-3">
        <div
          aria-label="기승전결 막별 비율"
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {plan.acts.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => setFilterMode(filterMode === act.id ? "all" : act.id)}
              aria-pressed={filterMode === act.id}
              className={`flex min-h-11 flex-col gap-1 rounded-xl border p-3 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                filterMode === act.id
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-card hover:border-line-strong"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">{act.labelKo}</span>
                <span className="text-xs font-semibold tabular-nums text-accent">
                  #{act.startCutIndex}~{act.endCutIndex} ({act.cutCount}컷)
                </span>
              </div>
              <p className="text-xs text-fg-2 tabular-nums">
                평균 컷 {act.avgCutHeightPx}px · 여백 {act.avgGutterPx}px · 전면 {act.fullBleedCount}컷
              </p>
              <p className="text-xs leading-5 text-fg-3 [word-break:keep-all]">{act.intentKo}</p>
            </button>
          ))}
        </div>

        <dl
          data-testid="genre-skeleton-metrics"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="rounded-xl border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-fg-3">총 세로 길이</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">
              {plan.totalHeightPx.toLocaleString("ko-KR")} px
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-fg-3">모바일 스크롤</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">
              약 {plan.metrics.totalScrollScreens}화면 · {plan.estimatedReadSeconds}초
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-fg-3">클라이맥스 전면 컷</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-accent">
              {plan.metrics.fullBleedCount}컷 (#{plan.climaxCutIndices.join(", #") || "-"})
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-fg-3">평균 컷 / 여백</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">
              {plan.metrics.avgCutHeightPx}px / {plan.metrics.avgGutterPx}px
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-fg-3">말풍선 안전영역</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-good">
              총 {plan.metrics.bubbleZoneCount}박스 자동 배치
            </dd>
          </div>
        </dl>
      </div>

      {/* 4. 컷 리스트 필터 & 세로 스크롤 미리보기 + 선택 컷 미세 조정 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,1fr)]">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg">
              생성된 세로 스크롤 컷 골격 ({visibleCuts.length} / {plan.cutCount}컷)
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="컷 필터">
              {(
                [
                  { id: "all", label: "전체" },
                  { id: "fullbleed", label: "전면 컷만" },
                  { id: "jeon", label: "클라이맥스 막" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filterMode === item.id}
                  onClick={() => setFilterMode(item.id)}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    filterMode === item.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:text-fg"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <ol
            data-testid="genre-skeleton-cut-list"
            className="max-h-80 space-y-2 overflow-y-auto pr-1"
            aria-label="세로 스크롤 컷 목록"
          >
            {visibleCuts.map((cut) => {
              const isSelected = selectedCut?.index === cut.index;
              const previewBarHeightPx = Math.max(24, Math.min(76, Math.round(cut.heightPx / 30)));
              return (
                <li key={cut.index}>
                  <button
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setSelectedCutIndex(cut.index)}
                    className={`flex min-h-11 w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-panel hover:border-line-strong hover:bg-raised"
                    }`}
                  >
                    {/* 세로 비율 + 말풍선 안전영역 미니 와이어프레임 */}
                    <span
                      aria-hidden="true"
                      style={{ height: `${previewBarHeightPx}px` }}
                      className={`relative mt-0.5 flex w-10 shrink-0 flex-col justify-between overflow-hidden rounded border p-1 ${
                        cut.fullBleed
                          ? "border-accent bg-accent/15"
                          : "border-line-strong bg-canvas"
                      }`}
                    >
                      {cut.speechBubbleZones.map((zone) => (
                        <span
                          key={zone.id}
                          className="block h-2 w-6 rounded-sm border border-cool/70 bg-cool/25"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold tabular-nums text-accent">
                          #{String(cut.index).padStart(2, "0")}
                        </span>
                        <span className="text-xs font-bold text-fg">{cut.labelKo}</span>
                        {cut.fullBleed ? (
                          <span className="rounded-full border border-accent/45 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                            전면 컷
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-fg-2 tabular-nums">
                        높이 {cut.heightPx}px · 아래 여백 {cut.gutterAfterPx}px · 말풍선{" "}
                        {cut.speechBubbleZones.length}박스
                      </span>
                      <span className="block truncate text-xs text-fg-3">
                        {cut.recommendedShotKo}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 선택 컷 미세 조정 인스펙터 */}
        {selectedCut ? (
          <aside
            aria-label="선택 컷 호흡 조정"
            className="space-y-3 rounded-xl border border-line bg-card p-3.5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <SlidersHorizontal size={14} className="text-accent" aria-hidden="true" />
                #{selectedCut.index}컷 상세 · 말풍선 안전영역
              </h3>
              <span className="text-xs font-semibold tabular-nums text-fg-3">
                Y {selectedCut.yPx.toLocaleString("ko-KR")}px
              </span>
            </div>

            <p className="text-xs leading-5 text-fg-2 [word-break:keep-all]">
              {selectedCut.recommendedShotKo}
            </p>

            <div className="space-y-1">
              <label
                htmlFor="genre-skeleton-selected-height"
                className="flex justify-between text-xs font-semibold tabular-nums text-fg-2"
              >
                <span>컷 높이</span>
                <span className="text-fg">{selectedCut.heightPx}px</span>
              </label>
              <input
                id="genre-skeleton-selected-height"
                type="range"
                min={360}
                max={2600}
                step={20}
                value={selectedCut.heightPx}
                onChange={(event) => {
                  const nextHeight = Number(event.target.value);
                  setCutOverrides((prev) => ({
                    ...prev,
                    [selectedCut.index]: { ...prev[selectedCut.index], heightPx: nextHeight },
                  }));
                }}
                className="min-h-11 w-full cursor-pointer accent-[var(--color-accent)]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="genre-skeleton-selected-gutter"
                className="flex justify-between text-xs font-semibold tabular-nums text-fg-2"
              >
                <span>아래 컷 간 여백</span>
                <span className="text-fg">{selectedCut.gutterAfterPx}px</span>
              </label>
              <input
                id="genre-skeleton-selected-gutter"
                type="range"
                min={0}
                max={480}
                step={10}
                disabled={selectedCut.index === plan.cutCount}
                value={selectedCut.gutterAfterPx}
                onChange={(event) => {
                  const nextGutter = Number(event.target.value);
                  setCutOverrides((prev) => ({
                    ...prev,
                    [selectedCut.index]: { ...prev[selectedCut.index], gutterAfterPx: nextGutter },
                  }));
                }}
                className="min-h-11 w-full cursor-pointer accent-[var(--color-accent)] disabled:opacity-45"
              />
            </div>

            <div className="space-y-1.5 border-t border-line pt-2.5">
              <span className="block text-xs font-semibold text-fg">
                말풍선 안전영역 박스 ({selectedCut.speechBubbleZones.length}개)
              </span>
              <ul className="space-y-1.5">
                {selectedCut.speechBubbleZones.map((zone) => (
                  <li
                    key={zone.id}
                    className="rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg-2"
                  >
                    <p className="font-semibold text-fg">{zone.labelKo}</p>
                    <p className="mt-0.5 tabular-nums text-fg-3">
                      좌표 ({zone.xPx}, {zone.yPx}) · 크기 {zone.widthPx}×{zone.heightPx}px · 권장 ≤{" "}
                      {zone.maxCharsRecommended}자
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </div>

      {/* 5. 실행·내보내기 버튼 바 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {activeEpisodePlan && onApplyToEpisodePlan ? (
          <button
            type="button"
            data-testid="genre-skeleton-apply-episode-btn"
            onClick={handleApplyToEpisode}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            {activeEpisodePlan.episodeNumber}화 줄거리·전환점에 골격 반영
          </button>
        ) : null}
        <button
          type="button"
          data-testid="genre-skeleton-copy-conti-btn"
          onClick={() => void handleCopyTextConti()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Copy size={14} aria-hidden="true" />
          텍스트 콘티 복사
        </button>
        <button
          type="button"
          data-testid="genre-skeleton-download-svg-btn"
          onClick={handleDownloadSvgMap}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download size={14} aria-hidden="true" />
          리듬 맵 SVG 저장
        </button>
        <button
          type="button"
          data-testid="genre-skeleton-download-json-btn"
          onClick={handleDownloadJson}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download size={14} aria-hidden="true" />
          골격 JSON 저장
        </button>
      </div>

      {statusMessage ? (
        <p
          role="status"
          data-testid="genre-skeleton-status"
          className="rounded-lg border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-good"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}

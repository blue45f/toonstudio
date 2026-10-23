/**
 * Studio 마네킹 포저 — 통합 포즈 라이브러리(포즈 탭 본문).
 *
 * 웹툰 포즈 프리셋·데생 인형 전신 포즈·손 전용 포즈를 검색창 하나·출처 필터 하나로 합친다.
 * 예전에는 웹툰 프리셋 그리드와 포즈 라이브러리가 검색창·필터·10초 가이드를 따로 두었고
 * 검색 기준도 달라 같은 낱말에 서로 다른 결과가 나왔으며, 같은 포즈(손잡고 걷기·어깨에
 * 기대기·바닥 양반다리 …)가 두 번 보였다. 검색 기준과 중복 정리는
 * studio-pose-library-search가 정하고, 이 파일은 탐색 화면만 책임진다.
 *
 * 상태: 분류(selectedCategory)는 패널이 소유하고 props로 받는다(탭을 오가도 유지).
 * 검색어·출처·인원 필터와 즐겨찾기·최근 사용 표시는 이 섹션이 갖는다. 즐겨찾기는 출처별
 * 저장소(데생 인형·웹툰)를 그대로 써서 VRM 포저의 웹툰 그리드와 핀이 이어진다.
 */

import { FlipHorizontal2, PersonStanding, Pin, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { StudioSectionHeader, StudioToggleChip } from "../studio-panel-ui";
import {
  STUDIO_MANNEQUIN_POSE_CATEGORIES,
  type StudioMannequinPoseCategory,
} from "./studio-mannequin-poses";
import {
  clearMannequinPosePresetRecent,
  readMannequinPosePresetFavorites,
  readMannequinPosePresetRecent,
  recordMannequinPosePresetRecent,
  toggleMannequinPosePresetFavorite,
} from "./studio-mannequin-pose-preset-storage";
import {
  STUDIO_POSE_LIBRARY_SOURCES,
  countStudioPoseLibraryByCategory,
  countStudioPoseLibraryBySource,
  filterStudioPoseLibrary,
  getStudioPoseLibraryEntry,
  studioPoseLibraryEntryKey,
  type StudioPoseLibraryEntry,
  type StudioPoseLibrarySource,
} from "./studio-pose-library-search";
import {
  readWebtoonPosePresetFavorites,
  recordWebtoonPosePresetRecent,
  toggleWebtoonPosePresetFavorite,
} from "./studio-webtoon-pose-preset-storage";
import { StudioPoseFirstRunGuide } from "./StudioPoseFirstRunGuide";
import { StudioPoseLibraryCard } from "./StudioPoseLibraryCard";
import { StudioWebtoonPoseFavoritesShare } from "./StudioWebtoonPosePresetGrid";
import { buttonClass } from "@/shared/components/ui/button-utils";

type SourceFilter = StudioPoseLibrarySource | "all";
type FiguresFilter = 1 | 2 | "all";

/**
 * 최근 사용 목록은 데생 인형 최근 저장소 하나에 둔다. 데생 인형 포즈는 예전처럼 id 그대로,
 * 웹툰 프리셋은 `webtoon:<id>`로 적어 기존 기록을 잃지 않고 두 출처를 한 줄에 섞는다.
 */
function recentIdFor(entry: StudioPoseLibraryEntry): string {
  return entry.kind === "webtoon" ? entry.key : entry.presetId;
}

function entryForRecentId(id: string): StudioPoseLibraryEntry | undefined {
  return id.startsWith("webtoon:")
    ? getStudioPoseLibraryEntry(id)
    : getStudioPoseLibraryEntry(studioPoseLibraryEntryKey("mannequin", id));
}

function isEntry(entry: StudioPoseLibraryEntry | undefined): entry is StudioPoseLibraryEntry {
  return entry !== undefined;
}

const FIGURE_FILTERS: readonly { readonly id: FiguresFilter; readonly label: string }[] = [
  { id: "all", label: "전체" },
  { id: 1, label: "1인" },
  { id: 2, label: "2인" },
];

/** 분류 칩: 손 전용은 출처 칩('손')이 맡으므로 분류 줄에서는 뺀다. */
const BODY_CATEGORIES = STUDIO_MANNEQUIN_POSE_CATEGORIES.filter((meta) => meta.id !== "hand");

const SMALL_ACTION_CLASS =
  "rounded px-1.5 py-0.5 text-[0.64rem] text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:min-h-11 pointer-coarse:px-3";
const RECENT_CHIP_CLASS =
  "inline-flex max-w-full items-center gap-1 truncate rounded-full border border-accent/40 bg-accent-soft/30 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-accent-soft/60 disabled:opacity-50 pointer-coarse:min-h-11";

export interface StudioMannequinPoseSectionProps {
  readonly selectedCategory: StudioMannequinPoseCategory | "all";
  readonly onCategorySelect: (category: StudioMannequinPoseCategory | "all") => void;
  /** 데생 인형 라이브러리(전신·손) 프리셋 적용 — 호스트의 applyPosePreset. */
  readonly onApplyPreset: (presetId: string) => void;
  /** 웹툰 포즈 프리셋 적용 — 호스트의 applyWebtoonPosePreset. */
  readonly onApplyWebtoonPreset: (presetId: string) => void;
  /** 캡처 중처럼 포즈를 바꾸면 안 되는 동안 카드 적용을 막는다. */
  readonly applyDisabled?: boolean;
  readonly onMirror: () => void;
  readonly onResetJoints: () => void;
}

export function StudioMannequinPoseSection({
  selectedCategory,
  onCategorySelect,
  onApplyPreset,
  onApplyWebtoonPreset,
  applyDisabled = false,
  onMirror,
  onResetJoints,
}: StudioMannequinPoseSectionProps): ReactElement {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [figures, setFigures] = useState<FiguresFilter>("all");
  const [mannequinFavorites, setMannequinFavorites] = useState<string[]>(() =>
    readMannequinPosePresetFavorites(),
  );
  const [webtoonFavorites, setWebtoonFavorites] = useState<string[]>(() =>
    readWebtoonPosePresetFavorites(),
  );
  const [recent, setRecent] = useState<string[]>(() => readMannequinPosePresetRecent());
  const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const filtersActive = source !== "all" || selectedCategory !== "all" || figures !== "all";
  const isDefaultFilter = !filtersActive && trimmedQuery === "";

  const results = useMemo(
    () => filterStudioPoseLibrary({ source, category: selectedCategory, figures, query: trimmedQuery }),
    [source, selectedCategory, figures, trimmedQuery],
  );
  const sourceCounts = useMemo(
    () => countStudioPoseLibraryBySource({ category: selectedCategory, figures, query: trimmedQuery }),
    [selectedCategory, figures, trimmedQuery],
  );
  const categoryCounts = useMemo(
    () => countStudioPoseLibraryByCategory({ source, figures, query: trimmedQuery }),
    [source, figures, trimmedQuery],
  );

  const mannequinPinned = useMemo(() => new Set(mannequinFavorites), [mannequinFavorites]);
  const webtoonPinned = useMemo(() => new Set(webtoonFavorites), [webtoonFavorites]);
  const favoriteEntries = useMemo(
    () => [
      ...mannequinFavorites.map((id) => getStudioPoseLibraryEntry(studioPoseLibraryEntryKey("mannequin", id))),
      ...webtoonFavorites.map((id) => getStudioPoseLibraryEntry(studioPoseLibraryEntryKey("webtoon", id))),
    ].filter(isEntry),
    [mannequinFavorites, webtoonFavorites],
  );
  const recentEntries = useMemo(() => recent.map(entryForRecentId).filter(isEntry), [recent]);

  function isPinned(entry: StudioPoseLibraryEntry): boolean {
    return entry.kind === "webtoon" ? webtoonPinned.has(entry.presetId) : mannequinPinned.has(entry.presetId);
  }

  function handleApply(entry: StudioPoseLibraryEntry): void {
    if (applyDisabled) return;
    setLastAppliedKey(entry.key);
    setRecent(recordMannequinPosePresetRecent(recentIdFor(entry)));
    if (entry.kind === "webtoon") {
      // VRM 포저의 웹툰 그리드 '최근 사용'과도 이어지게 출처별 기록을 함께 남긴다.
      recordWebtoonPosePresetRecent(entry.presetId);
      onApplyWebtoonPreset(entry.presetId);
      return;
    }
    onApplyPreset(entry.presetId);
  }

  function handleTogglePin(entry: StudioPoseLibraryEntry): void {
    if (entry.kind === "webtoon") {
      setWebtoonFavorites(toggleWebtoonPosePresetFavorite(entry.presetId));
      return;
    }
    setMannequinFavorites(toggleMannequinPosePresetFavorite(entry.presetId));
  }

  function handleSourceChange(next: SourceFilter): void {
    setSource(next);
    // 손 포즈는 분류가 하나뿐이라 몸 분류 선택을 풀어 빈 결과로 떨어지지 않게 한다.
    if (next === "hand" && selectedCategory !== "all") onCategorySelect("all");
  }

  function handleResetFilters(): void {
    setSource("all");
    setFigures("all");
    onCategorySelect("all");
  }

  function handleClearRecent(): void {
    if (clearMannequinPosePresetRecent()) setRecent([]);
  }

  const lastApplied = lastAppliedKey ? getStudioPoseLibraryEntry(lastAppliedKey) : undefined;

  return (
    <div className="space-y-3" data-studio-pose-library="unified">
      <StudioPoseFirstRunGuide
        scope="mannequin-poser-pose"
        icon={PersonStanding}
        title="포즈 라이브러리 — 10초 가이드"
        steps={[
          {
            ko: "검색창 하나로 웹툰 프리셋·데생 인형·손 포즈를 함께 찾습니다. 카드를 누르면 바로 적용됩니다.",
            en: "Search webtoon, mannequin and hand poses in one box. Click a card to apply it.",
          },
          {
            ko: "출처 칩으로 웹툰 프리셋·데생 인형·손 포즈만 골라 볼 수 있습니다.",
            en: "Use the source chips to show only webtoon, mannequin or hand poses.",
          },
          {
            ko: "핀으로 즐겨찾기를 고정하고, 뷰포트에서 손·발 핸들을 드래그해 다듬으세요.",
            en: "Pin favorites, then refine by dragging the hand and foot handles in the viewport.",
          },
        ]}
      />
      <StudioSectionHeader
        title="포즈 라이브러리"
        description="웹툰 포즈 프리셋·데생 인형 포즈·손 포즈를 한곳에서 찾습니다. 실루엣은 실제 관절 각도에서 그린 미리보기입니다."
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMirror}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="포즈 좌우 반전"
            >
              <FlipHorizontal2 size={13} aria-hidden /> 미러
            </button>
            <button
              type="button"
              onClick={onResetJoints}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="모든 관절 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          </div>
        }
      />

      <div role="search" className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 200))}
          placeholder="포즈 검색 — 예: 주먹, 포옹, 검, 앉기"
          aria-label="포즈 라이브러리 검색"
          className="h-9 w-full rounded-lg border border-line bg-card pl-8 pr-9 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent pointer-coarse:h-11 pointer-coarse:pr-12"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:size-10"
          >
            <X size={13} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="포즈 출처">
          <span className="mr-1 text-[0.66rem] font-semibold text-fg-3">출처</span>
          <StudioToggleChip active={source === "all"} onClick={() => handleSourceChange("all")}>
            전체 {sourceCounts.all}
          </StudioToggleChip>
          {STUDIO_POSE_LIBRARY_SOURCES.map((meta) => (
            <StudioToggleChip
              key={meta.id}
              active={source === meta.id}
              onClick={() => handleSourceChange(meta.id)}
              title={meta.description}
            >
              {meta.label} {sourceCounts[meta.id]}
            </StudioToggleChip>
          ))}
        </div>
        {source !== "hand" ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="포즈 분류">
            <span className="mr-1 text-[0.66rem] font-semibold text-fg-3">분류</span>
            <StudioToggleChip active={selectedCategory === "all"} onClick={() => onCategorySelect("all")}>
              전체
            </StudioToggleChip>
            {BODY_CATEGORIES.filter(
              (meta) => categoryCounts[meta.id] > 0 || selectedCategory === meta.id,
            ).map((meta) => (
              <StudioToggleChip
                key={meta.id}
                active={selectedCategory === meta.id}
                onClick={() => onCategorySelect(meta.id)}
              >
                {meta.label} {categoryCounts[meta.id]}
              </StudioToggleChip>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="인원수">
          <span className="mr-1 text-[0.66rem] font-semibold text-fg-3">인원</span>
          {FIGURE_FILTERS.map((meta) => (
            <StudioToggleChip
              key={String(meta.id)}
              active={figures === meta.id}
              onClick={() => setFigures(meta.id)}
            >
              {meta.label}
            </StudioToggleChip>
          ))}
        </div>
      </div>

      {isDefaultFilter && recentEntries.length > 0 ? (
        <section aria-label="최근 사용한 포즈">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-[0.68rem] font-bold text-fg-2">최근 사용</h4>
            <button
              type="button"
              onClick={handleClearRecent}
              className={SMALL_ACTION_CLASS}
              title="최근 사용 목록 비우기"
            >
              지우기
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {recentEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                disabled={applyDisabled}
                onClick={() => handleApply(entry)}
                aria-label={`${entry.label} 포즈 적용`}
                title={`${entry.fullName} — 클릭하면 바로 적용`}
                className={RECENT_CHIP_CLASS}
              >
                <span className="truncate">{entry.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isDefaultFilter ? (
        <section aria-label="즐겨찾기 포즈">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
              <Pin size={11} aria-hidden className="text-accent" /> 즐겨찾기
            </h4>
            <StudioWebtoonPoseFavoritesShare
              favorites={webtoonFavorites}
              onFavoritesChange={setWebtoonFavorites}
              onMessage={setShareMessage}
              ariaPrefix="웹툰 즐겨찾기"
            />
          </div>
          {shareMessage ? (
            <p role="status" aria-live="polite" className="mb-1.5 rounded-lg border border-line bg-card/60 px-2 py-1.5 text-[0.68rem] text-fg-2">
              {shareMessage}
            </p>
          ) : null}
          {favoriteEntries.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5 sm:max-md:grid-cols-4">
              {favoriteEntries.map((entry) => (
                <StudioPoseLibraryCard
                  key={entry.key}
                  entry={entry}
                  pinned
                  disabled={applyDisabled}
                  onApply={handleApply}
                  onTogglePin={handleTogglePin}
                />
              ))}
            </div>
          ) : (
            <p className="text-[0.66rem] text-fg-3">카드의 핀을 누르면 자주 쓰는 포즈가 여기에 모입니다.</p>
          )}
        </section>
      ) : null}

      <p className="text-[0.66rem] text-fg-3" role="status">
        결과 {results.length}개
        {source === "hand" ? " — 손 포즈는 지금 몸 포즈를 그대로 두고 손 모양만 바꿉니다." : ""}
      </p>
      <div
        className="grid grid-cols-3 gap-1.5 sm:max-md:grid-cols-4"
        role="group"
        aria-label="포즈 라이브러리 결과"
      >
        {results.map((entry) => (
          <StudioPoseLibraryCard
            key={entry.key}
            entry={entry}
            pinned={isPinned(entry)}
            disabled={applyDisabled}
            onApply={handleApply}
            onTogglePin={handleTogglePin}
          />
        ))}
      </div>
      {results.length === 0 ? (
        <div className="space-y-1.5 rounded-xl border border-dashed border-line/60 bg-card/30 px-3 py-4 text-center">
          <p className="text-xs text-fg-3">검색 결과가 없습니다. 다른 단어로 검색해 보세요.</p>
          {filtersActive ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className={buttonClass({ size: "sm", variant: "outline", className: "text-[0.7rem]" })}
            >
              출처·분류·인원 필터 풀기
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[0.66rem] text-fg-3">
        {lastApplied
          ? `적용된 포즈: ${lastApplied.label} — 위 되돌리기 버튼으로 이전 포즈로 돌아갈 수 있습니다.`
          : "아직 적용된 포즈가 없습니다. 카드를 클릭해 보세요."}
      </p>
    </div>
  );
}

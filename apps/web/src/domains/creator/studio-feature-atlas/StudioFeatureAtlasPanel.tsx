/**
 * 툰스튜디오·드로잉 전체 기능 아틀라스 · 8대 차별화 기술·주변기기 쇼케이스 · 역할별 10분 인터랙티브 매뉴얼 허브 패널.
 *
 * - Props 없이 단독 렌더 가능하며 React Router에 의존하지 않는다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 리터럴 0건) · 브라우저 영구 저장소 비사용(순수 메모리 상태).
 * - 일상 한국어 중심으로 설명하며 번역투와 불필요한 개발자 전문용어를 배제한다.
 */

import {
  BookOpen,
  Compass,
  Keyboard,
  Layers,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  AtlasRoleManualSection,
  AtlasRouteLink,
  AtlasShortcutsAndFaqSection,
  type AtlasNavigate,
} from "./AtlasManualAndShortcutSections";
import {
  CREATOR_ROLE_MANUALS,
  computeOverallManualProgress,
  searchAtlasAndShortcuts,
  type CreatorRoleId,
} from "./interactive-manual-engine";
import {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  ATLAS_ENTRY_SCOPE_LABELS,
  STUDIO_FEATURE_AXES,
  getAtlasCatalogSummary,
  type FeatureAxisId,
} from "./studio-feature-catalog";

export type AtlasSectionTab = "showcase" | "atlas" | "manual" | "shortcuts";

export interface StudioFeatureAtlasPanelProps {
  readonly initialSection?: AtlasSectionTab;
  readonly initialRoleId?: CreatorRoleId;
  readonly initialAxisId?: FeatureAxisId | "all";
  readonly className?: string;
  readonly onNavigate?: AtlasNavigate;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const CHIP_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const CTA_PRIMARY = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 [word-break:keep-all] ${FOCUS_RING}`;

const QUICK_SEARCH_CHIPS: readonly string[] = [
  "마찰음",
  "물감 혼색",
  "헤어 이식",
  "WebHID",
  "권리 BOM",
  "Shift+T",
  "Alt+C",
];

function createEmptyCompletedMap(): Record<CreatorRoleId, readonly string[]> {
  return {
    "beginner-first-4cut": [],
    "webtoon-assistant": [],
    "director-3d-character-bg": [],
    "series-pd": [],
  };
}

/** 툰스튜디오 전체 기능 아틀라스 + 역할별 10분 실습 매뉴얼 + 8대 차별화 기술 쇼케이스 통합 패널. */
export function StudioFeatureAtlasPanel({
  initialSection = "showcase",
  initialRoleId = "beginner-first-4cut",
  initialAxisId = "all",
  className,
  onNavigate,
}: StudioFeatureAtlasPanelProps): ReactElement {
  const uid = useId();
  const [activeSection, setActiveSection] = useState<AtlasSectionTab>(initialSection);
  const [selectedAxisId, setSelectedAxisId] = useState<FeatureAxisId | "all">(initialAxisId);
  const [selectedRoleId, setSelectedRoleId] = useState<CreatorRoleId>(initialRoleId);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [completedByRole, setCompletedByRole] = useState<Record<CreatorRoleId, readonly string[]>>(
    () => createEmptyCompletedMap(),
  );

  const summary = useMemo(() => getAtlasCatalogSummary(), []);
  const overallProgress = useMemo(
    () => computeOverallManualProgress(completedByRole),
    [completedByRole],
  );
  const searchResults = useMemo(() => searchAtlasAndShortcuts(searchQuery), [searchQuery]);
  const isSearching = searchResults.normalizedQuery.length > 0;

  const visibleAxes = useMemo(
    () =>
      selectedAxisId === "all"
        ? STUDIO_FEATURE_AXES
        : STUDIO_FEATURE_AXES.filter((axis) => axis.id === selectedAxisId),
    [selectedAxisId],
  );

  const handleToggleStep = (roleId: CreatorRoleId, stepId: string): void => {
    setCompletedByRole((prev) => {
      const current = prev[roleId] ?? [];
      const next = current.includes(stepId)
        ? current.filter((id) => id !== stepId)
        : [...current, stepId];
      return { ...prev, [roleId]: next };
    });
  };

  const handleResetRole = (roleId: CreatorRoleId): void => {
    setCompletedByRole((prev) => ({ ...prev, [roleId]: [] }));
  };

  const sectionTabs: readonly {
    readonly id: AtlasSectionTab;
    readonly labelKo: string;
    readonly countText: string;
    readonly icon: ReactElement;
  }[] = [
    {
      id: "showcase",
      labelKo: "8대 차별화 기술·주변기기",
      countText: `${summary.differentiatorCount}종`,
      icon: <Sparkles size={15} aria-hidden />,
    },
    {
      id: "atlas",
      labelKo: "7대 기능 축 전체 맵",
      countText: `${summary.featureCount}개`,
      icon: <Layers size={15} aria-hidden />,
    },
    {
      id: "manual",
      labelKo: "역할별 10분 실습 매뉴얼",
      countText: `${overallProgress.completionPct}%`,
      icon: <BookOpen size={15} aria-hidden />,
    },
    {
      id: "shortcuts",
      labelKo: "단축키 · 빠른 해결 FAQ",
      countText: `${summary.shortcutCount}키`,
      icon: <Keyboard size={15} aria-hidden />,
    },
  ];

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      data-testid="studio-feature-atlas-panel"
      className={`space-y-5 rounded-2xl border border-line bg-canvas p-4 text-fg sm:p-6 ${className ?? ""}`}
    >
      {/* 상단 소개 및 통합 검색 */}
      <header className="space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Compass size={14} aria-hidden />
              <span>툰스튜디오 전체 기능 아틀라스 · 10분 실습 가이드</span>
            </p>
            <h2
              id={`${uid}-heading`}
              className="text-lg font-bold tracking-tight text-fg sm:text-xl [word-break:keep-all]"
            >
              그리기부터 3D·협업·출고까지, 화면과 실험 예제 안내
            </h2>
            <p className="text-xs leading-relaxed text-fg-2 sm:text-sm [word-break:keep-all]">
              {summary.axisCount}대 기능 축의 {summary.featureCount}개 소개 항목, {summary.differentiatorCount}개 기술·주변기기 카드,{" "}
              {CREATOR_ROLE_MANUALS.length}가지 역할별 실습 체크리스트를 모았습니다. 항목 수는 구현 완료 기능 수가 아니에요.
            </p>
            <p data-testid="atlas-scope-notice" className="text-xs text-fg-3 [word-break:keep-all]">
              독립 예제와 기존 화면 링크를 구분해 안내해요. 링크는 대표 화면으로 이동하며 소개된 예제의 실제 원고 연결을 보증하지 않아요.
              이미지는 소개용 삽화이며 현재 실행 화면이 아니에요. 실습 시간은 예상치이며 실제 성능을 측정한 값이 아니에요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AtlasRouteLink
              href="/studio/canvas"
              labelKo="캔버스 바로 열기"
              className={CTA_PRIMARY}
              onNavigate={onNavigate}
            />
            <AtlasRouteLink
              href="/compare/studio"
              labelKo="도구 6종 비교"
              onNavigate={onNavigate}
            />
          </div>
        </div>

        {/* 한국어 · 초성 · 단축키 통합 검색 */}
        <div className="space-y-2">
          <div className="relative">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <input
              id={`${uid}-search`}
              type="search"
              value={searchQuery}
              data-testid="atlas-unified-search-input"
              aria-label="기능·단축키·문제 해결 통합 검색"
              placeholder="궁금한 기능, 한글 초성(ㅁㅍㅅ·ㅅㄸ), 단축키(Shift+T·Alt+C)를 입력해 보세요"
              onChange={(event) => setSearchQuery(event.currentTarget.value.slice(0, 80))}
              className={`min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-11 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
            />
            {isSearching ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                data-testid="atlas-search-clear-btn"
                onClick={() => setSearchQuery("")}
                className={`absolute right-1 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg ${FOCUS_RING}`}
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" aria-label="자주 찾는 검색어">
            <span className="text-[0.72rem] font-semibold text-fg-3">바로 찾기:</span>
            {QUICK_SEARCH_CHIPS.map((keyword) => (
              <button
                key={keyword}
                type="button"
                data-testid={`atlas-quick-chip-${keyword}`}
                onClick={() => setSearchQuery(keyword)}
                className={`min-h-9 cursor-pointer rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg ${FOCUS_RING}`}
              >
                {keyword}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 통합 검색 결과 모드 */}
      {isSearching ? (
        <div className="space-y-5" data-testid="atlas-search-results">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-sm font-semibold text-fg tabular-nums" role="status">
              &ldquo;{searchQuery.trim()}&rdquo; 검색 결과 {searchResults.totalCount}건
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className={`${CHIP_BTN} border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg`}
            >
              전체 아틀라스로 돌아가기
            </button>
          </div>

          {searchResults.totalCount === 0 ? (
            <div className="rounded-xl border border-line bg-card p-6 text-center">
              <p className="text-sm font-semibold text-fg [word-break:keep-all]">
                일치하는 기능이나 단축키가 없습니다.
              </p>
              <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
                &ldquo;마찰음&rdquo;, &ldquo;물감 혼색&rdquo;, &ldquo;헤어 이식&rdquo;, &ldquo;WebHID&rdquo;, &ldquo;권리 BOM&rdquo;, &ldquo;Shift+T&rdquo; 같은 말로 다시 찾아보세요.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {searchResults.differentiators.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-fg-2 tabular-nums">
                    핵심 차별화 기술 ({searchResults.differentiators.length})
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {searchResults.differentiators.map((card) => (
                      <article
                        key={card.id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-4"
                      >
                        <div className="space-y-1.5">
                          <span className="text-[0.72rem] font-semibold text-accent">{card.badgeKo}</span>
                          <h4 className="text-sm font-bold text-fg [word-break:keep-all]">{card.titleKo}</h4>
                          <p className="text-xs font-semibold text-fg-3">{ATLAS_ENTRY_SCOPE_LABELS[card.scope]}</p>
                          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{card.summaryKo}</p>
                        </div>
                        <div>
                          <AtlasRouteLink href={card.route} labelKo={card.ctaLabelKo} onNavigate={onNavigate} />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {searchResults.features.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-fg-2 tabular-nums">
                    7대 축 세부 기능 ({searchResults.features.length})
                  </h3>
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {searchResults.features.map((feature) => (
                      <article
                        key={feature.id}
                        className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3.5"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2">
                              {feature.badgeKo}
                            </span>
                            {feature.shortcuts.map((key) => (
                              <kbd
                                key={key}
                                className="rounded border border-line-strong bg-panel px-1.5 py-0.5 text-[0.7rem] font-bold text-fg"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                          <h4 className="text-sm font-bold text-fg [word-break:keep-all]">{feature.titleKo}</h4>
                          <p className="text-xs font-semibold text-fg-3">{ATLAS_ENTRY_SCOPE_LABELS[feature.scope]}</p>
                          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{feature.summaryKo}</p>
                        </div>
                        <div>
                          <AtlasRouteLink href={feature.route} labelKo="관련 화면 안내" onNavigate={onNavigate} />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {searchResults.shortcuts.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-fg-2 tabular-nums">
                    단축키 ({searchResults.shortcuts.length})
                  </h3>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {searchResults.shortcuts.map((shortcut) => (
                      <div key={shortcut.id} className="rounded-xl border border-line bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-fg [word-break:keep-all]">{shortcut.actionKo}</span>
                          <kbd className="rounded border border-line-strong bg-raised px-2 py-0.5 text-xs font-bold text-fg">
                            {shortcut.keys}
                          </kbd>
                        </div>
                        <p className="mt-1.5 text-xs text-fg-2 [word-break:keep-all]">{shortcut.tipKo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {searchResults.faqs.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-fg-2 tabular-nums">
                    빠른 문제 해결 FAQ ({searchResults.faqs.length})
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {searchResults.faqs.map((faq) => (
                      <article key={faq.id} className="space-y-2 rounded-xl border border-line bg-card p-3.5">
                        <h4 className="text-xs font-bold text-fg [word-break:keep-all]">{faq.questionKo}</h4>
                        <ol className="list-decimal space-y-1 pl-4 text-xs text-fg-2 [word-break:keep-all]">
                          {faq.quickFixStepsKo.map((fix) => (
                            <li key={fix}>{fix}</li>
                          ))}
                        </ol>
                        <AtlasRouteLink href={faq.actionRoute} labelKo={faq.actionLabelKo} onNavigate={onNavigate} />
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 섹션 탭 내비게이션 */}
          <div
            role="tablist"
            aria-label="기능 아틀라스 보기 전환"
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {sectionTabs.map((tab) => {
              const selected = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${uid}-tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`${uid}-tabpanel-${tab.id}`}
                  data-testid={`atlas-tab-${tab.id}`}
                  onClick={() => setActiveSection(tab.id)}
                  className={`${TAB_BTN} ${
                    selected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.labelKo}</span>
                  <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.68rem] font-bold text-fg-2 tabular-nums">
                    {tab.countText}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 1. 8대 핵심 차별화 기술·주변기기 쇼케이스 */}
          {activeSection === "showcase" ? (
            <div
              id={`${uid}-tabpanel-showcase`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-showcase`}
              data-testid="atlas-showcase-section"
              className="grid gap-4 md:grid-cols-2"
            >
              {DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => (
                <article
                  key={card.id}
                  data-testid={`atlas-diff-card-${card.id}`}
                  className="flex flex-col overflow-hidden rounded-xl border border-line bg-card"
                >
                  <div className="relative overflow-hidden border-b border-line bg-raised">
                    <img
                      src={card.imageSrc}
                      alt={card.imageAltKo}
                      loading="lazy"
                      decoding="async"
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-3.5 p-4">
                    <div className="space-y-2">
                      <span className="inline-block rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[0.72rem] font-semibold text-accent">
                        {card.badgeKo}
                      </span>
                      <h3 className="text-base font-bold leading-snug text-fg [word-break:keep-all]">
                        {card.titleKo}
                      </h3>
                      <p data-testid={`atlas-scope-${card.id}`} className="text-xs font-semibold text-fg-3">
                        {ATLAS_ENTRY_SCOPE_LABELS[card.scope]}
                      </p>
                      <p className="text-xs font-semibold text-fg [word-break:keep-all]">
                        {card.headlineKo}
                      </p>
                      <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                        {card.summaryKo}
                      </p>
                      <p className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
                        살펴볼 점: {card.creatorBenefitKo}
                      </p>
                      <ul className="space-y-1 pt-0.5 text-xs text-fg-2 [word-break:keep-all]">
                        {card.specHighlightsKo.map((item) => (
                          <li key={item} className="flex items-start gap-1.5">
                            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="text-[0.72rem] font-medium text-fg-3">{card.route}</span>
                      <AtlasRouteLink
                        href={card.route}
                        labelKo={card.ctaLabelKo}
                        testId={`atlas-diff-link-${card.id}`}
                        onNavigate={onNavigate}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {/* 2. 7대 기능 축 전체 맵 + 필터 */}
          {activeSection === "atlas" ? (
            <div
              id={`${uid}-tabpanel-atlas`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-atlas`}
              data-testid="atlas-axes-section"
              className="space-y-4"
            >
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="7대 기능 축 필터">
                <button
                  type="button"
                  aria-pressed={selectedAxisId === "all"}
                  data-testid="atlas-axis-filter-all"
                  onClick={() => setSelectedAxisId("all")}
                  className={`${CHIP_BTN} ${
                    selectedAxisId === "all"
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  }`}
                >
                  전체 {STUDIO_FEATURE_AXES.length}대 축
                </button>
                {STUDIO_FEATURE_AXES.map((axis) => {
                  const active = selectedAxisId === axis.id;
                  return (
                    <button
                      key={axis.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`atlas-axis-filter-${axis.id}`}
                      onClick={() => setSelectedAxisId(axis.id)}
                      className={`${CHIP_BTN} ${
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                      }`}
                    >
                      <span className="tabular-nums">{axis.order}.</span>
                      <span>{axis.shortLabelKo}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                {visibleAxes.map((axis) => (
                  <article
                    key={axis.id}
                    data-testid={`atlas-axis-block-${axis.id}`}
                    className="space-y-3 rounded-xl border border-line bg-panel p-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[180px_1fr] md:items-center">
                      <div className="overflow-hidden rounded-lg border border-line bg-raised">
                        <img
                          src={axis.previewImageSrc}
                          alt={axis.previewImageAltKo}
                          loading="lazy"
                          decoding="async"
                          className="aspect-video w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-accent tabular-nums">
                            기능 축 0{axis.order}
                          </span>
                          <h3 className="text-base font-bold text-fg [word-break:keep-all]">
                            {axis.titleKo}
                          </h3>
                          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                            {axis.taglineKo}
                          </p>
                        </div>
                        <AtlasRouteLink
                          href={axis.primaryRoute}
                          labelKo="대표 화면 열기"
                          onNavigate={onNavigate}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2.5 md:grid-cols-2">
                      {axis.features.map((feature) => (
                        <div
                          key={feature.id}
                          className="flex flex-col justify-between gap-2.5 rounded-lg border border-line bg-card p-3.5"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2">
                                {feature.badgeKo}
                              </span>
                              {feature.shortcuts.map((key) => (
                                <kbd
                                  key={key}
                                  className="rounded border border-line-strong bg-panel px-1.5 py-0.5 text-[0.7rem] font-bold text-fg"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </div>
                            <h4 className="text-sm font-bold text-fg [word-break:keep-all]">
                              {feature.titleKo}
                            </h4>
                            <p className="text-xs font-semibold text-fg-3">{ATLAS_ENTRY_SCOPE_LABELS[feature.scope]}</p>
                            <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                              {feature.summaryKo}
                            </p>
                          </div>
                          <div>
                            <AtlasRouteLink
                              href={feature.route}
                              labelKo="관련 화면 안내"
                              onNavigate={onNavigate}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {/* 3. 역할별 10분 인터랙티브 실습 매뉴얼 */}
          {activeSection === "manual" ? (
            <div
              id={`${uid}-tabpanel-manual`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-manual`}
            >
              <AtlasRoleManualSection
                selectedRoleId={selectedRoleId}
                completedByRole={completedByRole}
                onSelectRole={setSelectedRoleId}
                onToggleStep={handleToggleStep}
                onResetRole={handleResetRole}
                onNavigate={onNavigate}
              />
            </div>
          ) : null}

          {/* 4. 단축키 치트시트 · 빠른 문제 해결 FAQ */}
          {activeSection === "shortcuts" ? (
            <div
              id={`${uid}-tabpanel-shortcuts`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-shortcuts`}
            >
              <AtlasShortcutsAndFaqSection onNavigate={onNavigate} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Heart,
  LayoutTemplate,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { useI18n } from "@/shared/lib/i18n";
import { type BilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_TEMPLATE_CATEGORIES,
  STUDIO_TEMPLATE_CATALOG,
  createStudioTemplateHandoff,
  defaultStudioTemplateValues,
  readStudioTemplateFavorites,
  searchStudioTemplates,
  studioTemplateStartHref,
  writeStudioTemplateFavorites,
  writeStudioTemplateHandoff,
  type StudioTemplateCatalogItem,
  type StudioTemplateCategory,
} from "../studio-template-catalog";
import { planStudioTemplateApplication } from "../studio-template-system";
import { StudioTemplateVisualPreview } from "./StudioTemplateVisualPreview";
import "./studio-illustrated-project-surfaces.css";


const CATEGORY_LABELS: Readonly<
  Record<StudioTemplateCategory, BilingualText>
> = {
  all: { ko: "전체", en: "All" },
  webtoon: { ko: "웹툰", en: "Webtoon" },
  illustration: { ko: "일러스트", en: "Illustration" },
  promotion: { ko: "표지·홍보", en: "Cover & promotion" },
  presentation: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "콘티", en: "Storyboard" },
};

function templateTitle(
  template: StudioTemplateCatalogItem,
  bt: (ko: string, en: string) => string,
): string {
  return bt(template.titleKo, template.titleEn);
}

function templateDescription(
  template: StudioTemplateCatalogItem,
  bt: (ko: string, en: string) => string,
): string {
  return bt(template.descriptionKo, template.descriptionEn);
}

function TemplatePreview({
  locale,
  template,
  favorite,
  onToggleFavorite,
}: {
  readonly locale: string;
  readonly template: StudioTemplateCatalogItem;
  readonly favorite: boolean;
  readonly onToggleFavorite: () => void;
}) {
  const bt = useBilingual("StudioTemplatesPage.preview");
  const plan = useMemo(
    () => planStudioTemplateApplication(
      template.definition,
      defaultStudioTemplateValues(template),
    ),
    [template],
  );
  const title = templateTitle(template, bt);
  const composition = template.definition.composition;
  const pageCount = composition?.pages.length ?? 0;
  const panelCount = composition?.pages.reduce(
    (total, page) => total + page.panelCount,
    0,
  ) ?? 0;
  const statusReady = plan.status === "ready";

  const prepareHandoff = () => {
    if (typeof window === "undefined") return;
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(template.id),
    );
  };

  return (
    <aside className="rounded-3xl border border-line bg-card p-5 shadow-sm lg:sticky lg:top-6 lg:self-start sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <LayoutTemplate size={22} aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={bt("즐겨찾기 전환", "Toggle favorite")}
          className={cn(
            "grid size-11 place-items-center rounded-xl border transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
            favorite
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-line bg-panel text-fg-3 hover:text-fg",
          )}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <StudioTemplateVisualPreview
        template={template}
        locale={locale}
        showNavigation
        className="mt-4"
      />
      <p className="mt-5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
        {bt(CATEGORY_LABELS[template.category].ko, CATEGORY_LABELS[template.category].en)}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-fg">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-fg-2">
        {templateDescription(template, bt)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {template.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
            {tag}
          </span>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {bt("페이지", "Pages")}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{pageCount}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {bt("컷·구성 영역", "Panels")}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{panelCount}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {bt("편집 슬롯", "Editable slots")}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{template.definition.slots.length}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-[0.65rem] font-semibold text-fg-3">
            {bt("레이어", "Layers")}
          </dt>
          <dd className="mt-1 text-sm font-black text-fg">{composition?.layerLabels.length ?? 0}</dd>
        </div>
      </dl>

      {composition ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-fg-3">
            {bt("출력·구조", "Output & structure")}
          </p>
          <p className="mt-1 text-sm font-black text-fg">
            {bt(composition.canvasLabelKo, composition.canvasLabelEn)}
          </p>
          <p className="mt-1 text-xs text-fg-3">
            {bt(`새 프로젝트 · 포함 에셋 ${composition.includedAssetCount}개`, `New project · ${composition.includedAssetCount} included assets`)}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {composition.layerLabels.slice(0, 8).map((label) => (
              <span key={label} className="rounded-full border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold text-fg-3">
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className={cn(
        "mt-4 flex items-start gap-3 rounded-xl border p-3",
        statusReady
          ? "border-success/30 bg-success-soft/15"
          : "border-warning/35 bg-warning-soft/15",
      )}>
        <CheckCircle2
          size={18}
          className={statusReady ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-warning"}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-black text-fg">
            {statusReady
              ? (bt("안전한 기본값으로 바로 시작할 수 있어요", "Ready with safe defaults"))
              : (bt("이미지 사용 조건을 시작 전에 확인해요", "Review image rights before starting"))}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {bt("미리보기와 같은 페이지·컷·레이어 구조를 새 프로젝트에 전달합니다. 원본 프로젝트는 변경하지 않습니다.", "The previewed pages, panels and layer structure are handed to a new project without changing originals.")}
          </p>
        </div>
      </div>

      <Link
        href={studioTemplateStartHref(template.id)}
        onClick={prepareHandoff}
        className={cn(
          "mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2",
        )}
      >
        {bt("이 템플릿으로 시작", "Start with this template")}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </aside>
  );
}

type TemplateSpecPreset =
  | "all"
  | "beginner"
  | "webtoon-scroll"
  | "shortform-square"
  | "print-page";

const SPEC_PRESETS: readonly {
  readonly id: TemplateSpecPreset;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "all", labelKo: "전체 규격", labelEn: "All specs" },
  { id: "beginner", labelKo: "입문 추천", labelEn: "Beginner picks" },
  { id: "webtoon-scroll", labelKo: "세로 스크롤 웹툰 (800px)", labelEn: "Vertical webtoon (800px)" },
  { id: "shortform-square", labelKo: "인스타툰·숏폼 (1:1)", labelEn: "Instatoon & short-form (1:1)" },
  { id: "print-page", labelKo: "출판·페이지 만화", labelEn: "Print & page manga" },
] as const;

function matchesSpecPreset(
  template: StudioTemplateCatalogItem,
  preset: TemplateSpecPreset,
): boolean {
  switch (preset) {
    case "all":
      return true;
    case "beginner":
      return template.difficulty === "easy";
    case "webtoon-scroll":
      return (
        template.category === "webtoon" &&
        !template.id.includes("four-panel")
      );
    case "shortform-square":
      return (
        template.id.includes("four-panel") ||
        template.category === "promotion" ||
        template.tags.some((tag) => tag.includes("4컷") || tag.includes("SNS"))
      );
    case "print-page":
      return (
        template.category === "storyboard" ||
        template.category === "presentation" ||
        template.category === "illustration"
      );
  }
}

/** 템플릿 레인(S2-6): 독립 시작 표면이 아니라 /create 시작 관문의 "템플릿에서" 레인이다.
 * URL(/studio/templates)은 유지하되, 관문으로 돌아가는 길을 상단에 두고 카드의
 * 주 행동을 "이 템플릿으로 시작"으로 삼는다(선택·구성 보기는 부수 행동). */
export function StudioTemplatesPage() {
  const bt = useBilingual("StudioTemplatesPage");
  const language = useI18n((state) => state.lang);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StudioTemplateCategory>("all");
  const [specPreset, setSpecPreset] = useState<TemplateSpecPreset>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState<string>(STUDIO_TEMPLATE_CATALOG[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFavoriteIds(readStudioTemplateFavorites(window.localStorage));
  }, []);

  const templates = useMemo(() => {
    const base = searchStudioTemplates({
      text: query,
      category,
      favoriteIds,
      favoritesOnly,
    });
    return base.filter((item) => matchesSpecPreset(item, specPreset));
  }, [category, favoriteIds, favoritesOnly, query, specPreset]);

  const selected = useMemo(() => (
    templates.find((template) => template.id === selectedId)
    ?? templates[0]
    ?? STUDIO_TEMPLATE_CATALOG.find((template) => template.id === selectedId)
    ?? STUDIO_TEMPLATE_CATALOG[0]
  ), [selectedId, templates]);

  // 카드 주 행동이 상세 패널과 같은 핸드오프를 준비한다 — 어느 쪽에서 눌러도 시작은 하나다.
  const prepareTemplateHandoff = (templateId: string) => {
    if (typeof window === "undefined") return;
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(templateId),
    );
  };

  // 필터가 없을 때만 첫 카드로 고정한다(F3.2) — 검색·즐겨찾기 결과에는 끼워 넣지 않는다.
  const showBlankCanvasCard =
    query === "" && category === "all" && specPreset === "all" && !favoritesOnly;

  const toggleFavorite = (templateId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId];
      if (typeof window === "undefined") return Object.freeze(next);
      return writeStudioTemplateFavorites(window.localStorage, next);
    });
  };

  return (
    <div data-studio-illustrated-surface="templates" className="min-h-[70vh] bg-canvas">
      <Container size="wide" className="py-8 sm:py-12">
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {bt("작품 시작하기로 돌아가기", "Back to start a work")}
        </Link>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
          {bt("템플릿은 시작 방법 중 하나예요. 이야기부터·콘티부터·빈 캔버스·가져오기는 시작 관문에서 고를 수 있어요.", "Templates are one way to start. Story-first, storyboard-first, blank canvas and import live in the start gateway.")}
        </p>
        {/* 머리글은 전체 폭으로 두어 테마의 우측 아트워크가 잘리지 않게 하고, 글 폭만 제한한다. */}
        <header className="flex gap-6">
          <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
            <Sparkles size={15} aria-hidden="true" /> TOONSTUDIO TEMPLATES
          </p>
          <h1 className="mt-3 max-w-4xl break-keep text-3xl font-black tracking-tight text-fg sm:text-5xl">
            {bt("무엇을 만들지 고르세요", "Choose what you want to make")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
            {bt("웹툰, 일러스트, 홍보물, 발표 자료와 콘티의 전문 구조를 미리 준비했습니다. 복잡한 규격과 기본 레이어는 ToonStudio가 정하고, 필요할 때만 세부 설정을 바꿀 수 있습니다.", "Professional structures for webtoons, illustration, promotion, presentations and storyboards are prepared in advance. ToonStudio chooses safe defaults while keeping expert controls available.")}
          </p>
          </div>
          <div className="hidden w-60 shrink-0 self-center lg:block xl:w-72" aria-hidden="true">
            <SectionArt image="explore" className="aspect-[16/10] w-full rounded-2xl border border-line object-cover" />
          </div>
        </header>

        <section className="mt-7 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-label={bt("템플릿 찾기", "Find templates")}>
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{bt("템플릿 검색", "Search templates")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={bt("웹툰, 피칭, 캐릭터 시트처럼 검색", "Search webtoon, pitch, character sheet…")}
              className="min-h-12 w-full rounded-xl border border-line bg-panel pl-10 pr-4 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {STUDIO_TEMPLATE_CATEGORIES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setCategory(candidate)}
                aria-pressed={candidate === category}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  candidate === category
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                )}
              >
                {bt(CATEGORY_LABELS[candidate].ko, CATEGORY_LABELS[candidate].en)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFavoritesOnly((current) => !current)}
              aria-pressed={favoritesOnly}
              className={cn(
                "ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                favoritesOnly
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg",
              )}
            >
              <Heart size={14} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" />
              {bt("즐겨찾기", "Favorites")}
            </button>
          </div>
          <div
            role="group"
            aria-label={bt("규격·목적별 빠른 필터", "Quick filters by spec and purpose")}
            className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-3"
          >
            <span className="mr-1 text-[0.7rem] font-bold text-fg-3">
              {bt("규격·목적 빠른 필터:", "Spec & purpose:")}
            </span>
            {SPEC_PRESETS.map((preset) => {
              const active = specPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSpecPreset(preset.id)}
                  aria-pressed={active}
                  data-template-spec-preset={preset.id}
                  className={cn(
                    "min-h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                  )}
                >
                  {bt(preset.labelKo, preset.labelEn)}
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-live="polite">
            <p className="mb-3 text-xs font-bold text-fg-3">
              {bt(`${templates.length}개 템플릿`, `${templates.length} templates`)}
            </p>
            {templates.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {showBlankCanvasCard ? (
                  <article className="group rounded-2xl border border-dashed border-accent/40 bg-card p-4 shadow-sm">
                    <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                      <Plus size={22} aria-hidden="true" />
                    </span>
                    <h2 className="mt-3 text-base font-black leading-6 text-fg">
                      {bt("빈 캔버스로 바로 시작", "Start with a blank canvas")}
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-fg-2">
                      {bt("구조가 정해진 템플릿 없이, 하얀 페이지에서 바로 그려 나가요.", "Skip the preset structure and draw on a blank page right away.")}
                    </p>
                    <Link
                      href="/studio/new"
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-black text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      {bt("빈 캔버스로 시작", "Start blank")}
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </article>
                ) : null}
                {templates.map((template) => {
                  const active = selected?.id === template.id;
                  const favorite = favoriteIds.includes(template.id);
                  return (
                    <article
                      key={template.id}
                      data-studio-template-selected={active}
                      className={cn(
                        "group rounded-2xl border bg-card p-4 shadow-sm transition",
                        active ? "border-accent/55 ring-2 ring-accent/15" : "border-line hover:border-accent/35",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(template.id)}
                        aria-label={`${templateTitle(template, bt)} ${bt("시각 미리보기", "visual preview")}`}
                        aria-pressed={active}
                        className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <StudioTemplateVisualPreview
                          template={template}
                          locale={language}
                          compact
                        />
                      </button>
                      <div className="mt-3 flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(template.id)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-none"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex rounded-full bg-accent-soft px-2 py-1 text-[0.6rem] font-black text-accent">
                              {bt(CATEGORY_LABELS[template.category].ko, CATEGORY_LABELS[template.category].en)}
                            </span>
                            {template.difficulty === "easy" ? (
                              <span className="inline-flex rounded-full border border-accent/30 bg-panel px-2 py-0.5 text-[0.6rem] font-bold text-accent">
                                {bt("입문 추천", "Beginner pick")}
                              </span>
                            ) : null}
                          </div>
                          <h2 className="mt-3 text-base font-black leading-6 text-fg">
                            {templateTitle(template, bt)}
                          </h2>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(template.id)}
                          aria-pressed={favorite}
                          aria-label={bt("즐겨찾기 전환", "Toggle favorite")}
                          className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-panel hover:text-accent max-sm:size-11 pointer-coarse:size-11"
                        >
                          <Heart size={15} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-fg-2">
                        {templateDescription(template, bt)}
                      </p>
                      {template.definition.composition ? (
                        <div className="mt-3 space-y-1.5 rounded-xl border border-line/70 bg-panel/70 p-2.5">
                          <p className="text-[0.68rem] font-bold text-fg">
                            {bt(
                              template.definition.composition.canvasLabelKo,
                              template.definition.composition.canvasLabelEn,
                            )}
                          </p>
                          <p className="text-[0.66rem] font-semibold text-fg-3">
                            {bt(
                              `${template.definition.composition.pages.length}페이지 · ${template.definition.composition.pages.reduce((total, page) => total + page.panelCount, 0)}컷·영역 · 편집 슬롯 ${template.definition.slots.length}`,
                              `${template.definition.composition.pages.length} pages · ${template.definition.composition.pages.reduce((total, page) => total + page.panelCount, 0)} panels · ${template.definition.slots.length} slots`,
                            )}
                          </p>
                          <p
                            data-template-layer-stack-badge="true"
                            className="inline-flex rounded-md bg-accent/10 px-2 py-0.5 text-[0.64rem] font-bold text-accent"
                          >
                            {bt(
                              "콘티 + 선화 + 밑색 + 말풍선 레이어 기본 포함",
                              "Includes storyboard + line + flat color + balloon layers",
                            )}
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-4 space-y-2">
                        <Link
                          href={studioTemplateStartHref(template.id)}
                          onClick={() => prepareTemplateHandoff(template.id)}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-black text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2"
                        >
                          {bt("이 템플릿으로 시작", "Start with this template")}
                          <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSelectedId(template.id)}
                          className="min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-fg"
                        >
                          {bt("구성 보기", "View structure")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center">
                <LayoutTemplate size={28} className="mx-auto text-fg-3" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-black text-fg">
                  {bt("조건에 맞는 템플릿이 없어요", "No matching templates")}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setSpecPreset("all");
                    setFavoritesOnly(false);
                  }}
                  className="mt-4 min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
                >
                  {bt("전체 템플릿 보기", "Show all templates")}
                </button>
              </div>
            )}
          </section>

          {selected ? (
            <TemplatePreview
              locale={language}
              template={selected}
              favorite={favoriteIds.includes(selected.id)}
              onToggleFavorite={() => toggleFavorite(selected.id)}
            />
          ) : null}
        </div>
      </Container>
    </div>
  );
}

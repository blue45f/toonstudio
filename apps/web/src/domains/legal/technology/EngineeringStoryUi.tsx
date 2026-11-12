import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Clock3,
  FlaskConical,
  LayoutGrid,
  Presentation,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_PAGES,
  ENGINEERING_PAGE_GROUPS,
  engineeringPageForPath,
  findEngineeringPage,
  type EngineeringPageEntry,
  type EngineeringPageId,
} from "./engineering-tech-pages";
import { ENGINEERING_STATUS_META, type EngineeringStatus } from "./engineering-story-content";

import Link from "@/shared/navigation/router-link";
import { usePathname } from "@/shared/navigation/navigation";
import { Container } from "@/shared/components/section";
import {
  WORKFLOW_VISUAL_COPY,
  workflowIllustrationSource,
  workflowIllustrationSources,
} from "@/shared/components/site-experience/workflow-illustration";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringStoryUi", ko, en);

/* ── 상태 배지 ─────────────────────────────────────────────── */

/** 상태 색은 테마의 의미 토큰(good/warn/bad/cool/accent)만 사용한다. 글자 라벨로도 상태를 전달한다. */
const STATUS_STYLES: Record<EngineeringStatus, string> = {
  live: "border-good/40 bg-good/12 text-good",
  configured: "border-accent/40 bg-accent-soft text-accent",
  experimental: "border-warn/40 bg-warn/12 text-warn",
  documented: "border-line-strong bg-raised text-fg-2",
  planned: "border-cool/40 bg-cool/12 text-cool",
  retired: "border-bad/40 bg-bad/12 text-bad",
  "reference-only": "border-line bg-card text-fg-3",
};

const STATUS_ICONS = {
  live: CheckCircle2,
  configured: CircleDot,
  experimental: FlaskConical,
  documented: BookOpen,
  planned: CircleDashed,
  retired: CircleDashed,
  "reference-only": CircleDot,
} as const;

export function EngineeringStatusBadge({
  status,
  className,
}: {
  readonly status: EngineeringStatus;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const Icon = STATUS_ICONS[status];
  const meta = ENGINEERING_STATUS_META[status];

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-display text-[0.66rem] font-bold",
        STATUS_STYLES[status],
        className,
      )}
      title={bi(meta.description.ko, meta.description.en)}
    >
      <Icon size={12} aria-hidden="true" />
      {bi(meta.label.ko, meta.label.en)}
    </span>
  );
}

/* ── 하위 탭 메뉴 ──────────────────────────────────────────── */

function StepMark({ step, active }: { readonly step: number; readonly active: boolean }) {
  return (
    <span
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-full font-display text-[0.7rem] font-black",
        active ? "bg-accent text-on-accent" : "bg-accent-soft text-accent",
      )}
      aria-hidden="true"
    >
      {step}
    </span>
  );
}

/**
 * 기술 소개 하위 메뉴. 큰 그림(번호 없음)·핵심(발표 동선 1~4)·발표(5)·자료로 묶고, 라벨은 항상 한 줄로 유지한다.
 * 좁은 화면에서는 가로로 넘겨 보며, 현재 항목이 보이도록 가로 위치만 맞춘다(세로 스크롤은 건드리지 않음).
 */
export function EngineeringTechNav({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  const pathname = usePathname();
  const current = engineeringPageForPath(pathname);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !active || scroller.scrollWidth <= scroller.clientWidth) return;
    const offset = active.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    scroller.scrollLeft = Math.max(0, offset - (scroller.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  return (
    <nav
      aria-label={bi("기술 문서 메뉴", "Engineering documents")}
      className={cx("relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-r from-accent/8 via-panel/85 to-card/90 shadow-sm backdrop-blur-xl", className)}
    >
      <div aria-hidden="true" className="h-0.5 w-full bg-gradient-to-r from-accent via-cool to-accent-2" />
      <div ref={scrollerRef} className="flex snap-x gap-1 overflow-x-auto overscroll-x-contain p-2 [scrollbar-width:thin]">
        {ENGINEERING_PAGE_GROUPS.map((group, groupIndex) => {
          const pages = ENGINEERING_PAGES.filter((page) => page.group === group.id);
          const labelId = `engineering-nav-group-${group.id}`;
          return (
            <div
              key={group.id}
              role="group"
              aria-labelledby={labelId}
              className={cx("flex shrink-0 items-center gap-1", groupIndex > 0 && "border-l border-line/70 pl-2")}
            >
              <span id={labelId} className="px-2 font-display text-[0.68rem] font-black uppercase tracking-[0.12em] text-fg-3">
                {bi(group.label.ko, group.label.en)}
              </span>
              {pages.map((page) => {
                const active = current?.id === page.id;
                const Icon = page.icon;
                return (
                  <Link
                    key={page.id}
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group inline-flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-2xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent/45 bg-card text-fg shadow-sm"
                        : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
                    )}
                  >
                    {"step" in page ? (
                      <StepMark step={page.step} active={active} />
                    ) : (
                      <Icon size={15} aria-hidden="true" className={active ? "text-accent" : "text-fg-3 group-hover:text-accent"} />
                    )}
                    {bi(page.label.ko, page.label.en)}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/* ── 좌측 고정 아틀라스 목차(시안 P) & 모바일 접이식 목차(모바일 시안 M4) ── */

function AtlasTocGroups({ currentId }: { readonly currentId: EngineeringPageId }) {
  return (
    <div className="space-y-3">
      {ENGINEERING_PAGE_GROUPS.map((group) => {
        const pages = ENGINEERING_PAGES.filter((page) => page.group === group.id);
        return (
          <div key={group.id}>
            <p className="px-2 font-display text-[0.65rem] font-black uppercase tracking-[0.12em] text-fg-3">
              {bi(group.label.ko, group.label.en)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {pages.map((page) => {
                const active = page.id === currentId;
                const Icon = page.icon;
                return (
                  <li key={page.id}>
                    <Link
                      href={page.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        active
                          ? "bg-accent-soft text-accent"
                          : "text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                    >
                      {"step" in page ? (
                        <StepMark step={page.step} active={active} />
                      ) : (
                        <Icon size={14} aria-hidden="true" className={active ? "text-accent" : "text-fg-3"} />
                      )}
                      <span className="truncate">{bi(page.label.ko, page.label.en)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function EngineeringAtlasSideToc({ currentId }: { readonly currentId: EngineeringPageId }) {
  useBilingualI18nRevision();
  const current = findEngineeringPage(currentId);
  return (
    <>
      <details
        data-testid="engineering-atlas-mobile-toc"
        className="group relative mt-3 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/8 via-panel/85 to-card xl:hidden"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-accent-2" />
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-xs font-bold text-fg [&::-webkit-details-marker]:hidden">
          <span className="truncate">
            {bi("기술 아틀라스 12종 목차", "12-Part Engineering Atlas")}
            {current ? ` · ${bi(current.label.ko, current.label.en)}` : ""}
          </span>
          <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-fg-3 transition-transform group-open:rotate-180" />
        </summary>
        <nav
          aria-label={bi("모바일 기술 아틀라스 목차", "Mobile engineering atlas index")}
          className="border-t border-line/60 p-2.5"
        >
          <AtlasTocGroups currentId={currentId} />
        </nav>
      </details>

      <aside
        data-testid="engineering-atlas-sticky-toc"
        aria-label={bi("기술 아틀라스 12종 목차", "12-Part Engineering Atlas index")}
        className="hidden xl:sticky xl:top-24 xl:block xl:self-start xl:overflow-hidden xl:rounded-2xl xl:border xl:border-accent/25 xl:bg-gradient-to-b xl:from-accent/8 xl:via-panel/85 xl:to-card/90 xl:shadow-xs"
      >
        <div aria-hidden="true" className="h-0.5 w-full bg-gradient-to-r from-accent via-cool to-accent-2" />
        <div className="p-3">
          <AtlasTocGroups currentId={currentId} />
        </div>
      </aside>
    </>
  );
}

/** 도감 검색을 가리지 않도록 중복 문서 메뉴를 한 곳에 모으되 기존 링크와 선택 상태를 유지한다. */
function EngineeringCatalogMenu({ currentId }: { readonly currentId: EngineeringPageId }) {
  useBilingualI18nRevision();
  const current = findEngineeringPage(currentId);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // summary의 네이티브 키 동작은 그대로 두고, 열린 메뉴 내부 Escape만 보완한다.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.querySelector("summary")?.focus({ preventScroll: true });
    };
    menu.addEventListener("keydown", closeOnEscape);
    return () => menu.removeEventListener("keydown", closeOnEscape);
  }, []);
  return (
    <details ref={menuRef} className="group rounded-2xl border border-line/70 bg-panel/70 print:hidden" data-engineering-catalog-menu="">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span>{bi("기술 문서 메뉴·목차", "Documents & index")}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-2">
          {current ? bi(current.label.ko, current.label.en) : null}
          <ChevronDown size={15} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      <div className="max-h-[min(65dvh,28rem)] overflow-y-auto overscroll-contain border-t border-line/70 p-3">
        <AboutSectionNav variant="compact" />
        <nav aria-label={bi("기술 문서 목차", "Engineering document index")} className="mt-4">
          <AtlasTocGroups currentId={currentId} />
        </nav>
      </div>
    </details>
  );
}

/* ── 페이지 머리말 ─────────────────────────────────────────── */

function PageMeta({ page }: { readonly page: EngineeringPageEntry }) {
  if (page.readingMinutes) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Clock3 size={13} aria-hidden="true" />
        {formatI18nTemplate(String(bi("읽기 약 {value0}분", "About {value0} min read")), { value0: page.readingMinutes })}
      </span>
    );
  }
  if (page.talkMinutes) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Presentation size={13} aria-hidden="true" />
        {formatI18nTemplate(String(bi("발표 {value0}분", "{value0}-minute talk")), { value0: page.talkMinutes })}
      </span>
    );
  }
  return null;
}

/** 레지스트리 순서 기준 다음 페이지. 마지막 페이지에는 없다(그때는 기술 허브로 이어진다). */
function nextEngineeringPage(id: EngineeringPageId): EngineeringPageEntry | undefined {
  const index = ENGINEERING_PAGES.findIndex((page) => page.id === id);
  return index >= 0 ? ENGINEERING_PAGES[index + 1] : undefined;
}

/**
 * 머리말 안내 줄: 이 페이지가 답하는 질문 · 이런 분께 · 다음에 읽을 것.
 * 질문과 대상은 레지스트리의 선택 필드에서 오고, 다음 페이지는 하단 이어보기와 같은 순서(레지스트리 순서)를 따른다.
 */
function PageGuide({ page }: { readonly page: EngineeringPageEntry }) {
  const next = nextEngineeringPage(page.id);
  if (!page.question && !page.audience) return null;
  const labelClass = "text-[0.7rem] font-black uppercase tracking-[0.06em] text-fg-3";
  return (
    <dl className="mt-6 grid max-w-3xl gap-x-6 gap-y-2 rounded-2xl border border-line/70 bg-panel/55 px-4 py-3.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-3">
      {page.question ? (
        <>
          <dt className={labelClass}>{bi("이 페이지가 답하는 질문", "Question this page answers")}</dt>
          <dd className="font-bold leading-6 text-fg">{bi(page.question.ko, page.question.en)}</dd>
        </>
      ) : null}
      {page.audience ? (
        <>
          <dt className={labelClass}>{bi("이런 분께", "Who it is for")}</dt>
          <dd className="leading-6 text-fg-2">{bi(page.audience.ko, page.audience.en)}</dd>
        </>
      ) : null}
      <dt className={labelClass}>{bi("다음에 읽을 것", "Read next")}</dt>
      <dd className="leading-6 text-fg-2">
        <Link
          href={next ? next.href : "/about/technology"}
          className="inline-flex items-center gap-1.5 font-black text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {next ? bi(next.label.ko, next.label.en) : bi("기술 허브로 돌아가 다른 길 고르기", "Back to the hub to pick another route")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        {next ? <span className="ml-2 text-xs text-fg-3">{bi(next.purpose.ko, next.purpose.en)}</span> : null}
      </dd>
    </dl>
  );
}

/**
 * 머리말 맨 위의 페이지 대표 장면 (마스트헤드). /about/data에서 검증된 장면 헤더 문법
 * (디자인 웨이브 21 전파): 전폭 장면 밴드가 첫 화면을 열고, 제목·소개는 그 아래 종속된다.
 * 레지스트리에 매핑된 기존 브랜드 아트(workflow-20260928)를 쓴다.
 * 원본 아트 로드가 실패하면 같은 세트의 대체 아트(illustrated-20260928)로 바꾸고,
 * 그것도 실패하면 깨진 이미지를 남기지 않고 자리를 접는다.
 */
function EngineeringPageHeroArt({ page }: { readonly page: EngineeringPageEntry }) {
  useBilingualI18nRevision();
  const [stage, setStage] = useState<"workflow" | "fallback" | "gone">("workflow");
  if (stage === "gone") return null;
  const copy = WORKFLOW_VISUAL_COPY[page.art];
  const korean = getActiveI18nLocale().startsWith("ko");
  const fallback = stage === "fallback";
  return (
    <figure className="relative m-0 overflow-hidden rounded-[2rem] border border-line/70 bg-panel shadow-sm">
      <img
        src={fallback ? `/brand/illustrated-20260928/${copy.fallback}-640.webp` : workflowIllustrationSource(page.art)}
        srcSet={fallback ? undefined : workflowIllustrationSources(page.art)}
        sizes="(max-width: 767px) 100vw, 1152px"
        width={960}
        height={600}
        alt={fallback ? bi("작업을 설명하는 브랜드 콘셉트 아트", "Brand concept art illustrating the task") : korean ? copy.ko : copy.en}
        className="aspect-[16/10] w-full object-cover sm:aspect-[3/1]"
        fetchPriority="high"
        decoding="async"
        onError={() => setStage(fallback ? "gone" : "fallback")}
      />
      <figcaption className="absolute bottom-3 left-3 rounded-full bg-canvas/75 px-2.5 py-1 text-[0.65rem] font-semibold text-fg backdrop-blur-sm">
        {bi("브랜드 콘셉트 아트 · 실제 화면이 아닙니다", "Brand concept art · not an actual screen")}
      </figcaption>
    </figure>
  );
}

export function EngineeringPageIntro({
  eyebrow,
  title,
  description,
  aside,
  pageId,
  variant = "document",
}: {
  readonly variant?: "document" | "catalog";
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly aside?: ReactNode;
  /**
   * 지정하면 레지스트리 항목에서 발표 동선 단계·읽기 시간과 함께
   * "이 페이지가 답하는 질문 · 이런 분께 · 다음에 읽을 것" 안내 줄을 보여준다.
   */
  readonly pageId?: EngineeringPageId;
}) {
  useBilingualI18nRevision();
  const page = pageId ? findEngineeringPage(pageId) : undefined;
  const group = page ? ENGINEERING_PAGE_GROUPS.find((entry) => entry.id === page.group) : undefined;
  // 레지스트리 머리말의 안내·정체성은 유지하고, 별도 안내가 없는 도감 검색 화면만 압축한다.
  if (variant === "catalog" && !page) {
    return (
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-4 sm:py-5">
        <div className="min-w-0">
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h1 className="mt-1 text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">{title}</h1>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
        <p className="col-span-full max-w-3xl text-sm leading-6 text-fg-2">{description}</p>
      </header>
    );
  }
  return (
    <header className="flex flex-col gap-7 py-8 sm:py-12">
      {page ? <EngineeringPageHeroArt page={page} /> : null}
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {page?.step ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
              {formatI18nTemplate(String(bi("발표 동선 {value0}/5", "Talk path {value0}/5")), { value0: page.step })}
            </span>
          ) : page && group ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised px-2.5 py-1 text-xs font-black text-fg-2">
              {bi(`${group.label.ko} · ${page.label.ko}`, `${group.label.en} · ${page.label.en}`)}
            </span>
          ) : null}
          <p className="eyebrow text-accent">{eyebrow}</p>
        </div>
        <h1 className="mt-4 max-w-4xl text-balance break-keep text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">{description}</p>
        {page ? <PageGuide page={page} /> : null}
        {page ? (
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-fg-3">
            <PageMeta page={page} />
            <span>{bi(page.purpose.ko, page.purpose.en)}</span>
          </p>
        ) : null}
      </div>
      {aside ? <div className="lg:max-w-sm">{aside}</div> : null}
      </div>
    </header>
  );
}

/* ── 하단 이어보기 ─────────────────────────────────────────── */

function PagerCard({
  page,
  direction,
}: {
  readonly page: EngineeringPageEntry;
  readonly direction: "previous" | "next";
}) {
  const Icon = page.icon;
  const next = direction === "next";
  return (
    <Link
      href={page.href}
      className={cx(
        "group flex min-h-24 flex-col justify-center gap-1.5 rounded-3xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        next
          ? "border-accent/40 bg-accent-soft/25 text-right hover:border-accent sm:items-end"
          : "border-line/70 bg-card/60 hover:border-accent/40",
      )}
    >
      <span className={cx("inline-flex items-center gap-2 text-xs font-bold text-fg-3", next && "sm:flex-row-reverse")}>
        {next ? <ArrowRight size={14} aria-hidden="true" /> : <ArrowLeft size={14} aria-hidden="true" />}
        {next ? bi("다음 글", "Next article") : bi("이전 글", "Previous article")}
      </span>
      <span className={cx("inline-flex items-center gap-2 text-lg font-black text-fg group-hover:text-accent", next && "sm:flex-row-reverse")}>
        {page.step ? <StepMark step={page.step} active={next} /> : <Icon size={18} aria-hidden="true" />}
        {bi(page.label.ko, page.label.en)}
      </span>
      <span className="text-sm leading-6 text-fg-2">{bi(page.purpose.ko, page.purpose.en)}</span>
    </Link>
  );
}

/**
 * 전체 읽기 순서(레지스트리 배열 순서) 기준 이전·다음 글 카드.
 * 발표 동선 밖의 자료 페이지(영상·참고 자료·용어집·라이선스)도 실제 앞뒤 글을 받는다.
 * 순서의 처음에는 이전 글 대신, 끝에는 다음 글 대신 기술 허브 카드를 둔다.
 */
function EngineeringPathPager({ current, className }: { readonly current: EngineeringPageId; readonly className?: string }) {
  useBilingualI18nRevision();
  const index = ENGINEERING_PAGES.findIndex((page) => page.id === current);
  const previous = index > 0 ? ENGINEERING_PAGES[index - 1] : undefined;
  const next = index >= 0 && index < ENGINEERING_PAGES.length - 1 ? ENGINEERING_PAGES[index + 1] : undefined;

  return (
    <nav aria-label={bi("기술 문서 이어보기", "Continue through the engineering documents")} className={cx("mt-14 grid gap-3 sm:grid-cols-2", className)}>
      {previous ? <PagerCard page={previous} direction="previous" /> : <HubCard />}
      {next ? <PagerCard page={next} direction="next" /> : <HubCard alignEnd />}
    </nav>
  );
}

/** 기술 허브로 돌아가는 카드. 동선의 처음(이전 없음)과 끝(다음 없음)에 둔다. */
function HubCard({ alignEnd = false }: { readonly alignEnd?: boolean }) {
  return (
    <Link
      href="/about/technology"
      className={cx(
        "group flex min-h-24 flex-col justify-center gap-1.5 rounded-3xl border border-line/70 bg-card/60 p-5 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        alignEnd && "sm:items-end sm:text-right",
      )}
    >
      <span className="inline-flex items-center gap-2 text-xs font-bold text-fg-3">
        <LayoutGrid size={14} aria-hidden="true" />
        {bi("기술 허브", "Engineering hub")}
      </span>
      <span className="text-lg font-black text-fg group-hover:text-accent">{bi("읽는 길 한눈에 보기", "See every reading route")}</span>
      <span className="text-sm leading-6 text-fg-2">{bi("큰 그림 두 해설, 발표 동선 다섯 단계, 찾아보기 도구를 한 화면에서 고릅니다.", "Pick a big-picture guide, one of the five talk-path steps or a look-up tool on one screen.")}</span>
    </Link>
  );
}

/* ── 공통 페이지 틀 ────────────────────────────────────────── */

/** 기술 하위 페이지 공통 틀: 소개 메뉴(간결형) → 기술 메뉴 → 좌측 고정 목차(시안 P) + 본문 → 이어보기. */
export function EngineeringPageFrame({
  pageId,
  children,
  className,
  pager = true,
  variant = "document",
}: {
  /** 도감만 중복 메뉴를 접어 검색과 결과를 먼저 보여준다. 문서 기본 배치는 유지한다. */
  readonly variant?: "document" | "catalog";
  readonly pageId: EngineeringPageId;
  readonly children: ReactNode;
  readonly className?: string;
  readonly pager?: boolean;
}) {
  if (variant === "catalog") {
    return (
      <Container size="wide" className={cx("py-3 sm:py-5", className)}>
        <EngineeringCatalogMenu currentId={pageId} />
        <div className="min-w-0">
          {children}
          {pager ? <EngineeringPathPager current={pageId} /> : null}
        </div>
      </Container>
    );
  }
  return (
    <Container size="wide" className={cx("py-6 sm:py-8 lg:py-10", className)}>
      <AboutSectionNav variant="compact" />
      <EngineeringTechNav className="mt-2" />
      <div className="xl:mt-4 xl:grid xl:grid-cols-[14.5rem_minmax(0,1fr)] xl:items-start xl:gap-8">
        <EngineeringAtlasSideToc currentId={pageId} />
        <div className="min-w-0">
          {children}
          {pager ? <EngineeringPathPager current={pageId} /> : null}
        </div>
      </div>
    </Container>
  );
}

import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision, formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  Clock3,
  Database,
  Play,
  Presentation,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";
import { EngineeringArchitectureDiagram } from "./technology/EngineeringArchitectureDiagram";
import { BLUEPRINT_GRID_STYLE } from "./technology/engineering-blueprint";
import { EngineeringChapterLibrary } from "./technology/EngineeringChapterLibrary";
import { EngineeringHubStatusStrip } from "./technology/EngineeringHubStatusStrip";
import {
  ENGINEERING_STATUS_META,
  type EngineeringStatus,
} from "./technology/engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS as ENGINEERING_CHAPTERS } from "./technology/engineering-story-published-content";
import {
  ENGINEERING_PAGES,
  ENGINEERING_PATH_PAGES,
  findEngineeringPage,
  type EngineeringPageEntry,
} from "./technology/engineering-tech-pages";
import {
  EngineeringStatusBadge,
  EngineeringTechNav,
} from "./technology/EngineeringStoryUi";
import { TechnologyStackShowcase } from "./technology/TechnologyStackShowcase";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("TechnologyPage", ko, en);

const STATIC_SCOPE = "domains.legal.TechnologyPage";

const SHOWN_STATUSES = ["live", "configured", "experimental", "documented"] as const satisfies readonly EngineeringStatus[];

/** 도서관 머리말의 전체 읽기 시간. 제작 스토리 페이지 항목에 고정된 공표값을 그대로 쓴다. */
const STORY_READING_MINUTES = findEngineeringPage("story").readingMinutes ?? 0;

const RESOURCE_PAGES: readonly EngineeringPageEntry[] = ENGINEERING_PAGES.filter(
  (page) => page.group === "resources" || page.id === "videos",
);

function pageMeta(page: EngineeringPageEntry): string {
  if (page.readingMinutes) {
    return formatI18nTemplate(String(bi("읽기 약 {value0}분", "About {value0} min read")), { value0: page.readingMinutes });
  }
  if (page.talkMinutes) {
    return formatI18nTemplate(String(bi("발표 {value0}분", "{value0}-minute talk")), { value0: page.talkMinutes });
  }
  return "";
}

function PathCard({ page, last }: { readonly page: EngineeringPageEntry; readonly last: boolean }) {
  const Icon = page.icon;
  const deck = page.id === "deck";
  return (
    <li className="relative flex">
      <Link
        href={page.href}
        className={cx(
          "group flex w-full flex-col gap-4 rounded-3xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          deck
            ? "border-accent/60 bg-accent-soft/35 hover:border-accent"
            : "border-line/70 bg-card/65 hover:border-accent/45 hover:bg-raised/70",
        )}
      >
        <span className="flex items-center justify-between gap-3">
          <span
            className={cx(
              "grid size-10 place-items-center rounded-full font-display text-base font-black",
              deck ? "bg-accent text-on-accent" : "bg-accent-soft text-accent",
            )}
            aria-hidden="true"
          >
            {page.step}
          </span>
          <Icon size={20} className={deck ? "text-accent" : "text-fg-3 group-hover:text-accent"} aria-hidden="true" />
        </span>
        <span className="grid gap-2">
          <span className="text-lg font-black text-fg">
            <span className="sr-only">{formatI18nTemplate(String(bi("{value0}단계 ", "Step {value0} ")), { value0: page.step ?? "" })}</span>
            {bi(page.label.ko, page.label.en)}
          </span>
          <span className="text-sm leading-6 text-fg-2">{bi(page.purpose.ko, page.purpose.en)}</span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 border-t border-line/60 pt-3 text-xs font-bold text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            {deck ? <Presentation size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
            {pageMeta(page)}
          </span>
          <span className="inline-flex items-center gap-1 text-accent">
            {deck ? bi("발표하기", "Present") : bi("열기", "Open")}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </span>
      </Link>
      {!last ? (
        <ArrowRight
          size={18}
          className="absolute -right-[1.05rem] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-canvas text-accent xl:block"
          aria-hidden="true"
        />
      ) : null}
    </li>
  );
}

export function TechnologyPage() {
  useBilingualI18nRevision();

  const statusCounts = ENGINEERING_CHAPTERS.reduce<Partial<Record<EngineeringStatus, number>>>(
    (counts, chapter) => ({ ...counts, [chapter.status]: (counts[chapter.status] ?? 0) + 1 }),
    {},
  );

  useDocumentTitle(
    bi("ToonStudio 기술 소개 · 발표 동선과 아키텍처", "ToonStudio engineering · Talk path and architecture"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative overflow-hidden rounded-[2rem] border border-line/70 bg-panel/65 shadow-sm">
        <div aria-hidden="true" className="absolute inset-0" style={BLUEPRINT_GRID_STYLE} />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-panel via-panel/80 to-panel/20" />
        <div className="relative px-6 py-8 sm:px-9 sm:py-10">
          <p className="eyebrow text-accent">TOONSTUDIO ENGINEERING</p>
          <h1 className="mt-3 max-w-3xl text-balance break-keep text-3xl font-black tracking-tight text-fg sm:text-4xl">
            {bi("브라우저에서 웹툰 제작 스튜디오를 만들기까지.", "How we built a webtoon production studio in the browser.")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
            {bi(
              "무엇을 썼는지보다 왜 선택했는지, 실제로 어디까지 동작하는지, 실패와 대체 경로는 무엇인지, 다른 서비스에는 어떻게 옮기는지를 챕터로 정리했습니다. 아래 도서관에서 챕터를 골라 바로 읽을 수 있습니다.",
              "Not only what we used, but why, how far it really works, what fails, which fallback remains and how to reuse it elsewhere — organised as chapters you can open straight from the library below.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/about/technology/deck"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <Play size={16} aria-hidden="true" />
              {bi("발표 모드 열기", "Open presentation mode")}
            </Link>
            <Link
              href="/about/technology/story"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card/70 px-4 py-2.5 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {bi("전체 제작 과정 보기", "Read the full story")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <p className="text-xs font-bold text-fg-3">
              {formatI18nTemplate(String(bi("챕터 {value0}개 · 전체 읽기 약 {value1}분", "{value0} chapters · about {value1} min in total")), {
                value0: ENGINEERING_CHAPTERS.length,
                value1: STORY_READING_MINUTES,
              })}
            </p>
          </div>
        </div>
      </header>

      <AboutSectionNav className="mt-8" />
      <EngineeringTechNav className="mt-2" />
      <EngineeringHubStatusStrip />

      <EngineeringChapterLibrary />

      <section className="py-12 sm:py-16" aria-labelledby="engineering-path-title">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText(STATIC_SCOPE, "en", "TALK PATH · 5 STEPS")}</p>
            <h2 id="engineering-path-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("발표 동선: 이야기에서 발표까지 다섯 단계", "Talk path: five steps from story to presentation")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {bi(
                "단계마다 목적이 겹치지 않습니다. 1~4단계는 발표의 근거이고, 5단계 발표 모드는 같은 사실을 30분으로 압축합니다.",
                "Each step has its own purpose. Steps 1–4 are the evidence; step 5 compresses the same facts into a 30-minute talk.",
              )}
            </p>
          </div>
        </div>
        <ol className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-5 xl:gap-6">
          {ENGINEERING_PATH_PAGES.map((page, index) => (
            <PathCard key={page.id} page={page} last={index === ENGINEERING_PATH_PAGES.length - 1} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="engineering-architecture-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText(STATIC_SCOPE, "en", "ARCHITECTURE MAP")}</p>
        <h2 id="engineering-architecture-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("원본은 기기에, 원장은 서버에, 실시간은 엣지에", "Sources on the device, ledgers on the server, realtime at the edge")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {bi(
            "작업 종류마다 권위를 하나만 둡니다. 서버가 잠들어도 그림은 기기에 남고, 실시간 서버가 재시작돼도 원본은 잃지 않습니다.",
            "Each workload has one authority. Drawings stay on the device while the server sleeps, and sources survive realtime restarts.",
          )}
        </p>
        <div className="mt-7 rounded-[2rem] border border-line/70 bg-panel/65 p-4 shadow-sm sm:p-6">
          <EngineeringArchitectureDiagram />
        </div>
        <p className="mt-3 text-xs leading-6 text-fg-3">
          {bi(
            "근거: DEPLOY.md · render.yaml · deploy/cloudflare-realtime/wrangler.jsonc. 자세한 결정과 대가는 플레이북과 제작 스토리에서 이어집니다.",
            "Sources: DEPLOY.md · render.yaml · deploy/cloudflare-realtime/wrangler.jsonc. Decisions and trade-offs continue in the playbook and story.",
          )}
        </p>
      </section>

      <section className="py-12 sm:py-16" aria-labelledby="engineering-status-title">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText(STATIC_SCOPE, "en", "VERIFIED STATUS")}</p>
            <h2 id="engineering-status-title" className="mt-4 max-w-lg text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("코드가 있다는 이유만으로 운영 기능이라고 부르지 않습니다.", "Code existence alone does not make a capability live.")}
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-fg-2">
              {formatI18nTemplate(String(bi(
                "{value0}개 챕터를 운영 경로, 설정 완료, 실험, 문서화 단계로 나누고 코드·테스트·워크플로·문서를 근거로 연결합니다.",
                "{value0} chapters are labelled live, configured, experimental or documented and connected to code, tests, workflows or documents.",
              )), { value0: ENGINEERING_CHAPTERS.length })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SHOWN_STATUSES.map((status) => (
              <article key={status} className="rounded-3xl border border-line/70 bg-card/65 p-5">
                <EngineeringStatusBadge status={status} />
                <p className="mt-5 font-display text-3xl font-black tracking-tight text-fg">{statusCounts[status] ?? 0}</p>
                <p className="mt-2 text-xs leading-6 text-fg-3">
                  {bi(ENGINEERING_STATUS_META[status].description.ko, ENGINEERING_STATUS_META[status].description.en)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <TechnologyStackShowcase />

      <section className="py-12 sm:py-16" aria-labelledby="engineering-resources-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText(STATIC_SCOPE, "en", "RESOURCES")}</p>
        <h2 id="engineering-resources-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("발표를 돕는 자료실", "Resources for the talk")}
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RESOURCE_PAGES.map((page) => {
            const Icon = page.icon;
            return (
              <li key={page.id}>
                <Link
                  href={page.href}
                  className="group flex h-full items-start gap-3 rounded-2xl border border-line/70 bg-card/60 p-4 transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:text-accent">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-fg">{bi(page.label.ko, page.label.en)}</span>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">{bi(page.purpose.ko, page.purpose.en)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm sm:p-8 lg:p-10"
        aria-labelledby="engineering-transparency-title"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <ShieldCheck size={24} className="text-accent" aria-hidden="true" />
            <p className="mt-5 eyebrow text-accent">{translateCurrentStaticSourceText(STATIC_SCOPE, "en", "TRANSPARENCY WITHOUT SECRET EXPOSURE")}</p>
            <h2 id="engineering-transparency-title" className="mt-3 max-w-3xl text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("판단에 필요한 근거는 공개하고, 공격에 도움이 되는 운영 비밀은 보호합니다.", "Publish evidence needed for judgment while protecting operational secrets.")}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
              {bi(
                "데이터 위치, 외부 공급자, 지원 범위, 오픈소스와 실패 경로는 설명합니다. API 키, 비공개 엔드포인트, 실제 계정 식별자와 상세 서버 접근 정보는 예제와 자료에 포함하지 않습니다.",
                "Data location, external providers, support scope, open source and failure paths are explained. API keys, private endpoints, real account identifiers and server access details are excluded.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
            <Link
              href="/about/technology/licenses"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Scale size={15} aria-hidden="true" />
              {bi("라이선스 확인", "Review licenses")}
            </Link>
            <Link
              href="/about/data"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Database size={15} aria-hidden="true" />
              {bi("데이터 출처", "Data sources")}
            </Link>
          </div>
        </div>
      </section>
    </Container>
  );
}

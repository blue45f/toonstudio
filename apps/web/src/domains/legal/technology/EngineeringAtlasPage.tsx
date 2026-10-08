import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileCode2,
  Lightbulb,
  Link2,
  MapPinned,
  MessageCircleQuestion,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { EngineeringCodeBlock } from "./EngineeringCodeBlock";
import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { ENGINEERING_MAPS } from "./engineering-map-content";
import { filterMapRows } from "./engineering-map-filter";
import {
  ENGINEERING_ATLAS_CATEGORIES,
  ENGINEERING_ATLAS_LINK_KIND_LABEL,
  type EngineeringAtlasCategoryId,
  type EngineeringAtlasEntry,
  type EngineeringAtlasSample,
} from "./engineering-atlas-types";
import { externalLinkForName } from "./engineering-external-links";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import type { EngineeringChapter, EngineeringStatus, LocalizedText } from "./engineering-story-content";
import {
  EngineeringDisclosure,
  EngineeringKeySummary,
  EngineeringLongformLayout,
  EngineeringMetaChip,
  type EngineeringTocGroup,
} from "./EngineeringLongform";
import { EngineeringMapSection } from "./EngineeringMapSection";
import { EngineeringPageFrame, EngineeringPageIntro, EngineeringStatusBadge } from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import { useSearchParams } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringAtlasPage", ko, en);

const BODY_ID = "engineering-atlas-body";

const CATEGORY_IDS = new Set<string>(ENGINEERING_ATLAS_CATEGORIES.map((item) => item.id));
const STATUS_IDS = new Set<string>(["live", "configured", "experimental", "documented", "planned"]);

/** `?category=drawing&status=live&q=opfs` 로 들어오면 그 조건으로 시작한다(허브 타일·슬라이드·공유 링크용). */
function filtersFromSearch(params: URLSearchParams): { category: CategoryFilter; status: StatusFilter; query: string } {
  const category = params.get("category") ?? "all";
  const status = params.get("status") ?? "all";
  return {
    category: CATEGORY_IDS.has(category) ? (category as EngineeringAtlasCategoryId) : "all",
    status: STATUS_IDS.has(status) ? (status as EngineeringStatus) : "all",
    query: (params.get("q") ?? "").slice(0, 80),
  };
}
const text = (value: LocalizedText): string => bi(value.ko, value.en);

type CategoryFilter = "all" | EngineeringAtlasCategoryId;
type StatusFilter = "all" | EngineeringStatus;

const STATUS_FILTERS: readonly { readonly id: StatusFilter; readonly ko: string; readonly en: string }[] = [
  { id: "all", ko: "모든 상태", en: "Any status" },
  { id: "live", ko: "운영 경로", en: "Live" },
  { id: "configured", ko: "설정 완료", en: "Configured" },
  { id: "experimental", ko: "실험 기능", en: "Experimental" },
  { id: "documented", ko: "문서화", en: "Documented" },
  { id: "planned", ko: "설계 단계", en: "Planned" },
];

const chapterById = new Map<string, EngineeringChapter>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const categoryById = new Map(ENGINEERING_ATLAS_CATEGORIES.map((category) => [category.id, category]));

/** 검색은 두 언어를 모두 대상으로 한다(화면 언어와 다른 이름으로도 찾을 수 있게). */
function searchHaystack(entry: EngineeringAtlasEntry): string {
  return [
    entry.id,
    entry.name,
    entry.title.ko,
    entry.title.en,
    entry.tagline.ko,
    entry.tagline.en,
    ...entry.technologies,
    ...entry.keyPoints.flatMap((point) => [point.ko, point.en]),
    ...entry.usage.flatMap((usage) => [usage.feature.ko, usage.feature.en]),
  ]
    .join(" ")
    .toLowerCase();
}

const HAYSTACKS = new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, searchHaystack(entry)]));

function TechChip({ name }: { readonly name: string }) {
  const url = externalLinkForName(name);
  const chipClass = "rounded-full border border-line bg-card/75 px-3 py-1.5 font-display text-[0.68rem] font-semibold text-fg-2";
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} · ${bi("공식 사이트", "Official site")}`}
      className={`${chipClass} inline-flex items-center gap-1 transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {name}
      <ExternalLink size={10} aria-hidden="true" className="shrink-0 opacity-70" />
    </a>
  ) : (
    <span className={chipClass}>{name}</span>
  );
}

function SectionTitle({ id, icon: Icon, children }: { readonly id: string; readonly icon: typeof BookOpen; readonly children: string }) {
  return (
    <h4 id={id} className="flex items-center gap-2 text-sm font-black text-fg">
      <Icon size={15} className="text-accent" aria-hidden="true" />
      {children}
    </h4>
  );
}

function SampleBlock({ sample, locale }: { readonly sample: EngineeringAtlasSample; readonly locale: string }) {
  const english = !locale.startsWith("ko");
  const code = english && sample.codeEn ? sample.codeEn : sample.code;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-[0.66rem] font-black text-accent">
          {sample.kind === "teaching" ? bi("교육용 최소 예제", "Teaching sample") : bi("실제 구현을 줄인 예제", "Simplified from the real code")}
        </span>
        <p className="text-sm font-bold text-fg">{text(sample.title)}</p>
      </div>
      <p className="text-sm leading-7 text-fg-2">{text(sample.explain)}</p>
      <EngineeringCodeBlock code={code} language={sample.language} sourcePath={sample.source} title={text(sample.title)} />
    </div>
  );
}

function AtlasCard({ entry, locale }: { readonly entry: EngineeringAtlasEntry; readonly locale: string }) {
  useBilingualI18nRevision();
  const category = categoryById.get(entry.category);
  const chapters = entry.chapterIds.flatMap((id) => {
    const chapter = chapterById.get(id);
    return chapter ? [chapter] : [];
  });
  const linkGroups = (["spec", "docs", "guide", "repo", "article"] as const).flatMap((kind) => {
    const links = entry.links.filter((link) => link.kind === kind);
    return links.length > 0 ? [{ kind, links }] : [];
  });
  const headingId = `${entry.id}-title`;

  return (
    <article
      id={entry.id}
      aria-labelledby={headingId}
      className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 760px" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          {category ? text(category.label) : entry.category}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <EngineeringStatusBadge status={entry.status} />
          <span className="text-[0.66rem] font-bold text-fg-3">{bi("코드 대조", "Verified")} {entry.reviewedAt}</span>
        </div>
      </div>
      <h3 id={headingId} className="mt-4 text-balance break-keep text-2xl font-black tracking-tight text-fg">
        {entry.name}
        <span className="ml-3 text-lg font-bold text-fg-2">{text(entry.title)}</span>
      </h3>
      <p className="mt-3 max-w-4xl text-base leading-8 text-fg-2">{text(entry.tagline)}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={bi("핵심 요점", "Key points")}>
        {entry.keyPoints.map((point) => (
          <li key={point.ko} className="flex gap-2.5 rounded-2xl border border-line/60 bg-card/55 px-3.5 py-2.5 text-sm leading-6 text-fg">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-2" aria-hidden="true" />
            <span>{text(point)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-3xl border border-line/65 bg-card/70 p-3 sm:p-5">
        <EngineeringDiagramFrame diagram={entry.diagram} />
      </div>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label={bi("관련 기술", "Related technologies")}>
        {entry.technologies.map((technology) => (
          <li key={technology}>
            <TechChip name={technology} />
          </li>
        ))}
      </ul>

      <EngineeringDisclosure
        className="mt-6"
        summary={(
          <>
            <BookOpen size={17} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{bi("배경 지식 · 쓰인 곳 · 샘플 코드 · 참고 링크 · 발표 보조", "Background · where it is used · sample code · references · talk aids")}</span>
          </>
        )}
      >
        <div className="grid gap-8">
          <section aria-labelledby={`${entry.id}-background`} className="grid gap-3">
            <SectionTitle id={`${entry.id}-background`} icon={BookOpen}>{bi("배경 지식", "Background")}</SectionTitle>
            {entry.background.map((paragraph) => (
              <p key={paragraph.ko} className="max-w-4xl text-sm leading-8 text-fg-2">{text(paragraph)}</p>
            ))}
            {entry.talk.analogy ? (
              <p className="flex items-start gap-2.5 rounded-2xl border border-accent-2/35 bg-accent-2/10 px-4 py-3 text-sm leading-7 text-fg-2">
                <Lightbulb size={16} className="mt-1 shrink-0 text-accent-2" aria-hidden="true" />
                <span><strong className="mr-1 text-fg">{bi("쉬운 비유", "In plain words")}</strong>{text(entry.talk.analogy)}</span>
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`${entry.id}-usage`} className="grid gap-3">
            <SectionTitle id={`${entry.id}-usage`} icon={MapPinned}>{bi("서비스에서 쓰인 곳", "Where it is used in the service")}</SectionTitle>
            <ul className="grid gap-3 lg:grid-cols-2">
              {entry.usage.map((usage) => (
                <li key={usage.feature.ko} className="rounded-3xl border border-line/65 bg-card/65 p-4">
                  <p className="text-sm font-black text-fg">{text(usage.feature)}</p>
                  <p className="mt-1.5 text-sm leading-7 text-fg-2">{text(usage.role)}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={bi("근거 파일", "Evidence files")}>
                    {usage.paths.map((path) => (
                      <li key={path}>
                        <code className="eng-code block max-w-full break-all rounded-lg px-2 py-1 font-mono text-[0.68rem]">{path}</code>
                      </li>
                    ))}
                  </ul>
                  {usage.route ? (
                    <Link href={usage.route} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                      {bi("제품에서 열어보기", "Open it in the product")} <code className="font-mono">{usage.route}</code>
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {entry.facts?.length ? (
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entry.facts.map((fact) => (
                  <div key={fact.label.ko} className="rounded-2xl border border-line/65 bg-card/65 p-3.5">
                    <dt className="text-[0.7rem] font-bold text-fg-3">{text(fact.label)}</dt>
                    <dd className="mt-1 font-display text-xl font-black text-fg">{fact.value}</dd>
                    <dd className="mt-1 break-all font-mono text-[0.62rem] text-fg-3">{fact.source}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section aria-labelledby={`${entry.id}-samples`} className="grid gap-5">
            <SectionTitle id={`${entry.id}-samples`} icon={FileCode2}>{bi("샘플 코드", "Sample code")}</SectionTitle>
            {entry.samples.map((sample) => (
              <SampleBlock key={sample.title.ko} sample={sample} locale={locale} />
            ))}
          </section>

          <section aria-labelledby={`${entry.id}-links`} className="grid gap-3">
            <SectionTitle id={`${entry.id}-links`} icon={Link2}>{bi("참고 링크", "References")}</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-2">
              {linkGroups.map(({ kind, links }) => (
                <div key={kind} className="rounded-3xl border border-line/65 bg-card/65 p-4">
                  <p className="font-display text-[0.64rem] font-black uppercase tracking-[0.14em] text-fg-3">{text(ENGINEERING_ATLAS_LINK_KIND_LABEL[kind])}</p>
                  <ul className="mt-2 grid gap-2.5">
                    {links.map((link) => (
                      <li key={link.url}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 text-sm font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span>{link.title}</span>
                          <ExternalLink size={12} aria-hidden="true" className="mt-1 shrink-0" />
                          <span className="sr-only">{bi("(새 탭에서 열림)", "(opens in a new tab)")}</span>
                        </a>
                        {link.note ? <p className="mt-0.5 text-xs leading-6 text-fg-3">{text(link.note)}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {chapters.length > 0 ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
                <span className="font-bold">{bi("제작 스토리에서 이어 읽기", "Continue in the engineering story")}</span>
                {chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/about/technology/story#${chapter.id}`}
                    className="rounded-full border border-line bg-card/75 px-3 py-1 font-bold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {text(chapter.title)}
                  </Link>
                ))}
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`${entry.id}-talk`} className="grid gap-3">
            <SectionTitle id={`${entry.id}-talk`} icon={MessageCircleQuestion}>{bi("발표 보조", "Talk aids")}</SectionTitle>
            <p className="rounded-2xl border border-line/65 bg-card/65 p-4 text-sm leading-7 text-fg-2">
              <strong className="mr-1.5 text-fg">{bi("30초 설명", "30-second pitch")}</strong>
              {text(entry.talk.pitch)}
            </p>
            <dl className="grid gap-3">
              {entry.talk.questions.map((item) => (
                <div key={item.question.ko} className="rounded-2xl border border-line/65 bg-card/65 p-4">
                  <dt className="text-sm font-black text-fg"><span className="mr-2 text-accent" aria-hidden="true">Q</span>{text(item.question)}</dt>
                  <dd className="mt-2 text-sm leading-7 text-fg-2"><span className="mr-2 font-black text-accent-2" aria-hidden="true">A</span>{text(item.answer)}</dd>
                </div>
              ))}
            </dl>
            {entry.talk.pitfall ? (
              <p className="flex items-start gap-2.5 rounded-2xl border border-warn/35 bg-warn/10 px-4 py-3 text-sm leading-7 text-fg-2">
                <TriangleAlert size={16} className="mt-1 shrink-0 text-warn" aria-hidden="true" />
                <span><strong className="mr-1 text-fg">{bi("과장하지 않기", "Do not overclaim")}</strong>{text(entry.talk.pitfall)}</span>
              </p>
            ) : null}
          </section>
        </div>
      </EngineeringDisclosure>
    </article>
  );
}

/** 인쇄할 때는 접힌 상세를 모두 펼쳤다가 인쇄 후 원래 상태로 되돌린다. */
function useOpenDetailsForPrint(): void {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = (): void => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>(`#${BODY_ID} details[data-eng-disclosure]`)].filter((element) => !element.open);
      for (const element of opened) element.open = true;
    };
    const after = (): void => {
      for (const element of opened) element.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}

export function EngineeringAtlasPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const params = useSearchParams();
  const initial = filtersFromSearch(params);
  const [category, setCategory] = useState<CategoryFilter>(initial.category);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [query, setQuery] = useState(initial.query);
  const paramsKey = params.toString();
  useEffect(() => {
    const next = filtersFromSearch(new URLSearchParams(paramsKey));
    setCategory(next.category);
    setStatus(next.status);
    setQuery(next.query);
  }, [paramsKey]);
  const searchId = useId();
  const statusId = useId();
  useOpenDetailsForPrint();

  useDocumentTitle(
    bi("ToonStudio 기술 도감 · 쓰인 기술을 한 장씩", "ToonStudio tech atlas · One card per technology"),
  );

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      ENGINEERING_ATLAS_ENTRIES.filter(
        (entry) =>
          (category === "all" || entry.category === category) &&
          (status === "all" || entry.status === status) &&
          (!normalized || (HAYSTACKS.get(entry.id) ?? "").includes(normalized)),
      ),
    [category, status, normalized],
  );

  const sections = ENGINEERING_ATLAS_CATEGORIES.map((meta) => ({
    meta,
    entries: visible.filter((entry) => entry.category === meta.id),
  })).filter((section) => section.entries.length > 0);

  // 지도는 분야를 가로지르는 표라서 분야 필터가 "전체"일 때만 보이고, 검색어·상태 필터는 행에도 적용한다.
  const visibleMaps = useMemo(
    () =>
      category === "all"
        ? ENGINEERING_MAPS.map((map) => ({ map, rows: filterMapRows(map, normalized, status) })).filter((item) => item.rows.length > 0)
        : [],
    [category, normalized, status],
  );
  const visibleAtlas = useMemo(() => new Map(visible.map((entry) => [entry.id, entry.name])), [visible]);
  const mapRowCount = visibleMaps.reduce((sum, item) => sum + item.rows.length, 0);

  const tocGroups: readonly EngineeringTocGroup[] = [
    ...(visibleMaps.length > 0
      ? [{ id: "maps", label: bi("지도 · 같은 종류를 한 표로", "Maps · one table per kind"), items: visibleMaps.map(({ map }) => ({ id: `map-${map.id}`, label: text(map.title) })) }]
      : []),
    ...sections.map((section) => ({
      id: section.meta.id,
      label: text(section.meta.label),
      items: section.entries.map((entry) => ({ id: entry.id, label: entry.name })),
    })),
  ];

  const categoryCounts = new Map<CategoryFilter, number>([["all", ENGINEERING_ATLAS_ENTRIES.length]]);
  for (const entry of ENGINEERING_ATLAS_ENTRIES) categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);

  const sampleCount = ENGINEERING_ATLAS_ENTRIES.reduce((sum, entry) => sum + entry.samples.length, 0);
  const linkCount = ENGINEERING_ATLAS_ENTRIES.reduce((sum, entry) => sum + entry.links.length, 0);
  const referencedChapters = new Set(ENGINEERING_ATLAS_ENTRIES.flatMap((entry) => entry.chapterIds)).size;

  return (
    <EngineeringPageFrame pageId="atlas">
      <EngineeringPageIntro
        pageId="atlas"
        eyebrow="TECH ATLAS"
        title={bi("서비스에 쓰인 기술을 한 장씩 정리했습니다.", "One card for every technology the service uses.")}
        description={bi(
          "카드마다 도식으로 큰 그림을 먼저 보고, 배경 지식 → 서비스에서 쓰인 곳(기능·파일) → 샘플 코드 → 참고 링크 → 발표 보조 순서로 내려갑니다. 모든 경로는 저장소에서 확인했고, 링크는 공식 문서만 담았습니다.",
          "Each card starts with a diagram, then goes through background, where the service uses it (features and files), sample code, references and talk aids. Every path was checked against the repository and every link points to official documentation.",
        )}
      />

      <EngineeringKeySummary
        points={[
          bi("기술 이름이 아니라 '어느 기능에서 어떻게 쓰였는가'로 정리했습니다. 카드의 '쓰인 곳'은 사용자가 보는 기능 → 그 안에서 맡은 일 → 근거 파일 순입니다.", "Cards are organized by 'which feature uses it and how', not by technology name: user-facing feature, the job it does there, then evidence files."),
          bi("샘플 코드는 핵심 아이디어만 남긴 교육용 예제이거나 실제 구현을 줄인 예제이며, 구문·타입 검증 테스트를 통과한 것만 실었습니다.", "Sample code is a teaching sample or a simplified real implementation, and only samples that pass syntax and type verification are published."),
          bi("발표 중 질문을 받으면 검색창에서 기술 이름을 찾고, '발표 보조'의 30초 설명과 예상 질문을 그대로 쓰면 됩니다.", "When a question comes up during the talk, search the technology name and reuse the 30-second pitch and anticipated questions."),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("카드 {value0}장", "{value0} cards")), { value0: ENGINEERING_ATLAS_ENTRIES.length })}</EngineeringMetaChip>
            {ENGINEERING_MAPS.length > 0 ? (
              <EngineeringMetaChip>{formatI18nTemplate(String(bi("비교 지도 {value0}개", "{value0} maps")), { value0: ENGINEERING_MAPS.length })}</EngineeringMetaChip>
            ) : null}
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("샘플 코드 {value0}개", "{value0} samples")), { value0: sampleCount })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("참고 링크 {value0}개", "{value0} references")), { value0: linkCount })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("연결 챕터 {value0}개", "{value0} linked chapters")), { value0: referencedChapters })}</EngineeringMetaChip>
          </>
        )}
      />

      <section aria-label={bi("도감 찾기", "Find in the atlas")} className="mt-8 grid gap-4 rounded-3xl border border-line/70 bg-panel/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label={bi("분야", "Category")}>
          {([{ id: "all" as const, label: { ko: "전체", en: "All" } }, ...ENGINEERING_ATLAS_CATEGORIES]).map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(item.id)}
                className={cx(
                  "min-h-11 rounded-full border px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
                )}
              >
                {text(item.label)} <span className="tabular-nums opacity-80">{categoryCounts.get(item.id) ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label htmlFor={searchId} className="grid gap-1.5 text-xs font-bold text-fg-3">
            {bi("기술·기능 이름으로 검색", "Search by technology or feature")}
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={bi("예: OPFS, WebRTC, 드래그, Yjs", "e.g. OPFS, WebRTC, drag, Yjs")}
                className="min-h-11 w-full rounded-2xl border border-line bg-card pl-10 pr-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </span>
          </label>
          <label htmlFor={statusId} className="grid gap-1.5 text-xs font-bold text-fg-3">
            {bi("현재 상태", "Current status")}
            <select
              id={statusId}
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="min-h-11 rounded-2xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {STATUS_FILTERS.map((item) => (
                <option key={item.id} value={item.id}>{bi(item.ko, item.en)}</option>
              ))}
            </select>
          </label>
        </div>
        <p role="status" aria-live="polite" data-atlas-result-count="" className="text-xs font-bold text-fg-3">
          {visibleMaps.length > 0
            ? formatI18nTemplate(String(bi("카드 {value0}장 · 지도 항목 {value1}개 표시 중", "Showing {value0} cards and {value1} map rows")), { value0: visible.length, value1: mapRowCount })
            : formatI18nTemplate(String(bi("{value0}장 표시 중", "Showing {value0} cards")), { value0: visible.length })}
        </p>
      </section>

      {visible.length === 0 && visibleMaps.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-line-strong bg-card/50 p-8 text-center text-sm leading-7 text-fg-2">
          {bi("조건에 맞는 카드가 없습니다. 검색어를 줄이거나 분야와 상태를 '전체'로 바꿔 보세요.", "No cards match. Shorten the search or reset category and status to All.")}
        </p>
      ) : (
        <EngineeringLongformLayout groups={tocGroups} bodyId={BODY_ID} tocLabel={bi("도감 목차", "Atlas contents")}>
          <div className="grid gap-12">
            {visibleMaps.length > 0 ? (
              <section aria-labelledby="atlas-maps-title" className="grid gap-6">
                <header>
                  <h2 id="atlas-maps-title" className="scroll-mt-32 text-2xl font-black tracking-tight text-fg">
                    {bi("지도 · 같은 종류를 한 표로", "Maps · one table per kind")}
                    <span className="ml-3 text-base font-bold text-fg-3">{visibleMaps.length}</span>
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm leading-7 text-fg-2">
                    {bi(
                      "카드가 기술 하나를 깊게 설명한다면, 지도는 무료 서비스·오픈소스·Open API·경쟁 제품·AI 개발 도구를 한 표로 나란히 비교합니다. 이름을 누르면 공식 사이트로, '도감 카드'를 누르면 자세한 설명으로 이동합니다.",
                      "A card explains one technology in depth; a map compares free services, open source, Open APIs, competing products and AI development tools side by side. Names link to official sites and 'Atlas card' chips jump to the detailed card.",
                    )}
                  </p>
                </header>
                {visibleMaps.map(({ map, rows }) => (
                  <EngineeringMapSection key={map.id} map={map} rows={rows} visibleAtlas={visibleAtlas} />
                ))}
              </section>
            ) : null}
            {sections.map((section) => (
              <section key={section.meta.id} aria-labelledby={`category-${section.meta.id}`} className="grid gap-6">
                <header>
                  <h2 id={`category-${section.meta.id}`} className="scroll-mt-32 text-2xl font-black tracking-tight text-fg">
                    {text(section.meta.label)}
                    <span className="ml-3 text-base font-bold text-fg-3">{section.entries.length}</span>
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm leading-7 text-fg-2">{text(section.meta.description)}</p>
                </header>
                {section.entries.map((entry) => (
                  <AtlasCard key={entry.id} entry={entry} locale={locale} />
                ))}
              </section>
            ))}
          </div>
        </EngineeringLongformLayout>
      )}
    </EngineeringPageFrame>
  );
}


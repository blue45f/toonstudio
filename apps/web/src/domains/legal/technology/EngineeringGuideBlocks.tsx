import { BookOpen, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { EngineeringDisclosure } from "./EngineeringLongform";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";
import type { EngineeringDiagramTone } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";
import "./engineering-surfaces.css";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringGuideBlocks", ko, en);

/**
 * 아키텍처 해설(`EngineeringArchitecturePage`)과 라이브러리 해설(`EngineeringLibrariesPage`)이 함께 쓰는 표현 블록.
 * 두 페이지가 같은 시각 언어(구간 머리 → 쉬운 비유 → 도식 → 흐름 → 접이식 상세 → 오해하기 쉬운 점 → 더 보기)를 쓰도록
 * 한 곳에 모았다. 모든 블록은 부모가 고른 문자열(`bi()` 결과)을 받는 순수 표현 컴포넌트이고,
 * 도감·챕터·용어 이름을 푸는 `GuideLinkRow` 만 렌더 뒤에 데이터를 동적으로 불러온다.
 */

/* ── 구간 틀과 머리 ─────────────────────────────────────────── */

/** 구간(영역) 하나를 감싸는 카드. `id` 는 목차·주소 앵커와 같아야 한다. */
export function GuideSectionShell({
  id,
  titleId,
  children,
  className,
}: {
  readonly id: string;
  readonly titleId: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cx("scroll-mt-36 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-8", className)}
    >
      {children}
    </section>
  );
}

/**
 * 구간 머리: 번호 · (묶음 이름) · 제목 · 질문 · 상태 배지 · 한 줄 요약.
 * 제목은 h2(기본) 또는 h3 로 그린다. `titleId` 는 부모 구간의 `aria-labelledby` 와 맞춘다.
 */
export function GuideSectionHeader({
  number,
  titleId,
  title,
  kicker,
  question,
  oneLine,
  status,
  headingLevel = 2,
}: {
  readonly number: number;
  readonly titleId: string;
  readonly title: string;
  /** 제목 위의 작은 글씨. 보통 묶음 이름. */
  readonly kicker?: string;
  readonly question?: string;
  readonly oneLine?: string;
  readonly status?: EngineeringStatus;
  readonly headingLevel?: 2 | 3;
}) {
  useBilingualI18nRevision();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <header className="grid gap-4">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent font-display text-xl font-black text-on-accent shadow-sm sm:size-14 sm:text-2xl"
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {kicker ? (
              <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.15em] text-accent-2">{kicker}</p>
            ) : (
              <span />
            )}
            {status ? <EngineeringStatusBadge status={status} /> : null}
          </div>
          <Heading id={titleId} className="mt-1.5 text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
            <span className="sr-only">{number}. </span>
            {title}
          </Heading>
          {question ? (
            <p className="mt-2 flex items-start gap-2 text-sm font-bold leading-7 text-fg-3 sm:text-base">
              <span aria-hidden="true" className="font-display font-black text-accent">Q</span>
              <span className="sr-only">{bi("질문", "Question")}: </span>
              <span>{question}</span>
            </p>
          ) : null}
        </div>
      </div>
      {oneLine ? (
        <p className="border-l-4 border-accent bg-accent-soft/30 py-2.5 pl-4 pr-3 text-balance break-keep text-lg font-bold leading-8 text-fg sm:text-xl sm:leading-9">
          {oneLine}
        </p>
      ) : null}
    </header>
  );
}

/* ── 쉬운 비유 · 오해하기 쉬운 점 ─────────────────────────────── */

/** 일상 사물 비유 한두 문장. */
export function GuideEasyBox({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  useBilingualI18nRevision();
  return (
    <p className="flex items-start gap-3 rounded-2xl border border-accent-2/35 bg-accent-2/10 px-4 py-3.5 text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
      <Lightbulb size={18} className="mt-1.5 shrink-0 text-accent-2" aria-hidden="true" />
      <span>
        <strong className="mr-1.5 text-fg">{label ?? bi("쉽게 말해", "In plain words")}</strong>
        {children}
      </span>
    </p>
  );
}

/** 청중이 오해하기 쉬운 점이나 확인하지 못한 항목. 접지 않고 항상 보여 준다. */
export function GuidePitfall({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  useBilingualI18nRevision();
  return (
    <p className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3.5 text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
      <TriangleAlert size={18} className="mt-1.5 shrink-0 text-warn" aria-hidden="true" />
      <span>
        <strong className="mr-1.5 text-fg">{label ?? bi("오해하기 쉬운 점", "Easy to misread")}</strong>
        {children}
      </span>
    </p>
  );
}

/* ── 도식 틀 · 흐름 단계 ────────────────────────────────────── */

/** 도식(`EngineeringDiagramFrame`)을 담는 패널. */
export function GuideDiagramPanel({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cx("rounded-3xl border border-line/65 bg-card/70 p-3 sm:p-5", className)}>{children}</div>;
}

/** 도식을 말로 따라 읽는 순서(3~6단계). */
export function GuideSteps({ steps, label }: { readonly steps: readonly string[]; readonly label?: string }) {
  useBilingualI18nRevision();
  const heading = label ?? bi("도식을 말로 따라 읽기", "Reading the diagram in order");
  return (
    <div className="grid gap-3">
      <p className="text-sm font-black text-fg">{heading}</p>
      <ol aria-label={heading} className="grid gap-2.5 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={`${index}-${step}`}
            className="flex items-start gap-3 rounded-2xl border border-line/65 bg-card/65 px-3.5 py-3 text-sm leading-7 text-fg-2 sm:text-[0.95rem]"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-xs font-black text-accent"
            >
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 도식 색(tone)의 뜻. 도식 노드와 같은 색 공식으로 칠한 견본 옆에 글자 설명을 둬 색만으로 뜻을 전하지 않는다. */
const LEGEND: readonly { readonly tone: EngineeringDiagramTone; readonly label: LocalizedText }[] = [
  { tone: "local", label: { ko: "내 기기", en: "Your device" } },
  { tone: "edge", label: { ko: "Cloudflare (전달 계층)", en: "Cloudflare (delivery layer)" } },
  { tone: "server", label: { ko: "서버·원장", en: "Server and ledger" } },
  { tone: "ai", label: { ko: "AI·모델", en: "AI and models" } },
  { tone: "external", label: { ko: "외부·사본 (점선 테두리)", en: "External or copies (dashed outline)" } },
  { tone: "warn", label: { ko: "승인·주의 지점", en: "Approval or caution point" } },
  { tone: "good", label: { ko: "작업이 남는 바닥", en: "Where work remains" } },
];

/** 도식 색의 범례("누가 소유하는가"). 한 장 요약 도식 바로 아래에 둔다. */
export function GuideDiagramLegend() {
  useBilingualI18nRevision();
  return (
    <ul className="eng-legend" aria-label={bi("도식 색의 뜻 (누가 소유하는가)", "What diagram colors mean (who owns it)")}>
      {LEGEND.map((item) => (
        <li key={item.tone} className="eng-legend__item">
          <span className="eng-legend__swatch" data-tone={item.tone} aria-hidden="true" />
          {bi(item.label.ko, item.label.en)}
        </li>
      ))}
    </ul>
  );
}

/* ── 접이식 상세 ────────────────────────────────────────────── */

/**
 * 접이식 블록. 네이티브 `<details>` 이고 `data-eng-disclosure` 가 붙어 있어 긴 문서 도구의 "모두 펼치기/접기"와
 * 주소 앵커 자동 펼침이 그대로 동작한다. 인쇄할 때 모두 펼치려면 페이지에서 `use-open-guide-details-for-print.ts` 의
 * `useOpenGuideDetailsForPrint(rootId)` 를 한 번 호출한다.
 */
export function GuideDetails({
  icon: Icon = BookOpen,
  title,
  hint,
  defaultOpen = false,
  className,
  children,
}: {
  readonly icon?: LucideIcon;
  readonly title: string;
  /** 제목 옆에 작게 보이는 내용 미리보기(넓은 화면에서만 보인다). */
  readonly hint?: string;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <EngineeringDisclosure
      className={className}
      defaultOpen={defaultOpen}
      summary={(
        <>
          <Icon size={17} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 truncate sm:whitespace-normal">{title}</span>
          {hint ? <span className="ml-1 hidden min-w-0 truncate text-xs font-medium text-fg-3 lg:inline">{hint}</span> : null}
        </>
      )}
    >
      {children}
    </EngineeringDisclosure>
  );
}

/* ── 경로 · 수치 ────────────────────────────────────────────── */

/** 저장소 경로(`경로#심볼`) 목록. 첫 경로가 대표 근거다. */
export function GuidePathList({ paths, label }: { readonly paths: readonly string[]; readonly label?: string }) {
  useBilingualI18nRevision();
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={label ?? bi("근거 파일", "Evidence files")}>
      {paths.map((path) => (
        <li key={path} className="min-w-0 max-w-full">
          <code className="eng-code block max-w-full break-all rounded-lg px-2 py-1 font-mono text-[0.68rem] leading-5">{path}</code>
        </li>
      ))}
    </ul>
  );
}

/** 값 + 설명 + 근거 경로로 이루어진 확인된 수치 목록. */
export function GuideFactList({
  facts,
}: {
  readonly facts: readonly { readonly value: string; readonly label: string; readonly source: string }[];
}) {
  return (
    <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={`${fact.label}-${fact.source}`} className="rounded-2xl border border-line/65 bg-card/65 p-3.5">
          <dt className="text-[0.72rem] font-bold leading-5 text-fg-3">{fact.label}</dt>
          <dd className="mt-1 break-words font-display text-lg font-black leading-7 text-fg">{fact.value}</dd>
          <dd className="mt-1 break-all font-mono text-[0.62rem] leading-5 text-fg-3">{fact.source}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 더 보기: 도감 카드 · 제작 스토리 · 용어집 ───────────────── */

type NameMap<V> = ReadonlyMap<string, V>;

interface NameSource<V> {
  readonly cached: () => NameMap<V> | undefined;
  readonly load: () => Promise<NameMap<V>>;
}

/**
 * 도감 카드·챕터·용어의 이름 사전. 데이터가 수백 KB 라서 첫 화면 번들에 넣지 않고 렌더 뒤에 한 번만 동적으로 불러온다.
 * 세 가지를 따로 불러오므로 하나가 실패해도 나머지 이름은 그대로 풀리고, 실패하면 다음 호출에서 다시 시도한다.
 */
function createNameSource<V>(read: () => Promise<NameMap<V>>): NameSource<V> {
  let cache: NameMap<V> | undefined;
  let pending: Promise<NameMap<V>> | null = null;
  return {
    cached: () => cache,
    load: () => {
      pending ??= read()
        .then((map) => {
          cache = map;
          return map;
        })
        .catch((error: unknown) => {
          pending = null;
          throw error;
        });
      return pending;
    },
  };
}

const ATLAS_NAMES = createNameSource<string>(async () => {
  const { ENGINEERING_ATLAS_ENTRIES } = await import("./engineering-atlas-content");
  return new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, entry.name]));
});

const CHAPTER_TITLES = createNameSource<LocalizedText>(async () => {
  const { PUBLISHED_ENGINEERING_CHAPTERS } = await import("./engineering-story-published-content");
  return new Map(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter.title]));
});

const GLOSSARY_TERMS = createNameSource<LocalizedText>(async () => {
  const { ENGINEERING_GLOSSARY } = await import("./engineering-glossary-content");
  return new Map(ENGINEERING_GLOSSARY.map((term) => [term.id, term.term]));
});

/** `undefined`: 아직 불러오는 중, `null`: 불러오기 실패(링크는 id 로 대신 그린다). */
function useNameSource<V>(source: NameSource<V>): NameMap<V> | null | undefined {
  const [names, setNames] = useState<NameMap<V> | null | undefined>(() => source.cached());
  useEffect(() => {
    if (source.cached()) return undefined;
    let cancelled = false;
    source
      .load()
      .then((loaded) => {
        if (!cancelled) setNames(loaded);
      })
      .catch(() => {
        if (!cancelled) setNames(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);
  return names;
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-9";

interface LinkGroup {
  readonly key: string;
  readonly label: string;
  readonly tone: string;
  readonly loading: boolean;
  readonly items: readonly { readonly id: string; readonly href: string; readonly name: string; readonly attr: Record<string, string> }[];
}

/**
 * "더 보기" 줄: 이 구간과 이어지는 기술 도감 카드 · 제작 스토리 챕터 · 용어집 항목으로 가는 링크.
 * 이름은 렌더 뒤에 풀리고, 불러오는 동안에는 자리만 잡아 두며, 실패해도 id 로 링크는 그대로 동작한다.
 */
export function GuideLinkRow({
  atlasIds,
  chapterIds,
  glossaryIds,
  contextLabel,
  className,
}: {
  readonly atlasIds: readonly string[];
  readonly chapterIds: readonly string[];
  readonly glossaryIds: readonly string[];
  /** 한 페이지에 이 줄이 여럿이라(구간마다 하나) 이름이 겹치지 않도록 이 줄이 속한 구간 이름을 앞에 붙인다. */
  readonly contextLabel?: string;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const atlas = useNameSource(ATLAS_NAMES);
  const chapters = useNameSource(CHAPTER_TITLES);
  const glossary = useNameSource(GLOSSARY_TERMS);
  const localized = (value: LocalizedText | undefined, fallback: string): string => (value ? bi(value.ko, value.en) : fallback);

  const groups: readonly LinkGroup[] = [
    {
      key: "atlas",
      label: bi("기술 도감 카드", "Tech atlas cards"),
      tone: "border-accent/35 bg-accent-soft text-accent hover:border-accent/60",
      loading: atlas === undefined,
      items: atlasIds.map((id) => ({ id, href: `/about/technology/atlas#${id}`, name: atlas?.get(id) ?? id, attr: { "data-atlas-id": id } })),
    },
    {
      key: "chapters",
      label: bi("제작 스토리 챕터", "Engineering story chapters"),
      tone: "border-line bg-card/75 text-fg-2 hover:border-accent/50 hover:text-accent",
      loading: chapters === undefined,
      items: chapterIds.map((id) => ({ id, href: `/about/technology/story#${id}`, name: localized(chapters?.get(id), id), attr: { "data-chapter-id": id } })),
    },
    {
      key: "glossary",
      label: bi("용어집", "Glossary"),
      tone: "border-line bg-card/75 text-fg-2 hover:border-accent/50 hover:text-accent",
      loading: glossary === undefined,
      items: glossaryIds.map((id) => ({ id, href: `/about/technology/glossary#glossary-${id}`, name: localized(glossary?.get(id), id), attr: { "data-glossary-id": id } })),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <nav aria-label={contextLabel ? `${contextLabel} — ${bi("더 깊이 보기", "Go deeper")}` : bi("더 깊이 보기", "Go deeper")} aria-busy={groups.some((group) => group.loading) || undefined} className={cx("grid gap-3", className)}>
      {groups.map((group) => (
        <div key={group.key} className="grid gap-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-3">
          <p className="pt-2 text-xs font-black text-fg-3">{group.label}</p>
          {group.loading ? (
            <ul className="flex flex-wrap gap-2" aria-hidden="true">
              {group.items.map((item) => (
                <li key={item.id} className="h-9 w-28 animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} {...item.attr} className={cx(CHIP_BASE, group.tone)}>
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

import { ArrowRight, BookOpen, ExternalLink, FileCode2, Lightbulb, Link2, MapPinned, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { EngineeringCodeBlock } from "./EngineeringCodeBlock";
import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { ENGINEERING_ATLAS_CATEGORIES, ENGINEERING_ATLAS_LINK_KIND_LABEL, type EngineeringAtlasEntry, type EngineeringAtlasSample } from "./engineering-atlas-types";
import { externalLinkForName } from "./engineering-external-links";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import type { EngineeringChapter, LocalizedText } from "./engineering-story-content";
import { EngineeringDisclosure } from "./EngineeringLongform";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";

import Link from "@/shared/navigation/router-link";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

// 기존 문구의 번역 범위를 유지한다.
const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringAtlasPage", ko, en);
const text = (value: LocalizedText): string => bi(value.ko, value.en);
const chapterById = new Map<string, EngineeringChapter>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const categoryById = new Map(ENGINEERING_ATLAS_CATEGORIES.map((category) => [category.id, category]));

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

export function EngineeringAtlasCard({ entry, locale, printing, hashTarget, categoryAnchor }: { readonly entry: EngineeringAtlasEntry; readonly locale: string; readonly printing: boolean; readonly hashTarget: string; readonly categoryAnchor: boolean }) {
  useBilingualI18nRevision();
  // 목록에는 제목과 소개를 먼저 보여 준다. 도식·요점·본문은 상세를 열거나 해시로 진입하거나 인쇄할 때 구성한다.
  const [opened, setOpened] = useState(false);
  const targeted = hashTarget === entry.id || hashTarget.startsWith(`${entry.id}-`);
  const showBody = opened || printing || targeted;
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
      className="min-w-0 scroll-mt-32 rounded-3xl border border-line/70 bg-panel/55 p-4 shadow-sm sm:p-5"
      data-atlas-card=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={categoryAnchor ? `category-${entry.category}` : undefined} className="font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          {category ? text(category.label) : entry.category}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <EngineeringStatusBadge status={entry.status} />
          <span className="text-[0.66rem] font-bold text-fg-3">{bi("코드 대조", "Verified")} {entry.reviewedAt}</span>
        </div>
      </div>
      <h3 id={headingId} className="mt-3 text-balance break-keep text-lg font-black tracking-tight text-fg">
        {entry.name}
        <span className="mt-1 block text-base font-bold text-fg-2">{text(entry.title)}</span>
      </h3>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-fg-2">{text(entry.tagline)}</p>
      <EngineeringDisclosure
        className="mt-4"
        defaultOpen={printing || targeted}
        onToggle={(open) => {
          if (open && !printing) setOpened(true);
        }}
        summary={(
          <>
            <BookOpen size={17} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{bi("자세히 보기", "View details")}<span className="sr-only"> · {entry.name}</span></span>
          </>
        )}
      >
        {showBody ? (
          <div className="grid gap-8">
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
                    <Link href={usage.route} className="mt-3 inline-flex min-h-7 items-center gap-1.5 text-xs font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
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
                          className="inline-flex min-h-7 items-start gap-1.5 py-0.5 text-sm font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        ) : null}
      </EngineeringDisclosure>
    </article>
  );
}


import { ArchitectureSectionStrip, type ArchitectureNavItem } from "./EngineeringArchitectureNav";
import { EngineeringArchitectureOverview } from "./EngineeringArchitectureOverview";
import { EngineeringArchitectureSection } from "./EngineeringArchitectureSection";
import { EngineeringPageFrame, EngineeringPageIntro, EngineeringStatusBadge } from "./EngineeringStoryUi";
import { ARCHITECTURE_GUIDE_SECTIONS } from "./engineering-architecture-guide-content";
import {
  ARCHITECTURE_GUIDE_GROUPS,
  type ArchitectureGuideGroup,
  type ArchitectureGuideSection,
} from "./engineering-architecture-guide-types";
import type { LocalizedText } from "./engineering-story-content";
import { useOpenGuideDetailsForPrint } from "./use-open-guide-details-for-print";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitecturePage", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

const BODY_ID = "engineering-architecture-body";

interface GroupedSections {
  readonly group: ArchitectureGuideGroup;
  readonly sections: readonly ArchitectureGuideSection[];
}

/** 구간 바로가기: 번호 · 쉬운 제목 · 답하는 질문. 키보드·터치로 어느 구간에든 한 번에 간다. */
function SectionMap({ groups }: { readonly groups: readonly GroupedSections[] }) {
  return (
    <section aria-labelledby="architecture-map-title" className="mt-10 grid gap-5">
      <h2 id="architecture-map-title" className="text-2xl font-black tracking-tight text-fg">
        {bi("구간 바로가기", "Jump to a section")}
      </h2>
      <nav aria-label={bi("구간 바로가기", "Jump to a section")} className="grid gap-6">
        {groups.map(({ group, sections }) => (
          <div key={group.id} className="grid gap-3">
            <p className="text-sm font-black text-fg">
              {text(group.label)}
              <span className="ml-2 text-xs font-medium text-fg-3">{text(group.hint)}</span>
            </p>
            <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="group flex min-h-16 items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-3.5 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-base font-black text-accent"
                    >
                      {section.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-sm font-black text-fg group-hover:text-accent">{text(section.title)}</span>
                        <EngineeringStatusBadge status={section.status} className="hidden sm:inline-flex" />
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-fg-3">{text(section.question)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </nav>
    </section>
  );
}

/**
 * 아키텍처 해설(`/about/technology/architecture`).
 * 한 장 지도 → 구간 바로가기 → 구간 본문(앱이 돌아가는 구조 → 만들고 지키는 구조) 순서이고,
 * 구간마다 도식 → 한 줄 요약·쉬운 비유 → 흐름 단계 → 배경 지식 → 쓰인 파일 → 선택과 대가 → 도감·챕터·용어 링크로 내려간다.
 */
export function EngineeringArchitecturePage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("아키텍처 해설 · ToonStudio", "Architecture guide · ToonStudio"));
  useOpenGuideDetailsForPrint(BODY_ID);

  const groups: readonly GroupedSections[] = ARCHITECTURE_GUIDE_GROUPS.map((group) => ({
    group,
    sections: ARCHITECTURE_GUIDE_SECTIONS.filter((section) => section.group === group.id),
  })).filter((entry) => entry.sections.length > 0);

  const navItems: readonly ArchitectureNavItem[] = groups.flatMap(({ group, sections }) =>
    sections.map((section) => ({ id: section.id, number: section.number, title: text(section.title), groupId: group.id })),
  );

  const atlasCount = new Set(ARCHITECTURE_GUIDE_SECTIONS.flatMap((section) => section.atlasIds)).size;

  return (
    <EngineeringPageFrame pageId="architecture">
      <EngineeringPageIntro
        pageId="architecture"
        eyebrow="ARCHITECTURE · THE BIG PICTURE"
        title={bi("한 장으로 보는 ToonStudio 구조", "ToonStudio's structure on one page")}
        description={bi(
          "도식을 먼저 보고, 쉬운 비유와 흐름 단계로 이해한 뒤, 필요하면 배경 지식·쓰인 파일·선택과 대가·도감 카드로 내려갑니다. 상태 배지는 코드와 설정으로 확인한 현재 상태입니다.",
          "Start with the diagram, understand it through a plain analogy and the flow steps, then go down to background, the files that implement it, the choices and their costs, and the tech atlas cards. Status badges show what code and configuration confirm today.",
        )}
      />

      <EngineeringArchitectureOverview
        sectionCount={ARCHITECTURE_GUIDE_SECTIONS.length}
        diagramCount={ARCHITECTURE_GUIDE_SECTIONS.length}
        atlasCount={atlasCount}
      />

      <SectionMap groups={groups} />

      <div id={BODY_ID} className="mt-10 grid gap-8">
        <ArchitectureSectionStrip items={navItems} bodyId={BODY_ID} />
        <div className="grid gap-14">
          {groups.map(({ group, sections }) => (
            <div key={group.id} className="grid gap-8">
              <header id={`architecture-group-${group.id}`} className="scroll-mt-36">
                <h2 className="text-2xl font-black tracking-tight text-fg">
                  {text(group.label)}
                  <span className="ml-3 text-base font-bold text-fg-3">{sections.length}</span>
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-7 text-fg-2">{text(group.hint)}</p>
              </header>
              {sections.map((section) => (
                <EngineeringArchitectureSection key={section.id} section={section} groupLabel={text(group.label)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </EngineeringPageFrame>
  );
}

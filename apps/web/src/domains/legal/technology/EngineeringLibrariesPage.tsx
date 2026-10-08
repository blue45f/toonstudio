import { ArchitectureSectionStrip, type ArchitectureNavItem } from "./EngineeringArchitectureNav";
import { EngineeringLibrariesOverview } from "./EngineeringLibrariesOverview";
import { EngineeringLibraryArea } from "./EngineeringLibraryArea";
import { EngineeringPageFrame, EngineeringPageIntro, EngineeringStatusBadge } from "./EngineeringStoryUi";
import { LIBRARY_GUIDE_AREAS } from "./engineering-library-guide-content";
import { LIBRARY_AREA_GROUPS, type LibraryAreaGroup } from "./engineering-library-guide-groups";
import type { LibraryGuideArea } from "./engineering-library-guide-types";
import type { LocalizedText } from "./engineering-story-content";
import { useOpenGuideDetailsForPrint } from "./use-open-guide-details-for-print";
import { useOpenLibraryCardForHash } from "./use-open-library-card-for-hash";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLibrariesPage", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

const BODY_ID = "engineering-libraries-body";

interface GroupedAreas {
  readonly group: LibraryAreaGroup;
  readonly areas: readonly LibraryGuideArea[];
}

/** 영역을 세 묶음으로 나눈다(묶음 안의 순서는 `areaIds` 순서). 아직 데이터가 없는 영역은 건너뛴다. */
function groupAreas(areas: readonly LibraryGuideArea[]): readonly GroupedAreas[] {
  return LIBRARY_AREA_GROUPS.map((group) => ({
    group,
    areas: group.areaIds.flatMap((id) => areas.filter((area) => area.id === id)),
  })).filter((entry) => entry.areas.length > 0);
}

/** 영역 바로가기: 번호 · 쉬운 제목 · 답하는 질문 · 상태. 키보드·터치로 어느 영역에든 한 번에 간다. */
function AreaMap({ groups }: { readonly groups: readonly GroupedAreas[] }) {
  useBilingualI18nRevision();
  return (
    <section aria-labelledby="libraries-map-title" className="mt-10 grid gap-5">
      <h2 id="libraries-map-title" className="text-2xl font-black tracking-tight text-fg">
        {bi("영역 바로가기", "Jump to an area")}
      </h2>
      <nav aria-label={bi("영역 바로가기", "Jump to an area")} className="grid gap-6">
        {groups.map(({ group, areas }) => (
          <div key={group.id} className="grid gap-3">
            <p className="text-sm font-black text-fg">
              {text(group.label)}
              <span className="ml-2 text-xs font-medium text-fg-3">{text(group.hint)}</span>
            </p>
            <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {areas.map((area) => (
                <li key={area.id}>
                  <a
                    href={`#${area.id}`}
                    className="group flex min-h-16 items-start gap-3 rounded-2xl border border-line/65 bg-card/65 p-3.5 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-base font-black text-accent"
                    >
                      {area.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-sm font-black text-fg group-hover:text-accent">{text(area.title)}</span>
                        <EngineeringStatusBadge status={area.status} className="hidden sm:inline-flex" />
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-fg-3">{text(area.question)}</span>
                      <span className="mt-1 block text-[0.7rem] font-bold text-fg-3">
                        {formatI18nTemplate(String(bi("라이브러리 {value0}개", "{value0} libraries")), { value0: area.libraries.length })}
                      </span>
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
 * 라이브러리 해설(`/about/technology/libraries`).
 * 한 장 요약(스택 도식 + 고르는 원칙) → 영역 바로가기 → 영역 본문 순서이고, 영역마다
 * 도식 → 한 줄 요약·쉬운 비유 → 왜 이런 설계인가 → 라이브러리 카드(왜 골랐나·대안·대가·쓰는 곳) → 도감·챕터·용어 링크로 내려간다.
 */
export function EngineeringLibrariesPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("주요 라이브러리와 선택 이유 · ToonStudio", "Main libraries and why we chose them · ToonStudio"));
  useOpenGuideDetailsForPrint(BODY_ID);
  useOpenLibraryCardForHash(BODY_ID);

  const groups = groupAreas(LIBRARY_GUIDE_AREAS);
  const navItems: readonly ArchitectureNavItem[] = groups.flatMap(({ group, areas }) =>
    areas.map((area) => ({ id: area.id, number: area.number, title: text(area.title), groupId: group.id })),
  );
  const libraryCount = LIBRARY_GUIDE_AREAS.reduce((count, area) => count + area.libraries.length, 0);

  return (
    <EngineeringPageFrame pageId="libraries">
      <EngineeringPageIntro
        pageId="libraries"
        eyebrow="LIBRARIES · WHAT IT IS BUILT WITH, AND WHY"
        title={bi("무엇으로 만들었고, 왜 그것을 골랐나", "What it is built with, and why we chose it")}
        description={bi(
          "브러시 엔진, VRM 캐릭터, 3D, 협업, 저장, AI까지 여덟 영역의 주요 라이브러리를 소개합니다. 먼저 구조를 왜 이렇게 나눴는지, 그다음 왜 이 라이브러리를 골랐는지를 풀었고, 문서에서 근거를 찾지 못한 이유는 쓰지 않았습니다.",
          "The main libraries in eight areas, from brush engines and VRM characters to 3D, collaboration, storage and AI. Each area first explains why the structure was split this way, then why each library was chosen, and reasons we could not find in the documents are not written.",
        )}
      />

      <EngineeringLibrariesOverview
        areaCount={LIBRARY_GUIDE_AREAS.length}
        libraryCount={libraryCount}
        diagramCount={LIBRARY_GUIDE_AREAS.length}
      />

      <AreaMap groups={groups} />

      <div id={BODY_ID} className="mt-10 grid gap-8">
        <ArchitectureSectionStrip items={navItems} bodyId={BODY_ID} />
        <div className="grid gap-14">
          {groups.map(({ group, areas }) => (
            <div key={group.id} className="grid gap-8">
              <header id={`libraries-group-${group.id}`} className="scroll-mt-36">
                <h2 className="text-2xl font-black tracking-tight text-fg">
                  {text(group.label)}
                  <span className="ml-3 text-base font-bold text-fg-3">{areas.length}</span>
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-7 text-fg-2">{text(group.hint)}</p>
              </header>
              {areas.map((area) => (
                <EngineeringLibraryArea key={area.id} area={area} groupLabel={text(group.label)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </EngineeringPageFrame>
  );
}

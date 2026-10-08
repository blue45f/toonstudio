import { Compass } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import {
  GuideDiagramPanel,
  GuideEasyBox,
  GuideLinkRow,
  GuidePitfall,
  GuideSectionHeader,
  GuideSectionShell,
} from "./EngineeringGuideBlocks";
import { EngineeringLibraryCard } from "./EngineeringLibraryCard";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";
import type { LibraryDesignChoice, LibraryGuideArea } from "./engineering-library-guide-types";
import { ENGINEERING_STATUS_META, type EngineeringStatus, type LocalizedText } from "./engineering-story-content";

import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLibraryArea", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

/** 라이브러리를 고르기 전에 구조를 어떻게 나눴나. 이 페이지의 핵심이라 접지 않고 항상 보여 준다. */
function DesignWhy({ areaId, choices }: { readonly areaId: string; readonly choices: readonly LibraryDesignChoice[] }) {
  useBilingualI18nRevision();
  const headingId = `${areaId}-why-title`;
  return (
    // 영역마다 같은 제목이 반복되므로 영역 제목까지 이름에 넣어 랜드마크 이름이 겹치지 않게 한다(axe landmark-unique).
    <section id={`${areaId}-why`} aria-labelledby={`${areaId}-title ${headingId}`} className="grid scroll-mt-40 gap-3">
      <div>
        <h4 id={headingId} className="flex items-center gap-2 text-lg font-black text-fg sm:text-xl">
          <Compass size={18} className="text-accent" aria-hidden="true" />
          {bi("왜 이런 설계인가", "Why this design")}
        </h4>
        <p className="mt-1 text-sm leading-7 text-fg-3">
          {bi("라이브러리를 고르기 전에, 구조를 이렇게 나눴습니다.", "Before choosing libraries, the structure was split like this.")}
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {choices.map((choice, index) => (
          <li key={choice.title.ko} className="flex gap-3 rounded-3xl border border-accent/30 bg-accent-soft/20 p-4 sm:p-5">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-black text-on-accent"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-balance break-keep text-base font-black leading-7 text-fg sm:text-lg">{text(choice.title)}</p>
              <p className="mt-1.5 text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">{text(choice.body)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 이 영역 카드들의 상태 분포("운영 경로 4 · 설정 필요 2 …"). 어느 정도가 실제로 쓰이는지 한눈에 보여 준다. */
function StatusSummary({ statuses }: { readonly statuses: readonly EngineeringStatus[] }) {
  useBilingualI18nRevision();
  const counts = new Map<EngineeringStatus, number>();
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  const order = Object.keys(ENGINEERING_STATUS_META) as EngineeringStatus[];
  const present = order.filter((status) => counts.has(status));
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={bi("상태별 라이브러리 수", "Libraries by status")}>
      {present.map((status) => (
        <li key={status} className="inline-flex items-center gap-1.5">
          <EngineeringStatusBadge status={status} />
          <span className="font-display text-sm font-black tabular-nums text-fg-2">{counts.get(status)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 영역 하나. 읽는 순서: 번호·제목·질문·상태·한 줄 요약 → 쉬운 비유 → 도식 → 왜 이런 설계인가
 * → 라이브러리 카드(접힘) → 오해하기 쉬운 점 → 더 깊이 보기(도감·챕터·용어).
 */
export function EngineeringLibraryArea({
  area,
  groupLabel,
  headingLevel = 3,
}: {
  readonly area: LibraryGuideArea;
  readonly groupLabel: string;
  readonly headingLevel?: 2 | 3;
}) {
  useBilingualI18nRevision();
  const titleId = `${area.id}-title`;
  const cardsTitleId = `${area.id}-cards-title`;
  return (
    <GuideSectionShell id={area.id} titleId={titleId}>
      <GuideSectionHeader
        number={area.number}
        titleId={titleId}
        title={text(area.title)}
        kicker={groupLabel}
        question={text(area.question)}
        oneLine={text(area.oneLine)}
        status={area.status}
        headingLevel={headingLevel}
      />

      <div className="mt-6 grid gap-7">
        <GuideEasyBox>{text(area.easy)}</GuideEasyBox>

        <GuideDiagramPanel>
          <EngineeringDiagramFrame diagram={area.diagram} />
        </GuideDiagramPanel>

        <DesignWhy areaId={area.id} choices={area.designWhy} />

        <section id={`${area.id}-cards`} aria-labelledby={`${titleId} ${cardsTitleId}`} className="grid scroll-mt-40 gap-3">
          <div className="grid gap-2">
            <h4 id={cardsTitleId} className="text-lg font-black text-fg sm:text-xl">
              {formatI18nTemplate(String(bi("라이브러리 {value0}개", "{value0} libraries")), { value0: area.libraries.length })}
            </h4>
            <p className="text-sm leading-7 text-fg-3">
              {bi(
                "중요한 것부터 놓았습니다. 카드를 누르면 하는 일 · 왜 골랐나 · 검토한 대안 · 대가 · 쓰는 곳이 펼쳐집니다.",
                "Ordered by importance. Open a card for what it does, why we chose it, the alternatives weighed, the cost and where it is used.",
              )}
            </p>
            <StatusSummary statuses={area.libraries.map((card) => card.status)} />
          </div>
          <ul className="grid gap-3">
            {area.libraries.map((card) => (
              <EngineeringLibraryCard key={card.id} card={card} />
            ))}
          </ul>
        </section>

        {area.pitfall ? <GuidePitfall>{text(area.pitfall)}</GuidePitfall> : null}

        <div className="grid gap-3 rounded-3xl border border-line/65 bg-card/50 p-4 sm:p-5">
          <p className="text-sm font-black text-fg">{bi("더 깊이 보기", "Go deeper")}</p>
          <GuideLinkRow atlasIds={area.atlasIds} chapterIds={area.chapterIds} glossaryIds={area.glossaryIds} />
        </div>
      </div>
    </GuideSectionShell>
  );
}

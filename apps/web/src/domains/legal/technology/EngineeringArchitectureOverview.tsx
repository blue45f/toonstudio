import { Compass, Route } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { GuideDiagramLegend, GuideDiagramPanel } from "./EngineeringGuideBlocks";
import { EngineeringMetaChip } from "./EngineeringLongform";
import { ARCHITECTURE_GUIDE_OVERVIEW, ARCHITECTURE_GUIDE_REVIEWED_AT } from "./engineering-architecture-guide-overview";
import type { LocalizedText } from "./engineering-story-content";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitectureOverview", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

/**
 * 페이지 맨 위 "한 장으로 보기": 전체 지도 한 장 + 범례 + 구조를 지탱하는 원칙 + 읽는 법.
 * 지도는 왼쪽 목차 없이 본문 폭 전체를 쓴다(그래야 도식 글자가 발표 화면에서도 읽힌다).
 */
export function EngineeringArchitectureOverview({
  sectionCount,
  diagramCount,
  atlasCount,
}: {
  readonly sectionCount: number;
  readonly diagramCount: number;
  readonly atlasCount: number;
}) {
  useBilingualI18nRevision();
  const overview = ARCHITECTURE_GUIDE_OVERVIEW;
  return (
    <section
      id="architecture-overview"
      aria-labelledby="architecture-overview-title"
      className="mt-8 grid scroll-mt-32 gap-7 rounded-[2rem] border border-accent/25 bg-panel/60 p-5 shadow-sm sm:p-8"
    >
      <header className="grid gap-3">
        <p className="flex items-center gap-2 font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          <Compass size={15} aria-hidden="true" />
          {bi("한 장으로 보기", "The whole picture")}
        </p>
        <h2 id="architecture-overview-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("먼저 이 지도 한 장만 보세요", "Start with this single map")}
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
          {formatI18nTemplate(
            String(bi(
              "사용자 기기에서 시작해 Cloudflare, 서버와 데이터까지 물건마다 주인이 정해져 있습니다. 아래 {value0}개 구간은 이 지도를 한 칸씩 확대해 보는 설명입니다.",
              "From the user's device through Cloudflare to the server and its data, every kind of data has one owner. The {value0} sections below zoom into this map one part at a time.",
            )),
            { value0: sectionCount },
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-fg-3">
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("구간 {value0}개", "{value0} sections")), { value0: sectionCount })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("도식 {value0}장", "{value0} diagrams")), { value0: diagramCount + 1 })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("연결한 도감 카드 {value0}장", "{value0} linked atlas cards")), { value0: atlasCount })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("코드 대조 {value0}", "Checked against code {value0}")), { value0: ARCHITECTURE_GUIDE_REVIEWED_AT })}</EngineeringMetaChip>
        </div>
      </header>

      <GuideDiagramPanel>
        <EngineeringDiagramFrame diagram={overview.diagram} />
      </GuideDiagramPanel>
      <GuideDiagramLegend />

      <div className="grid gap-4">
        <h3 className="text-lg font-black text-fg">{bi("이 구조를 지탱하는 원칙", "Principles behind the structure")}</h3>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.principles.map((principle, index) => (
            <li key={principle.title.ko} className="flex gap-3 rounded-3xl border border-line/65 bg-card/65 p-4 sm:p-5">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-sm font-black text-accent"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-balance break-keep text-base font-black leading-6 text-fg">{text(principle.title)}</p>
                <p className="mt-1.5 text-sm leading-7 text-fg-2">{text(principle.body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 rounded-3xl border border-line/65 bg-card/55 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-black text-fg">
          <Route size={16} className="text-accent" aria-hidden="true" />
          {bi("이 페이지를 읽는 법", "How to read this page")}
        </h3>
        <ol className="grid gap-2 text-sm leading-7 text-fg-2 sm:text-[0.95rem]">
          {overview.howToRead.map((line, index) => (
            <li key={line.ko} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 font-display text-sm font-black text-accent">{index + 1}</span>
              <span>{text(line)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

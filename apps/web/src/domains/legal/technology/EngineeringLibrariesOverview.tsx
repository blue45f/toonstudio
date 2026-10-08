import { Compass, Route, Scale } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { GuideDiagramPanel } from "./EngineeringGuideBlocks";
import { EngineeringMetaChip } from "./EngineeringLongform";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";
import type { EngineeringDiagramTone } from "./engineering-diagram-types";
import { LIBRARY_GUIDE_OVERVIEW, LIBRARY_GUIDE_REVIEWED_AT } from "./engineering-library-guide-overview";
import { ENGINEERING_STATUS_META, type EngineeringStatus, type LocalizedText } from "./engineering-story-content";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLibrariesOverview", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

/** 도식 색(tone)의 뜻. 한 장 요약과 영역 도식이 같은 색 약속을 쓴다. */
const LEGEND: readonly { readonly tone: EngineeringDiagramTone; readonly label: LocalizedText }[] = [
  { tone: "local", label: { ko: "내 기기(브라우저) 안", en: "Inside your browser" } },
  { tone: "edge", label: { ko: "Cloudflare 같은 전달 계층", en: "Delivery layer such as Cloudflare" } },
  { tone: "server", label: { ko: "서버·원장·데이터베이스", en: "Server, ledger, database" } },
  { tone: "ai", label: { ko: "AI·모델", en: "AI and models" } },
  { tone: "external", label: { ko: "외부 서비스 (점선 테두리)", en: "External service (dashed outline)" } },
  { tone: "good", label: { ko: "그 일의 주인(소유자)", en: "The owner of that job" } },
  { tone: "warn", label: { ko: "고르는·승인하는 지점", en: "A choosing or approval point" } },
  { tone: "neutral", label: { ko: "비교 기준·후보·개발 도구", en: "Baselines, candidates, dev tools" } },
];

export function LibraryDiagramLegend() {
  useBilingualI18nRevision();
  return (
    <ul className="eng-legend" aria-label={bi("도식 색의 뜻", "What diagram colors mean")}>
      {LEGEND.map((item) => (
        <li key={item.tone} className="eng-legend__item">
          <span className="eng-legend__swatch" data-tone={item.tone} aria-hidden="true" />
          {text(item.label)}
        </li>
      ))}
    </ul>
  );
}

/** 상태 배지를 읽는 법에서 설명할 상태(이 페이지 카드가 실제로 쓰는 것). */
const STATUS_ORDER: readonly EngineeringStatus[] = ["live", "configured", "experimental", "reference-only"];

/**
 * 페이지 맨 위 "한 장으로 보기": 전체 스택 한 장 + 범례 + 라이브러리를 고르는 원칙 + 상태·라이선스 읽는 법 + 페이지 읽는 법.
 * 도식은 본문 폭 제약 없이 화면 폭을 쓰도록 목차 영역 바깥에 둔다.
 */
export function EngineeringLibrariesOverview({
  areaCount,
  libraryCount,
  diagramCount,
}: {
  readonly areaCount: number;
  readonly libraryCount: number;
  readonly diagramCount: number;
}) {
  useBilingualI18nRevision();
  const overview = LIBRARY_GUIDE_OVERVIEW;
  return (
    <section
      id="libraries-overview"
      aria-labelledby="libraries-overview-title"
      className="mt-8 grid scroll-mt-32 gap-7 rounded-[2rem] border border-accent/25 bg-panel/60 p-5 shadow-sm sm:p-8"
    >
      <header className="grid gap-3">
        <p className="flex items-center gap-2 font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          <Compass size={15} aria-hidden="true" />
          {bi("한 장으로 보기", "The whole picture")}
        </p>
        <h2 id="libraries-overview-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("먼저 이 스택 한 장만 보세요", "Start with this single stack")}
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
          {formatI18nTemplate(
            String(bi(
              "라이브러리 이름을 나열하기 전에 일마다 주인이 누구인지를 먼저 정했고, 그 틀 안에서 부품을 골랐습니다. 아래 {value0}개 영역은 이 스택을 한 층씩 확대해 '왜 이런 구조인지, 왜 이 라이브러리인지'를 풀어 줍니다.",
              "Before listing library names, the owner of each job was decided first, and parts were chosen inside that frame. The {value0} areas below zoom into this stack layer by layer to explain why the structure looks this way and why each library was chosen.",
            )),
            { value0: areaCount },
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-fg-3">
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("영역 {value0}개", "{value0} areas")), { value0: areaCount })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("라이브러리 카드 {value0}개", "{value0} library cards")), { value0: libraryCount })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("도식 {value0}장", "{value0} diagrams")), { value0: diagramCount + 1 })}</EngineeringMetaChip>
          <EngineeringMetaChip>{formatI18nTemplate(String(bi("코드 대조 {value0}", "Checked against code {value0}")), { value0: LIBRARY_GUIDE_REVIEWED_AT })}</EngineeringMetaChip>
        </div>
      </header>

      <GuideDiagramPanel>
        <EngineeringDiagramFrame diagram={overview.diagram} />
      </GuideDiagramPanel>
      <LibraryDiagramLegend />

      <div className="grid gap-4">
        <h3 className="text-lg font-black text-fg">{bi("라이브러리를 고르는 원칙", "Principles for choosing libraries")}</h3>
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

      <div className="grid gap-4 rounded-3xl border border-warn/30 bg-warn/5 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-black text-fg">
          <Scale size={16} className="text-warn" aria-hidden="true" />
          {bi("상태 배지와 라이선스 읽는 법", "How to read status badges and licenses")}
        </h3>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {STATUS_ORDER.map((status) => (
            <li key={status} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <EngineeringStatusBadge status={status} />
              <span className="min-w-0 flex-1 text-sm leading-6 text-fg-2">{text(ENGINEERING_STATUS_META[status].description)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-7 text-fg-2">
          {bi(
            "라이선스 칸은 법률 판단이 아니라 설치본 package.json과 저장소 문서에 적힌 라벨입니다. 비상업(CC BY-NC)·LGPL처럼 조건이 까다로운 항목은 경고 색으로 표시하며, 적격성은 이 페이지가 결론 내지 않고 '별도 확인'으로 남깁니다.",
            "The license field is not legal advice; it shows the labels recorded in installed package.json files and repository documents. Items with demanding terms, such as non-commercial (CC BY-NC) or LGPL, are marked in a warning color, and this page leaves eligibility to separate review instead of deciding it.",
          )}
        </p>
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

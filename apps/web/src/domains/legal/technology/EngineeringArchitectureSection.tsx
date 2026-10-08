import { BookOpen, MapPinned, Scale } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import {
  GuideDetails,
  GuideDiagramPanel,
  GuideEasyBox,
  GuideFactList,
  GuideLinkRow,
  GuidePathList,
  GuidePitfall,
  GuideSectionHeader,
  GuideSectionShell,
  GuideSteps,
} from "./EngineeringGuideBlocks";
import { ARCHITECTURE_GUIDE_REVIEWED_AT } from "./engineering-architecture-guide-overview";
import type { ArchitectureDecision, ArchitectureGuideSection, ArchitectureServiceUse } from "./engineering-architecture-guide-types";
import type { LocalizedText } from "./engineering-story-content";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitectureSection", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

function ServiceUseCard({ use }: { readonly use: ArchitectureServiceUse }) {
  return (
    <li className="rounded-3xl border border-line/65 bg-card/65 p-4">
      <p className="text-sm font-black text-fg">{text(use.what)}</p>
      <p className="mt-1.5 text-sm leading-7 text-fg-2">{text(use.role)}</p>
      <GuidePathList paths={use.paths} />
    </li>
  );
}

function DecisionCard({ decision }: { readonly decision: ArchitectureDecision }) {
  return (
    <li className="grid gap-3 rounded-3xl border border-line/65 bg-card/65 p-4 sm:p-5">
      <p className="text-balance break-keep text-base font-black leading-7 text-fg">{text(decision.choice)}</p>
      <dl className="grid gap-3 text-sm leading-7 text-fg-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-good/10 px-3.5 py-3">
          <dt className="text-xs font-black text-fg">{bi("왜 이렇게 했나", "Why")}</dt>
          <dd className="mt-1">{text(decision.because)}</dd>
        </div>
        <div className="rounded-2xl bg-warn/10 px-3.5 py-3">
          <dt className="text-xs font-black text-fg">{bi("치른 대가·한계", "Cost and limits")}</dt>
          <dd className="mt-1">{text(decision.cost)}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * 구간 하나. 읽는 순서: 번호·제목·질문·상태·한 줄 요약 → 쉬운 비유 → 도식 → 흐름 단계 → 오해하기 쉬운 점
 * → (접어 둔 상세) 배경 지식 · 서비스에서 쓰인 곳 · 선택과 대가 → 더 깊이 보기(도감·챕터·용어).
 */
export function EngineeringArchitectureSection({
  section,
  groupLabel,
  headingLevel = 3,
}: {
  readonly section: ArchitectureGuideSection;
  readonly groupLabel: string;
  readonly headingLevel?: 2 | 3;
}) {
  useBilingualI18nRevision();
  const titleId = `${section.id}-title`;
  return (
    <GuideSectionShell id={section.id} titleId={titleId}>
      <GuideSectionHeader
        number={section.number}
        titleId={titleId}
        title={text(section.title)}
        kicker={groupLabel}
        question={text(section.question)}
        oneLine={text(section.oneLine)}
        status={section.status}
        headingLevel={headingLevel}
      />

      <div className="mt-6 grid gap-6">
        <GuideEasyBox>{text(section.easy)}</GuideEasyBox>

        <GuideDiagramPanel>
          <EngineeringDiagramFrame diagram={section.diagram} />
        </GuideDiagramPanel>

        <GuideSteps steps={section.steps.map(text)} />

        {section.pitfall ? <GuidePitfall>{text(section.pitfall)}</GuidePitfall> : null}

        <div className="grid gap-3">
          <GuideDetails
            icon={BookOpen}
            title={bi("배경 지식", "Background")}
            hint={bi("이 구조가 없으면 무엇이 불편한지 · 동작 원리 · 한계", "Why it is needed · how it works · limits")}
          >
            <div className="grid gap-4">
              {section.background.map((paragraph) => (
                <p key={paragraph.ko} className="max-w-4xl text-sm leading-8 text-fg-2 sm:text-base sm:leading-9">{text(paragraph)}</p>
              ))}
            </div>
          </GuideDetails>

          <GuideDetails
            icon={MapPinned}
            title={bi("서비스에서 쓰인 곳", "Where the service uses it")}
            hint={bi("기능 → 맡은 일 → 실제 파일 경로", "Feature · its job · real file paths")}
          >
            <div className="grid gap-5">
              <ul className="grid gap-3 lg:grid-cols-2">
                {section.inService.map((use) => (
                  <ServiceUseCard key={use.what.ko} use={use} />
                ))}
              </ul>
              {section.facts?.length ? (
                <div className="grid gap-3">
                  <p className="text-xs font-black text-fg-3">
                    {formatI18nTemplate(String(bi("코드·설정에서 확인한 수치 ({value0} 기준)", "Figures checked in code and config (as of {value0})")), {
                      value0: ARCHITECTURE_GUIDE_REVIEWED_AT,
                    })}
                  </p>
                  <GuideFactList facts={section.facts.map((fact) => ({ value: fact.value, label: text(fact.label), source: fact.source }))} />
                </div>
              ) : null}
            </div>
          </GuideDetails>

          <GuideDetails
            icon={Scale}
            title={bi("선택과 대가", "Choices and their costs")}
            hint={bi("무엇을 골랐나 · 왜 · 치른 대가", "What was chosen · why · what it cost")}
          >
            <ul className="grid gap-3">
              {section.decisions.map((decision) => (
                <DecisionCard key={decision.choice.ko} decision={decision} />
              ))}
            </ul>
          </GuideDetails>
        </div>

        <div className="grid gap-3 rounded-3xl border border-line/65 bg-card/50 p-4 sm:p-5">
          <p className="text-sm font-black text-fg">{bi("더 깊이 보기", "Go deeper")}</p>
          <GuideLinkRow atlasIds={section.atlasIds} chapterIds={section.chapterIds} glossaryIds={section.glossaryIds} />
        </div>
      </div>
    </GuideSectionShell>
  );
}
